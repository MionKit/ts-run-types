package typefns

import (
	"fmt"
	"strings"

	"github.com/mionkit/ts-run-types/internal/cache/disk"
	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/operations"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// RenderOpts threads the per-session disk cache into the renderer. Zero
// value is a valid "no caching" configuration — every entry is computed
// fresh and nothing is persisted, matching the pre-cache behaviour. The
// renderer never panics on disk-layer errors: a read failure falls
// through to a fresh compile, a write failure is logged once and
// ignored so a read-only filesystem doesn't break builds.
type RenderOpts struct {
	// Store is the on-disk RT cache. Nil disables caching.
	Store *disk.Store
	// Lookup resolves structural ids ↔ short hashes for the current
	// session. Required when Store is non-nil. The resolver passes its
	// runtype.Cache here (which satisfies disk.HashLookup).
	Lookup disk.HashLookup
	// DiagSink is the destination for compile-time diagnostics emitted
	// by the walker at RTThrow / silent-skip sites. Nil disables
	// diagnostic emission entirely — keeps tests that don't care about
	// the per-call-site fan-out quiet. The dispatcher wires this from
	// the response's Diagnostics slice and flushes after each render.
	DiagSink *[]diag.Diagnostic
	// ProvenanceSites maps each cached RunType ID to the set of marker
	// call sites that reference it. EmitDiagnostic uses this to fan out
	// one Diagnostic per call site so the user gets actionable file:line:col
	// coordinates — without it, a RTThrow would record a diagnostic
	// with empty Site and the warning would be useless in the editor.
	ProvenanceSites map[string][]diag.Site
	// EmitCreateRTFn opts the renderer into emitting the inline
	// `createRTFn` closure alongside the body `code` string. False
	// (the default) writes `u` (the `const u = undefined` alias) in the
	// arg-7 slot and the JS-side materializer rebuilds the factory from
	// `code` via `new Function('utl', code)` lazily on first lookup.
	// True writes the full `function g_<hash>(utl){…}` declaration so
	// runtimes that disallow `new Function` (Cloudflare WorkerD,
	// browser CSP without `unsafe-eval`, …) can still materialise
	// validators. See docs/UNSUPPORTED-KINDS.md.
	EmitCreateRTFn bool
	// RefTable resolves child ref ids to their RunType during a render. When
	// non-nil it is used instead of an index built from dump.RunTypes — the
	// resolver passes the FULL session cache here so a render whose dump.RunTypes
	// is a per-request projection (the scanFiles scope) can always resolve a
	// root's children, even ones interned while scanning a different file. Nil
	// falls back to indexing dump.RunTypes (the module_test shape).
	RefTable map[string]*protocol.RunType
	// Facts, when non-nil, memoizes the canonical-node subtree predicates
	// (isJsonCompatible / isExtraProof) across every render of one
	// dispatch. See FactsTable.
	Facts *FactsTable
	// EntryCache, when non-nil, memoizes compiled (family-variant, typeID)
	// entries for the lifetime of ONE dispatch. Real family renders (live
	// DiagSink) populate it after compiling; CrossFamilyValRoots' collection
	// passes (DiagSink nil'd) read it, so a family that renders for real in
	// the same dispatch is never walked a second time just to harvest its
	// val_ edges. Writes are gated on DiagSink != nil — an entry must never
	// enter the cache from a diag-suppressed pass, or a later real render
	// reusing it would silently drop its diagnostics. The dispatcher orders
	// the validate render LAST so every requested family's real render runs
	// before the collection passes need it.
	EntryCache *EntryRenderCache
}

// EntryRenderCache is the per-dispatch memo for compiled cache-module
// entries, keyed by the namespaced variant cache key (`<fnHash>_<typeID>`),
// which is unique per (family, variant, type). Opaque so callers outside
// typefns can only create and thread it.
type EntryRenderCache struct {
	entries map[string]entryRender
}

// NewEntryRenderCache returns an empty per-dispatch entry memo.
func NewEntryRenderCache() *EntryRenderCache {
	return &EntryRenderCache{entries: map[string]entryRender{}}
}

func (cache *EntryRenderCache) get(key string) (entryRender, bool) {
	if cache == nil {
		return entryRender{}, false
	}
	entry, ok := cache.entries[key]
	return entry, ok
}

func (cache *EntryRenderCache) put(key string, entry entryRender) {
	if cache == nil {
		return
	}
	cache.entries[key] = entry
}



// familyOp recovers the operation that emits entries under a cache-module's
// family Tag (e.g. "verr" → the validationErrors operation). The fnHash naming scheme
// derives every cache key from the operation registry, NEVER from settings.Tag,
// so this lookup is the single bridge from a CacheModuleSettings to its hashes.
// Panics on an unknown tag — every type-walking family in CacheModules has a
// matching registry operation, so a miss is a programmer error caught in tests.
func familyOp(settings constants.CacheModuleSettings) operations.Operation {
	op, ok := operations.ByFamilyTag(settings.Tag)
	if !ok {
		panic(fmt.Sprintf("typefns: no operation registered for family tag %q", settings.Tag))
	}
	return op
}

// innerPrefix derives the inner-fn name prefix for a cache-module's family from
// the operation registry's plain (default-variant) fnHash — e.g. the validationErrors
// family → `<PlainHash("validationErrors")>_`. The inner validator function inside
// each createRTFn closure is named `<innerPrefix><hash>`; the same prefix
// namespaces the JS cache key registered via the factory's first arg, and the
// SAME plain prefix is what same-family child dep calls resolve to (so a
// variant root references plain children).
func innerPrefix(settings constants.CacheModuleSettings) string {
	return operations.PlainHash(familyOp(settings).Name) + "_"
}

// variantKey reports the cache-key shape for an emitter + variant suffix +
// runtype id. For the plain variant (empty suffix) this is `<plainFhash>_<id>`;
// for a non-empty suffix it's `<variantFhash>_<id>` — the variant fhash folds
// the option NAMES (carried in `options`) into the hash, so e.g. the
// noIsArrayCheck variant of validate is keyed by FnHashFor(validate, [noIsArrayCheck]).
func variantKey(settings constants.CacheModuleSettings, suffix string, options []string, id string) string {
	op := familyOp(settings)
	if suffix == "" {
		return operations.PlainHash(op.Name) + "_" + id
	}
	return operations.FnHashFor(op, options, "") + "_" + id
}

// variantFactoryName builds the outer factory's printed name —
// `g_<variantFhash>_<id>`. The plain branch reduces to `g_<plainFhash>_<id>`
// (= `settings.VarPrefix + id`). Wrapping `variantKey` with the `g_` prefix
// keeps the factory and cache-key shapes in lockstep.
func variantFactoryName(settings constants.CacheModuleSettings, suffix string, options []string, id string) string {
	return "g_" + variantKey(settings, suffix, options, id)
}




// entryRender is the result of compiling one (RunType, variant) into its
// cache-module line. `line` is the `init(…);` statement (empty when the
// entry is skipped — noop with no body to emit, or an unsupported leaf with
// no per-family diag code). `deps` is the same-family rt-dependency hashes
// (walker.RTDependencies, e.g. "val_<childHash>") that drive the dangling-dep
// cascade and topo sort. `crossFamilyDeps` is the distinct cross-family RT
// lookups the body reaches (walker.CrossFamilyDeps, e.g. a prepareForJson /
// toBinary / validationErrors entry referencing `val_<member>` to discriminate a
// union member) — followed by the demand-scoping step (CrossFamilyValRoots)
// into the referenced family; it is NOT consumed by any emission/topo decision
// in this render. `crossFamilyDeps` is populated whether the entry came from a
// fresh walk OR a disk-cache hit: as of FormatVersion 2 the edges are persisted
// as CrossFamilyRefs and rebuilt by tryReadCachedEntry, so a hit returns the
// same set the walk would have produced.
type entryRender struct {
	line            string
	deps            []string
	crossFamilyDeps []string
}



// splitNamespacedHash splits a namespaced cache hash into its family
// prefix (everything up to and including the first `_`, e.g. "val_") and
// the bare hash (the rest). Reports ok=false when there is no `_`
// separator — such an id can't be reconstructed as prefix+hash on read.
func splitNamespacedHash(namespaced string) (prefix string, bareHash string, ok bool) {
	idx := strings.IndexByte(namespaced, '_')
	if idx < 0 {
		return "", "", false
	}
	return namespaced[:idx+1], namespaced[idx+1:], true
}


// renderThrowEntry emits the short-form init line for a runtype whose
// JSON emit throws at RT compile time (mion's per-runtype throws —
// never, Promise, NonSerializableRunType, the array.ts symbol[]/
// function[] check). Shape:
//
//	init('<innerPrefix><runtype.ID>', '<typeName>', '<throwBody>',
//	     false, undefined, undefined, function(utl){ throw new Error(<msg>) });
//
// isNoop=false (the family-specific identity stub would mask the
// throw); code carries the throw body so deserialize* — which
// reconstructs via `new Function('utl', code)` — throws the same
// message; createRTFn is a function that throws when invoked, which
// happens inside materializeRTFn during the entry's first getRT
// lookup → throw propagates up to createPrepareForJson()-call site.
// leafKindLabel returns a short human-readable label for an unsupported
// leaf RunType — passed as the {0} substitution arg in the JS-side
// catalog template for root-throw diagnostics. The label is family-
// independent ("Never", "Symbol", "Function", …); per-family wording
// lives in the catalog entry's headline/detail text.
func leafKindLabel(leaf *protocol.RunType) string {
	if leaf == nil {
		return "Unsupported"
	}
	switch leaf.Kind {
	case protocol.KindNever:
		return "Never"
	case protocol.KindSymbol:
		return "Symbol"
	case protocol.KindPromise:
		return "Promise"
	case protocol.KindFunction,
		protocol.KindMethod,
		protocol.KindMethodSignature,
		protocol.KindCallSignature:
		return "Function"
	case protocol.KindClass:
		if leaf.SubKind == protocol.SubKindNonSerializable {
			return "NonSerializableClass"
		}
		return "Class"
	}
	return "Unsupported"
}



// rtTypeName resolves the `typeName` field for a RTCompiledFn entry.
// Mion uses the RunType's declared TypeName when present; for anonymous
// atomics it falls back to a name derived from the kind. Names mirror
// mion's ReflectionKindName table at
// mion-run-types:packages/run-types/src/constants.kind.ts.
func rtTypeName(runType *protocol.RunType) string {
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
// createRTFn arg is multi-line; padding around commas would not align
// readably across long entries, so emit them flush. Also used for
// path-literal segments (EmitContext.AccessPathLiteral) — the len-1
// fast path keeps that common single-segment case allocation-free.
func joinArgs(args []string) string {
	switch len(args) {
	case 0:
		return ""
	case 1:
		return args[0]
	}
	total := len(args) - 1
	for _, a := range args {
		total += len(a)
	}
	b := make([]byte, 0, total)
	for i, a := range args {
		if i > 0 {
			b = append(b, ',')
		}
		b = append(b, a...)
	}
	return string(b)
}
