package typefns

import (
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// union_flat_layout.go owns the structural decisions every flat-union
// emitter shares — bucketing members into atomic vs object, building
// the merged-property list, and computing the all-or-nothing wrap
// flags via isJsonCompatible. Codegen lives in each emitter family;
// this file produces the layout the codegen iterates.
//
// Layout lives ONLY here, never on protocol.RunType: the merged-prop
// view is an encoding-side dispatch fiction (no canonical RunType
// represents the merged shape) and the protocol describes types,
// not chosen wire formats.

// FlatLayout is the pre-computed flat-union layout. Same instance is
// consumable by every flat encoder/decoder; iterating it should be
// the only structural work an emitter does.
type FlatLayout struct {
	// AtomicMembers carries members that round-trip raw (or via their
	// own per-member factory) — atomics, indexed objects, classes with
	// a non-default SubKind. Order is the original SafeUnionChildren
	// order so OriginalIndex doubles as the wire `[idx, value]` index.
	AtomicMembers []FlatAtomic
	// ObjectMembers carries the mergeable object/class members — the
	// ones whose properties join into the merged-prop set. Order is
	// the SafeUnionChildren order minus atomics.
	ObjectMembers []FlatObject
	// MergedProps is the deduplicated property list across ObjectMembers,
	// ordered by first appearance.
	MergedProps []FlatMergedProp
	// AtomicNeedsTuple is the all-or-nothing wrap flag for the atomic
	// branch. True iff at least one atomic member is non-JSON-natural
	// OR any object branch exists (the [-1, …] envelope coexists with
	// the atomic envelope so the decoder must unconditionally unwrap).
	AtomicNeedsTuple bool
}

type FlatAtomic struct {
	Ref           *protocol.RunType
	Resolved      *protocol.RunType
	OriginalIndex int
}

type FlatObject struct {
	Ref      *protocol.RunType
	Resolved *protocol.RunType
}

type FlatMergedProp struct {
	Name       string
	IsSafeName bool
	// Required is true iff every ObjectMember declared the property AND
	// no declaration is `?:` optional. Lets the emit skip the per-prop
	// `=== undefined` guard for these slots.
	Required bool
	// NeedsSubWrap is the all-or-nothing wrap flag for this prop's
	// multi-candidate sub-dispatch — true iff at least one candidate
	// is non-JSON-natural. Single-candidate or no-candidate props are
	// always false.
	NeedsSubWrap bool
	Candidates   []FlatPropCandidate
}

type FlatPropCandidate struct {
	ChildRef *protocol.RunType
	Resolved *protocol.RunType
	Optional bool
}

// buildFlatLayout consolidates the four legacy helpers
// (splitUnionMembersFlat / buildMergedProps / atomicBranchNeedsTuple /
// mergedPropNeedsSubWrap) into one pass. Recomputed on each call —
// the work is bounded and avoiding shared state keeps the emitter
// pipeline simple.
func buildFlatLayout(rt *protocol.RunType, ctx *EmitContext) FlatLayout {
	layout := FlatLayout{}
	// DataOnly-strip members (symbol / function-like / Promise /
	// non-serializable / never) so a union like `Date | symbol` lays out as
	// `Date`. An all-stripped union keeps its members and falls through to the
	// alwaysThrow path (see union_strip.go). Surviving refs stay gap-free so
	// OriginalIndex (the loop index) is the symmetric encode/decode wire index.
	children := dataOnlyUnionMembers(rt, ctx)
	for i, ref := range children {
		resolved := ctx.ResolveRef(ref)
		if resolved == nil {
			continue
		}
		// Object-like members carrying an index signature fall into the
		// atomic bucket — dynamic keys can't be expressed in the merged
		// property set so they keep per-member dispatch.
		if isObjectLikeKind(resolved.Kind) && objectHasIndexSignatureChild(resolved, ctx) {
			layout.AtomicMembers = append(layout.AtomicMembers, FlatAtomic{Ref: ref, Resolved: resolved, OriginalIndex: i})
			continue
		}
		// Only ObjectLiteral / Class (with SubKindNone) participate in
		// the merge. Other object-like kinds (Array, Tuple, Date, Map,
		// Set …) don't expose a stable per-name property surface so
		// they keep per-member dispatch.
		if resolved.Kind == protocol.KindObjectLiteral || resolved.Kind == protocol.KindClass {
			if resolved.Kind == protocol.KindClass && resolved.SubKind != protocol.SubKindNone {
				layout.AtomicMembers = append(layout.AtomicMembers, FlatAtomic{Ref: ref, Resolved: resolved, OriginalIndex: i})
				continue
			}
			layout.ObjectMembers = append(layout.ObjectMembers, FlatObject{Ref: ref, Resolved: resolved})
			continue
		}
		layout.AtomicMembers = append(layout.AtomicMembers, FlatAtomic{Ref: ref, Resolved: resolved, OriginalIndex: i})
	}

	layout.MergedProps = buildMergedProps(layout.ObjectMembers, ctx)

	// AtomicNeedsTuple — object branch forces wrapping; otherwise any
	// non-JSON-natural atomic member forces wrapping (all-or-nothing).
	if len(layout.ObjectMembers) > 0 {
		layout.AtomicNeedsTuple = true
	} else {
		for _, m := range layout.AtomicMembers {
			if !isJsonCompatible(m.Resolved, ctx) {
				layout.AtomicNeedsTuple = true
				break
			}
		}
	}

	// Per-prop NeedsSubWrap — single-candidate or no-candidate props
	// never need a sub-wrap; multi-candidate props wrap iff at least
	// one candidate is non-JSON-natural.
	for i := range layout.MergedProps {
		mp := &layout.MergedProps[i]
		if len(mp.Candidates) < 2 {
			continue
		}
		for _, cand := range mp.Candidates {
			if cand.Resolved == nil {
				continue
			}
			if !isJsonCompatible(cand.Resolved, ctx) {
				mp.NeedsSubWrap = true
				break
			}
		}
	}

	return layout
}

// buildMergedProps walks every object member, groups its non-static,
// non-function-like Properties / PropertySignatures by name, and
// returns the ordered merged list. Order follows the first appearance
// of each property name across the iteration order of ObjectMembers.
//
// Required is set when EVERY member declares the property non-optionally;
// the emit uses this to drop the per-property `=== undefined` guard.
// Two members carrying the same canonical child id collapse to a
// single candidate (dedupe by ChildRef.ID).
func buildMergedProps(objectMembers []FlatObject, ctx *EmitContext) []FlatMergedProp {
	indexByName := make(map[string]int)
	presentInMember := make(map[string][]bool)
	hasOptionalDecl := make(map[string]bool)
	var merged []FlatMergedProp
	for memberIdx, m := range objectMembers {
		for _, propRef := range m.Resolved.Children {
			prop := ctx.ResolveRef(propRef)
			if prop == nil || prop.IsStatic {
				continue
			}
			if prop.Kind != protocol.KindProperty && prop.Kind != protocol.KindPropertySignature {
				continue
			}
			if prop.Child == nil {
				continue
			}
			childResolved := ctx.ResolveRef(prop.Child)
			if childResolved == nil {
				continue
			}
			// Drop a property whose child is DataOnly-stripped (function-like,
			// symbol, Promise, non-serialisable, never) — the same set a
			// standalone object absorbs in emitProperty*. Without this the
			// candidate survives into the merge, emits CodeNS, and alwaysThrows
			// the WHOLE union, while `{b: symbol}` on its own would serialize as
			// `{}` (K2). Emit the member-dropped warning so the drop stays visible.
			if isStrippedUnionMember(childResolved) {
				ctx.EmitDiagnosticSlot(SlotFunctionPropDropped, prop.Name)
				continue
			}
			candidate := FlatPropCandidate{ChildRef: prop.Child, Resolved: childResolved, Optional: prop.Optional}
			if prop.Optional {
				hasOptionalDecl[prop.Name] = true
			}
			idx, exists := indexByName[prop.Name]
			if !exists {
				indexByName[prop.Name] = len(merged)
				merged = append(merged, FlatMergedProp{
					Name:       prop.Name,
					IsSafeName: prop.IsSafeName,
					Candidates: []FlatPropCandidate{candidate},
				})
				presentInMember[prop.Name] = make([]bool, len(objectMembers))
				presentInMember[prop.Name][memberIdx] = true
				continue
			}
			presentInMember[prop.Name][memberIdx] = true
			candidates := merged[idx].Candidates
			skip := false
			for _, existing := range candidates {
				if existing.ChildRef != nil && candidate.ChildRef != nil && existing.ChildRef.ID == candidate.ChildRef.ID {
					skip = true
					break
				}
			}
			if !skip {
				merged[idx].Candidates = append(candidates, candidate)
			}
		}
	}
	for i := range merged {
		presence := presentInMember[merged[i].Name]
		allPresent := len(presence) == len(objectMembers)
		if allPresent {
			for _, ok := range presence {
				if !ok {
					allPresent = false
					break
				}
			}
		}
		merged[i].Required = allPresent && !hasOptionalDecl[merged[i].Name]
	}
	return merged
}
