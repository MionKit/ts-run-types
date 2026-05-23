package typefns

import "github.com/mionkit/ts-run-types/internal/protocol"

// ArgSpec describes one parameter of the emitted jit function. Mirrors
// mion's `args[key] = name` + `defaultParamValues[key] = default`
// pairing (jitFnCompiler.ts:71). Key is the conceptual slot ("vλl",
// "pλth", "εrr"); Name is the JS identifier in the emitted signature;
// Default is the JS-source default expression (empty for no default).
type ArgSpec struct {
	Key     string
	Name    string
	Default string
}

// Emitter is the per-fn implementation surface. One Emitter per jit
// function id (isType, typeErrors, prepareForJson, …). All fn-specific
// logic lives behind this interface; the Walker (walker.go) drives
// traversal without knowing which fn is being emitted.
//
// Adding a new fn = one new file with one Emitter struct + one giant
// `switch rt.Kind` inside Emit. Zero edits to the Walker.
type Emitter interface {
	// Args returns the inner function's parameter list. The first
	// entry's Name is the base value accessor — the Walker uses it as
	// the starting Vλl for the root frame. isType:
	// `[{Key:"vλl", Name:"v", Default:""}]`. typeErrors will be:
	// `[{vλl,v,""}, {pλth,pth,"[]"}, {εrr,er,"[]"}]`.
	Args() []ArgSpec

	// Supports reports whether Emit will produce valid code for rt
	// at the top level (renderer pre-flight check). Returning false
	// causes the renderer to skip emitting a factory for rt instead
	// of letting Emit panic. Recursive calls from inside Emit are
	// NOT gated by Supports — child kinds the dispatch doesn't
	// handle should panic loudly so the bug surfaces at compile time.
	Supports(rt *protocol.RunType) bool

	// IsJitInlined reports whether the walker should inline rt's
	// emitted code at the call site (true) or emit a dependency call
	// to a precompiled factory (false). The walker enforces an
	// independent depth gate (only dependency-call at depth > 1, so
	// the root always inlines); this predicate answers the intrinsic
	// "is rt cheap enough to inline?" question.
	//
	// Mion's run-types/src/lib/baseRunTypes.ts:52 defines this once
	// on BaseRunType — shared across every jit fn. Our equivalent
	// is `DefaultIsJitInlined` (inlining.go); emitters that want
	// mion's behaviour delegate to it. Emitters that need different
	// rules (the user's stated reason for surfacing this on the
	// Emitter interface) override the body. Per-fn override is
	// CAPABILITY, not policy — share unless you have a concrete
	// reason to diverge.
	IsJitInlined(ctx *InlineContext) bool

	// Emit dispatches the giant per-kind switch. The Walker calls
	// this once per node in the RunType graph. EmitContext exposes
	// the current value accessor + the hooks the emitter needs
	// (recursion into children, context-item registration).
	// expectedCType is the parent frame's required CodeType — most
	// emitters can ignore it; reconciliation happens in the Walker.
	Emit(rt *protocol.RunType, ctx *EmitContext, expectedCType CodeType) JitCode

	// EmitDependencyCall returns the JS expression that invokes a
	// pre-rendered child JIT entry. Used by the Walker when the
	// dispatch site decides a child is non-inline-cheap and the
	// stack is past depth 1 (mirrors mion's
	// BaseFnCompiler.callDependency at jitFnCompiler.ts:326). The
	// emitter also registers a context-item declaration of the form
	// `const <hash> = utl.getJIT('<hash>')` so the inner factory's
	// closure resolves the child via the jitUtils singleton.
	//
	// Self-recursive calls (childID == own hash) emit `<hash>(args)`;
	// cross-function calls emit `<hash>.fn(args)` — same split as
	// mion's `isSelf` branch.
	EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string

	// Finalize normalises the raw concatenated body produced by the
	// walk, detects noop bodies (empty / tautology / "just return
	// vλl"), and returns the final body string + an isNoop flag the
	// renderer uses to skip noop factories entirely.
	//
	//   isType: empty/"true"/"return true" → ("return true", true)
	//   typeErrors: empty → ("return εrr", true)
	//   prepareForJson et al: empty → ("return v", true)
	Finalize(rawCode string) (code string, isNoop bool)

	// ReturnName is the JS identifier the walker appends after a
	// statement-shaped body via `… return <ReturnName>`. For isType /
	// prepareForJson / format / mock this is the first arg's Name
	// (`v`). For typeErrors the accumulator is the third arg (`er`),
	// so the emitter overrides this method to return `"er"` instead.
	ReturnName() string
}

