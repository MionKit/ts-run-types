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
}

// buildMergedProps walks every object member, groups its non-static,
// non-function-like Properties / PropertySignatures by name, and
// returns the ordered merged list. Order follows the first appearance
// of each property name across the iteration order of SafeUnionChildren.
func buildMergedProps(objectMembers []memberRef, ctx *EmitContext) []mergedProp {
	indexByName := make(map[string]int)
	var merged []mergedProp
	for _, m := range objectMembers {
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
			candidate := propCandidate{childRef: prop.Child}
			idx, exists := indexByName[prop.Name]
			if !exists {
				indexByName[prop.Name] = len(merged)
				merged = append(merged, mergedProp{
					name:       prop.Name,
					isSafeName: prop.IsSafeName,
					candidates: []propCandidate{candidate},
				})
				continue
			}
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
			propParts = append(propParts, "if ("+accessor+" !== undefined) {"+propCode+"}")
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
// the candidate's prepareForJson; multi-candidate props emit an inline
// `[subIdx, value]` dispatch keyed on each candidate's isType. Returns
// ("", true) when the prop is a noop on every candidate.
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
	// defined key.
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
			propParts = append(propParts, "if ("+accessor+" !== undefined) {"+propCode+"}")
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
// multi-candidate props detect the per-property `[subIdx, value]`
// envelope and dispatch.
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
		// Build the merged-object stringify: `'{' + filterEmpty(parts).join(',') + '}'`
		// Each part either expands to `'"name":' + <propJson>` when defined
		// or to `''` when undefined.
		var partExprs []string
		for _, mp := range merged {
			accessor := propertyAccessor(v, mp.name, mp.isSafeName)
			propJson, ok := emitMergedPropStringify(mp, accessor, ctx)
			if !ok {
				return JitCode{Code: "", Type: CodeNS}
			}
			if propJson == "" {
				continue
			}
			prefix := "'" + jsonPropPrefix(mp.name, mp.isSafeName) + "'"
			// Strip the JSON `:` from jsonPropPrefix since we're rebuilding —
			// actually jsonPropPrefix already appends `:`, so reuse as-is.
			expr := "(" + accessor + " === undefined ? '' : " + prefix + " + " + propJson + ")"
			partExprs = append(partExprs, expr)
		}
		var objExpr string
		if len(partExprs) == 0 {
			objExpr = "'{}'"
		} else {
			objExpr = "'{'+[" + strings.Join(partExprs, ",") + "].filter(Boolean).join(',')+'}'"
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
// candidate's stringifyJson directly; multi-candidate emits an IIFE
// that dispatches on each candidate's isType and wraps with the
// `[subIdx, value]` envelope.
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
	// Multi-candidate — IIFE with per-candidate dispatch.
	errVar := flatUnionEncodeErrorVar(ctx)
	var arms []string
	for i, cand := range mp.candidates {
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
		isTypeExpr := unionMemberIsTypeCheck(resolved, ctx, accessor)
		guard := isTypeExpr
		if isObjectLikeKind(resolved.Kind) {
			guard = "(typeof " + accessor + " === 'object' && " + accessor + " !== null && " + isTypeExpr + ")"
		}
		arm := "if (" + guard + ") return '[" + strconv.Itoa(i) + ",' + " + childCode + " + ']';"
		arms = append(arms, arm)
	}
	if len(arms) == 0 {
		return "", true
	}
	iife := "(function(){" + strings.Join(arms, " ") + " throw new Error(" + errVar + ");})()"
	return iife, true
}

