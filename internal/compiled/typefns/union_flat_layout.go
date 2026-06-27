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
	// HasDiscriminant is true iff the object members share a single
	// required, plain-literal discriminant property (e.g. `kind: "t0"` |
	// `kind: "t1"` | …). When set, the merged-prop sub-dispatch selects
	// each candidate by the discriminant VALUE (DiscName) rather than by
	// re-classifying the prop value — the discriminant is preserved across
	// a round-trip, so the chosen sub-index stays byte-stable even when a
	// prop's value normalises to an ambiguous shape (e.g.
	// `Record<string, undefined>` → `{}` after JSON drops undefined
	// entries). See FlatPropCandidate.DiscValues.
	HasDiscriminant bool
	// DiscName is the discriminant property name (valid only when
	// HasDiscriminant). DiscIsSafeName mirrors propertyAccessor's safe-name
	// flag for it.
	DiscName       string
	DiscIsSafeName bool
}

// discAccessor renders the JS accessor for the union discriminant on `v`
// (e.g. `v.kind` or `v["weird key"]`). Empty when the layout has no usable
// discriminant.
func (layout FlatLayout) discAccessor(v string) string {
	if !layout.HasDiscriminant {
		return ""
	}
	return propertyAccessor(v, layout.DiscName, layout.DiscIsSafeName)
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
	// HasStrippedCandidate is true iff at least one object member declared
	// this property name with a DataOnly-stripped type (symbol / function-
	// like / Promise / non-serializable native / never) that was dropped
	// from Candidates. The merge collapses the prop to its surviving
	// candidate(s), so a value belonging to the STRIPPED member still
	// carries the key (e.g. `f2: Uint8Array` for a member whose sibling
	// declares `f2: Date`) — the encode must guard the surviving codec
	// with a value check and DROP the key when it matches none, instead of
	// mis-applying the surviving codec to a foreign value. Always implies
	// !Required (the stripped member never marks the prop present).
	HasStrippedCandidate bool
	Candidates           []FlatPropCandidate
}

type FlatPropCandidate struct {
	ChildRef *protocol.RunType
	Resolved *protocol.RunType
	Optional bool
	// DiscValues lists the discriminant JS literals (e.g. `"t3"`, `1`) of
	// the object members that declared THIS candidate for the prop. Only
	// populated when the layout has a usable discriminant; a candidate
	// shared by two members (same canonical child id) carries both their
	// discriminant values. The encoders dispatch a value to this candidate
	// when its discriminant matches one of these, instead of re-validating.
	DiscValues []string
}

