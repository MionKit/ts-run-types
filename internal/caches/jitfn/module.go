package jitfn

import (
	"io"
	"strings"

	"github.com/mionkit/ts-run-types/internal/cachetpl"
	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// innerPrefix derives the inner-fn name prefix from a cache-module's
// short Tag (e.g. "te" → "te_"). The inner validator function inside
// each createJitFn closure is named `<innerPrefix><hash>`; the same
// prefix namespaces the JS cache key registered via factory's first arg.
func innerPrefix(settings constants.CacheModuleSettings) string {
	return settings.Tag + "_"
}

// IsTypeModule writes the runtime artifact for the isType cache module:
// the hand-authored skeleton with the marker line replaced by one
// `init(…);` call per cached RunType the IsTypeEmitter supports.
// The skeleton's `init` closes over the surrounding `initCache(jitUtils)`
// parameter, so the per-entry call site doesn't repeat the argument.
//
// Thin wrapper over RenderFnModule: every per-fn module renderer is one
// line once the Emitter is implemented.
func IsTypeModule(writer io.Writer, dump protocol.Dump) error {
	settings := constants.CacheModules["isType"]
	return RenderFnModule(writer, dump, settings, IsTypeEmitter{}, innerPrefix(settings), cachetpl.SkeletonIsType)
}

// TypeErrorsModule writes the runtime artifact for the typeErrors
// cache module — sibling of IsTypeModule, same structure (skeleton +
// generated factories), different emitter and skeleton.
func TypeErrorsModule(writer io.Writer, dump protocol.Dump) error {
	settings := constants.CacheModules["typeErrors"]
	return RenderFnModule(writer, dump, settings, TypeErrorsEmitter{}, innerPrefix(settings), cachetpl.SkeletonTypeErrors)
}

// PrepareForJsonModule writes the runtime artifact for the prepareForJson
// cache module — the JSON encoder half of the round-trip pair. Unions
// emit the flat wire shape (object members merge into a single
// `[-1, mergedObject]` envelope; see union_flat.go).
func PrepareForJsonModule(writer io.Writer, dump protocol.Dump) error {
	settings := constants.CacheModules["prepareForJson"]
	return RenderFnModule(writer, dump, settings, PrepareForJsonEmitter{}, innerPrefix(settings), cachetpl.SkeletonPrepareForJson)
}

// RestoreFromJsonModule writes the runtime artifact for the
// restoreFromJson cache module — the decode-side counterpart to
// PrepareForJsonModule. Round-trip
// `restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))`
// must deep-equal v for every supported runtype.
func RestoreFromJsonModule(writer io.Writer, dump protocol.Dump) error {
	settings := constants.CacheModules["restoreFromJson"]
	return RenderFnModule(writer, dump, settings, RestoreFromJsonEmitter{}, innerPrefix(settings), cachetpl.SkeletonRestoreFromJson)
}

// StringifyJsonModule writes the runtime artifact for the stringifyJson
// cache module — mion's single-pass JSON serialiser that builds the
// output string directly from the type, without mutating `v` and
// stripping extras by construction.
func StringifyJsonModule(writer io.Writer, dump protocol.Dump) error {
	settings := constants.CacheModules["stringifyJson"]
	return RenderFnModule(writer, dump, settings, StringifyJsonEmitter{}, innerPrefix(settings), cachetpl.SkeletonStringifyJson)
}

// HasUnknownKeysModule writes the runtime artifact for the
// hasUnknownKeys cache module — boolean predicate per mion's
// emitHasUnknownKeys.
func HasUnknownKeysModule(writer io.Writer, dump protocol.Dump) error {
	settings := constants.CacheModules["hasUnknownKeys"]
	return RenderFnModule(writer, dump, settings, HasUnknownKeysEmitter{}, innerPrefix(settings), cachetpl.SkeletonHasUnknownKeys)
}

// StripUnknownKeysModule writes the runtime artifact for the
// stripUnknownKeys cache module — mutator that deletes unknown keys.
func StripUnknownKeysModule(writer io.Writer, dump protocol.Dump) error {
	settings := constants.CacheModules["stripUnknownKeys"]
	return RenderFnModule(writer, dump, settings, StripUnknownKeysEmitter{}, innerPrefix(settings), cachetpl.SkeletonStripUnknownKeys)
}

// UnknownKeyErrorsModule writes the runtime artifact for the
// unknownKeyErrors cache module — error accumulator (same arg shape as
// typeErrors) that records one 'never' error per unknown key.
func UnknownKeyErrorsModule(writer io.Writer, dump protocol.Dump) error {
	settings := constants.CacheModules["unknownKeyErrors"]
	return RenderFnModule(writer, dump, settings, UnknownKeyErrorsEmitter{}, innerPrefix(settings), cachetpl.SkeletonUnknownKeyErrors)
}

// UnknownKeysToUndefinedModule writes the runtime artifact for the
// unknownKeysToUndefined cache module — mutator that sets unknown keys
// to undefined (instead of deleting them).
func UnknownKeysToUndefinedModule(writer io.Writer, dump protocol.Dump) error {
	settings := constants.CacheModules["unknownKeysToUndefined"]
	return RenderFnModule(writer, dump, settings, UnknownKeysToUndefinedEmitter{}, innerPrefix(settings), cachetpl.SkeletonUnknownKeysToUndefined)
}

// RenderFnModule is the fn-agnostic module renderer. Emits one
// `init('hash', …);` line per supported RunType then splices the
// result into the named skeleton. The skeleton's `init` closes over
// `jitUtils` from its enclosing `initCache(jitUtils)`, so call sites
// stay compact.
//
// Entries are emitted in **child-before-parent** order so each
// factory's `createJitFn(jitUtils)` invocation can resolve its
// `utl.getJIT('<childHash>')` context items against an already-
// populated cache. The order is derived from each entry's
// `jitDependencies` (discovered during compile) via a DFS post-order
// walk over the input set; entries with no deps keep their input
// position relative to each other (stable topo sort).
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

	// Single-pass id→RunType index used by the walker to deref
	// KindRef sentinels at descent time. Cache entries store every
	// child slot as a ref (`{kind: -1, id: …}`) per protocol.go;
	// without the table the walker would dispatch on the ref's
	// placeholder kind and panic.
	refTable := make(map[string]*protocol.RunType, len(dump.RunTypes))
	for _, runType := range dump.RunTypes {
		if runType == nil || runType.ID == "" {
			continue
		}
		refTable[runType.ID] = runType
	}

	type compiled struct {
		line string
		deps []string
	}
	// Entries are keyed by the namespaced JS cache hash (innerPrefix +
	// runtype ID, e.g. "it_abc123"). Sharing this key with the
	// init registration's first arg means downstream tooling
	// (dangling-dep cascade, topo sort) operates on the same identifier
	// the JS side sees in jitUtils.
	entries := make(map[string]compiled, len(dump.RunTypes))
	order := make([]string, 0, len(dump.RunTypes))
	for _, runType := range dump.RunTypes {
		if runType == nil || !emitter.Supports(runType) {
			continue
		}
		// Composite kinds (Array, Object, Union, Tuple, …) may
		// reach unsupported child kinds through CompileChild. Rather
		// than walking each subtree twice (once to verify, once to
		// compile), the compile pass itself returns CodeNS from any
		// leaf with no emit; compound parents propagate that sentinel
		// upward and the walker's IsUnsupported flag signals to skip
		// the factory entirely. See codetype.go's CodeNS comment for
		// the full contract.
		line, deps := renderEntryWithDeps(runType, settings, emitter, innerPrefix, refTable)
		if line == "" {
			continue
		}
		namespacedID := innerPrefix + runType.ID
		if _, exists := entries[namespacedID]; exists {
			continue
		}
		entries[namespacedID] = compiled{line: line, deps: deps}
		order = append(order, namespacedID)
	}

	// Dangling-dep cascade: an entry whose body holds a
	// `<childHash>.fn(...)` reference but whose <childHash> never
	// made it into `entries` (the child compile returned
	// isUnsupported, OR the child's own dep cascaded out) would
	// throw at validator-call time on `undefined.fn`. Iteratively
	// drop entries with missing deps until the set is closed.
	// Runs to fixpoint — removing entry X can make Y (which
	// depended on X) unrenderable too. O(M·D·R) worst case
	// (M entries, D deps each, R rounds bounded by dep-chain
	// depth); typical schemas converge in 1-2 rounds.
	for {
		removed := 0
		for id, entry := range entries {
			for _, dep := range entry.deps {
				if _, ok := entries[dep]; !ok {
					delete(entries, id)
					removed++
					break
				}
			}
		}
		if removed == 0 {
			break
		}
	}

	// DFS post-order from each input entry to produce a stable topo
	// sort: children land before parents.
	visited := make(map[string]bool, len(entries))
	var topo []string
	var visit func(id string)
	visit = func(id string) {
		if visited[id] {
			return
		}
		visited[id] = true
		entry, ok := entries[id]
		if !ok {
			return
		}
		for _, dep := range entry.deps {
			if _, ok := entries[dep]; ok {
				visit(dep)
			}
		}
		topo = append(topo, id)
	}
	for _, id := range order {
		visit(id)
	}

	for _, id := range topo {
		body.WriteString(entries[id].line)
		body.WriteByte('\n')
	}

	out, err := cachetpl.Splice(skeleton, body.String())
	if err != nil {
		return err
	}
	_, err = io.WriteString(writer, out)
	return err
}

