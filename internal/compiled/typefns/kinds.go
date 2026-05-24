package typefns

import "github.com/mionkit/ts-run-types/internal/protocol"

// Kind-classification predicates shared across the emitters. Relocated from
// istype.go (where they accreted as de-facto package utilities) so the shared
// classification logic is discoverable independent of the isType emitter.

// isObjectLikeKind reports whether kind's isType emit needs the
// shared `typeof === 'object' && !== null` guard before it. Used by
// the union emit to lift the guard out of the per-child checks.
func isObjectLikeKind(kind protocol.ReflectionKind) bool {
	switch kind {
	case protocol.KindObjectLiteral, protocol.KindClass,
		protocol.KindIndexSignature, protocol.KindArray,
		protocol.KindTuple:
		return true
	}
	return false
}

// isFunctionLikeKind reports whether kind would emit a function-shape
// check (or be skipped entirely as a property's wrapped child). Used
// in two places: object-emit to drop method-shaped Children directly,
// and property-emit to skip when the wrapped value is function-typed.
func isFunctionLikeKind(kind protocol.ReflectionKind) bool {
	switch kind {
	case protocol.KindFunction, protocol.KindMethod,
		protocol.KindMethodSignature, protocol.KindCallSignature:
		return true
	}
	return false
}

// isRestTupleMember reports whether a resolved tuple-member RunType
// carries the "rest" flag mion's projection sets on rest elements
// (`[A, ...B[]]`). Mirrors mion's TupleMember.isRest() on the wire.
func isRestTupleMember(rt *protocol.RunType) bool {
	if rt == nil || rt.Kind != protocol.KindTupleMember {
		return false
	}
	return hasFlag(rt.Flags, "rest")
}

// isSymbolKeyedIndexSig reports whether a KindIndexSignature has a
// symbol-typed key (`{[k: symbol]: T}`). Mirrors mion's
// IndexSignatureRunType.skipRT (indexProperty.ts:30-36), which
// returns true for every RT fn except toJSCode (we don't emit a
// toJSCode equivalent in this binary, so the skip applies
// unconditionally for us). The for-in loop in our emits would never
// enumerate a symbol-keyed property anyway (per JS semantics), so
// skipping is observable parity with mion and elides dead emit.
func isSymbolKeyedIndexSig(rt *protocol.RunType, ctx *EmitContext) bool {
	if rt == nil || rt.Index == nil {
		return false
	}
	indexResolved := ctx.ResolveRef(rt.Index)
	return indexResolved != nil && indexResolved.Kind == protocol.KindSymbol
}

// hasFlag is a small membership helper for RunType.Flags.
func hasFlag(flags []string, target string) bool {
	for _, flag := range flags {
		if flag == target {
			return true
		}
	}
	return false
}
