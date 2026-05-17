package jitfn

import "github.com/mionkit/ts-run-types/internal/protocol"

// isJitInlined reports whether a RunType's emitted code is short
// enough that the walker should inline it at the call site, rather
// than emit a `utl.getJIT(<hash>)(…)` dependency call.
//
// The decision is purely structural — it depends on the RunType's
// kind, never on which fn (isType / typeErrors / …) is being
// compiled. Mirrors mion's `isJitInlined` flag set on each node class
// (e.g. run-types/src/nodes/atomic/string.ts sets it to true).
//
// Atomic kinds inline because their bodies are one-liners. Collection
// kinds become dependency calls so the same nested validator can be
// reused at every reference site instead of duplicating its body.
//
// v1 only exercises the atomic branch (the renderer skips kinds whose
// emitter isn't implemented yet). When the first collection kind
// lands, the walker's `else` branch needs to emit a dependency call
// via the emitter — see the "Inline-vs-dependent" section of the
// refactor plan for how `Emitter.EmitDependencyCall` joins the
// interface at that point.
func isJitInlined(rt *protocol.RunType) bool {
	if rt == nil {
		return true
	}
	switch rt.Kind {
	case protocol.KindAny,
		protocol.KindUnknown,
		protocol.KindNever,
		protocol.KindVoid,
		protocol.KindNull,
		protocol.KindUndefined,
		protocol.KindString,
		protocol.KindNumber,
		protocol.KindBoolean,
		protocol.KindBigInt,
		protocol.KindSymbol,
		protocol.KindObject,
		protocol.KindRegexp,
		protocol.KindLiteral,
		protocol.KindEnumMember,
		protocol.KindTemplateLiteral:
		return true
	}
	return false
}
