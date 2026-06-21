package typefns

import "github.com/mionkit/ts-runtypes/internal/protocol"

// Kind-classification predicates shared across the emitters. Relocated from
// istype.go (where they accreted as de-facto package utilities) so the shared
// classification logic is discoverable independent of the validate emitter.

// isObjectLikeKind reports whether kind's validate emit needs the
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

// objectHasCallSignature reports whether an object-like RunType carries a
// KindCallSignature member — i.e. it is a CALLABLE interface
// (`interface F { (a): R; p: string }`). A call signature makes the whole
// interface function-like: DataOnly strips it to `never`, and validate guards it
// with `typeof === 'function'`. The serializers therefore treat it like a bare
// function (alwaysThrow at the root, dropped at a property position) by returning
// CodeNS for it, rather than walking it as a plain object and serializing its
// data props — which would disagree with validate. Mirrors the call-signature
// detection in emitObjectValidate / emitObjectValidationErrors.
func objectHasCallSignature(rt *protocol.RunType, ctx *EmitContext) bool {
	if rt == nil {
		return false
	}
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved != nil && resolved.Kind == protocol.KindCallSignature {
			return true
		}
	}
	return false
}

// isRestTupleMember reports whether a resolved tuple-member RunType
// carries the "rest" flag the projection sets on rest elements
// (`[A, ...B[]]`). Mirrors TupleMember.isRest() on the wire.
func isRestTupleMember(rt *protocol.RunType) bool {
	if rt == nil || rt.Kind != protocol.KindTupleMember {
		return false
	}
	return hasFlag(rt.Flags, "rest")
}

// isSymbolKeyedIndexSig reports whether a KindIndexSignature has a
// symbol-typed key (`{[k: symbol]: T}`). Mirrors the
// IndexSignatureRunType.skipRT contract (indexProperty.ts:30-36), which
// returns true for every RT fn except toJSCode (we don't emit a
// toJSCode equivalent in this binary, so the skip applies
// unconditionally for us). The for-in loop in our emits would never
// enumerate a symbol-keyed property anyway (per JS semantics), so
// skipping is observable parity with the reference and elides dead emit.
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