// hasDiscDispatch reports whether the merged prop can use discriminant-based
// candidate selection: there are multiple candidates needing a sub-wrap AND
// every candidate carries at least one discriminant value (so each one is
// reachable by a discriminant match). Single-candidate / no-sub-wrap props
// never need it.
func (mp FlatMergedProp) hasDiscDispatch() bool {
	if len(mp.Candidates) < 2 || !mp.NeedsSubWrap {
		return false
	}
	for _, cand := range mp.Candidates {
		if cand.Resolved == nil {
			continue
		}
		if len(cand.DiscValues) == 0 {
			return false
		}
	}
	return true
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

	// Detect a usable shared-name literal discriminant across the object
	// members. discValueByMember is parallel to layout.ObjectMembers and
	// feeds per-candidate DiscValues into buildMergedProps.
	discName, discIsSafe, discValueByMember, discOK := detectFlatDiscriminant(layout.ObjectMembers, ctx)
	if discOK {
		layout.HasDiscriminant = true
		layout.DiscName = discName
		layout.DiscIsSafeName = discIsSafe
	}

	layout.MergedProps = buildMergedProps(layout.ObjectMembers, ctx, discValueByMember)

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
//
// discValueByMember (when non-nil) is parallel to objectMembers and holds
// each member's discriminant JS literal; a candidate accumulates the
// discriminant values of every member that declared it, so the encoders can
// dispatch by discriminant instead of re-validating the prop value.
func buildMergedProps(objectMembers []FlatObject, ctx *EmitContext, discValueByMember []string) []FlatMergedProp {
	indexByName := make(map[string]int)
	presentInMember := make(map[string][]bool)
	hasOptionalDecl := make(map[string]bool)
	strippedByName := make(map[string]bool)
	var merged []FlatMergedProp
	for memberIdx, m := range objectMembers {
		discValue := ""
		if memberIdx < len(discValueByMember) {
			discValue = discValueByMember[memberIdx]
		}
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
				// Record so the surviving candidate's codec is guarded — a value
				// from THIS (stripped) member still carries the key with a foreign
				// type the surviving codec must not be applied to (G3 / G4).
				strippedByName[prop.Name] = true
				continue
			}
			candidate := FlatPropCandidate{ChildRef: prop.Child, Resolved: childResolved, Optional: prop.Optional}
			if discValue != "" {
				candidate.DiscValues = []string{discValue}
			}
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
			for k, existing := range candidates {
				if existing.ChildRef != nil && candidate.ChildRef != nil && existing.ChildRef.ID == candidate.ChildRef.ID {
					// Same canonical child shared by another member — fold this
					// member's discriminant value into the existing candidate.
					if discValue != "" {
						candidates[k].DiscValues = append(candidates[k].DiscValues, discValue)
					}
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
		merged[i].HasStrippedCandidate = strippedByName[merged[i].Name]
		// A stripped sibling means the prop is absent from at least one member's
		// projection, so it can never be Required (the guard below would also
		// mis-drop the `=== undefined` check).
		merged[i].Required = allPresent && !hasOptionalDecl[merged[i].Name] && !merged[i].HasStrippedCandidate
	}
	return merged
}

// detectFlatDiscriminant looks for a single property name that every object
// member declares as a REQUIRED, plain-literal value with a value unique across
// the members — the classic discriminated-union shape (`kind: "t0"` | …). On
// success it returns the chosen name, its safe-name flag, and a slice parallel
// to objectMembers holding each member's discriminant JS literal.
//
// Self-contained on the resolved layout rather than rt.UnionDiscriminators: it
// only accepts the strictly-usable case (shared name, plain comparable literal)
// and yields the rendered JS literal the encoders compare against directly.
//
// The discriminant lets the merged-prop sub-dispatch pick each candidate by the
// member it belongs to instead of re-validating the prop value — the value is
// preserved across a round-trip, so the chosen sub-index stays byte-stable even
// when a prop normalises to an ambiguous shape (e.g. `Record<string, undefined>`
// collapsing to `{}` once JSON drops its undefined entries).
func detectFlatDiscriminant(objectMembers []FlatObject, ctx *EmitContext) (string, bool, []string, bool) {
	if len(objectMembers) < 2 {
		return "", false, nil, false
	}
	// Per member: the plain-literal JS value of each required literal prop.
	litByMember := make([]map[string]string, len(objectMembers))
	safeByName := make(map[string]bool)
	for memberIdx, m := range objectMembers {
		lits := make(map[string]string)
		for _, propRef := range m.Resolved.Children {
			prop := ctx.ResolveRef(propRef)
			if prop == nil || prop.IsStatic || prop.Optional {
				continue
			}
			if prop.Kind != protocol.KindProperty && prop.Kind != protocol.KindPropertySignature {
				continue
			}
			if prop.Child == nil {
				continue
			}
			child := ctx.ResolveRef(prop.Child)
			if child == nil || child.Kind != protocol.KindLiteral {
				continue
			}
			literal, ok := plainLiteralJS(child)
			if !ok {
				continue
			}
			lits[prop.Name] = literal
			safeByName[prop.Name] = prop.IsSafeName
		}
		litByMember[memberIdx] = lits
	}
	// A usable name is present in EVERY member with a value unique per member.
	// Pick deterministically (lowest name) so codegen is stable.
	best := ""
	for name := range litByMember[0] {
		seen := make(map[string]bool, len(objectMembers))
		usable := true
		for memberIdx := range objectMembers {
			value, present := litByMember[memberIdx][name]
			if !present || seen[value] {
				usable = false
				break
			}
			seen[value] = true
		}
		if usable && (best == "" || name < best) {
			best = name
		}
	}
	if best == "" {
		return "", false, nil, false
	}
	discValueByMember := make([]string, len(objectMembers))
	for memberIdx := range objectMembers {
		discValueByMember[memberIdx] = litByMember[memberIdx][best]
	}
	return best, safeByName[best], discValueByMember, true
}

// plainLiteralJS renders a KindLiteral's value as the JS literal used in an
// equality comparison (`=== "t3"`, `=== 1`, `=== true`). Reports false for
// bigint / symbol literals, whose Literal payload isn't a directly comparable
// plain value, so they're never chosen as a flat discriminant.
func plainLiteralJS(rt *protocol.RunType) (string, bool) {
	for _, flag := range rt.Flags {
		if flag == "bigint" || flag == "symbol" {
			return "", false
		}
	}
	literal, err := jsLiteralFromAny(rt.Literal)
	if err != nil {
		return "", false
	}
	return literal, true
}
