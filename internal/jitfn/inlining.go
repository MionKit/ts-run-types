package jitfn

import "github.com/mionkit/ts-run-types/internal/protocol"

// InlineContext is the input to an Emitter.IsJitInlined call. Mirrors
// the surface mion's `BaseRunType.isJitInlined` reads from `this`
// (run-types/src/lib/baseRunTypes.ts:52) plus the env / depth flags
// that live caller-side in mion's JitFnCompiler. Keeping the fields
// explicit makes the predicate easy to override per-fn (the user's
// stated reason for moving inlining decisions onto Emitters) without
// forcing every implementation to reach back into the Walker.
//
// "More context = better" was an explicit design goal — when adding
// fields, prefer surfacing them on InlineContext over having the
// predicate poke at walker internals through method calls.
type InlineContext struct {
	// RT is the RunType under consideration. The predicate inspects
	// Kind, TypeName, and FamilyOf(Kind) — same triplet mion uses.
	RT *protocol.RunType
	// DebugInline is the resolved value of mion's
	// `getENV('DEBUG_JIT') === 'INLINED'` flag — when true the
	// predicate must return true regardless of other heuristics, so
	// developers can force-inline every node to study generated code.
	// Resolved once at Walker construction; threaded through here so
	// the predicate doesn't hit os.Getenv on every dispatch.
	DebugInline bool
	// TODO: IsCircular bool — when the first collection kind lands
	// and serializer surfaces self-reference detection on RunType,
	// thread it here so the predicate can short-circuit to a
	// dependency call (matches mion's `this.isCircular` branch in
	// baseRunTypes.ts:54). Stay out of scope until the serializer
	// actually exposes the flag.
	walker *Walker
}

// StackDepth reports how deep the walker currently is in the
// traversal. Used by predicates that want to differentiate between
// "this is the root node" and "this is nested" — though the Walker
// applies its own `depth > 1` gate at the dispatch site, so most
// predicates don't need to check this themselves. Exposed for
// future emitters that want richer context-aware decisions.
func (ctx *InlineContext) StackDepth() int {
	if ctx.walker == nil {
		return 0
	}
	return len(ctx.walker.Stack)
}

// CurrentVλl returns the walker's current value-accessor expression
// at the point of the predicate call. Symmetric with EmitContext.Vλl
// but exposed on the inlining context too in case future fns base
// inlining heuristics on the accessor shape (e.g. estimated emitted
// code size).
func (ctx *InlineContext) CurrentVλl() string {
	if ctx.walker == nil {
		return ""
	}
	return ctx.walker.Vλl
}

// DefaultIsJitInlined is the shared default predicate every Emitter
// can delegate to. Body matches mion's BaseRunType.isJitInlined
// (run-types/src/lib/baseRunTypes.ts:52–61) — the implementation is
// shared across ALL jit functions in mion (no per-class overrides
// are defined in the entire run-types package), so emitters that
// don't have a strong reason to differ should just call this.
//
// The user's question "should each fn have its own predicate?" lands
// here: the answer is "share by default, override when you need to".
// Mion went all-shared and that's worked. Per-fn variation is a
// capability we want to RESERVE, not exercise speculatively.
//
// Decision matrix (in order):
//  1. DebugInline → true (env override, mion's getENV branch).
//  2. KindArray → false (mion comment: "all array are self invoked
//     for isType and are usually repeated type like string[] or
//     number[] so worth deduplicating").
//  3. Named Collection → false (mion comment: "collection with name
//     might be used in different places so worth deduplicating").
//  4. Otherwise → true.
//
// TODO: when InlineContext exposes IsCircular, prepend a
// `if ctx.IsCircular { return false }` branch above the env check.
func DefaultIsJitInlined(ctx *InlineContext) bool {
	if ctx == nil || ctx.RT == nil {
		return true
	}
	if ctx.DebugInline {
		return true
	}
	if ctx.RT.Kind == protocol.KindArray {
		return false
	}
	if ctx.RT.TypeName != "" && protocol.FamilyOf(ctx.RT.Kind) == protocol.FamilyCollection {
		return false
	}
	return true
}
