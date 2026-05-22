package jitfn

import (
	"strconv"
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// union_flat.go owns the three KindUnion emits used by the *Flat
// JSON-serialiser family. The wire shape produced here differs from the
// non-flat family only at unions:
//
//   - Atomic union members keep the original `[memberIndex, value]`
//     envelope (skipping the wrap when both halves of the round-trip
//     are noop on the member — same `unionMemberNeedsTuple` rule).
//   - Object/class union members are MERGED into one envelope:
//     `[-1, mergedObject]`. The merged object carries the union of every
//     object member's properties; each property is encoded if its key is
//     defined on `v` at encode time. Decode mirrors the encode: walk the
//     merged set, decode every defined key.
//
// The optimisation avoids the per-object `isType` walk on encode for
// the common "discriminated bag of N large classes" shape — instead of
// running N property-set checks to pick a member index, the emitter
// runs the per-property transforms directly and uses the `-1` sentinel
// at decode time to skip dispatch entirely.
//
// Conflict resolution: when two object members carry a property with the
// same name but different child type IDs, the merged prop's value
// branches at runtime via a nested `[subIdx, value]` inline-union — same
// shape as the regular non-flat union, but scoped to that one property.
//
// Object members that carry an index signature can't be safely merged
// (dynamic keys would collide with the merged-set discriminator), so
// they fall back into the atomic bucket and get their original
// per-member `[memberIndex, value]` dispatch.

// memberRef pairs a union child ref with its 0-based position in
// SafeUnionChildren. Atomic clauses use that position as the
// `[memberIndex, value]` wire index so the wire shape stays compatible
// with the non-flat decoder for the per-atomic case.
type memberRef struct {
	ref           *protocol.RunType
	originalIndex int
	resolved      *protocol.RunType
}

type unionSplit struct {
	atomic []memberRef
	object []memberRef
}

// splitUnionMembersFlat buckets union children into atomic + object
// (mergeable) members. Object members carrying an index signature fall
// into the atomic bucket because their dynamic keys can't be expressed
// in the merged-property set.
func splitUnionMembersFlat(rt *protocol.RunType, ctx *EmitContext) unionSplit {
	children := rt.SafeUnionChildren
	if len(children) == 0 {
		children = rt.Children
	}
	var split unionSplit
	for i, ref := range children {
		resolved := ctx.ResolveRef(ref)
		if resolved == nil {
			continue
		}
		entry := memberRef{ref: ref, originalIndex: i, resolved: resolved}
		if isObjectLikeKind(resolved.Kind) && objectHasIndexSig(resolved, ctx) {
			split.atomic = append(split.atomic, entry)
			continue
		}
		if resolved.Kind == protocol.KindObjectLiteral || resolved.Kind == protocol.KindClass {
			// Only ObjectLiteral / Class (with SubKindNone) participate in
			// the merge. Other object-like kinds (Array, Tuple, Date,
			// Map, Set …) don't expose a stable per-name property surface
			// so they keep per-member dispatch.
			if resolved.Kind == protocol.KindClass && resolved.SubKind != protocol.SubKindNone {
				split.atomic = append(split.atomic, entry)
				continue
			}
			split.object = append(split.object, entry)
			continue
		}
		split.atomic = append(split.atomic, entry)
	}
	return split
}

func objectHasIndexSig(rt *protocol.RunType, ctx *EmitContext) bool {
	for _, childRef := range rt.Children {
		child := ctx.ResolveRef(childRef)
		if child == nil {
			continue
		}
		if child.Kind == protocol.KindIndexSignature {
			return true
		}
	}
	return false
}

// propCandidate is one source-member contribution to a merged property.
type propCandidate struct {
	// childRef is the property's declared child type — what the
	// member's property emit would compile against.
	childRef *protocol.RunType
	// optional is set when the property's PropertySignature carries the
	// `?:` optional marker on this member. Used by the `required` flag
	// on mergedProp to decide whether the merged emit can drop its
	// `=== undefined` guard.
	optional bool
}

// mergedProp groups every object member's property by name. candidates
// holds one entry per source member that carries the property; when all
// candidates share the same canonical child id the merged emit becomes
// a simple `<child-prepare>`; mixed child ids trigger an inline union
// dispatch keyed on a fresh `[subIdx, value]` envelope per-property.
type mergedProp struct {
	name       string
	isSafeName bool
	candidates []propCandidate
	// required is true when EVERY union member declares the property
	// AND no declaration is `?:` optional. Lets the emit skip the
	// per-property `=== undefined` guard for these slots — for
	// discriminated unions with mostly-shared shapes, every prop is
	// required and the merged emit collapses to flat string concat
	// matching the non-flat per-member factory.
	required bool
}

// buildMergedProps walks every object member, groups its non-static,
// non-function-like Properties / PropertySignatures by name, and
// returns the ordered merged list. Order follows the first appearance
// of each property name across the iteration order of SafeUnionChildren.
//
// `required` is set when EVERY member declares the property non-optionally;
// the emit uses this to drop the per-property `=== undefined` guard.
func buildMergedProps(objectMembers []memberRef, ctx *EmitContext) []mergedProp {
	indexByName := make(map[string]int)
	// presentInMember[propName][memberIdx] tracks "this property was
	// found on this member" — used to compute the `required` flag below.
	presentInMember := make(map[string][]bool)
	hasOptionalDecl := make(map[string]bool)
	var merged []mergedProp
	for memberIdx, m := range objectMembers {
		for _, propRef := range m.resolved.Children {
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
			if childResolved == nil || isFunctionLikeKind(childResolved.Kind) {
				continue
			}
			candidate := propCandidate{childRef: prop.Child, optional: prop.Optional}
			if prop.Optional {
				hasOptionalDecl[prop.Name] = true
			}
			idx, exists := indexByName[prop.Name]
			if !exists {
				indexByName[prop.Name] = len(merged)
				merged = append(merged, mergedProp{
					name:       prop.Name,
					isSafeName: prop.IsSafeName,
					candidates: []propCandidate{candidate},
				})
				presentInMember[prop.Name] = make([]bool, len(objectMembers))
				presentInMember[prop.Name][memberIdx] = true
				continue
			}
			presentInMember[prop.Name][memberIdx] = true
			// Dedupe candidates by child ref ID — two members carrying the
			// same canonical type collapse to a single candidate.
			candidates := merged[idx].candidates
			skip := false
			for _, existing := range candidates {
				if existing.childRef != nil && candidate.childRef != nil && existing.childRef.ID == candidate.childRef.ID {
					skip = true
					break
				}
			}
			if !skip {
				merged[idx].candidates = append(candidates, candidate)
			}
		}
	}
	// Mark required: every member must have declared the prop AND no
	// declaration is optional. For discriminated unions this is the
	// common case for every shared property.
	for i := range merged {
		presence := presentInMember[merged[i].name]
		allPresent := len(presence) == len(objectMembers)
		if allPresent {
			for _, ok := range presence {
				if !ok {
					allPresent = false
					break
				}
			}
		}
		merged[i].required = allPresent && !hasOptionalDecl[merged[i].name]
	}
	return merged
}

// unionMemberNeedsTupleFlat is the flat-family analogue of
// unionMemberNeedsTuple — peeks PrepareForJsonFlatEmitter +
// RestoreFromJsonFlatEmitter so the noop cache keys don't collide with
// the non-flat family's. Atomic members that are noop on both halves
// skip the `[memberIndex, value]` wrap exactly like the non-flat path.
func unionMemberNeedsTupleFlat(member *protocol.RunType, ctx *EmitContext) bool {
	pjNoop := peekMemberIsNoop(member, PrepareForJsonFlatEmitter{}, ctx)
	rjNoop := peekMemberIsNoop(member, RestoreFromJsonFlatEmitter{}, ctx)
	return !(pjNoop && rjNoop)
}

// flatUnionErrorVar registers the canonical encode-error context item
// once per emit pass and returns its name. Shared across all three
// emit families so the renderer collapses to a single declaration.
func flatUnionEncodeErrorVar(ctx *EmitContext) string {
	name := "fuEncErr"
	if !ctx.HasContextItem(name) {
		ctx.SetContextItem(name, "const "+name+" = 'Can not json encode union: item does not belong to the union'")
	}
	return name
}

func flatUnionDecodeErrorVar(ctx *EmitContext) string {
	name := "fuDecErr"
	if !ctx.HasContextItem(name) {
		ctx.SetContextItem(name, "const "+name+" = 'Can not json decode union: invalid union index'")
	}
	return name
}

// --- prepareForJson encode ---------------------------------------------------

// emitUnionPrepareForJsonFlat — the encode-side of the flat-union wire
// shape. Mutates v: object members get every defined property
// transformed and then v = [-1, v]; atomic members run their original
// prepare and (when needed) wrap as [memberIndex, v].
func emitUnionPrepareForJsonFlat(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	split := splitUnionMembersFlat(rt, ctx)
	if len(split.atomic) == 0 && len(split.object) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}

	var clauses []string

	// Atomic clauses — same shape as the non-flat union encode.
	for _, m := range split.atomic {
		needsTuple := unionMemberNeedsTupleFlat(m.resolved, ctx)
		prepareJit := ctx.CompileChild(m.ref, CodeS)
		if prepareJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		isTypeExpr := unionMemberIsTypeCheck(m.resolved, ctx, v)
		guard := isTypeExpr
		if isObjectLikeKind(m.resolved.Kind) {
			guard = "(typeof " + v + " === 'object' && " + v + " !== null && " + isTypeExpr + ")"
		}
		body := strings.TrimSpace(prepareJit.Code)
		if body != "" && !strings.HasSuffix(body, ";") && !strings.HasSuffix(body, "}") {
			body += ";"
		}
		if needsTuple {
			body += v + " = [" + strconv.Itoa(m.originalIndex) + ", " + v + "]"
		}
		clause := "if (" + guard + ") {" + body + "}"
		if len(clauses) > 0 {
			clause = " else " + clause
		}
		clauses = append(clauses, clause)
	}

	// Object branch — merged-property encode wrapped in `[-1, v]`.
	if len(split.object) > 0 {
		merged := buildMergedProps(split.object, ctx)
		var propParts []string
		for _, mp := range merged {
			accessor := propertyAccessor(v, mp.name, mp.isSafeName)
			propCode, ok := emitMergedPropPrepare(mp, accessor, ctx)
			if !ok {
				return JitCode{Code: "", Type: CodeNS}
			}
			if propCode == "" {
				continue
			}
			// Required props (every member declares them non-optionally)
			// skip the `=== undefined` guard since the value is known to
			// be present once the outer object-type gate passes.
			if mp.required {
				propParts = append(propParts, propCode)
			} else {
				propParts = append(propParts, "if ("+accessor+" !== undefined) {"+propCode+"}")
			}
		}
		body := strings.Join(propParts, ";")
		if body != "" {
			body += ";"
		}
		body += v + " = [-1, " + v + "]"
		clause := "if (typeof " + v + " === 'object' && " + v + " !== null) {" + body + "}"
		if len(clauses) > 0 {
			clause = " else " + clause
		}
		clauses = append(clauses, clause)
	}

	errVar := flatUnionEncodeErrorVar(ctx)
	clauses = append(clauses, " else { throw new Error("+errVar+") }")
	return JitCode{Code: strings.Join(clauses, ""), Type: CodeS}
}

