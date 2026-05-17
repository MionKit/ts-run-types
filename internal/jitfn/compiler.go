package jitfn

import (
	"fmt"
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// JitFnID enumerates the validator/serializer operations a Compiler can
// produce. Mirrors mion's JitFunctions constants
// (run-types/src/constants.functions.ts:137). v1 only implements
// JitFnIsType — every other id is reserved for future work.
type JitFnID string

const (
	JitFnIsType JitFnID = "isType"
)

// ArgSpec describes one parameter of the emitted jit function. The same
// pairing mion encodes as `args[key] = name` + `defaultParamValues[key] = default`
// (jitFnCompiler.ts:71). Key is the conceptual slot ("vλl", "pλth",
// "εrr"); Name is the JS identifier that lands in the emitted function
// signature; Default is the JS-source default expression (empty string
// when the parameter has no default).
type ArgSpec struct {
	Key     string
	Name    string
	Default string
}

// StackItem mirrors mion's StackItem (jitFnCompiler.ts:33). One frame
// per RunType the orchestrator is currently inside. The atomic-string
// case in v1 only ever pushes one frame; the field is here so the
// scaffolding scales to nested kinds without rework.
type StackItem struct {
	// Vλl is the JS accessor expression that names the current value
	// (e.g. "v", "v.foo", "v[i0]"). Snapshotted on push so popStack
	// can restore the parent's Vλl.
	Vλl string
	// RT is the RunType being compiled at this frame.
	RT *protocol.RunType
}

// orderedItems maintains insertion order for context items so the
// emitted JS source is deterministic. Mirrors mion's
// `contextCodeItems = new Map<string, string>()` (jitFnCompiler.ts:96):
// JS Maps preserve insertion order, so Go needs an explicit ordered map
// to match that behaviour.
type orderedItems struct {
	keys   []string
	values map[string]string
}

func newOrderedItems() *orderedItems {
	return &orderedItems{values: map[string]string{}}
}

func (o *orderedItems) set(key, value string) {
	if _, exists := o.values[key]; !exists {
		o.keys = append(o.keys, key)
	}
	o.values[key] = value
}

func (o *orderedItems) has(key string) bool { _, ok := o.values[key]; return ok }

func (o *orderedItems) get(key string) (string, bool) { v, ok := o.values[key]; return v, ok }

func (o *orderedItems) ordered() []string {
	out := make([]string, len(o.keys))
	for i, key := range o.keys {
		out[i] = o.values[key]
	}
	return out
}

// Compiler is the Go-side port of mion's BaseFnCompiler
// (jitFnCompiler.ts:49). One Compiler instance corresponds to exactly
// one emitted jit function. Walks the RunType AST via pushStack/popStack,
// dispatches per-kind emitters through the big `EmitIsType` switch in
// dispatch_istype.go, and assembles the final closure body.
type Compiler struct {
	// RootType is the entry-point RunType for this jit function.
	RootType *protocol.RunType
	// FnID selects which operation we're compiling (v1: only isType).
	FnID JitFnID
	// FnName is the emitted JS function name (e.g. "isType_<hash>").
	// Used both for the inner function and as the "get_<name>" factory
	// wrapper produced by WrapClosure.
	FnName string
	// Args is the ordered list of jit function parameters. For isType:
	// `[{Key: "vλl", Name: "v", Default: ""}]`.
	Args []ArgSpec
	// ReturnName is the JS identifier the function returns when its
	// body is a noop. For isType the function returns a boolean, so
	// ReturnName isn't used in any emitter path the v1 reaches — kept
	// for parity with mion's structure (jitFnCompiler.ts:73).
	ReturnName string
	// Vλl is the current value-accessor expression. Recomputed on
	// every pushStack as `args.vλl` concatenated with each frame's
	// child accessor (property name, array index, …). For an atomic
	// root it stays equal to the function's first parameter (e.g. "v").
	Vλl string
	// Stack is the live traversal stack. Pushed by Compile, popped at
	// the end of each Compile call.
	Stack []StackItem
	// Code is the assembled function body. handleFunctionReturn
	// normalises it on finalisation; CreateJitFunction returns it.
	Code string
	// ContextItems is an ordered set of `const xyz = …` declarations
	// that the WrapClosure prologue emits before the inner function.
	// v1's KindString path doesn't populate this — present so the
	// scaffolding scales (mion's `contextCodeItems`, jitFnCompiler.ts:96).
	ContextItems *orderedItems
	// JitDependencies / PureFnDependencies track which other jit and
	// pure functions this function reaches via callDependency. v1
	// doesn't populate either — see updateDependencies on the JS side
	// (jitFnCompiler.ts:222) for the full contract.
	JitDependencies     []string
	PureFnDependencies  []string
	// isNoop is set by handleFunctionReturn when the emitted code is
	// empty / a trivial tautology so the renderer can skip emitting
	// the factory altogether.
	isNoop bool
}

// NewIsTypeCompiler builds a Compiler primed for an `isType` jit
// function over rt. Mirrors mion's JitFnCompiler constructor +
// jitValidationFunctions.isType settings.
func NewIsTypeCompiler(rt *protocol.RunType, fnName string) *Compiler {
	// jitArgs.vλl = 'v', jitDefaultArgs.vλl = '' — see
	// run-types/src/constants.functions.ts:45.
	args := []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
	return &Compiler{
		RootType:     rt,
		FnID:         JitFnIsType,
		FnName:       fnName,
		Args:         args,
		ReturnName:   args[0].Name, // jitValidationFunctions.isType.returnName = jitArgs.vλl
		Vλl:          args[0].Name,
		ContextItems: newOrderedItems(),
	}
}

// Compile is the orchestrator entry point — mirrors
// BaseFnCompiler.compile (jitFnCompiler.ts:279). Pushes the frame,
// dispatches to the per-kind emitter, normalises the result against the
// expected parent code type, then pops.
func (c *Compiler) Compile(rt *protocol.RunType, expectedCType CodeType, fnID JitFnID) JitCode {
	if rt == nil {
		return JitCode{Code: "", Type: expectedCType}
	}
	c.pushStack(rt)
	jc := c.runEmitter(rt, expectedCType, fnID)
	if jc.Code != "" {
		jc.Code = c.handleCodeInterpolation(rt, jc, expectedCType)
	}
	c.popStack(jc)
	return jc
}

// CompileIsType is the shorthand mion's BaseFnCompiler exposes for
// recursive isType calls in member/collection emitters
// (jitFnCompiler.ts:521). v1 doesn't reach it but the method is on the
// receiver so the eventual collection emitters can call it just like
// the JS does.
func (c *Compiler) CompileIsType(rt *protocol.RunType, expectedCType CodeType) JitCode {
	return c.Compile(rt, expectedCType, JitFnIsType)
}

func (c *Compiler) runEmitter(rt *protocol.RunType, expectedCType CodeType, fnID JitFnID) JitCode {
	if c.shouldCallDependency() {
		// v1: no collection / member kinds reach this path. Future
		// kinds that compose children will hit this branch and need
		// callDependency wired through emit/runtypes_module.go-style
		// `utl.getJIT(<hash>)` lookups.
		panic(fmt.Sprintf("jitfn: dependency calls not yet implemented (kind=%d)", rt.Kind))
	}
	switch fnID {
	case JitFnIsType:
		return EmitIsType(rt, c, expectedCType)
	default:
		panic(fmt.Sprintf("jitfn: unknown fnID %q", fnID))
	}
}

// pushStack snapshots the current Vλl onto a new stack frame.
// getStackVλl computes the descendant accessor from the (pre-push)
// stack; for atomic-root that's just the function's first argument.
// Mirrors jitFnCompiler.ts:148.
func (c *Compiler) pushStack(newChild *protocol.RunType) {
	if len(c.Stack) == 0 && newChild != c.RootType {
		panic("jitfn: rootType must be the first item pushed onto the stack")
	}
	c.Vλl = c.getStackVλl()
	c.Stack = append(c.Stack, StackItem{Vλl: c.Vλl, RT: newChild})
}

// popStack mirrors jitFnCompiler.ts:161. Stores the emitted code on
// the compiler (so the root frame's code survives as Compiler.Code at
// the end) and restores Vλl to the parent frame's snapshot.
func (c *Compiler) popStack(result JitCode) {
	if result.Code != "" {
		c.Code = result.Code
	}
	if len(c.Stack) == 0 {
		return
	}
	c.Stack = c.Stack[:len(c.Stack)-1]
	if parent := c.peekStack(); parent != nil {
		c.Vλl = parent.Vλl
	} else {
		c.Vλl = c.Args[0].Name
	}
}

func (c *Compiler) peekStack() *StackItem {
	if len(c.Stack) == 0 {
		return nil
	}
	return &c.Stack[len(c.Stack)-1]
}

// getStackVλl walks the live stack and concatenates each frame's child
// accessor onto the function's value parameter. Mirrors
// jitFnCompiler.ts:738. v1's atomic-only scope never descends into
// member / child kinds, so this returns the base parameter name
// unchanged. The walk is here so member kinds can be added without
// having to restructure the orchestrator.
func (c *Compiler) getStackVλl() string {
	value := c.Args[0].Name
	// Future member kinds will append per-frame accessors here. The
	// switch lives in member-specific code (mion has it on each
	// MemberRunType class); the Go port will land it on the dispatch
	// or via dedicated child-accessor metadata on the *protocol.RunType.
	return value
}

// shouldCallDependency mirrors jitFnCompiler.ts:218. v1's KindString
// case never triggers the dependency path (no children, isJitInlined
// would return true), so this stays false. Member/collection kinds
// will revisit this when they land.
func (c *Compiler) shouldCallDependency() bool {
	return false
}

// SetContextItem mirrors jitFnCompiler.ts:243. Future emitters that
// need shared `const dep = utl.getJIT(<id>)` lookups call this; KindString
// doesn't.
func (c *Compiler) SetContextItem(key, value string) {
	c.ContextItems.set(key, value)
}

// HasContextItem mirrors jitFnCompiler.ts:253.
func (c *Compiler) HasContextItem(key string) bool { return c.ContextItems.has(key) }

// GetContextItem mirrors jitFnCompiler.ts:248.
func (c *Compiler) GetContextItem(key string) (string, bool) { return c.ContextItems.get(key) }

// CreateJitFunction finalises the emitted body and returns the inner
// function as a JS function declaration ready for WrapClosure. Mirrors
// BaseFnCompiler.createJitFunction (jitFnCompiler.ts:175) and the
// `getJitFnCode` helper in createJitFunction.ts:71.
func (c *Compiler) CreateJitFunction() string {
	c.handleFunctionReturn()
	return fmt.Sprintf("function %s(%s){%s}", c.FnName, c.argsList(true), c.Code)
}

// IsNoop reports whether handleFunctionReturn classified this jit
// function's body as a noop (empty / tautology). The module renderer
// uses this to decide whether to emit the factory at all.
func (c *Compiler) IsNoop() bool { return c.isNoop }

// ContextLines returns the assembled `const xyz = …` declarations in
// insertion order, joined with `;` so the WrapClosure prologue can
// embed them verbatim.
func (c *Compiler) ContextLines() string {
	return strings.Join(c.ContextItems.ordered(), ";\n")
}

// argsList renders the function's parameter list. With
// includeDefaults=true the output mirrors mion's getJitFnArgs
// (createJitFunction.ts:79): each parameter is rendered as `name` when
// it has no default, or `name=defaultValue` when it does. KindString's
// vλl has an empty default, so the output is just `v`.
func (c *Compiler) argsList(includeDefaults bool) string {
	parts := make([]string, 0, len(c.Args))
	for _, arg := range c.Args {
		if includeDefaults && arg.Default != "" {
			parts = append(parts, arg.Name+"="+arg.Default)
		} else {
			parts = append(parts, arg.Name)
		}
	}
	return strings.Join(parts, ",")
}

// handleCodeInterpolation reconciles a child emitter's code type with
// the expected parent code type. Mirrors jitFnCompiler.ts:452. For an
// atomic root with a JS expression the wrapping logic produces
// `return <expression>` — that's the case v1 exercises.
func (c *Compiler) handleCodeInterpolation(rt *protocol.RunType, child JitCode, parentCT CodeType) string {
	code := child.Code
	childCT := child.Type
	isRoot := len(c.Stack) == 1
	if isRoot {
		switch childCT {
		case CodeE:
			return "return " + code
		case CodeS:
			return addFullStop(code) + " return " + c.ReturnName
		case CodeRB:
			return code
		}
	}
	// Non-root code-type reconciliation. v1's atomic-only scope never
	// reaches the non-root branches, but the table is here verbatim
	// from mion (jitFnCompiler.ts:465) so member kinds drop in cleanly.
	switch {
	case parentCT == CodeE && childCT == CodeE:
		return code
	case parentCT == CodeE && childCT == CodeS,
		parentCT == CodeE && childCT == CodeRB:
		return callSelfInvoking(child)
	case parentCT == CodeS && childCT == CodeE:
		return code
	case parentCT == CodeS && childCT == CodeS:
		return addFullStop(code)
	case parentCT == CodeS && childCT == CodeRB:
		return callSelfInvoking(child)
	case parentCT == CodeRB && childCT == CodeE:
		panic("jitfn: expected block but got expression — would emit useless code")
	case parentCT == CodeRB && childCT == CodeS:
		return addFullStop(code)
	case parentCT == CodeRB && childCT == CodeRB:
		return addFullStop(code) + " return " + c.ReturnName
	}
	panic(fmt.Sprintf("jitfn: unexpected code type (parent=%s child=%s)", parentCT, childCT))
}

// handleFunctionReturn matches jitFnCompiler.ts:413. Detects the
// "compiled body is a noop" cases per-fnID and normalises the code so
// the inner function still has a syntactically valid `return` statement.
func (c *Compiler) handleFunctionReturn() {
	code := normaliseWhitespace(c.Code)
	switch c.FnID {
	case JitFnIsType:
		// mion treats empty / "true" / "return true" as noop because
		// isType for irrelevant types should still answer true.
		if code == "" || code == "true" || code == "return true" {
			c.isNoop = true
			code = "return true"
		}
	}
	c.Code = code
}

// normaliseWhitespace mirrors jitFnCompiler.ts:417 — collapse runs of
// spaces/tabs to one and collapse repeated `;` to a single `;`. Newlines
// are preserved because they can be significant inside template literals
// the emitters may produce in future.
func normaliseWhitespace(code string) string {
	var builder strings.Builder
	builder.Grow(len(code))
	prevSpace := false
	prevSemicolon := false
	for _, r := range code {
		switch {
		case r == ' ' || r == '\t':
			if !prevSpace {
				builder.WriteRune(' ')
			}
			prevSpace = true
			prevSemicolon = false
		case r == ';':
			if !prevSemicolon {
				builder.WriteRune(';')
			}
			prevSpace = false
			prevSemicolon = true
		default:
			builder.WriteRune(r)
			prevSpace = false
			prevSemicolon = false
		}
	}
	return builder.String()
}

// addFullStop ensures a snippet ends with a `;` so the next statement
// can concatenate without ambiguity. Mirrors jitFnCompiler.ts:395.
func addFullStop(code string) string {
	if code == "" {
		return code
	}
	last := code[len(code)-1]
	if last == ';' || last == '}' {
		return code
	}
	return code + ";"
}

// callSelfInvoking wraps a statement/block in an IIFE so the parent
// expression context can embed it. Mirrors jitFnCompiler.ts:496.
func callSelfInvoking(child JitCode) string {
	code := strings.TrimSpace(child.Code)
	if code == "" {
		return ""
	}
	if strings.HasPrefix(code, "(function()") && strings.HasSuffix(code, ")()") {
		return code
	}
	prefix := ""
	if child.Type != CodeRB {
		prefix = "return "
	}
	return "(function(){" + prefix + child.Code + "})()"
}
