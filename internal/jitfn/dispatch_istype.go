package jitfn

import (
	"fmt"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// EmitIsType is the single switch over ReflectionKind that dispatches
// to a per-kind isType emitter. Replaces mion's per-class
// `emitIsType` methods (one per node class under
// run-types/src/nodes/atomic/*.ts) with one function — the same
// pattern mion already uses for stringifyJson
// (jitCompilers/json/stringifyJson.ts:37).
//
// v1 implements ONLY `KindString`. Every other kind is an explicit
// fall-through to the default branch so the gaps are visible at a
// glance; the renderer in module.go knows to skip unimplemented kinds
// instead of crashing the whole emit.
func EmitIsType(rt *protocol.RunType, comp *Compiler, expectedCType CodeType) JitCode {
	if rt == nil {
		return JitCode{Code: "", Type: expectedCType}
	}
	switch rt.Kind {
	case protocol.KindString:
		// Mirrors run-types/src/nodes/atomic/string.ts:14:
		//   `typeof ${comp.vλl} === 'string'`
		// Single-quoted to keep the cacheSource JSON envelope's escape
		// budget small (same rationale as emit/runtypes_module.go:quoteJS).
		return JitCode{
			Code: "typeof " + comp.Vλl + " === 'string'",
			Type: CodeE,
		}

	// --- v1: everything below this line is unimplemented. Listed
	// explicitly so the gaps are visible — a new contributor adding
	// `KindBoolean` only needs to replace the comment with a code-emit
	// expression. Kept grouped by family for navigability.

	// Atomic kinds (mirror run-types/src/nodes/atomic/*.ts).
	case protocol.KindAny,
		protocol.KindUnknown,
		protocol.KindNever,
		protocol.KindVoid,
		protocol.KindNull,
		protocol.KindUndefined,
		protocol.KindNumber,
		protocol.KindBoolean,
		protocol.KindBigInt,
		protocol.KindSymbol,
		protocol.KindObject,
		protocol.KindRegexp,
		protocol.KindLiteral,
		protocol.KindEnum,
		protocol.KindEnumMember,
		protocol.KindTemplateLiteral:
		// fall through

	// Member kinds (mirror run-types/src/nodes/member/*.ts).
	case protocol.KindProperty,
		protocol.KindPropertySignature,
		protocol.KindParameter,
		protocol.KindArray,
		protocol.KindRest,
		protocol.KindIndexSignature,
		protocol.KindTupleMember:
		// fall through

	// Collection kinds (mirror run-types/src/nodes/collection/*.ts).
	case protocol.KindObjectLiteral,
		protocol.KindClass,
		protocol.KindUnion,
		protocol.KindIntersection,
		protocol.KindTuple:
		// fall through

	// Function kinds.
	case protocol.KindFunction,
		protocol.KindMethod,
		protocol.KindMethodSignature,
		protocol.KindCallSignature,
		protocol.KindPromise:
		// fall through

	// Reserved / not expected in a real cache (the type checker rejects
	// these at the call site for the kinds we support, but if one
	// somehow reaches the emitter we want a loud failure).
	case protocol.KindTypeParameter, protocol.KindInfer, protocol.KindRef:
		// fall through
	}
	panic(fmt.Sprintf("jitfn: isType emitter not implemented for kind %d (TODO)", rt.Kind))
}