// emitMergedPropPrepare returns the inline JS body that transforms a
// single merged property's value. Single-candidate props delegate to
// the candidate's prepareForJson; multi-candidate that are all
// noop-on-both-halves (e.g. literal `'a' | 'b' | 'c'` discriminators
// where both prepare and restore are identity) collapse to no transform
// — the `[subIdx, value]` envelope adds no information the decoder
// needs since the value round-trips identity-style. Multi-candidate
// with genuine transforms (e.g. `bigint | Date` where prepare emits
// different code per candidate) keeps the dispatch + envelope.
// Returns ("", true) when the prop is a noop on every candidate.
func emitMergedPropPrepare(mp mergedProp, accessor string, ctx *EmitContext) (string, bool) {
	if len(mp.candidates) == 1 {
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(mp.candidates[0].childRef, CodeS)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		return strings.TrimSpace(jc.Code), true
	}
	// Collapse multi-candidate when every candidate is a noop on both
	// prepare AND restore. The literal discriminator case (`'a' | 'b' | 'c'`)
	// is the headline shape this catches: all three literals are
	// prepare-noop AND restore-noop, so the dispatch + `[subIdx, value]`
	// wrap is pure overhead. JSON's natural typing recovers the value.
	if mp.allCandidatesNoop(ctx) {
		return "", true
	}
	// Multi-candidate — inline union dispatch over the accessor.
	var arms []string
	for i, cand := range mp.candidates {
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(cand.childRef, CodeS)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		resolved := ctx.ResolveRef(cand.childRef)
		if resolved == nil {
			continue
		}
		isTypeExpr := unionMemberIsTypeCheck(resolved, ctx, accessor)
		guard := isTypeExpr
		if isObjectLikeKind(resolved.Kind) {
			guard = "(typeof " + accessor + " === 'object' && " + accessor + " !== null && " + isTypeExpr + ")"
		}
		body := strings.TrimSpace(jc.Code)
		if body != "" && !strings.HasSuffix(body, ";") && !strings.HasSuffix(body, "}") {
			body += ";"
		}
		body += accessor + " = [" + strconv.Itoa(i) + ", " + accessor + "]"
		arm := "if (" + guard + ") {" + body + "}"
		if len(arms) > 0 {
			arm = " else " + arm
		}
		arms = append(arms, arm)
	}
	if len(arms) == 0 {
		return "", true
	}
	return strings.Join(arms, ""), true
}