// EmitContext is the narrow surface Emit implementations see. They
// never touch the Walker directly — keeps the interface stable as the
// walker's internals evolve and prevents emitters from poking at
// traversal state (Stack mutation, finalize hooks, etc.).
//
// Vλl is a snapshot taken when Emit is called. CompileChild can
// recurse into nested kinds; by the time it returns the walker has
// popped back to this frame, so Vλl stays correct for the duration of
// the calling Emit body.
type EmitContext struct {
	Vλl    string
	walker *Walker
}

// CompileChild recurses into rt as a child of the current frame.
// Used by collection emitters (object literal, union, …) that need
// to compose child code into their own snippet. v1's atomic-only
// scope never reaches this path; the method is here so the first
// collection emitter that lands can call into it without restructuring.
func (ctx *EmitContext) CompileChild(rt *protocol.RunType, expectedCType CodeType) JitCode {
	return ctx.walker.compileNode(rt, expectedCType)
}

// IsRoot reports whether the current Emit call is at the JIT
// function's root (the outermost frame). Mirrors mion's
// `comp.getNestLevel(runType) === 0`. Used by emitters whose output
// shape depends on root-vs-nested context — e.g. stringifyJson's
// atomic number/null emits return `String(v)` at root (so the JIT
// fn returns a JSON-parseable string) but bare `v` at non-root
// (the parent concatenates and the JS `+` coerces).
func (ctx *EmitContext) IsRoot() bool {
	return ctx.walker != nil && len(ctx.walker.Stack) == 1
}

// ResolveRef dereferences a KindRef sentinel via the walker's ref
// table. Returns the input unchanged when it isn't a ref; nil when
// the ref points at a missing entry. Useful for emit decisions that
// need to peek at the resolved kind (e.g. PropertySignature checking
// whether its wrapped child is a function — which would skip the
// property from the parent's AND chain).
func (ctx *EmitContext) ResolveRef(rt *protocol.RunType) *protocol.RunType {
	return ctx.walker.resolveRef(rt)
}

// NextLocalVar allocates and returns a fresh local variable name
// scoped to the current emitter instance. Mirrors mion's
// JitFnCompiler.getLocalVarName (jitFnCompiler.ts:236) — each call
// hands out a unique name so child accessors and result locals
// never collide across nested frames. Prefix convention: "i" for
// loop counters, "res" for child-result locals.
func (ctx *EmitContext) NextLocalVar(prefix string) string {
	return ctx.walker.nextLocalVar(prefix)
}

// SetChildAccessor records the value-accessor expression that the
// next pushStack will use as the child's Vλl. Used by collection
// emitters (Array, Object, Tuple, …) that need to point a child
// frame at a specific subscript or property expression instead of
// the parent's own Vλl. The accessor stays attached to the current
// (parent) frame so getStackVλl reads it at the next pushStack and
// then the parent emit can move on to its next child by calling
// SetChildAccessor again.
func (ctx *EmitContext) SetChildAccessor(accessor string) {
	ctx.walker.setChildAccessor(accessor)
}

// SetChildPathLiteral records the path-literal contribution the next
// pushStack frame inherits. Symmetric with SetChildAccessor — collection
// emitters call it before each CompileChild so the child frame's
// PathLiteral reflects the property name, tuple index, or loop counter
// the child sits at relative to the parent. Used by typeErrors-style
// emitters to build access-path arrays for error reporting; isType
// ignores it.
func (ctx *EmitContext) SetChildPathLiteral(literal string) {
	ctx.walker.setChildPathLiteral(literal)
}

