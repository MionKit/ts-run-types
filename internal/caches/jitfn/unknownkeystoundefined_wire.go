package jitfn

import (
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// UnknownKeysToUndefinedWireEmitter — decoder-internal sibling of
// UnknownKeysToUndefinedEmitter. Identical for every kind EXCEPT
// KindUnion, where it emits the wire-format-aware merged-allowlist
// strip: detect `Array.isArray(v) && v[0] === -1` at runtime, reach
// into `v[1]` and apply the merged-allowlist strip there.
//
// This family is NOT exposed via the public createUnknownKeysToUndefined
// API. The decoder's safe pipeline at
// packages/ts-go-run-types/src/createJitFunctions.ts composes:
//
//	restore(ukuWire(JSON.parse(s)))
//
// The wire-format-aware emit lets the safe decoder strip undeclared
// keys inside the merged-object branch of unsafe-encoded wire payloads,
// closing the decoder-safety hole at union nodes that the legacy
// uku-no-op-on-union created.
type UnknownKeysToUndefinedWireEmitter struct{}

func (UnknownKeysToUndefinedWireEmitter) Args() []ArgSpec {
	return UnknownKeysToUndefinedEmitter{}.Args()
}

func (UnknownKeysToUndefinedWireEmitter) Supports(rt *protocol.RunType) bool {
	return UnknownKeysToUndefinedEmitter{}.Supports(rt)
}

func AnyUnknownKeysToUndefinedWireSupported(runTypes []*protocol.RunType) bool {
	emitter := UnknownKeysToUndefinedWireEmitter{}
	for _, rt := range runTypes {
		if emitter.Supports(rt) {
			return true
		}
	}
	return false
}

func (UnknownKeysToUndefinedWireEmitter) IsJitInlined(ctx *InlineContext) bool {
	return UnknownKeysToUndefinedEmitter{}.IsJitInlined(ctx)
}

func (UnknownKeysToUndefinedWireEmitter) ReturnName() string {
	return UnknownKeysToUndefinedEmitter{}.ReturnName()
}

func (UnknownKeysToUndefinedWireEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	return UnknownKeysToUndefinedEmitter{}.EmitDependencyCall(rt, childID, ctx)
}

func (UnknownKeysToUndefinedWireEmitter) Finalize(raw string) (string, bool) {
	return UnknownKeysToUndefinedEmitter{}.Finalize(raw)
}

// Emit — only KindUnion differs from the base emitter. For all other
// kinds the wire-format wrapper isn't present (the wrapper exists
// ONLY at union nodes per the flat-encoder design), so the base
// emitter's per-kind helpers are correct.
func (UnknownKeysToUndefinedWireEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, ct CodeType) JitCode {
	if rt != nil && rt.Kind == protocol.KindUnion {
		return emitUnionUnknownKeysMerged(rt, ctx, UnknownKeysOpts{
			Snippet: func(_ *EmitContext, accessor, keyVar string) string {
				return accessor + "[" + keyVar + "] = undefined"
			},
			CodeShape:      CodeS,
			JsonWireFormat: true,
		})
	}
	return UnknownKeysToUndefinedEmitter{}.Emit(rt, ctx, ct)
}
