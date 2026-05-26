package typefns

import (
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// PrepareForJsonSafePreserveEmitter — clone-preserve variant of
// PrepareForJsonSafeEmitter. Identical codegen EXCEPT every cloned
// object literal is emitted as `{...v, declared: <transformed>}`
// instead of `{declared: <transformed>}` — undeclared keys present on
// the input survive the clone untouched.
//
// Use case: the encoder's `strategy: 'clone', stripExtras: false`
// combination — clone-deep (no mutation), preserve all keys.
//
// The branch is gated by Walker.PreserveExtras, which NewWalker sets
// to true when the constructed walker's emitter is this type. Every
// other emit function (array, tuple, union, native iterable …) is
// reused unchanged from the strip variant.
type PrepareForJsonSafePreserveEmitter struct{}

func (PrepareForJsonSafePreserveEmitter) Args() []ArgSpec {
	return PrepareForJsonSafeEmitter{}.Args()
}

func (PrepareForJsonSafePreserveEmitter) Supports(rt *protocol.RunType) bool {
	return PrepareForJsonSafeEmitter{}.Supports(rt)
}

func AnyPrepareForJsonSafePreserveSupported(runTypes []*protocol.RunType) bool {
	emitter := PrepareForJsonSafePreserveEmitter{}
	for _, rt := range runTypes {
		if emitter.Supports(rt) {
			return true
		}
	}
	return false
}

func (PrepareForJsonSafePreserveEmitter) IsJitInlined(ctx *InlineContext) bool {
	return PrepareForJsonSafeEmitter{}.IsJitInlined(ctx)
}

func (PrepareForJsonSafePreserveEmitter) ReturnName() string {
	return PrepareForJsonSafeEmitter{}.ReturnName()
}

func (PrepareForJsonSafePreserveEmitter) EmitDependencyCall(rt *protocol.RunType, childID string, ctx *EmitContext) string {
	return PrepareForJsonSafeEmitter{}.EmitDependencyCall(rt, childID, ctx)
}

func (PrepareForJsonSafePreserveEmitter) Finalize(raw string) (string, bool) {
	return PrepareForJsonSafeEmitter{}.Finalize(raw)
}

// Emit delegates entirely to the strip variant's per-kind dispatch —
// the preserve semantic is read out of Walker.PreserveExtras inside
// buildSafeObjectLiteral, so no per-kind branching is needed here.
func (PrepareForJsonSafePreserveEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, ct CodeType) JitCode {
	return PrepareForJsonSafeEmitter{}.Emit(rt, ctx, ct)
}
