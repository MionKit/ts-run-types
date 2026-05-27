package typefns

import "github.com/mionkit/ts-run-types/internal/protocol"

// InlineContext is the input to an Emitter.IsRTInlined call. Mirrors
// the surface mion's `BaseRunType.isRTInlined` reads from `this`
// (run-types/src/lib/baseRunTypes.ts:52) plus the env / depth flags
// that live caller-side in mion's RTFnCompiler. Keeping the fields
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
	// `getENV('DEBUG_RT') === 'INLINED'` flag — when true the
	// predicate must return true regardless of other heuristics, so
	// developers can force-inline every node to study generated code.
	// Resolved once at Walker construction; threaded through here so
	// the predicate doesn't hit os.Getenv on every dispatch.
	DebugInline bool
	walker      *Walker
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

// DefaultIsRTInlined is the shared default predicate every Emitter
// can delegate to. Body matches mion's BaseRunType.isRTInlined
// (run-types/src/lib/baseRunTypes.ts:52–61) — the implementation is
// shared across ALL rt functions in mion (no per-class overrides
// are defined in the entire run-types package), so emitters that
// don't have a strong reason to differ should just call this.
//
// The user's question "should each fn have its own predicate?" lands
// here: the answer is "share by default, override when you need to".
// Mion went all-shared and that's worked. Per-fn variation is a
// capability we want to RESERVE, not exercise speculatively.
//
// Decision matrix (in order) — matches mion's BaseRunType.isRTInlined
// (baseRunTypes.ts:52-61) byte-for-byte:
//  1. IsCircular → false. Circular types must self-invoke, so the
//     parent always issues a dependency call instead of inlining.
//  2. DebugInline → true (env override, mion's getENV branch).
//  3. KindArray → false (mion comment: "all array are self invoked
//     for isType and are usually repeated type like string[] or
//     number[] so worth deduplicating").
//  4. KindObjectLiteral / KindClass / KindTuple / KindUnion → false.
//     mion only deopts named collections (typeName + family C); we
//     can't rely on that alone because (a) our serializer doesn't
//     populate TypeName on `interface Foo {}` declarations and
//     (b) the IsCircular flag on protocol.RunType isn't auto-set
//     yet. Treating every compound as non-inlined matches KindArray's
//     stance and is correct for every case in the validation suite
//     (anonymous non-circular composites get their own factory — a
//     small constant-factor cost, no correctness impact). When a
//     proper circular-detection pass in the serializer lands and
//     sets IsCircular, these arms can flip back to "inline unless
//     circular or named" without code-shape changes.
//     The atomic-Date arm (KindClass+SubKindDate) is handled inside
//     istype.go and never reaches here as a child to inline (it
//     emits a single instanceof expression).
//  5. Named Collection → false (mion comment: "collection with name
//     might be used in different places so worth deduplicating").
//  6. Otherwise → true.
func DefaultIsRTInlined(ctx *InlineContext) bool {
	if ctx == nil || ctx.RT == nil {
		return true
	}
	if ctx.RT.IsCircular {
		return false
	}
	if ctx.DebugInline {
		return true
	}
	if ctx.RT.Kind == protocol.KindArray {
		return false
	}
	if ctx.RT.Kind == protocol.KindObjectLiteral {
		return false
	}
	if ctx.RT.Kind == protocol.KindClass {
		// Date is atomic in mion (extends AtomicRunType) — its emit is
		// a single instanceof/`new Date(v)` expression with no child
		// recursion, so inlining produces correct JS and avoids the
		// dangling-dep cascade that would otherwise nuke any parent
		// factory whose dep chain reaches a noop Date emit (e.g.
		// prepareForJson<Date> is `{code: undefined, type: 'S'}` →
		// no factory emitted → dep references a missing entry).
		// Subkinds other than Date go through the named-collection
		// (non-inlined) branch.
		if ctx.RT.SubKind == protocol.SubKindDate {
			return true
		}
		return false
	}
	if ctx.RT.Kind == protocol.KindTuple {
		return false
	}
	if ctx.RT.Kind == protocol.KindUnion {
		return false
	}
	if ctx.RT.TypeName != "" && protocol.FamilyOf(ctx.RT.Kind) == protocol.FamilyCollection {
		return false
	}
	return true
}
