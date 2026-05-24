package jitfn

import (
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// PrepareForJsonFlatEmitter is the optimised sibling of
// PrepareForJsonEmitter. Every per-kind dispatch arm delegates to the
// non-flat emitter — only the KindUnion arm is overridden to emit the
// flattened-object encoding (see emitUnionPrepareForJsonFlat in
// union_flat.go).
//
// The wire shape produced here is NOT compatible with PrepareForJsonEmitter
// at the union boundary: object-like members in a union are merged into
// a single envelope `[-1, mergedObject]` instead of being dispatched
// individually via isType + `[memberIndex, value]`. Atomic union members
// keep the original `[memberIndex, value]` wrapping so a hybrid union
// of objects + atomics works.
//
// Consumers opt into the flat family explicitly via
// `createPrepareForJsonFlat` / `createRestoreFromJsonFlat` /
// `createStringifyJsonFlat`. The non-flat family stays untouched.
type PrepareForJsonFlatEmitter struct{}

func (PrepareForJsonFlatEmitter) Args() []ArgSpec {
	return PrepareForJsonEmitter{}.Args()
}

func (PrepareForJsonFlatEmitter) Supports(rt *protocol.RunType) bool {
	return PrepareForJsonEmitter{}.Supports(rt)
}

func AnyPrepareForJsonFlatSupported(runTypes []*protocol.RunType) bool {
	emitter := PrepareForJsonFlatEmitter{}
	for _, rt := range runTypes {
		if emitter.Supports(rt) {
			return true
		}
	}
	return false
}

func (PrepareForJsonFlatEmitter) IsJitInlined(ctx *InlineContext) bool {
	return DefaultIsJitInlined(ctx)
}

func (PrepareForJsonFlatEmitter) ReturnName() string {
	return "v"
}

func (PrepareForJsonFlatEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, expected CodeType) JitCode {
	if rt != nil && rt.Kind == protocol.KindUnion && len(rt.Children) > 0 {
		return emitUnionPrepareForJsonFlat(rt, ctx, ctx.Vλl)
	}
	return PrepareForJsonEmitter{}.Emit(rt, ctx, expected)
}

func (PrepareForJsonFlatEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	return PrepareForJsonEmitter{}.EmitDependencyCall(rt, childID, ctx)
}

func (PrepareForJsonFlatEmitter) Finalize(raw string) (string, bool) {
	return PrepareForJsonEmitter{}.Finalize(raw)
}
