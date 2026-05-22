package jitfn

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
