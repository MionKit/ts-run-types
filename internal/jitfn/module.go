package jitfn

import (
	"fmt"
	"io"

	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// isTypeInnerPrefix is the prefix for the INNER validator function
// inside each createJitFn closure — what mion calls `jitFnHash` (the
// name used for self-recursive calls inside the body). The outer
// closure's debug name comes from CacheModules["isType"].VarPrefix
// (currently "get_isType_"). Keep the relationship
// `VarPrefix == "get_" + isTypeInnerPrefix` so the emitted JS matches
// mion's printClosure pattern. The two prefixes intentionally don't
// live on the same constant: VarPrefix is consumer-facing (in the
// CacheModuleSettings mirror), while the inner prefix is an internal
// codegen detail.
const isTypeInnerPrefix = "isType_"

// IsTypeModule writes the runtime artifact for the
// `virtual:runtypes-isType` module: module-level `'use strict';`,
// the shared `J` factory wrapped inside an `export function install(utl)`,
// and one `<get_isType_hash>: J(…)` property per RunType the
// IsTypeEmitter supports. The module is pure: importing it has no side
// effect — the consumer must call `install(utl)` explicitly, at which
// point every entry is materialized against the supplied utl, registered
// via `utl.addToJitCache(entry)`, and returned as a map keyed by
// factoryName for direct lookup.
//
// Thin wrapper over RenderFnModule: every per-fn module renderer is
// one line once the Emitter is implemented. Adding typeErrors later
// is a one-line `TypeErrorsModule` next to this one.
func IsTypeModule(writer io.Writer, dump protocol.Dump) error {
	return RenderFnModule(writer, dump, constants.CacheModules["isType"], IsTypeEmitter{}, isTypeInnerPrefix)
}

// isTypeFactoryPreambleLines is everything the rendered module emits
// before the per-entry properties of the returned map:
//
//   - `'use strict';` at module top — strict mode propagates lexically
//     into every nested closure, so per-factory directives would be
//     redundant. ES modules are strict by default, but the directive
//     is kept as a marker for readers and for non-ESM evaluation paths
//     (e.g. tests that eval the module body via `new Function`).
//   - `const u = undefined;` — same wire-size trick the runtypes module
//     uses (internal/emit/runtypes_module.go's `RT` preamble).
//   - `export function install(utl) {` — the module's single export.
//     Caller passes a JITUtils-shaped object; the function materializes
//     every entry against it (so `createJitFn(utl)` and
//     `utl.addToJitCache(entry)` happen at install-call time rather
//     than at module import, eliminating the side-effect import).
//   - `const J = (…) => {…};` — the shared factory inside install that
//     builds a JitCompiledFn entry, registers it in the supplied utl's
//     cache, and returns it. Mirrors `RT` in the runtypes module.
//
// All `JitCompiledFnData` fields the entry needs are passed as positional
// args to `J`. Fields invariant per fnID family (`args`,
// `defaultParamValues`, `fnID`) are hard-coded inside the factory body.
// The `createJitFn` closure is the last positional arg so it can span
// multiple lines without awkward formatting around trailing commas.
var isTypeFactoryPreambleLines = []string{
	"'use strict';",
	"",
	"const u = undefined;",
	"export function install(utl) {",
	"  const J = (jitFnHash, typeName, code, isNoop, jitDependencies, pureFnDependencies, createJitFn) => {",
	"    const fn = createJitFn(utl);",
	"    const entry = {",
	"      jitFnHash, fnID: 'isType', typeName,",
	"      args: {'vλl': 'v'}, defaultParamValues: {'vλl': u},",
	"      code, isNoop, jitDependencies, pureFnDependencies, createJitFn, fn,",
	"    };",
	"    utl.addToJitCache(entry);",
	"    return entry;",
	"  };",
	"  return {",
}

// isTypeFactoryEpilogueLines closes the `return { … }` literal and the
// surrounding `install(utl)` function body that the preamble opened.
var isTypeFactoryEpilogueLines = []string{
	"  };",
	"}",
}

// RenderFnModule is the fn-agnostic module renderer. Emits the preamble,
// then walks dump.RunTypes and writes one
// `export const <VarPrefix><hash> = J(…);` line per supported RunType.
//
// Kinds the emitter's Supports gate doesn't accept are silently
// skipped — the alternative (panicking) would crash the whole module
// for the presence of one unsupported kind, making kind-by-kind
// rollout impossible. The acceptance test in
// packages/vite-plugin-runtypes/test/jit-isType.test.ts asserts on
// the KindString case; if dispatch regresses for KindString the test
// fails loudly there.
//
// Parameters:
//   - settings: which CacheModule the factory names land in; the
//     VarPrefix becomes the exported entry's name prefix.
//   - emitter: the per-fn dispatch + Args + Finalize implementation.
//   - innerPrefix: the prefix for the INNER validator function inside
//     each createJitFn closure (must satisfy
//     `settings.VarPrefix == "get_" + innerPrefix` for the
//     printClosure convention to hold).
func RenderFnModule(writer io.Writer, dump protocol.Dump, settings constants.CacheModuleSettings, emitter Emitter, innerPrefix string) error {
	buffered := &lineWriter{writer: writer}
	buffered.line("// Code generated by ts-go-run-types. DO NOT EDIT.")
	buffered.line("// Source: precompiled jit validators for mion runtypes.")
	for _, preLine := range isTypeFactoryPreambleLines {
		buffered.line(preLine)
	}

	for _, runType := range dump.RunTypes {
		if runType == nil || !emitter.Supports(runType) {
			continue
		}
		entry := renderEntry(runType, settings, emitter, innerPrefix)
		if entry == "" {
			continue
		}
		buffered.line(entry)
	}

	for _, postLine := range isTypeFactoryEpilogueLines {
		buffered.line(postLine)
	}

	return buffered.err
}

// renderEntry compiles one RunType into a
// `    <factoryName>: J(<7 positional args>),` line inside the
// `return { … }` literal of the `install(utl)` body. The inner function
// lands as `<innerPrefix><hash>` (e.g. "isType_abc123"); the outer
// property lands as `<VarPrefix><hash>` (e.g. "get_isType_abc123") so
// consumers can look it up by the same name they used pre-migration.
// Noop bodies — `function name(v){return true}` for isType, or
// analogous defaults for other fns — return an empty string so the
// renderer can skip them; consumers default to a trivial fallback on
// the JS side (mirrors mion's `isNoop` short-circuit at
// jitFnCompiler.ts:101).
func renderEntry(runType *protocol.RunType, settings constants.CacheModuleSettings, emitter Emitter, innerPrefix string) string {
	factoryName := settings.VarPrefix + runType.ID
	innerName := innerPrefix + runType.ID
	walker := NewWalker(runType, innerName, emitter)
	innerFn, isNoop := walker.Compile()
	if isNoop {
		return ""
	}
	createJitFn := WrapClosure(factoryName, innerFn, walker.ContextLines())
	args := []string{
		quoteJS(runType.ID),
		quoteJS(jitTypeName(runType)),
		quoteJS(walker.Code),
		boolJS(isNoop),
		stringSliceJS(walker.JitDependencies),
		pureFnDepsJS(walker.PureFnDependencies),
		createJitFn,
	}
	return "    " + factoryName + ": J(" + joinArgs(args) + "),"
}

// jitTypeName resolves the `typeName` field for a JitCompiledFn entry.
// Mion uses the RunType's declared TypeName when present (e.g. for
// named types like `User`); for anonymous atomics it falls back to a
// name derived from the kind. v1's KindString case: the RunType's
// TypeName is empty for the bare `string` primitive, so the entry's
// typeName becomes the literal "string" — matching the consumer
// expectation in mion's `JitCompiledFnData` shape.
func jitTypeName(runType *protocol.RunType) string {
	if runType.TypeName != "" {
		return runType.TypeName
	}
	switch runType.Kind {
	case protocol.KindString:
		return "string"
	}
	return ""
}

// boolJS emits the JS literal for b. Inlining `strconv.FormatBool`
// would work too but a 2-case switch reads more obviously next to the
// other small render helpers.
func boolJS(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

// joinArgs concatenates positional args with bare commas. The
// createJitFn arg is multi-line; padding around commas would not align
// readably across long entries, so emit them flush.
func joinArgs(args []string) string {
	var b []byte
	for i, a := range args {
		if i > 0 {
			b = append(b, ',')
		}
		b = append(b, a...)
	}
	return string(b)
}

// lineWriter is the package-local equivalent of emit.bufWriter
// (internal/emit/runtypes_module.go:460). The emit package keeps that
// type unexported, so jitfn mirrors the minimal contract here rather
// than reaching across packages for two methods.
type lineWriter struct {
	writer io.Writer
	err    error
}

func (lw *lineWriter) line(line string) {
	if lw.err != nil {
		return
	}
	_, lw.err = fmt.Fprintln(lw.writer, line)
}