// renderEntryWithDeps compiles one RunType into its `init(…);` line
// and returns the discovered jit-dependency hashes alongside. Inner
// function name is `<innerPrefix><hash>` (e.g. "it_abc123"); the
// outer factory's debug name (`<VarPrefix><hash>`, e.g.
// "g_it_abc123") is used only as the closure's printed name so
// consumers see the same identity in stack traces. Noop bodies return
// an empty line so the renderer skips them; consumers default to a
// trivial fallback on the JS side.
func renderEntryWithDeps(runType *protocol.RunType, settings constants.CacheModuleSettings, emitter Emitter, innerPrefix string, refTable map[string]*protocol.RunType) (string, []string) {
	factoryName := settings.VarPrefix + runType.ID
	innerName := innerPrefix + runType.ID
	walker := NewWalker(runType, innerName, emitter)
	walker.RefTable = refTable
	// InnerPrefix lets dispatch namespace child cache keys consistently
	// with the factory registration's first arg (innerName below).
	walker.InnerPrefix = innerPrefix
	innerFn, isNoop, isUnsupported := walker.Compile()
	if isUnsupported {
		// Two failure modes:
		//
		// 1. ThrowMessage non-empty — the compile reached a runtype
		//    whose JSON emit throws at JIT-compile time in mion
		//    (never, Promise, NonSerializableRunType, the symbol[]/
		//    function[] check in array.ts). Emit a throw-factory
		//    that raises `new Error(<msg>)` when the entry is
		//    materialised; the throw surfaces at
		//    createPrepareForJson()-call time, matching mion's
		//    `expect(() => rt.createJitFunction(...)).toThrow()`
		//    contract.
		//
		// 2. ThrowMessage empty — the kind has no emit at all; keep
		//    the existing silent-skip behaviour so the runtime cache
		//    miss is caught by the create*()-side
		//    hasRunType-but-no-jit identity fallback.
		if walker.ThrowMessage != "" {
			return renderThrowEntry(runType, settings, innerPrefix, walker.ThrowMessage), nil
		}
		return "", nil
	}
	// Noop factories emit a SHORT-FORM init line: only the cache key,
	// typeName, and isNoop=true are passed. The JS-side init() builds
	// the entry with a family-specific identity `fn` (`() => true` for
	// isType, `(v, pth, er) => er` for typeErrors, `(v) => v` for
	// prepareForJson / restoreFromJson) and leaves `code`,
	// `jitDependencies`, `pureFnDependencies`, and `createJitFn` as
	// undefined. Same dep-call wiring works — a parent referencing the
	// noop entry's `<hash>.fn(v)` still hits a real function — without
	// the per-entry payload bloat of an inlined `return v` body.
	if isNoop {
		args := []string{
			quoteJS(innerName),
			quoteJS(jitTypeName(runType)),
			"undefined", // code
			"true",      // isNoop
		}
		return "init(" + joinArgs(args) + ");", nil
	}
	createJitFn, factoryBody := WrapClosure(factoryName, innerFn, walker.ContextLines())
	// The 3rd arg (`code`) carries the factory BODY — the contents
	// between the `function(utl){ … }` braces — so a consumer holding
	// only the serialized JitCompiledFnData can rebuild the validator
	// via `new Function('utl', code)(jitUtils)`. The inner-validator
	// body remains embedded in `code` (as `return function …(v){…}`)
	// AND is the entire payload of `createJitFn` for live invocation.
	//
	// First arg is the namespaced cache key (innerPrefix + runType.ID)
	// so the JS-side jitFnsCache slot is distinct from the same
	// runtype's isType / prepareForJson / … entries.
	args := []string{
		quoteJS(innerName),
		quoteJS(jitTypeName(runType)),
		quoteJS(factoryBody),
		boolJS(isNoop),
		stringSliceJS(walker.JitDependencies),
		pureFnDepsJS(walker.PureFnDependencies),
		createJitFn,
	}
	deps := append([]string(nil), walker.JitDependencies...)
	return "init(" + joinArgs(args) + ");", deps
}

