package typefns

import (
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// isJsonCompatible reports whether values of type `rt` round-trip
// identically through native `JSON.parse(JSON.stringify(v))` AND would
// have no special encode/decode transform applied by any of the three
// JSON emit families (prepareForJson, stringifyJson, restoreFromJson).
//
// Both halves of that conjunction matter:
//
//   - "Round-trips natively" means JSON.stringify outputs a recoverable
//     form for every value of this type. Strings/numbers/booleans/null
//     and their composites do. Date/bigint/Symbol/RegExp don't (each
//     either loses info or throws).
//
//   - "No special transform" means the emitter doesn't need to mutate
//     the value (encode side) or rebuild it (decode side). Date is
//     read-only at the value level — its toJSON is enough on encode —
//     but the decode MUST call `new Date(...)` to restore the type,
//     so the round-trip is NOT identity-preserving and Date returns
//     false here.
//
// This predicate is the sole input to the union wrap-or-not decision
// (see unionNeedsTuple / atomicBranchNeedsTuple / mergedPropNeedsSubWrap).
// Either every member of a union is JSON-compatible — the whole union
// round-trips raw with no [memberIndex, value] envelope — or any
// member is non-compatible and EVERY member's encoded form wraps so
// the decoder can unconditionally unwrap. There is no runtime
// shape-sniff on the wire; the decoder knows at compile time which
// shape to expect.
//
// Cycles: object/class/union/array/tuple types can reach themselves via
// property chains. We pass a visited set keyed on `rt.ID` and treat a
// re-entry as compatible. Cycle-back doesn't disqualify the type — if
// any non-cycle leaf elsewhere in the graph is non-compatible the
// outer call returns false on that path anyway.
func isJsonCompatible(rt *protocol.RunType, ctx *EmitContext) bool {
	if rt != nil && rt.ID != "" {
		if verdict, known := ctx.walker.factsLookup(factJsonCompat, rt.ID); known {
			return verdict
		}
	}
	result := jsonCompatRecursive(rt, ctx, make(map[string]struct{}))
	// Only COMPLETED top-level walks are stored: an intermediate node's
	// in-walk value can depend on the cycle-back assumption for an
	// ancestor still on the stack, so it is not context-free. The
	// top-level result is — "every leaf reachable from rt is JSON-safe"
	// names the same reachable set no matter which parent asked.
	if rt != nil && rt.ID != "" {
		ctx.walker.factsStore(factJsonCompat, rt.ID, result)
	}
	return result
}

func jsonCompatRecursive(rt *protocol.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	if rt == nil {
		return false
	}
	if rt.ID != "" {
		// A previously completed top-level verdict for this node is
		// context-free — reuse it at any depth.
		if verdict, known := ctx.walker.factsLookup(factJsonCompat, rt.ID); known {
			return verdict
		}
		if _, seen := visited[rt.ID]; seen {
			return true
		}
		visited[rt.ID] = struct{}{}
	}
	switch rt.Kind {

	case protocol.KindString,
		protocol.KindNumber,
		protocol.KindBoolean,
		protocol.KindNull,
		protocol.KindAny,
		protocol.KindUnknown,
		protocol.KindObject,
		protocol.KindEnum,
		protocol.KindTemplateLiteral:
		return true

	case protocol.KindLiteral:
		// bigint / symbol literals carry a flag and have a transform on
		// the encode side (toString / description / etc.); primitive
		// literals (string / number / boolean / null) are noop.
		for _, flag := range rt.Flags {
			if flag == "bigint" || flag == "symbol" {
				return false
			}
		}
		return true

	case protocol.KindBigInt,
		protocol.KindSymbol,
		protocol.KindUndefined,
		protocol.KindVoid,
		protocol.KindRegexp,
		protocol.KindNever,
		protocol.KindPromise,
		protocol.KindFunction,
		protocol.KindMethod,
		protocol.KindMethodSignature,
		protocol.KindCallSignature:
		return false

	case protocol.KindArray:
		if rt.Child == nil {
			return true
		}
		return jsonCompatRecursive(ctx.ResolveRef(rt.Child), ctx, visited)

	case protocol.KindTuple:
		for _, child := range rt.Children {
			if !jsonCompatRecursive(ctx.ResolveRef(child), ctx, visited) {
				return false
			}
		}
		return true

	case protocol.KindTupleMember:
		if rt.Child == nil {
			return true
		}
		return jsonCompatRecursive(ctx.ResolveRef(rt.Child), ctx, visited)

	case protocol.KindProperty, protocol.KindPropertySignature:
		if rt.Child == nil {
			return true
		}
		resolved := ctx.ResolveRef(rt.Child)
		// Function-typed properties are silently skipped by the per-prop
		// emit (see emitPropertyPrepareForJson) — they contribute no
		// transform code, so they're effectively JSON-compatible from
		// the wrap-decision perspective.
		if resolved != nil && isFunctionLikeKind(resolved.Kind) {
			return true
		}
		return jsonCompatRecursive(resolved, ctx, visited)

	case protocol.KindIndexSignature:
		if rt.Child == nil {
			return true
		}
		return jsonCompatRecursive(ctx.ResolveRef(rt.Child), ctx, visited)

	case protocol.KindObjectLiteral:
		return objectChildrenCompat(rt.Children, ctx, visited)

	case protocol.KindIntersection:
		// Defensive: the type checker usually pre-resolves intersections.
		// When one slips through, treat as compatible iff every part is.
		for _, child := range rt.Children {
			if !jsonCompatRecursive(ctx.ResolveRef(child), ctx, visited) {
				return false
			}
		}
		return true

	case protocol.KindUnion:
		children := rt.SafeUnionChildren
		if len(children) == 0 {
			children = rt.Children
		}
		for _, child := range children {
			if !jsonCompatRecursive(ctx.ResolveRef(child), ctx, visited) {
				return false
			}
		}
		return true

	case protocol.KindClass:
		if protocol.IsTemporalSubKind(rt.SubKind) {
			// Temporal types serialize via toJSON() (a string), like Date —
			// not raw-JSON-compatible, so a union containing one wraps.
			return false
		}
		switch rt.SubKind {
		case protocol.SubKindDate,
			protocol.SubKindMap,
			protocol.SubKindSet,
			protocol.SubKindNonSerializable:
			return false
		case protocol.SubKindNone:
			return objectChildrenCompat(rt.Children, ctx, visited)
		}
		return false
	}
	return false
}

// objectChildrenCompat — shared body for ObjectLiteral and plain Class.
// Skips static and function-like members the same way the per-emitter
// per-kind dispatch does, then defers to every surviving property's
// child type.
func objectChildrenCompat(children []*protocol.RunType, ctx *EmitContext, visited map[string]struct{}) bool {
	for _, childRef := range children {
		resolved := ctx.ResolveRef(childRef)
		if resolved == nil {
			continue
		}
		if resolved.IsStatic {
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			continue
		}
		if !jsonCompatRecursive(resolved, ctx, visited) {
			return false
		}
	}
	return true
}

// litFlavour classifies a KindLiteral's serialization flavour. The JSON
// emit families share this classification — bigint/symbol/regexp literals
// carry a value transform, primitive literals (string/number/boolean/null)
// are noop — and differ only in the per-family leaf op. Mirrors the
// flag/Literal inspection in jsonCompatRecursive's KindLiteral arm.
type litFlavour int

const (
	litPrimitive litFlavour = iota
	litBigInt
	litSymbol
)

// literalFlavour returns the litFlavour for a KindLiteral RunType. bigint
// takes priority over symbol (matching the set-membership order the emitters
// used), then a regexp-shaped Literal map, else primitive. Linear scan —
// Flags holds at most a couple of entries, a map per call was pure churn.
func literalFlavour(rt *protocol.RunType) litFlavour {
	hasSymbol := false
	for _, flag := range rt.Flags {
		if flag == "bigint" {
			return litBigInt
		}
		if flag == "symbol" {
			hasSymbol = true
		}
	}
	if hasSymbol {
		return litSymbol
	}
	return litPrimitive
}
