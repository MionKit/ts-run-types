package jitfn

import (
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// RestoreFromJsonFlatEmitter — sibling of RestoreFromJsonEmitter that
// decodes the flat-union wire shape produced by
// PrepareForJsonFlatEmitter / StringifyJsonFlatEmitter. Every non-union
// arm delegates to the non-flat emitter; the KindUnion arm dispatches
// on the `[-1, mergedObject]` marker for object members and falls back
// to the existing `[memberIndex, value]` shape for atomic members.
type RestoreFromJsonFlatEmitter struct{}

func (RestoreFromJsonFlatEmitter) Args() []ArgSpec {
	return RestoreFromJsonEmitter{}.Args()
}

func (RestoreFromJsonFlatEmitter) Supports(rt *protocol.RunType) bool {
	return RestoreFromJsonEmitter{}.Supports(rt)
}

func AnyRestoreFromJsonFlatSupported(runTypes []*protocol.RunType) bool {
	emitter := RestoreFromJsonFlatEmitter{}
	for _, rt := range runTypes {
		if emitter.Supports(rt) {
			return true
		}
	}
	return false
}

func (RestoreFromJsonFlatEmitter) IsJitInlined(ctx *InlineContext) bool {
	return DefaultIsJitInlined(ctx)
}

func (RestoreFromJsonFlatEmitter) ReturnName() string {
	return "v"
}

func (RestoreFromJsonFlatEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, expected CodeType) JitCode {
	if rt != nil && rt.Kind == protocol.KindUnion && len(rt.Children) > 0 {
		return emitUnionRestoreFromJsonFlat(rt, ctx, ctx.Vλl)
	}
	return RestoreFromJsonEmitter{}.Emit(rt, ctx, expected)
}

func (RestoreFromJsonFlatEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	return RestoreFromJsonEmitter{}.EmitDependencyCall(rt, childID, ctx)
}

func (RestoreFromJsonFlatEmitter) Finalize(raw string) (string, bool) {
	return RestoreFromJsonEmitter{}.Finalize(raw)
}