// allCandidatesNoop reports whether every candidate ref points at a
// type that is noop on BOTH the flat-prepare and flat-restore halves.
// When true, the per-property dispatch + `[subIdx, value]` wrap is pure
// overhead — JSON's natural typing recovers the value on the decode
// side without needing the subIdx.
func (mp mergedProp) allCandidatesNoop(ctx *EmitContext) bool {
	if len(mp.candidates) == 0 {
		return true
	}
	for _, cand := range mp.candidates {
		resolved := ctx.ResolveRef(cand.childRef)
		if resolved == nil {
			return false
		}
		if !peekMemberIsNoop(resolved, PrepareForJsonFlatEmitter{}, ctx) {
			return false
		}
		if !peekMemberIsNoop(resolved, RestoreFromJsonFlatEmitter{}, ctx) {
			return false
		}
	}
	return true
}

// --- restoreFromJson decode --------------------------------------------------

// emitUnionRestoreFromJsonFlat — the decode-side of the flat-union wire
// shape. Detects the `[idx, value]` envelope; idx === -1 routes to the
// merged-object decode, numeric idx >= 0 routes to the matching atomic
// member's restore, and a raw value (noop atomic that skipped the
// wrap) passes through unchanged.
func emitUnionRestoreFromJsonFlat(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	split := splitUnionMembersFlat(rt, ctx)
	if len(split.atomic) == 0 && len(split.object) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}

	// Per-atomic-member tuple-wrap decision (mirrors encode side).
	atomicNeedsTuple := make(map[int]bool)
	anyWrapped := false
	for _, m := range split.atomic {
		needsTuple := unionMemberNeedsTupleFlat(m.resolved, ctx)
		atomicNeedsTuple[m.originalIndex] = needsTuple
		if needsTuple {
			anyWrapped = true
		}
	}
	hasObjectBranch := len(split.object) > 0
	if !anyWrapped && !hasObjectBranch {
		// Every atomic member is noop on both halves, and there are no
		// object members — decoder is identity.
		return JitCode{Code: "", Type: CodeS}
	}

	decVar := ctx.NextLocalVar("dec")
	var arms []string

	// Object branch (idx === -1) — walk merged props, restore each
	// defined key. Required props (every member declares them
	// non-optionally) skip the `=== undefined` guard, matching the
	// encoder's symmetric optimisation in emitUnionPrepareForJsonFlat.
	if hasObjectBranch {
		merged := buildMergedProps(split.object, ctx)
		var propParts []string
		for _, mp := range merged {
			accessor := propertyAccessor(v, mp.name, mp.isSafeName)
			propCode, ok := emitMergedPropRestore(mp, accessor, ctx)
			if !ok {
				return JitCode{Code: "", Type: CodeNS}
			}
			if propCode == "" {
				continue
			}
			if mp.required {
				propParts = append(propParts, propCode)
			} else {
				propParts = append(propParts, "if ("+accessor+" !== undefined) {"+propCode+"}")
			}
		}
		body := strings.Join(propParts, ";")
		arm := "if (" + decVar + " === -1) {" + body + "}"
		arms = append(arms, arm)
	}

	// Atomic arms — same shape as the non-flat decode.
	for _, m := range split.atomic {
		if !atomicNeedsTuple[m.originalIndex] {
			continue
		}
		restoreJit := ctx.CompileChild(m.ref, CodeS)
		if restoreJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		body := strings.TrimSpace(restoreJit.Code)
		if body != "" && !strings.HasSuffix(body, ";") && !strings.HasSuffix(body, "}") {
			body += ";"
		}
		arm := "if (" + decVar + " === " + strconv.Itoa(m.originalIndex) + ") {" + body + "}"
		if len(arms) > 0 {
			arm = " else " + arm
		}
		arms = append(arms, arm)
	}

	if len(arms) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}

	errVar := flatUnionDecodeErrorVar(ctx)
	inner := strings.Join(arms, "") + " else { throw new Error(" + errVar + ") }"

	body := "if (Array.isArray(" + v + ") && " + v + ".length === 2 && typeof " + v + "[0] === 'number') {" +
		"const " + decVar + " = " + v + "[0]; " + v + " = " + v + "[1];" +
		inner + "}"
	return JitCode{Code: body, Type: CodeS}
}

