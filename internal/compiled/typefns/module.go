package typefns

import (
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/mionkit/ts-run-types/internal/cache/disk"
	"github.com/mionkit/ts-run-types/internal/cachetpl"
	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// RenderOpts threads the per-session disk cache into the renderer. Zero
// value is a valid "no caching" configuration — every entry is computed
// fresh and nothing is persisted, matching the pre-cache behaviour. The
// renderer never panics on disk-layer errors: a read failure falls
// through to a fresh compile, a write failure is logged once and
// ignored so a read-only filesystem doesn't break builds.
type RenderOpts struct {
	// Store is the on-disk JIT cache. Nil disables caching.
	Store *disk.Store
	// Lookup resolves structural ids ↔ short hashes for the current
	// session. Required when Store is non-nil. The resolver passes its
	// runtype.Cache here (which satisfies disk.HashLookup).
	Lookup disk.HashLookup
	// DiagSink is the destination for compile-time diagnostics emitted
	// by the walker at JitThrow / silent-skip sites. Nil disables
	// diagnostic emission entirely — keeps tests that don't care about
	// the per-call-site fan-out quiet. The dispatcher wires this from
	// the response's Diagnostics slice and flushes after each render.
	DiagSink *[]diag.Diagnostic
	// ProvenanceSites maps each cached RunType ID to the set of marker
	// call sites that reference it. EmitDiagnostic uses this to fan out
	// one Diagnostic per call site so the user gets actionable file:line:col
	// coordinates — without it, a JitThrow would record a diagnostic
	// with empty Site and the warning would be useless in the editor.
	ProvenanceSites map[string][]diag.Site
}

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
func IsTypeModule(writer io.Writer, dump protocol.Dump, opts RenderOpts) error {
	settings := constants.CacheModules["isType"]
	return RenderFnModule(writer, dump, settings, IsTypeEmitter{}, innerPrefix(settings), cachetpl.SkeletonIsType, opts)
}

// TypeErrorsModule writes the runtime artifact for the typeErrors
// cache module — sibling of IsTypeModule, same structure (skeleton +
// generated factories), different emitter and skeleton.
func TypeErrorsModule(writer io.Writer, dump protocol.Dump, opts RenderOpts) error {
	settings := constants.CacheModules["typeErrors"]
	return RenderFnModule(writer, dump, settings, TypeErrorsEmitter{}, innerPrefix(settings), cachetpl.SkeletonTypeErrors, opts)
}

// PrepareForJsonModule writes the runtime artifact for the prepareForJson
// cache module — the JSON encoder half of the round-trip pair. Unions
// emit the flat wire shape (object members merge into a single
// `[-1, mergedObject]` envelope; see union_flat.go).
func PrepareForJsonModule(writer io.Writer, dump protocol.Dump, opts RenderOpts) error {
	settings := constants.CacheModules["prepareForJson"]
	return RenderFnModule(writer, dump, settings, PrepareForJsonEmitter{}, innerPrefix(settings), cachetpl.SkeletonPrepareForJson, opts)
}

// RestoreFromJsonModule writes the runtime artifact for the
// restoreFromJson cache module — the decode-side counterpart to
// PrepareForJsonModule. Round-trip
// `restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))`
// must deep-equal v for every supported runtype.
func RestoreFromJsonModule(writer io.Writer, dump protocol.Dump, opts RenderOpts) error {
	settings := constants.CacheModules["restoreFromJson"]
	return RenderFnModule(writer, dump, settings, RestoreFromJsonEmitter{}, innerPrefix(settings), cachetpl.SkeletonRestoreFromJson, opts)
}

// StringifyJsonModule writes the runtime artifact for the stringifyJson
// cache module — mion's single-pass JSON serialiser that builds the
// output string directly from the type, without mutating `v` and
// stripping extras by construction.
func StringifyJsonModule(writer io.Writer, dump protocol.Dump, opts RenderOpts) error {
	settings := constants.CacheModules["stringifyJson"]
	return RenderFnModule(writer, dump, settings, StringifyJsonEmitter{}, innerPrefix(settings), cachetpl.SkeletonStringifyJson, opts)
}

// PrepareForJsonSafeModule writes the runtime artifact for the
// prepareForJsonSafe cache module — non-mutating sibling of
// prepareForJson that strips undeclared properties and returns
// a new value.
func PrepareForJsonSafeModule(writer io.Writer, dump protocol.Dump, opts RenderOpts) error {
	settings := constants.CacheModules["prepareForJsonSafe"]
	return RenderFnModule(writer, dump, settings, PrepareForJsonSafeEmitter{}, innerPrefix(settings), cachetpl.SkeletonPrepareForJsonSafe, opts)
}

// PrepareForJsonSafePreserveModule writes the runtime artifact for the
// clone+preserve variant family — same shape as PrepareForJsonSafe but
// every cloned object literal spreads `...v` so undeclared keys
// survive.
func PrepareForJsonSafePreserveModule(writer io.Writer, dump protocol.Dump, opts RenderOpts) error {
	settings := constants.CacheModules["prepareForJsonSafePreserve"]
	return RenderFnModule(writer, dump, settings, PrepareForJsonSafePreserveEmitter{}, innerPrefix(settings), cachetpl.SkeletonPrepareForJsonSafePreserve, opts)
}

// HasUnknownKeysModule writes the runtime artifact for the
// hasUnknownKeys cache module — boolean predicate per mion's
// emitHasUnknownKeys.
func HasUnknownKeysModule(writer io.Writer, dump protocol.Dump, opts RenderOpts) error {
	settings := constants.CacheModules["hasUnknownKeys"]
	return RenderFnModule(writer, dump, settings, HasUnknownKeysEmitter{}, innerPrefix(settings), cachetpl.SkeletonHasUnknownKeys, opts)
}

// StripUnknownKeysModule writes the runtime artifact for the
// stripUnknownKeys cache module — mutator that deletes unknown keys.
func StripUnknownKeysModule(writer io.Writer, dump protocol.Dump, opts RenderOpts) error {
	settings := constants.CacheModules["stripUnknownKeys"]
	return RenderFnModule(writer, dump, settings, StripUnknownKeysEmitter{}, innerPrefix(settings), cachetpl.SkeletonStripUnknownKeys, opts)
}

// UnknownKeyErrorsModule writes the runtime artifact for the
// unknownKeyErrors cache module — error accumulator (same arg shape as
// typeErrors) that records one 'never' error per unknown key.
func UnknownKeyErrorsModule(writer io.Writer, dump protocol.Dump, opts RenderOpts) error {
	settings := constants.CacheModules["unknownKeyErrors"]
	return RenderFnModule(writer, dump, settings, UnknownKeyErrorsEmitter{}, innerPrefix(settings), cachetpl.SkeletonUnknownKeyErrors, opts)
}

// UnknownKeysToUndefinedModule writes the runtime artifact for the
// unknownKeysToUndefined cache module — mutator that sets unknown keys
// to undefined (instead of deleting them).
func UnknownKeysToUndefinedModule(writer io.Writer, dump protocol.Dump, opts RenderOpts) error {
	settings := constants.CacheModules["unknownKeysToUndefined"]
	return RenderFnModule(writer, dump, settings, UnknownKeysToUndefinedEmitter{}, innerPrefix(settings), cachetpl.SkeletonUnknownKeysToUndefined, opts)
}

// UnknownKeysToUndefinedWireModule writes the runtime artifact for the
// decoder-internal ukuWire family — sibling of uku that emits the
// wire-format-aware merged-allowlist strip at union nodes.
func UnknownKeysToUndefinedWireModule(writer io.Writer, dump protocol.Dump, opts RenderOpts) error {
	settings := constants.CacheModules["unknownKeysToUndefinedWire"]
	return RenderFnModule(writer, dump, settings, UnknownKeysToUndefinedWireEmitter{}, innerPrefix(settings), cachetpl.SkeletonUnknownKeysToUndefinedWire, opts)
}

// ToBinaryModule writes the runtime artifact for the toBinary cache
// module — binary serializer half of the round-trip pair. Wire format
// uses DataViewSerializer (little-endian byte stream). Unions emit the
// flat-prop wire shape (object members merge under a sentinel
// discriminator; see union_flat_binary.go).
func ToBinaryModule(writer io.Writer, dump protocol.Dump, opts RenderOpts) error {
	settings := constants.CacheModules["toBinary"]
	return RenderFnModule(writer, dump, settings, ToBinaryEmitter{}, innerPrefix(settings), cachetpl.SkeletonToBinary, opts)
}

// FromBinaryModule writes the runtime artifact for the fromBinary cache
// module — decode-side counterpart to ToBinaryModule. Round-trip
// `fromBinary(toBinary(v, ser).getBuffer(), des)` must deep-equal v for
// every supported runtype.
func FromBinaryModule(writer io.Writer, dump protocol.Dump, opts RenderOpts) error {
	settings := constants.CacheModules["fromBinary"]
	return RenderFnModule(writer, dump, settings, FromBinaryEmitter{}, innerPrefix(settings), cachetpl.SkeletonFromBinary, opts)
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
func RenderFnModule(writer io.Writer, dump protocol.Dump, settings constants.CacheModuleSettings, emitter Emitter, innerPrefix string, skeleton string, opts RenderOpts) error {
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
		line, deps := renderEntryWithDeps(runType, settings, emitter, innerPrefix, refTable, opts)
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
//
// When opts.Store is non-nil and opts.Lookup is provided, the function
// first checks the on-disk cache at <store>/<runType.ID>/<settings.Tag>.json.
// A header structural-id mismatch, or any cached child-ref whose
// structural id no longer maps to the same short hash, is treated as
// a miss; we then fall through to the walker as usual and write the
// fresh result back. Read/write errors are non-fatal — the renderer
// always produces output even when the cache is broken.
func renderEntryWithDeps(runType *protocol.RunType, settings constants.CacheModuleSettings, emitter Emitter, innerPrefix string, refTable map[string]*protocol.RunType, opts RenderOpts) (string, []string) {
	factoryName := settings.VarPrefix + runType.ID
	innerName := innerPrefix + runType.ID

	if cachedLine, cachedDeps, ok := tryReadCachedEntry(runType, settings, innerPrefix, opts); ok {
		return cachedLine, cachedDeps
	}

	walker := NewWalker(runType, innerName, emitter)
	walker.RefTable = refTable
	// InnerPrefix lets dispatch namespace child cache keys consistently
	// with the factory registration's first arg (innerName below).
	walker.InnerPrefix = innerPrefix
	// Wire diagnostic emission for this walk. EmitDiagnostic fans each
	// recorded code out across every call site referencing this RT.
	walker.DiagSink = opts.DiagSink
	if opts.ProvenanceSites != nil {
		walker.rootProvenance = opts.ProvenanceSites[runType.ID]
	}
	innerFn, isNoop, isUnsupported := walker.Compile()
	if isUnsupported {
		// Compile reached an unsupported leaf and the parent positions
		// chose to propagate (not absorb). Render an alwaysThrow factory
		// keyed by the leaf's per-family diag code so the JS-side init()
		// can materialise a throwing factory with the catalog message.
		// Surface the same code as a build-time diagnostic against every
		// call site referencing this RT — users see the cause at build
		// time AND at runtime. See docs/UNSUPPORTED-KINDS.md for the
		// unified model.
		//
		// Fallback to silent skip when the emitter registers no code
		// for the leaf — preserves the safety net for unknown future
		// kinds (the runtime cache miss is caught by createXxx<T>'s
		// identity fallback).
		if leafProvider, ok := emitter.(LeafDiagCodeProvider); ok && walker.UnsupportedLeaf != nil {
			if diagCode := leafProvider.DiagCodeForLeaf(walker.UnsupportedLeaf); diagCode != "" {
				walker.EmitDiagnostic(diagCode, throwDiagnosticMessage(walker.UnsupportedLeaf, settings))
				line := renderAlwaysThrowEntry(runType, settings, innerPrefix, diagCode, walker.rootProvenance)
				writeCachedEntry(runType, settings, innerPrefix, line, nil, opts)
				return line, nil
			}
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
		line := "init(" + joinArgs(args) + ");"
		writeCachedEntry(runType, settings, innerPrefix, line, nil, opts)
		return line, nil
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
	line := "init(" + joinArgs(args) + ");"
	writeCachedEntry(runType, settings, innerPrefix, line, deps, opts)
	return line, deps
}

// tryReadCachedEntry attempts to load a previously cached (line, deps)
// pair from the disk store. Returns ok=false on miss for any reason:
// no store wired, missing file, malformed file, header structural-id
// mismatch (hash drift), or any child ref whose hash has changed since
// write time.
//
// Cached deps are rebuilt from ChildRefs by translating each
// (structural id, hash) back to the namespaced form
// (innerPrefix + hash) the topo sort expects. Because the read-time
// child-hash check guarantees structural id → hash agreement, this
// translation is lossless.
func tryReadCachedEntry(runType *protocol.RunType, settings constants.CacheModuleSettings, innerPrefix string, opts RenderOpts) (string, []string, bool) {
	if opts.Store == nil || opts.Lookup == nil || runType == nil || runType.ID == "" {
		return "", nil, false
	}
	expectedStructural := opts.Lookup.StructuralForHash(runType.ID)
	if expectedStructural == "" {
		// Not interned in the current build — should not happen because
		// renderEntryWithDeps is called for entries that ARE in the
		// current dump, but guard anyway: a missing reverse mapping
		// means we cannot verify the file safely.
		return "", nil, false
	}
	entry, ok, err := opts.Store.ReadJIT(runType.ID, settings.Tag)
	if err != nil || !ok || entry == nil {
		return "", nil, false
	}
	if entry.StructuralID != expectedStructural {
		return "", nil, false
	}
	deps := make([]string, 0, len(entry.ChildRefs))
	for _, ref := range entry.ChildRefs {
		currentHash := opts.Lookup.HashForStructural(ref.StructuralID)
		if currentHash == "" || currentHash != ref.Hash {
			// Child's structural id has been re-hashed (collision
			// extension) or removed entirely — cached body's baked
			// hash is stale.
			return "", nil, false
		}
		deps = append(deps, innerPrefix+currentHash)
	}
	return entry.Line, deps, true
}

// writeCachedEntry persists the freshly-rendered (line, deps) pair so
// the next build can skip the walker for this (typeID, fnTag). Failures
// are logged once to stderr and otherwise ignored — a read-only or
// out-of-space FS shouldn't break the build, and the next run will
// re-attempt the write.
//
// deps here are the namespaced jit-dependency hashes
// (walker.JitDependencies, e.g. "it_<childHash>"). We strip the prefix
// to recover the bare childHash and look up its structural id for the
// ChildRefs record.
func writeCachedEntry(runType *protocol.RunType, settings constants.CacheModuleSettings, innerPrefix string, line string, deps []string, opts RenderOpts) {
	if opts.Store == nil || opts.Lookup == nil || runType == nil || runType.ID == "" {
		return
	}
	structural := opts.Lookup.StructuralForHash(runType.ID)
	if structural == "" {
		return
	}
	childRefs := make([]disk.ChildRef, 0, len(deps))
	for _, dep := range deps {
		childHash := strings.TrimPrefix(dep, innerPrefix)
		if childHash == dep {
			// Defensive: a dep that doesn't start with innerPrefix
			// breaks the read-time hash translation. Skip writing
			// rather than persist a record we can't safely verify.
			return
		}
		childStructural := opts.Lookup.StructuralForHash(childHash)
		if childStructural == "" {
			return
		}
		childRefs = append(childRefs, disk.ChildRef{
			StructuralID: childStructural,
			Hash:         childHash,
		})
	}
	entry := disk.JITEntry{
		Format:       disk.FormatVersion,
		StructuralID: structural,
		Line:         line,
		ChildRefs:    childRefs,
	}
	if err := opts.Store.WriteJIT(runType.ID, settings.Tag, entry); err != nil {
		// Best-effort: report once per session would be ideal, but
		// keep it simple — fmt.Fprintln on the first failure is
		// enough to surface FS-permission misconfigurations without
		// spamming.
		fmt.Fprintln(os.Stderr, "ts-go-run-types: disk-cache write failed:", err)
	}
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
// throwDiagnosticMessage returns the user-facing message for an
// unsupported leaf in the active family. Mirrors the JS-side
// messageForCode catalog (packages/ts-go-run-types/src/jit/diagnosticMessages.ts)
// so the build-time diagnostic carries the same wording the runtime
// throw will surface.
func throwDiagnosticMessage(leaf *protocol.RunType, settings constants.CacheModuleSettings) string {
	family := settings.Tag
	if family == "" {
		family = "this JIT family"
	}
	kindLabel := leafKindLabel(leaf)
	return kindLabel + " cannot be handled by " + family
}

// leafKindLabel returns a short human-readable label for an unsupported
// leaf RunType — used in build-time diagnostic messages.
func leafKindLabel(leaf *protocol.RunType) string {
	if leaf == nil {
		return "Unsupported type"
	}
	switch leaf.Kind {
	case protocol.KindNever:
		return "Never type"
	case protocol.KindSymbol:
		return "Symbol type"
	case protocol.KindPromise:
		return "Promise type"
	case protocol.KindFunction,
		protocol.KindMethod,
		protocol.KindMethodSignature,
		protocol.KindCallSignature:
		return "Function type"
	case protocol.KindClass:
		if leaf.SubKind == protocol.SubKindNonSerializable {
			return "Non-serializable class type"
		}
		return "Class type"
	}
	return "Unsupported type"
}

// renderAlwaysThrowEntry emits the structured alwaysThrow init() call —
// 8th argument is the per-family diag code; the JS-side init() consumer
// resolves it to a human-readable message via messageForCode() and
// constructs the throwing factory at materialise time. Replaces the
// legacy renderThrowEntry which embedded the message as an inline
// function body. Wire-size win: ~50 bytes saved per throw entry; the
// JS side avoids a `new Function` parse on first use.
//
// 9th argument is an optional `file:line:col` hint pointing at the FIRST
// known marker call site for the type. Appended to the runtime error
// message so a user who somehow ships an alwaysThrow factory to runtime
// sees `[CODE] msg (at src/foo.ts:7:18)` instead of an anonymous throw.
// When provenance is empty (orphaned entry), the slot is `undefined`.
//
// Shape (relative to the normal 7-arg init):
//
//	init('<hash>', '<typeName>',
//	     undefined,  // code
//	     false,      // isNoop
//	     undefined,  // jitDependencies
//	     undefined,  // pureFnDependencies
//	     undefined,  // createJitFn — JS-side derives from diagCode
//	     '<diagCode>',
//	     '<siteHint>')
//
// See docs/UNSUPPORTED-KINDS.md "Wire format".
func renderAlwaysThrowEntry(runType *protocol.RunType, settings constants.CacheModuleSettings, innerPrefix string, diagCode string, provenance []diag.Site) string {
	_ = settings
	innerName := innerPrefix + runType.ID
	args := []string{
		quoteJS(innerName),
		quoteJS(jitTypeName(runType)),
		"undefined", // code
		"false",     // isNoop
		"undefined", // jitDependencies
		"undefined", // pureFnDependencies
		"undefined", // createJitFn
		quoteJS(diagCode),
		formatCallSiteHint(provenance),
	}
	return "init(" + joinArgs(args) + ");"
}

// formatCallSiteHint renders the first call-site as `file:line:col` for
// the alwaysThrow 9th arg. Returns the literal `undefined` when no
// provenance is known so the JS-side init() consumer treats the slot
// as absent.
func formatCallSiteHint(provenance []diag.Site) string {
	if len(provenance) == 0 {
		return "undefined"
	}
	site := provenance[0]
	return quoteJS(fmt.Sprintf("%s:%d:%d", site.FilePath, site.StartLine, site.StartCol))
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
