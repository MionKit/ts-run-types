// Package typefns ports mion's JitFnCompiler to Go so validator functions
// (isType, typeErrors, prepareForJson, …) can be precompiled at build
// time and shipped as static JS source instead of being assembled at
// runtime via `new Function`.
//
// Currently implements `isType` for every mion node category (atomic,
// array, tuple, union, intersection-collapsed, object literal, class,
// property, method, index signature, call signature, function, template
// literal, Map/Set/Promise/Awaited). The walker + dispatcher in
// walker.go and the per-fn switch in istype.go are the two seams; the
// switch dispatches one kind at a time, falling through to a
// `CodeNS` sentinel for any kind without an arm so the renderer can
// silently skip that entry's factory (see CodeNS below).
//
// Mirrors:
//   - mion/packages/run-types/src/lib/jitFnCompiler.ts (BaseFnCompiler)
//   - mion/packages/run-types/src/lib/createJitFunction.ts (closure assembly)
//   - mion/packages/run-types/src/jitCompilers/json/stringifyJson.ts (the
//     "single big switch over ReflectionKind" dispatch pattern this
//     package uses for `EmitIsType`).
package typefns

// CodeType matches mion's CodeTypes enum
// (run-types/src/constants.functions.ts:11). A JitCode snippet must
// declare which of the four shapes its source text takes so the
// parent frame knows whether it can be interpolated as-is, wrapped
// in a self-invoking function, terminated with a fullstop, or
// (for CodeNS) treated as a signal that the whole top-level entry
// should be skipped.
type CodeType string

const (
	// CodeE — a single JS expression. Concatenable with operators like
	// `&&`, `||`, `+`. The most common shape for atomic checks.
	CodeE CodeType = "E"
	// CodeS — one or more JS statements. Concatenable with `;`.
	CodeS CodeType = "S"
	// CodeRB — a JS block that returns a value via an explicit
	// `return …;`. Must be wrapped in a self-invoking function before it
	// can be embedded inside an expression.
	CodeRB CodeType = "RB"
	// CodeNS — sentinel: NOT actual JS code. Means "the kind reached
	// here has no emit implementation; the walker / parent emits must
	// propagate this upward so the renderer skips the factory entirely."
	//
	// Distinct from `Code == ""` carrying CodeE / CodeS / CodeRB, which
	// means "skip this slot in the parent" (e.g. a function-typed
	// property dropped from an object's AND chain — the parent's
	// validator is still emittable, this single child just contributes
	// nothing). CodeNS escalates: the parent IS unvalidatable too,
	// and so on up to the root.
	//
	// The renderer's contract: when a top-level Walker.Compile()
	// returns isUnsupported=true, no factory is emitted for that
	// RunType — the runtime cache miss is caught by createIsType's
	// hasRunType-but-no-jit fallback and degrades to `() => true`,
	// which mirrors mion's "no validator available" stance.
	CodeNS CodeType = "NS"
)

// JitCode is one emitter's output. `Code == ""` means "no code emitted"
// (mion uses `undefined` for the same state — both halves treat empty
// snippets as a noop the orchestrator can drop).
//
// ErrorMessage rides along the CodeNS sentinel to flip the renderer's
// "silent skip" into "emit a throwing factory". Mion's per-runtype
// throws inside emitPrepareForJson / emitRestoreFromJson (never,
// Promise, NonSerializableRunType, the `Arrays can not have non
// serializable types` check in array.ts) propagate as JS exceptions out
// of createJitFunction; our equivalent lands the message here, the
// walker latches it onto Walker.ThrowMessage on the first encounter,
// and module.go emits a `function(utl){ throw new Error(<msg>) }`
// factory so the throw surfaces at createPrepareForJson()-call time
// (matching mion's "throws at JIT compile" semantic).
type JitCode struct {
	Code         string
	Type         CodeType
	ErrorMessage string
}

// JitThrow returns a CodeNS JitCode carrying a message. Renderer emits
// a throw-factory whose body raises `new Error(message)` when invoked,
// so the throw surfaces at `createPrepareForJson<T>()` call time (which
// triggers the entry's first getJIT lookup → materialize →
// createJitFn(utl) → throw). Mirrors mion's per-runtype throws in
// nodes/atomic/never.ts, nodes/native/promise.ts,
// nodes/native/nonSerializable.ts, and the explicit
// checkNonSkipTypes() in nodes/member/array.ts.
func JitThrow(message string) JitCode {
	return JitCode{Code: "", Type: CodeNS, ErrorMessage: message}
}