// emitMergedPropRestore — decode-side mirror of emitMergedPropPrepare.
// Single-candidate props delegate to the candidate's restoreFromJson;
// multi-candidate that are all noop-on-both-halves collapse to no
// transform (the encoder skipped the wrap so there's nothing to undo).
// Multi-candidate with genuine transforms decodes the per-prop
// `[subIdx, value]` envelope.
func emitMergedPropRestore(mp mergedProp, accessor string, ctx *EmitContext) (string, bool) {
	if len(mp.candidates) == 1 {
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(mp.candidates[0].childRef, CodeS)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		return strings.TrimSpace(jc.Code), true
	}
	// Collapse multi-candidate when every candidate is a noop on both
	// halves. Symmetric with emitMergedPropPrepare — the encoder didn't
	// emit a wrap, so the decoder has nothing to unwrap.
	if mp.allCandidatesNoop(ctx) {
		return "", true
	}
	// Multi-candidate — decode the per-prop `[subIdx, value]` envelope.
	subDecVar := ctx.NextLocalVar("sub")
	var arms []string
	for i, cand := range mp.candidates {
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(cand.childRef, CodeS)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		body := strings.TrimSpace(jc.Code)
		if body != "" && !strings.HasSuffix(body, ";") && !strings.HasSuffix(body, "}") {
			body += ";"
		}
		arm := "if (" + subDecVar + " === " + strconv.Itoa(i) + ") {" + body + "}"
		if len(arms) > 0 {
			arm = " else " + arm
		}
		arms = append(arms, arm)
	}
	if len(arms) == 0 {
		return "", true
	}
	errVar := flatUnionDecodeErrorVar(ctx)
	body := "if (Array.isArray(" + accessor + ") && " + accessor + ".length === 2 && typeof " + accessor + "[0] === 'number') {" +
		"const " + subDecVar + " = " + accessor + "[0]; " + accessor + " = " + accessor + "[1];" +
		strings.Join(arms, "") + " else { throw new Error(" + errVar + ") }" +
		"}"
	return body, true
}

