package jitfn

import (
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// StringifyJsonFlatEmitter — single-pass JSON serialiser sibling of
// StringifyJsonEmitter. Every non-union arm delegates to the non-flat
// emitter; KindUnion goes through emitUnionStringifyJsonFlat which
// builds the JSON for the flat-merged-object envelope and falls back
// to per-member `[memberIndex, value]` strings for atomic members.
type StringifyJsonFlatEmitter struct{}

func (StringifyJsonFlatEmitter) Args() []ArgSpec {
	return StringifyJsonEmitter{}.Args()
}

func (StringifyJsonFlatEmitter) Supports(rt *protocol.RunType) bool {
	return StringifyJsonEmitter{}.Supports(rt)
}

func AnyStringifyJsonFlatSupported(runTypes []*protocol.RunType) bool {
	emitter := StringifyJsonFlatEmitter{}
	for _, rt := range runTypes {
		if emitter.Supports(rt) {
			return true
		}
	}
	return false
}

func (StringifyJsonFlatEmitter) IsJitInlined(ctx *InlineContext) bool {
	return DefaultIsJitInlined(ctx)
}

func (StringifyJsonFlatEmitter) ReturnName() string {
	return "v"
}

func (StringifyJsonFlatEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, expected CodeType) JitCode {
	if rt != nil && rt.Kind == protocol.KindUnion && len(rt.Children) > 0 {
		return emitUnionStringifyJsonFlat(rt, ctx, ctx.Vλl)
	}
	return StringifyJsonEmitter{}.Emit(rt, ctx, expected)
}

func (StringifyJsonFlatEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	return StringifyJsonEmitter{}.EmitDependencyCall(rt, childID, ctx)
}

func (StringifyJsonFlatEmitter) Finalize(raw string) (string, bool) {
	return StringifyJsonEmitter{}.Finalize(raw)
}
