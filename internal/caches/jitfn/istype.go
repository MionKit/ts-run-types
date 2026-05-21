package jitfn

import (
	"fmt"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// IsTypeEmitter implements the `isType` jit function — produces a
// boolean validator per RunType. The factory shape it emits:
//
//	export function get_isType_<hash>(utl){
//	  'use strict';
//	  return function isType_<hash>(v){ <body> }
//	}
//
// One file owns every isType-specific concern: the args list, the
// per-kind switch in Emit, the noop detection in Finalize, and the
// per-emitter "is this kind supported yet?" predicate in Supports.
// Adding a new mion fn (typeErrors, prepareForJson, …) means one new
// file of this same shape — the Walker in walker.go stays untouched.
type IsTypeEmitter struct{}

// Args returns the single `v` parameter the inner isType function
// takes. Mirrors mion's `jitArgs.vλl = 'v'` + empty default in
// run-types/src/constants.functions.ts:45.
func (IsTypeEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports gates the renderer's top-level loop. v1 ships only
// KindString; every other kind is an explicit no-op so the rendered
// module stays valid (only handled-kind factories are emitted)
// while the dispatch's panic surfaces the gap at compile time if a
// parent emitter ever recurses into one. As new kinds are added the
// list grows in lockstep with the switch in Emit — keep both in
// sync (drift would silently emit broken JS).
func (IsTypeEmitter) Supports(rt *protocol.RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case protocol.KindString:
		return true
	}
	return false
}

// IsJitInlined delegates to DefaultIsJitInlined. Mion's
// run-types/src/lib/baseRunTypes.ts:52 defines the predicate ONCE
// for every jit fn (no per-class overrides exist in the upstream
// runtype package), so the isType emitter inherits the shared
// behaviour: arrays and named collections become dependency calls,
// everything else inlines. Override here only if a concrete need
// surfaces — there isn't one today.
func (IsTypeEmitter) IsJitInlined(ctx *InlineContext) bool {
	return DefaultIsJitInlined(ctx)
}

// Emit is the single big switch over ReflectionKind. Replaces mion's
// per-class `emitIsType` methods (one per node class under
// run-types/src/nodes/atomic/*.ts) — same pattern mion uses for
// stringifyJson in jitCompilers/json/stringifyJson.ts:37.
//
// v1 implements ONLY `KindString`. Every other kind is an explicit
// fall-through to the default branch so the gaps are visible at a
// glance; a new contributor adding `KindBoolean` only needs to
// replace the comment with a code-emit expression. Kinds grouped by
// family for navigability.
func (IsTypeEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, _ CodeType) JitCode {
	if rt == nil {
		return JitCode{Code: "", Type: CodeE}
	}
	switch rt.Kind {
	case protocol.KindString:
		// Mirrors run-types/src/nodes/atomic/string.ts:14:
		//   `typeof ${comp.vλl} === 'string'`
		// Single-quoted to keep the JSON envelope's escape budget
		// small (same rationale as emit/runtypes_module.go:quoteJS).
		return JitCode{
			Code: "typeof " + ctx.Vλl + " === 'string'",
			Type: CodeE,
		}

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

	// Reserved / shouldn't reach the emitter for fns we support.
	case protocol.KindTypeParameter, protocol.KindInfer, protocol.KindRef:
		// fall through
	}
	panic(fmt.Sprintf("jitfn: isType emitter not implemented for kind %d (TODO)", rt.Kind))
}

// Finalize matches mion's per-fn noop detection in
// handleFunctionReturn (jitFnCompiler.ts:420–423 for the isType case).
// An isType body that's empty, the bare expression `true`, or already
// `return true` is replaced by `return true` and marked noop so the
// renderer can skip emitting a factory whose validator always
// returns true (consumer can default to `() => true` for free).
func (IsTypeEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "true" || code == "return true" {
		return "return true", true
	}
	return code, false
}