// --- stringifyJson encode (single-pass string) ------------------------------

// emitUnionStringifyJsonFlat — single-pass stringification of the
// flat-union wire shape. Mirrors emitUnionPrepareForJsonFlat structurally,
// but each branch BUILDS the JSON string for the envelope rather than
// mutating `v`.
func emitUnionStringifyJsonFlat(rt *protocol.RunType, ctx *EmitContext, v string) JitCode {
	split := splitUnionMembersFlat(rt, ctx)
	if len(split.atomic) == 0 && len(split.object) == 0 {
		return JitCode{Code: "", Type: CodeS}
	}

	var clauses []string

	for _, m := range split.atomic {
		childJit := ctx.CompileChild(m.ref, CodeE)
		if childJit.Type == CodeNS {
			return JitCode{Code: "", Type: CodeNS}
		}
		if childJit.Code == "" {
			continue
		}
		isTypeExpr := unionMemberIsTypeCheck(m.resolved, ctx, v)
		guard := isTypeExpr
		if isObjectLikeKind(m.resolved.Kind) {
			guard = "(typeof " + v + " === 'object' && " + v + " !== null && " + isTypeExpr + ")"
		}
		var emitted string
		if unionMemberNeedsTupleFlat(m.resolved, ctx) {
			emitted = "'[" + strconv.Itoa(m.originalIndex) + ",' + " + childJit.Code + " + ']'"
		} else {
			emitted = childJit.Code
		}
		clause := "if (" + guard + ") { return " + emitted + ";}"
		if len(clauses) > 0 {
			clause = " else " + clause
		}
		clauses = append(clauses, clause)
	}

	if len(split.object) > 0 {
		merged := buildMergedProps(split.object, ctx)
		// Build the merged-object stringify with direct string concat
		// instead of `[parts].filter(Boolean).join(',')` — the filter
		// approach allocates two arrays + a string per call. With Fix 3
		// (required vs optional split) the common discriminated-union
		// case where every member shares the same property set collapses
		// to flat concat, matching the shape the non-flat per-member
		// factory produces.
		//
		// Strategy:
		//   - Required props (every member has them, none declared
		//     optional) emit `,"name":<propJson>` unconditionally. The
		//     first required prop becomes the comma anchor; subsequent
		//     required props always lead with `,`.
		//   - Optional props (any member missing the prop, or any
		//     declaration is `?:`) emit
		//     `(accessor === undefined ? '' : ',"name":<propJson>')` —
		//     always with a leading comma in the populated branch.
		//   - When there is at least one required prop, the leading `,`
		//     from the FIRST emitted fragment is harmless: the first
		//     fragment was emitted without a leading comma so the
		//     concat is `'{' + '"r1":...' + ',"r2":...' + ...`.
		//   - When there are NO required props (all optional), fall
		//     back to a slice(1) trick — prepend `,` unconditionally
		//     in every conditional branch and strip the leading comma
		//     from the resulting string. Still avoids the filter+join
		//     allocations.
		hasRequired := false
		for _, mp := range merged {
			if mp.required {
				hasRequired = true
				break
			}
		}
		// Collect propJson per merged prop. Skipping empty noop props.
		type compiledProp struct {
			mp       mergedProp
			accessor string
			propJson string
		}
		var compiledProps []compiledProp
		for _, mp := range merged {
			accessor := propertyAccessor(v, mp.name, mp.isSafeName)
			propJson, ok := emitMergedPropStringify(mp, accessor, ctx)
			if !ok {
				return JitCode{Code: "", Type: CodeNS}
			}
			if propJson == "" {
				continue
			}
			compiledProps = append(compiledProps, compiledProp{mp: mp, accessor: accessor, propJson: propJson})
		}
		var objExpr string
		if len(compiledProps) == 0 {
			objExpr = "'{}'"
		} else if hasRequired {
			// At least one required → flat concat anchored by the first
			// required prop's unconditional emit.
			var parts []string
			firstRequiredSeen := false
			for _, cp := range compiledProps {
				prefix := "'" + jsonPropPrefix(cp.mp.name, cp.mp.isSafeName) + "'"
				if cp.mp.required {
					if !firstRequiredSeen {
						parts = append(parts, prefix+"+"+cp.propJson)
						firstRequiredSeen = true
					} else {
						parts = append(parts, "','+"+prefix+"+"+cp.propJson)
					}
				} else {
					// Optional prop — conditional with leading comma.
					if !firstRequiredSeen {
						// Optional appears before any required prop has anchored
						// the concat — needs the slice(1) trick locally. This is
						// uncommon (would require a required prop to appear later
						// in iteration order); fall back to conditional-with-
						// leading-comma which works because the FIRST emitted
						// required prop later will not lead with `,`. But to
						// keep the JS valid we need to emit unconditional `,`
						// here. Use a wrapper that adds the comma only when the
						// accessor is defined.
						parts = append(parts, "("+cp.accessor+" === undefined ? '' : ','+"+prefix+"+"+cp.propJson+")")
					} else {
						parts = append(parts, "("+cp.accessor+" === undefined ? '' : ','+"+prefix+"+"+cp.propJson+")")
					}
				}
			}
			objExpr = "'{'+" + strings.Join(parts, "+") + "+'}'"
		} else {
			// All optional — use the slice trick. Each part either emits
			// `,"name":<propJson>` or `''`. Final concat strips the
			// leading comma via slice(1). Allocates one string for the
			// concat + one for slice(1) (V8 cons-string). No arrays.
			var parts []string
			for _, cp := range compiledProps {
				prefix := "'" + jsonPropPrefix(cp.mp.name, cp.mp.isSafeName) + "'"
				parts = append(parts, "("+cp.accessor+" === undefined ? '' : ','+"+prefix+"+"+cp.propJson+")")
			}
			objExpr = "'{'+(" + strings.Join(parts, "+") + ").slice(1)+'}'"
		}
		envelope := "'[-1,' + " + objExpr + " + ']'"
		clause := "if (typeof " + v + " === 'object' && " + v + " !== null) { return " + envelope + ";}"
		if len(clauses) > 0 {
			clause = " else " + clause
		}
		clauses = append(clauses, clause)
	}

	errVar := flatUnionEncodeErrorVar(ctx)
	clauses = append(clauses, " else { throw new Error("+errVar+") }")
	return JitCode{Code: strings.Join(clauses, ""), Type: CodeRB}
}