// renderThrowEntry emits the short-form init line for a runtype whose
// JSON emit throws at JIT compile time (mion's per-runtype throws —
// never, Promise, NonSerializableRunType, the array.ts symbol[]/
// function[] check). Shape:
//
//	init('<innerPrefix><runtype.ID>', '<typeName>', '<throwBody>',
//	     false, undefined, undefined, function(utl){ throw new Error(<msg>) });
//
// isNoop=false (the family-specific identity stub would mask the
// throw); code carries the throw body so deserialize* — which
// reconstructs via `new Function('utl', code)` — throws the same
// message; createJitFn is a function that throws when invoked, which
// happens inside materializeJitFn during the entry's first getJIT
// lookup → throw propagates up to createPrepareForJson()-call site.
func renderThrowEntry(runType *protocol.RunType, settings constants.CacheModuleSettings, innerPrefix string, message string) string {
	_ = settings
	innerName := innerPrefix + runType.ID
	quoted := quoteJS(message)
	body := "throw new Error(" + quoted + ");"
	factory := "function(utl){" + body + "}"
	args := []string{
		quoteJS(innerName),
		quoteJS(jitTypeName(runType)),
		quoteJS(body),
		"false",     // isNoop — false so the identity-fn stub doesn't mask the throw
		"undefined", // jitDependencies
		"undefined", // pureFnDependencies
		factory,
	}
	return "init(" + joinArgs(args) + ");"
}