// AccessPathLiteral returns a JS array-literal expression listing every
// non-empty PathLiteral on the current stack, with `extra` appended as a
// trailing segment when non-empty. Empty path → empty string (caller
// omits the argument). Used by typeErrors emitters when calling
// cpf_newRunTypeErr to embed the static path segments at error sites.
//
// Mirrors mion's `getAccessPath` + `getAccessPathLiteral`
// (jitFnCompiler.ts:677-681) — same join, same `extra` semantics.
func (ctx *EmitContext) AccessPathLiteral(extra string) string {
	segments := ctx.walker.accessPath()
	if extra != "" {
		segments = append(segments, extra)
	}
	if len(segments) == 0 {
		return ""
	}
	return "[" + joinComma(segments) + "]"
}

// AccessPathLength returns the number of static path segments the
// current stack contributes (with `extra` counted when non-empty).
// Used by typeErrors EmitDependencyCall to size the `pth.splice(-N)`
// pop that unwinds the path after a dependency-call returns. Mirrors
// mion's `getAccessPathLength` (jitFnCompiler.ts implicit via array
// length on getAccessPath result).
func (ctx *EmitContext) AccessPathLength(extra string) int {
	n := len(ctx.walker.accessPath())
	if extra != "" {
		n++
	}
	return n
}

// SetContextItem registers a closure-prologue `const xyz = …;`
// declaration. WrapClosure emits these before the inner function so
// they're evaluated once per factory call, not on every validator
// invocation. Mirrors jitFnCompiler.ts:243.
func (ctx *EmitContext) SetContextItem(key, value string) {
	ctx.walker.ContextItems.set(key, value)
}

// HasContextItem mirrors jitFnCompiler.ts:253.
func (ctx *EmitContext) HasContextItem(key string) bool {
	return ctx.walker.ContextItems.has(key)
}

// GetContextItem mirrors jitFnCompiler.ts:248.
func (ctx *EmitContext) GetContextItem(key string) (string, bool) {
	return ctx.walker.ContextItems.get(key)
}

// AddPureFnDependency records that the emitted body reaches a pure-fn
// at `utl.getPureFn(<namespace>, <fnName>)`. The walker forwards each
// dependency to the resolver's integrity check at end of compilation —
// see internal/compiled/typefns/walker.go's AddPureFnDependency for the
// recording contract. Used by typeErrors to register `cpf_newRunTypeErr`
// before emitting calls into it.
func (ctx *EmitContext) AddPureFnDependency(namespace, fnName, filePath string) {
	ctx.walker.AddPureFnDependency(namespace, fnName, filePath)
}

// ArgName looks up the JS identifier the inner function uses for a
// conceptual arg slot ("vλl", "pλth", "εrr") via the emitter's Args
// list. Returns "" when the slot isn't declared on this emitter — eg
// isType has no "pλth" / "εrr", so callers gating on those slots
// short-circuit cleanly without panicking. Mirrors mion's
// `this.args.<key>` access (jitFnCompiler.ts:671).
func (ctx *EmitContext) ArgName(key string) string {
	for _, arg := range ctx.walker.Emitter.Args() {
		if arg.Key == key {
			return arg.Name
		}
	}
	return ""
}

// joinComma is a private helper to concatenate path-literal segments
// without depending on strings.Join (avoids an import here; the file
// otherwise stays import-free).
func joinComma(parts []string) string {
	switch len(parts) {
	case 0:
		return ""
	case 1:
		return parts[0]
	}
	total := 0
	for _, p := range parts {
		total += len(p) + 1
	}
	buf := make([]byte, 0, total)
	for i, p := range parts {
		if i > 0 {
			buf = append(buf, ',')
		}
		buf = append(buf, p...)
	}
	return string(buf)
}