// emitMergedPropStringify returns a JS expression that evaluates to the
// JSON fragment for the merged prop's value. Single-candidate uses the
// candidate's stringifyJson directly; multi-candidate that all produce
// IDENTICAL child code (e.g. `'a' | 'b' | 'c'` literal discriminators,
// where every candidate emits `JSON.stringify(accessor)`) collapses to
// the shared code — the `[subIdx, value]` envelope adds no information
// the decoder needs since JSON.parse recovers the value via its
// natural typing. Truly divergent candidates fall back to the IIFE
// dispatch + `[subIdx, value]` envelope.
func emitMergedPropStringify(mp mergedProp, accessor string, ctx *EmitContext) (string, bool) {
	if len(mp.candidates) == 1 {
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(mp.candidates[0].childRef, CodeE)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		if jc.Code == "" {
			return "JSON.stringify(" + accessor + ")", true
		}
		return jc.Code, true
	}
	// Compile every candidate up front so the collapse-on-identical check
	// can inspect the resulting code strings.
	type compiled struct {
		code     string
		resolved *protocol.RunType
	}
	candidates := make([]compiled, 0, len(mp.candidates))
	for _, cand := range mp.candidates {
		ctx.SetChildAccessor(accessor)
		jc := ctx.CompileChild(cand.childRef, CodeE)
		ctx.SetChildAccessor("")
		if jc.Type == CodeNS {
			return "", false
		}
		resolved := ctx.ResolveRef(cand.childRef)
		if resolved == nil {
			continue
		}
		childCode := jc.Code
		if childCode == "" {
			childCode = "JSON.stringify(" + accessor + ")"
		}
		candidates = append(candidates, compiled{code: childCode, resolved: resolved})
	}
	if len(candidates) == 0 {
		return "", true
	}
	// Collapse: if every candidate produces the same code, the dispatch
	// is pure overhead — emit the shared code directly.
	allSame := true
	for i := 1; i < len(candidates); i++ {
		if candidates[i].code != candidates[0].code {
			allSame = false
			break
		}
	}
	if allSame {
		return candidates[0].code, true
	}
	// Multi-candidate — IIFE with per-candidate dispatch.
	errVar := flatUnionEncodeErrorVar(ctx)
	arms := make([]string, 0, len(candidates))
	for i, cand := range candidates {
		isTypeExpr := unionMemberIsTypeCheck(cand.resolved, ctx, accessor)
		guard := isTypeExpr
		if isObjectLikeKind(cand.resolved.Kind) {
			guard = "(typeof " + accessor + " === 'object' && " + accessor + " !== null && " + isTypeExpr + ")"
		}
		arm := "if (" + guard + ") return '[" + strconv.Itoa(i) + ",' + " + cand.code + " + ']';"
		arms = append(arms, arm)
	}
	iife := "(function(){" + strings.Join(arms, " ") + " throw new Error(" + errVar + ");})()"
	return iife, true
}