// jitTypeName resolves the `typeName` field for a JitCompiledFn entry.
// Mion uses the RunType's declared TypeName when present; for anonymous
// atomics it falls back to a name derived from the kind. Names mirror
// mion's ReflectionKindName table at
// mion-run-types:packages/run-types/src/constants.kind.ts.
func jitTypeName(runType *protocol.RunType) string {
	if runType.TypeName != "" {
		return runType.TypeName
	}
	if runType.Kind == protocol.KindClass {
		switch runType.SubKind {
		case protocol.SubKindDate:
			return "date"
		case protocol.SubKindMap:
			return "map"
		case protocol.SubKindSet:
			return "set"
		}
	}
	switch runType.Kind {
	case protocol.KindAny:
		return "any"
	case protocol.KindUnknown:
		return "unknown"
	case protocol.KindNever:
		return "never"
	case protocol.KindVoid:
		return "void"
	case protocol.KindNull:
		return "null"
	case protocol.KindUndefined:
		return "undefined"
	case protocol.KindString:
		return "string"
	case protocol.KindNumber:
		return "number"
	case protocol.KindBoolean:
		return "boolean"
	case protocol.KindBigInt:
		return "bigint"
	case protocol.KindSymbol:
		return "symbol"
	case protocol.KindObject:
		// mion's ReflectionKindName maps deepkit's KindObject (4) to
		// 'objectLiteral'; the atomic node lives at nodes/atomic/object.ts.
		return "objectLiteral"
	case protocol.KindRegexp:
		return "regexp"
	case protocol.KindLiteral:
		return "literal"
	case protocol.KindEnum:
		return "enum"
	case protocol.KindArray:
		return "array"
	case protocol.KindObjectLiteral:
		return "objectLiteral"
	case protocol.KindClass:
		return "class"
	case protocol.KindProperty:
		return "property"
	case protocol.KindPropertySignature:
		return "propertySignature"
	case protocol.KindIndexSignature:
		return "indexSignature"
	case protocol.KindFunction:
		return "function"
	case protocol.KindMethod:
		return "method"
	case protocol.KindMethodSignature:
		return "methodSignature"
	case protocol.KindCallSignature:
		return "callSignature"
	case protocol.KindTuple:
		return "tuple"
	case protocol.KindTupleMember:
		return "tupleMember"
	case protocol.KindUnion:
		return "union"
	case protocol.KindTemplateLiteral:
		return "templateLiteral"
	case protocol.KindPromise:
		return "promise"
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
