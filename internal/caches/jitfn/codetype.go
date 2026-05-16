// Package jitfn ports mion's JitFnCompiler to Go so validator functions
// (isType, typeErrors, prepareForJson, …) can be precompiled at build
// time and shipped as static JS source instead of being assembled at
// runtime via `new Function`.
//
// v1 implements only `isType` for `KindString`. The Compiler scaffolding
// (stack tracking, vλl accessor mutation, context items, dependency
// hooks) mirrors mion's BaseFnCompiler 1:1 so adding the remaining kinds
// is a matter of filling in the dispatch switch in dispatch_istype.go.
//
// Mirrors:
//   - mion/packages/run-types/src/lib/jitFnCompiler.ts (BaseFnCompiler)
//   - mion/packages/run-types/src/lib/createJitFunction.ts (closure assembly)
//   - mion/packages/run-types/src/jitCompilers/json/stringifyJson.ts (the
//     "single big switch over ReflectionKind" dispatch pattern this
//     package uses for `EmitIsType`).
package jitfn

// CodeType matches mion's CodeTypes enum
// (run-types/src/constants.functions.ts:11). A JitCode snippet must
// declare which of the three shapes its source text takes so the parent
// frame knows whether it can be interpolated as-is, wrapped in a
// self-invoking function, or terminated with a fullstop.
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
)

// JitCode is one emitter's output. `Code == ""` means "no code emitted"
// (mion uses `undefined` for the same state — both halves treat empty
// snippets as a noop the orchestrator can drop).
type JitCode struct {
	Code string
	Type CodeType
}
