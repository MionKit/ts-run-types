package jitfn

import (
	"io"
	"strings"

	"github.com/mionkit/ts-run-types/internal/cachetpl"
	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// isTypeInnerPrefix is the prefix for the INNER validator function
// inside each createJitFn closure — what mion calls `jitFnHash` (the
// name used for self-recursive calls inside the body). The skeleton's
// `factory` builds the outer entry; the inner closure name is the only
// place this prefix still surfaces in the emitted JS.
const isTypeInnerPrefix = "isType_"

// IsTypeModule writes the runtime artifact for the
// `virtual:runtypes-isType` module: the hand-authored skeleton with the
// marker line replaced by one `factory(jitUtils, …);` call per cached
// RunType the IsTypeEmitter supports.
//
// Thin wrapper over RenderFnModule: every per-fn module renderer is one
// line once the Emitter is implemented. Adding typeErrors later is a
// one-line `TypeErrorsModule` next to this one.
func IsTypeModule(writer io.Writer, dump protocol.Dump) error {
	return RenderFnModule(writer, dump, constants.CacheModules["isType"], IsTypeEmitter{}, isTypeInnerPrefix, cachetpl.SkeletonIsType)
}

// RenderFnModule is the fn-agnostic module renderer. Emits one
// `factory(jitUtils, 'hash', …);` line per supported RunType then
// splices the result into the named skeleton.
//
// Kinds the emitter's Supports gate doesn't accept are silently
// skipped — the alternative (panicking) would crash the whole module
// for the presence of one unsupported kind, making kind-by-kind
// rollout impossible. The acceptance test in
// packages/vite-plugin-runtypes/test/jit-isType.test.ts asserts on the
// KindString case; if dispatch regresses for KindString the test fails
// loudly there.
//
// Parameters:
//   - settings: which CacheModule the factory uses for inner-closure
//     names; the VarPrefix prefixes the outer factory's debug name
//     inside createJitFn.
//   - emitter: the per-fn dispatch + Args + Finalize implementation.
//   - innerPrefix: the prefix for the INNER validator function inside
//     each createJitFn closure.
//   - skeleton: the cachetpl skeleton name to splice into.
func RenderFnModule(writer io.Writer, dump protocol.Dump, settings constants.CacheModuleSettings, emitter Emitter, innerPrefix string, skeleton string) error {
	var body strings.Builder
	body.WriteString("const u = undefined;\n")

	for _, runType := range dump.RunTypes {
		if runType == nil || !emitter.Supports(runType) {
			continue
		}
		entry := renderEntry(runType, settings, emitter, innerPrefix)
		if entry == "" {
			continue
		}
		body.WriteString(entry)
		body.WriteByte('\n')
	}

	out, err := cachetpl.Splice(skeleton, body.String())
	if err != nil {
		return err
	}
	_, err = io.WriteString(writer, out)
	return err
}

// renderEntry compiles one RunType into a `factory(jitUtils, …);` line
// that the skeleton's `factory` function consumes. Inner function name
// is `<innerPrefix><hash>` (e.g. "isType_abc123"); the outer factory's
// debug name (`<VarPrefix><hash>`, e.g. "get_isType_abc123") is used
// only as the closure's printed name so consumers see the same identity
// in stack traces. Noop bodies return empty string so the renderer
// skips them; consumers default to a trivial fallback on the JS side.
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
	return "factory(jitUtils," + joinArgs(args) + ");"
}

// jitTypeName resolves the `typeName` field for a JitCompiledFn entry.
// Mion uses the RunType's declared TypeName when present; for anonymous
// atomics it falls back to a name derived from the kind.
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

// boolJS emits the JS literal for b.
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
