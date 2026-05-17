package jitfn

import (
	"fmt"
	"os"
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// debugInlineEnv resolves mion's `getENV('DEBUG_JIT') === 'INLINED'`
// branch once per process. Cheap (env vars are cached at runtime
// startup); a package-level var matches mion's process-wide
// resolution and avoids threading the lookup through every Walker.
var debugInlineEnv = os.Getenv("DEBUG_JIT") == "INLINED"

// StackItem mirrors mion's StackItem (jitFnCompiler.ts:33). One frame
// per RunType the walker is currently inside. Vλl is snapshotted on
// push so popStack can restore the parent's accessor.
type StackItem struct {
	Vλl string
	RT  *protocol.RunType
}

// orderedItems maintains insertion order for context items so the
// emitted JS source is deterministic across runs. Mirrors mion's
// `contextCodeItems = new Map<string, string>()` (jitFnCompiler.ts:96):
// JS Maps preserve insertion order; Go's built-in maps don't, so we
// keep an explicit slice of keys.
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

// Walker is the Go-side port of mion's BaseFnCompiler
// (jitFnCompiler.ts:49), minus the per-fn specifics. Walks a RunType
// graph, dispatches each node through the supplied Emitter, reconciles
// child code types with parent expectations, and assembles the final
// closure body.
//
// One Walker per emitted jit function instance. The Walker owns
// traversal state (Stack, Vλl, Code, ContextItems, deps); the Emitter
// owns the per-fn switch and finalize logic. Adding a new fn = one
// new Emitter implementation; the Walker stays untouched.
type Walker struct {
	// RootType is the entry-point RunType for this jit function.
	RootType *protocol.RunType
	// FnName is the inner function name (e.g. "isType_<hash>") that
	// lands in the emitted `function <FnName>(<args>){…}`.
	FnName string
	// Emitter supplies the per-fn args, dispatch, and finalize logic.
	Emitter Emitter
	// Vλl is the current value-accessor expression. Recomputed on
	// every pushStack from the live stack of frames. For an atomic
	// root it equals the first arg's Name (e.g. "v"); for a member
	// frame future kinds will extend it (e.g. "v.foo", "v[i0]").
	Vλl string
	// Stack is the live traversal stack. The Walker pushes the root
	// on Compile entry; emitters indirectly push more frames by
	// calling EmitContext.CompileChild.
	Stack []StackItem
	// Code is the assembled function body. The Walker stores the
	// most recent root-level emitted code here; Finalize normalises
	// it on exit.
	Code string
	// ContextItems is an ordered set of `const xyz = …;` declarations
	// that WrapClosure emits before the inner function returns.
	ContextItems *orderedItems
	// JitDependencies / PureFnDependencies track which other jit and
	// pure functions this function reaches via dependency calls.
	// v1 doesn't populate either — they're here so the scaffolding
	// matches mion's `updateDependencies` contract (jitFnCompiler.ts:222).
	JitDependencies    []string
	PureFnDependencies []string
}

// NewWalker primes a Walker for the given RunType + Emitter pair.
// The Vλl starts at the first arg's Name (the base value accessor);
// pushStack will refresh it on every descent.
func NewWalker(rt *protocol.RunType, fnName string, emitter Emitter) *Walker {
	args := emitter.Args()
	if len(args) == 0 {
		panic("jitfn: emitter returned empty Args()")
	}
	return &Walker{
		RootType:     rt,
		FnName:       fnName,
		Emitter:      emitter,
		Vλl:          args[0].Name,
		ContextItems: newOrderedItems(),
	}
}

// Compile walks RootType, drives the Emitter, finalizes, and returns
// the inner function declaration `function <FnName>(<args>){<body>}`
// ready for WrapClosure. isNoop reports whether the body was a noop
// (renderer skips noop factories).
//
// Mirrors mion's BaseFnCompiler.compile (jitFnCompiler.ts:279) +
// createJitFunction (jitFnCompiler.ts:175) + getJitFnCode helper
// (createJitFunction.ts:71).
func (w *Walker) Compile() (innerFnDecl string, isNoop bool) {
	w.compileNode(w.RootType, CodeE)
	finalCode, noop := w.Emitter.Finalize(w.Code)
	w.Code = finalCode
	innerFnDecl = fmt.Sprintf("function %s(%s){%s}", w.FnName, w.argsList(true), w.Code)
	return innerFnDecl, noop
}

// ContextLines returns the `const xyz = …` declarations in insertion
// order, joined with `;\n` so WrapClosure's prologue can embed them
// verbatim. Empty when no emitter has registered any context item
// (the v1 KindString path).
func (w *Walker) ContextLines() string {
	return strings.Join(w.ContextItems.ordered(), ";\n")
}

// compileNode is the recursive entry point. The Walker pushes the
// frame, dispatches through the Emitter (or panics if the kind isn't
// inline-supported — see inlining.go for the predicate), reconciles
// the result against the parent's expected code type, then pops.
func (w *Walker) compileNode(rt *protocol.RunType, expectedCType CodeType) JitCode {
	if rt == nil {
		return JitCode{Code: "", Type: expectedCType}
	}
	w.pushStack(rt)
	jc := w.dispatch(rt, expectedCType)
	if jc.Code != "" {
		jc.Code = w.handleCodeInterpolation(rt, jc, expectedCType)
	}
	w.popStack(jc)
	return jc
}

// dispatch decides between inline emission and a dependency call.
// Mirrors mion's BaseFnCompiler.shouldCallDependency
// (jitFnCompiler.ts:218–221): a dependency call happens only when
// BOTH (a) the predicate says the node is NOT inline-cheap AND
// (b) the walker is past depth 1 — the root always inlines so the
// top-level factory has a body. v1's atomic-only scope hits the
// inline branch every time; the dependency branch panics with a
// TODO so the first non-atomic kind forces the conversation about
// how to wire `Emitter.EmitDependencyCall` into the interface.
func (w *Walker) dispatch(rt *protocol.RunType, expectedCType CodeType) JitCode {
	inlineCtx := &InlineContext{
		RT:          rt,
		DebugInline: debugInlineEnv,
		walker:      w,
	}
	shouldDepend := !w.Emitter.IsJitInlined(inlineCtx) && len(w.Stack) > 1
	if shouldDepend {
		// Future: w.Emitter.EmitDependencyCall(rt, childHash, ctx).
		// See refactor plan "Inline-vs-dependent: two pieces, two homes".
		panic(fmt.Sprintf("jitfn: dependency calls not yet implemented (kind=%d)", rt.Kind))
	}
	emitCtx := &EmitContext{Vλl: w.Vλl, walker: w}
	return w.Emitter.Emit(rt, emitCtx, expectedCType)
}

// pushStack snapshots the current Vλl onto a new stack frame.
// getStackVλl computes the descendant accessor from the (pre-push)
// stack; for atomic-root that's just the function's first argument.
// Mirrors jitFnCompiler.ts:148.
func (w *Walker) pushStack(newChild *protocol.RunType) {
	if len(w.Stack) == 0 && newChild != w.RootType {
		panic("jitfn: rootType must be the first item pushed onto the stack")
	}
	w.Vλl = w.getStackVλl()
	w.Stack = append(w.Stack, StackItem{Vλl: w.Vλl, RT: newChild})
}

// popStack mirrors jitFnCompiler.ts:161. Stores the emitted code on
// the Walker (so the root frame's code survives as w.Code at the end)
// and restores Vλl to the parent frame's snapshot.
func (w *Walker) popStack(result JitCode) {
	if result.Code != "" {
		w.Code = result.Code
	}
	if len(w.Stack) == 0 {
		return
	}
	w.Stack = w.Stack[:len(w.Stack)-1]
	if parent := w.peekStack(); parent != nil {
		w.Vλl = parent.Vλl
	} else {
		w.Vλl = w.Emitter.Args()[0].Name
	}
}

func (w *Walker) peekStack() *StackItem {
	if len(w.Stack) == 0 {
		return nil
	}
	return &w.Stack[len(w.Stack)-1]
}

// getStackVλl walks the live stack and concatenates each frame's
// child accessor onto the function's base value parameter. Mirrors
// jitFnCompiler.ts:738. v1's atomic-only scope never descends into
// member kinds, so this returns the base parameter name unchanged.
// Member kinds (property, tuple, array, …) will extend this when
// they land.
func (w *Walker) getStackVλl() string {
	return w.Emitter.Args()[0].Name
}

// argsList renders the function's parameter list. With
// includeDefaults=true the output mirrors mion's getJitFnArgs
// (createJitFunction.ts:79): each parameter is `name` when it has no
// default, or `name=defaultValue` when it does.
func (w *Walker) argsList(includeDefaults bool) string {
	args := w.Emitter.Args()
	parts := make([]string, 0, len(args))
	for _, arg := range args {
		if includeDefaults && arg.Default != "" {
			parts = append(parts, arg.Name+"="+arg.Default)
		} else {
			parts = append(parts, arg.Name)
		}
	}
	return strings.Join(parts, ",")
}

// handleCodeInterpolation reconciles a child emitter's CodeType with
// the expected parent CodeType. Mirrors jitFnCompiler.ts:452. For an
// atomic root with a JS expression the wrapping logic produces
// `return <expression>` — that's the case v1 exercises.
//
// Non-root branches are kept verbatim from mion so the first member /
// collection emitter to land has the full reconciliation table
// available without restructuring.
func (w *Walker) handleCodeInterpolation(rt *protocol.RunType, child JitCode, parentCT CodeType) string {
	code := child.Code
	childCT := child.Type
	isRoot := len(w.Stack) == 1
	if isRoot {
		switch childCT {
		case CodeE:
			return "return " + code
		case CodeS:
			return addFullStop(code) + " return " + w.returnName()
		case CodeRB:
			return code
		}
	}
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
		return addFullStop(code) + " return " + w.returnName()
	}
	panic(fmt.Sprintf("jitfn: unexpected code type (parent=%s child=%s)", parentCT, childCT))
}

// returnName is the JS identifier to return when a statement-shaped
// body needs an explicit `return …` appended. For every fn we ship
// today this is the first arg's Name (vλl for isType / prepareForJson
// / format / mock; pλth-tracked fns like typeErrors will diverge here
// when they land and the simplest answer is to surface returnName via
// the Emitter interface). For v1 it's `Emitter.Args()[0].Name`.
func (w *Walker) returnName() string {
	return w.Emitter.Args()[0].Name
}

// normaliseWhitespace mirrors jitFnCompiler.ts:417 — collapse runs of
// spaces/tabs to one and collapse repeated `;` to a single `;`.
// Newlines are preserved (template literals in future emitters may
// rely on them being significant).
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

// callSelfInvoking wraps a statement/block in an IIFE so a parent
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
