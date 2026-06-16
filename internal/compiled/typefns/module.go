package typefns

import (
	"fmt"
	"os"
	"sort"
	"strings"

	"github.com/mionkit/ts-runtypes/internal/cache/disk"
	"github.com/mionkit/ts-runtypes/internal/compiled/entrymod"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/diag"
	"github.com/mionkit/ts-runtypes/internal/operations"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// RenderOpts threads the per-session disk cache into the per-entry collectors.
// Zero value is a valid "no caching" configuration — every entry is computed
// fresh and nothing is persisted. The collectors never panic on disk-layer
// errors: a read failure falls through to a fresh compile, a write failure is
// logged once and ignored so a read-only filesystem doesn't break builds.
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
	// the per-call-site fan-out quiet.
	DiagSink *[]diag.Diagnostic
	// ProvenanceSites maps each cached RunType ID to the set of marker
	// call sites that reference it. EmitDiagnostic uses this to fan out
	// one Diagnostic per call site so the user gets actionable file:line:col
	// coordinates — without it, a RTThrow would record a diagnostic
	// with empty Site and the warning would be useless in the editor.
	ProvenanceSites map[string][]diag.Site
	// InlineMode selects the child-inlining policy (constants.InlineMode):
	// default (and the zero value) inlines UNNAMED non-circular compounds
	// into their parents and keeps named types external; allInternal
	// inlines everything except circular types, names ignored. Folded into
	// the disk fingerprint — the two modes never share cache entries.
	InlineMode constants.InlineMode
	// EmitMode selects what each fn entry ships in its code/factory slots:
	//   - EmitCode (default / zero value): only the body `code` string; the
	//     createRTFn slot is the `u` placeholder and the JS-side materializer
	//     rebuilds the factory via `new Function('utl', code)` on first lookup.
	//   - EmitFunctions: only the live `function g_<hash>(utl){…}` factory; the
	//     code slot is `undefined` (runtime derives `code` lazily if read).
	//   - EmitBoth: both (the body twice) — runtimes that disallow `new Function`
	//     (Cloudflare WorkerD, browser CSP without `unsafe-eval`) yet read `.code`.
	// See docs/UNSUPPORTED-KINDS.md.
	EmitMode constants.EmitMode
	// RefTable resolves child ref ids to their RunType during a collect. When
	// non-nil it is used instead of an index built from dump.RunTypes — the
	// resolver passes the FULL session cache here so a collect whose dump.RunTypes
	// is a per-request projection (the scanFiles scope) can always resolve a
	// root's children, even ones interned while scanning a different file. Nil
	// falls back to indexing dump.RunTypes (the unit-test shape).
	RefTable map[string]*protocol.RunType
	// Facts, when non-nil, memoizes the canonical-node subtree predicates
	// (isJsonCompatible / isExtraProof) across every collect of one
	// dispatch. See FactsTable.
	Facts *FactsTable
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
// namespaces the JS cache key (tuple slot 3), and the SAME plain prefix is what
// same-family child dep calls resolve to (so a variant root references plain
// children).
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

// CollectFamilyEntries compiles one family's demanded cache entries into
// entrymod entries: one per demanded (root, variant) plus the transitive
// closure of same-family child factories they reference. Each entry's module
// Deps carry BOTH the same-family child deps and the cross-family edges
// (`<valHash>_<member>` lookups a decoder / validationErrors body reaches) — the
// per-entry import closure replaces the pre-migration CrossFamilyValRoots
// seeding pass, and the resolver's cross-family fixpoint renders the foreign
// entries those edges name.
//
// extraRoots seeds additional BARE type-ids as plain roots beyond the family's
// own call-site demand — the resolver's cross-family fixpoint uses it to
// render `val_<member>` entries other families' bodies reference. Each extra
// root is collected as a plain (no-variant) entry plus its same-family closure.
//
// When dump.Sites is empty AND no extraRoots are given, the collector falls
// back to emitting a factory for every interned RunType the emitter supports —
// the unit-test (and embedded-API) shape predating demand scoping.
//
// Pure-fn deps are intentionally NOT module deps: the pure fns a factory body
// reaches register themselves at their own `registerPureFnFactory` call sites
// (binding-injected by the plugin, or live factories without it) when the
// defining module is imported — always before any factory materializes.
func CollectFamilyEntries(dump protocol.Dump, settings constants.CacheModuleSettings, emitter Emitter, innerPrefix string, opts RenderOpts, extraRoots []string) entrymod.Graph {
	// Single-pass id→RunType index used by the walker to deref
	// KindRef sentinels at descent time. Cache entries store every
	// child slot as a ref (`{kind: -1, id: …}`) per protocol.go;
	// without the table the walker would dispatch on the ref's
	// placeholder kind and panic. opts.RefTable (the full session cache)
	// wins when provided so a collect resolves children that the per-request
	// dump.RunTypes projection may not contain.
	refTable := opts.RefTable
	if refTable == nil {
		refTable = make(map[string]*protocol.RunType, len(dump.RunTypes))
		for _, runType := range dump.RunTypes {
			if runType == nil || runType.ID == "" {
				continue
			}
			refTable[runType.ID] = runType
		}
	}

	graph := make(entrymod.Graph, len(dump.RunTypes))

	// renderEntry compiles one (RunType, variant) into the graph and returns
	// its discovered same-family child dependencies. Idempotent via the graph
	// dedup. Composite kinds may reach unsupported child kinds through
	// CompileChild; the compile pass returns CodeNS from any leaf with no emit,
	// compound parents propagate it, and the walker's IsUnsupported flag drops
	// the factory — see codetype.go's CodeNS contract.
	renderEntry := func(runType *protocol.RunType, suffix string, options []string) ([]string, bool) {
		if runType == nil || !emitter.Supports(runType) {
			return nil, false
		}
		entryID := variantKey(settings, suffix, options, runType.ID)
		if existing, exists := graph[entryID]; exists {
			return existing.Deps, true
		}
		rendered := renderEntryWithDeps(runType, settings, emitter, innerPrefix, refTable, opts, suffix, options)
		if rendered.argsText == "" {
			return nil, false
		}
		graph.Add(&entrymod.Entry{
			Key:       entryID,
			Kind:      entrymod.KindTypeFn,
			FamilyTag: settings.Tag,
			ArgsText:  rendered.argsText,
			// Same-family deps are HARD (body calls `<dep>.fn(…)`
			// unconditionally → cascade on absence); cross-family edges are
			// SOFT (bodies guard them with `?.fn(…) ?? true`, so a missing
			// foreign entry degrades to a stub at runtime).
			Deps:     append([]string(nil), rendered.deps...),
			SoftDeps: append([]string(nil), rendered.crossFamilyDeps...),
			IsNoop:   rendered.isNoop,
		})
		return rendered.deps, true
	}

	// enqueueChildren strips the inner prefix off each namespaced dependency
	// hash (e.g. "val_abc" → "abc") so the demand worklist can resolve the child
	// RunType via refTable and render its (plain) factory.
	queued := make(map[string]bool)
	var childQueue []string
	enqueueChildren := func(deps []string) {
		for _, dep := range deps {
			childHash := strings.TrimPrefix(dep, innerPrefix)
			if childHash == dep || queued[childHash] {
				continue
			}
			queued[childHash] = true
			childQueue = append(childQueue, childHash)
		}
	}

	if len(dump.Sites) > 0 || len(extraRoots) > 0 {
		// Demand-driven: emit only the (root, variant) entries the createX call
		// sites request for this family, plus the transitive closure of child
		// factories they reference. A type only passed to getRunTypeId (or to a
		// different family's createX) leaves no entry here. Children are always
		// plain entries: a variant only changes the root body, and its child dep
		// calls resolve to the plain `<fnHash>_<id>`.
		demand := collectFamilyDemand(dump.Sites, settings.Tag)
		// Iterate demand roots in a deterministic (sorted) order — Go map
		// iteration is randomized; sorted roots keep walk order (and therefore
		// disk-cache write order / diagnostics order) stable across runs.
		rootIDs := make([]string, 0, len(demand))
		for rootID := range demand {
			rootIDs = append(rootIDs, rootID)
		}
		sort.Strings(rootIDs)
		for _, rootID := range rootIDs {
			root := refTable[rootID]
			if root == nil {
				continue
			}
			demands := demand[rootID]
			sort.Slice(demands, func(i, j int) bool {
				return demands[i].VariantSuffix < demands[j].VariantSuffix
			})
			for _, demanded := range demands {
				if deps, ok := renderEntry(root, demanded.VariantSuffix, demanded.Options); ok {
					enqueueChildren(deps)
				}
			}
		}
		// extraRoots seed plain roots beyond the family's own call sites (the
		// resolver's cross-family fixpoint). Treated exactly like worklist
		// roots so their transitive same-family closure is pulled too. Sorted
		// (copy) for the same determinism reason as the demand roots.
		sortedExtra := append([]string(nil), extraRoots...)
		sort.Strings(sortedExtra)
		for _, rootID := range sortedExtra {
			if queued[rootID] {
				continue
			}
			queued[rootID] = true
			root := refTable[rootID]
			if root == nil {
				continue
			}
			if deps, ok := renderEntry(root, "", nil); ok {
				enqueueChildren(deps)
			}
		}
		for len(childQueue) > 0 {
			childHash := childQueue[len(childQueue)-1]
			childQueue = childQueue[:len(childQueue)-1]
			child := refTable[childHash]
			if child == nil {
				continue
			}
			if deps, ok := renderEntry(child, "", nil); ok {
				enqueueChildren(deps)
			}
		}
	} else {
		// Back-compat / unit-test path: no call-site demand for this family.
		// Emit a factory for every interned RunType the emitter supports; the
		// resolver-level cascade prunes any parent whose child kind is
		// unsupported.
		for _, runType := range dump.RunTypes {
			if runType == nil || !emitter.Supports(runType) {
				continue
			}
			renderEntry(runType, "", nil)
		}
	}

	return graph
}

// collectFamilyDemand groups, per structural runtype id, the distinct variant
// demands a family receives from createX call sites. The scanner attaches each
// site's structured Demand (computed from the operation registry); only entries
// whose FamilyTag matches familyTag are kept. Dedup is by variant suffix so the
// same type requested with the same options at N call sites yields one entry.
func collectFamilyDemand(sites []protocol.Site, familyTag string) map[string][]protocol.SiteDemand {
	bySuffix := make(map[string]map[string]protocol.SiteDemand)
	for _, site := range sites {
		if site.ID == "" || len(site.Demand) == 0 {
			continue
		}
		for _, demanded := range site.Demand {
			if demanded.FamilyTag != familyTag {
				continue
			}
			if bySuffix[site.ID] == nil {
				bySuffix[site.ID] = make(map[string]protocol.SiteDemand)
			}
			bySuffix[site.ID][demanded.VariantSuffix] = demanded
		}
	}
	out := make(map[string][]protocol.SiteDemand, len(bySuffix))
	for id, suffixes := range bySuffix {
		for _, demanded := range suffixes {
			out[id] = append(out[id], demanded)
		}
	}
	return out
}

// entryRender is the result of compiling one (RunType, variant) into its
// tuple argument text. `argsText` is the positional-arg interior (empty when
// the entry is skipped — noop with no body to emit, or an unsupported leaf with
// no per-family diag code). `deps` is the same-family rt-dependency hashes
// (walker.RTDependencies, e.g. "<valHash>_<childHash>") that drive the demand
// worklist; `crossFamilyDeps` is the distinct cross-family RT lookups the body
// reaches (walker.CrossFamilyDeps, e.g. a prepareForJson / toBinary /
// validationErrors entry referencing `<valHash>_<member>` to discriminate a
// union member). Both land on the emitted module's Deps so the import closure
// covers them; crossFamilyDeps additionally feed the resolver's cross-family
// fixpoint, which renders the foreign entries they name. `crossFamilyDeps` is
// populated whether the entry came from a fresh walk OR a disk-cache hit — the
// edges are persisted as CrossFamilyRefs and rebuilt by tryReadCachedEntry.
type entryRender struct {
	argsText        string
	deps            []string
	crossFamilyDeps []string
	// isNoop mirrors the walker's Finalize verdict (the short-form tuple
	// whose runtime fn is the family identity). Landed on
	// entrymod.Entry.IsNoop so downstream consumers (the JSON composite
	// collector) can elide references to identity entries.
	isNoop bool
}

// renderEntryWithDeps compiles one RunType into its tuple argument text and
// returns the discovered dependency hashes alongside (see entryRender). Inner
// function name is `<innerPrefix><hash>` (e.g. "<valHash>_abc123"); the
// outer factory's debug name (`g_<key>`) is used only as the closure's printed
// name so consumers see the same identity in stack traces. Noop bodies return
// the short-form arg text; unsupported leaves either produce an alwaysThrow
// entry (when the emitter registers a diag code) or skip silently.
//
// When `variantSuffix` is non-empty (e.g. "NA"), the entry is rendered
// under the variant cache key `<variantFhash>_<id>` and the walker is primed
// with `VariantOptions` so the emitter's per-kind dispatch can branch.
// Variants share child references with the plain entry — `InnerPrefix`
// stays at the plain hash so child dep calls resolve to plain factories.
//
// When opts.Store is non-nil and opts.Lookup is provided, the function
// first checks the on-disk cache at <store>/<runType.ID>/<settings.Tag>.json.
// A header structural-id mismatch, or any cached child-ref whose
// structural id no longer maps to the same short hash, is treated as
// a miss; we then fall through to the walker as usual and write the
// fresh result back. Read/write errors are non-fatal — the collector
// always produces output even when the cache is broken.
func renderEntryWithDeps(runType *protocol.RunType, settings constants.CacheModuleSettings, emitter Emitter, innerPrefix string, refTable map[string]*protocol.RunType, opts RenderOpts, variantSuffix string, variantOptions []string) entryRender {
	factoryName := variantFactoryName(settings, variantSuffix, variantOptions, runType.ID)
	innerName := variantKey(settings, variantSuffix, variantOptions, runType.ID)

	if variantSuffix == "" {
		if cached, ok := tryReadCachedEntry(runType, settings, innerPrefix, opts); ok {
			// Disk-cache hit: the walker never runs, but the entry's
			// cross-family edges were persisted as CrossFamilyRefs and
			// rebuilt here (see tryReadCachedEntry / writeCachedEntry), so
			// the hit returns the same crossFamilyDeps a fresh walk would
			// (and the same isNoop verdict, persisted as RTEntry.IsNoop).
			return cached
		}
	}

	walker := NewWalker(runType, innerName, emitter)
	walker.inlineCtx.InlineAllInternal = opts.InlineMode.AllInternal()
	walker.RefTable = refTable
	walker.facts = opts.Facts
	// InnerPrefix lets dispatch namespace child cache keys consistently
	// with the tuple's key slot (innerName below). Variant walkers still
	// set this to the plain hash so child deps resolve to the plain
	// entries — the variant only changes the ROOT body, not its children.
	walker.InnerPrefix = innerPrefix
	if len(variantOptions) > 0 {
		walker.VariantOptions = make(map[string]bool, len(variantOptions))
		for _, name := range variantOptions {
			walker.VariantOptions[name] = true
		}
	}
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
		// keyed by the leaf's per-family diag code so the JS-side tuple
		// consumer can materialise a throwing factory with the catalog
		// message. Surface the same code as a build-time diagnostic against
		// every call site referencing this RT — users see the cause at build
		// time AND at runtime. See docs/UNSUPPORTED-KINDS.md.
		//
		// Fallback to silent skip when the emitter registers no code
		// for the leaf — preserves the safety net for unknown future
		// kinds (the runtime cache miss is caught by createXxx<T>'s
		// identity fallback, via the KindMissing stub module).
		if leafProvider, ok := emitter.(LeafDiagCodeProvider); ok && walker.UnsupportedLeaf != nil {
			if diagCode := leafProvider.DiagCodeForLeaf(walker.UnsupportedLeaf); diagCode != "" {
				walker.EmitDiagnostic(diagCode, leafKindLabel(walker.UnsupportedLeaf))
				argsText := renderAlwaysThrowEntry(runType, innerName, diagCode, walker.rootProvenance)
				if variantSuffix == "" {
					// alwaysThrow entries emit no dep calls — no same-family
					// or cross-family edges to persist.
					writeCachedEntry(runType, settings, innerPrefix, argsText, nil, nil, false, opts)
				}
				return entryRender{argsText: argsText}
			}
		}
		return entryRender{}
	}
	// Noop factories emit a SHORT-FORM tuple tail: only the cache key,
	// typeName, and isNoop=true are passed. The JS-side consumer builds
	// the entry with a family-specific identity `fn` (`() => true` for
	// validate, `(v, pth, er) => er` for validationErrors, `(v) => v` for
	// prepareForJson / restoreFromJson) and leaves `code`,
	// `rtDependencies`, `pureFnDependencies`, and `createRTFn` as
	// undefined. Same dep-call wiring works — a parent referencing the
	// noop entry's `<hash>.fn(v)` still hits a real function — without
	// the per-entry payload bloat of an inlined `return v` body.
	if isNoop {
		args := []string{
			quoteJS(innerName),
			quoteJS(rtTypeName(runType)),
			"undefined", // code
			"true",      // isNoop
		}
		argsText := joinArgs(args)
		if variantSuffix == "" {
			// A noop body emits no dep calls, so no same-family or
			// cross-family lookups are registered.
			writeCachedEntry(runType, settings, innerPrefix, argsText, nil, nil, true, opts)
		}
		return entryRender{argsText: argsText, isNoop: true}
	}
	createRTFn, factoryBody := WrapClosure(factoryName, walker.FnName, innerFn, walker.ContextLines())
	// The `code` arg carries the factory BODY — the contents between the
	// `function(utl){ … }` braces — so a consumer holding only the
	// serialized RTCompiledFnData can rebuild the validator via
	// `new Function('utl', code)(rtUtils)`. The inner-validator body
	// remains embedded in `code` (as `return function …(v){…}`).
	//
	// The code (slot 2) and createRTFn (slot 6) slots vary by emit mode:
	//   - EmitCode (default): code string, `u` factory placeholder. The
	//     JS-side materializeRTFn rebuilds the factory from `code` on first
	//     `getRT(hash)` call. The all-default tail (`false,[],[],u`) trims, so
	//     the common dep-less entry ends at the `code` slot.
	//   - EmitFunctions: `undefined` code, live factory. The runtime uses the
	//     factory directly and derives `code` lazily only if a consumer reads it.
	//   - EmitBoth: code string + live factory (the body twice) for runtimes
	//     without `new Function` that still read `.code`.
	//
	// First arg is the namespaced cache key (innerPrefix + runType.ID) ==
	// the entry-module key, so the JS-side rtFnsCache slot is distinct from
	// the same runtype's other-family entries.
	codeArg := "undefined"
	if opts.EmitMode.EmitsCode() {
		codeArg = quoteJS(factoryBody)
	}
	createRTFnArg := "u"
	if opts.EmitMode.EmitsFactory() {
		createRTFnArg = createRTFn
	}
	args := trimArgsTail([]string{
		quoteJS(innerName),
		quoteJS(rtTypeName(runType)),
		codeArg,
		boolJS(isNoop),
		stringSliceJS(walker.RTDependencies),
		pureFnDepsJS(walker.PureFnDependencies),
		createRTFnArg,
	}, fnEntryArgDefaults)
	deps := append([]string(nil), walker.RTDependencies...)
	crossFamilyDeps := append([]string(nil), walker.CrossFamilyDeps...)
	argsText := joinArgs(args)
	if variantSuffix == "" {
		writeCachedEntry(runType, settings, innerPrefix, argsText, deps, crossFamilyDeps, false, opts)
	}
	return entryRender{argsText: argsText, deps: deps, crossFamilyDeps: crossFamilyDeps}
}

// tryReadCachedEntry attempts to load a previously cached entryRender
// (argsText, deps, crossFamilyDeps, isNoop) from the disk store. Returns
// ok=false on miss for any reason: no store wired, missing file, malformed
// file, header structural-id mismatch (hash drift), or any child OR
// cross-family ref whose hash has changed since write time.
//
// Cached deps are rebuilt from ChildRefs by translating each
// (structural id, hash) back to the namespaced form
// (innerPrefix + hash) the demand worklist expects. Cross-family deps are
// rebuilt from CrossFamilyRefs the same way, except each ref carries its
// OWN (foreign) prefix — the reconstructed dep is `ref.Prefix +
// currentHash`. Because both read-time hash checks guarantee structural
// id → hash agreement, these translations are lossless; a cache hit
// returns the exact entryRender the fresh walk would have produced.
func tryReadCachedEntry(runType *protocol.RunType, settings constants.CacheModuleSettings, innerPrefix string, opts RenderOpts) (entryRender, bool) {
	if opts.Store == nil || opts.Lookup == nil || runType == nil || runType.ID == "" {
		return entryRender{}, false
	}
	expectedStructural := opts.Lookup.StructuralForHash(runType.ID)
	if expectedStructural == "" {
		// Not interned in the current build — should not happen because
		// renderEntryWithDeps is called for entries that ARE in the
		// current dump, but guard anyway: a missing reverse mapping
		// means we cannot verify the file safely.
		return entryRender{}, false
	}
	entry, ok, err := opts.Store.ReadRT(runType.ID, settings.Tag)
	if err != nil || !ok || entry == nil {
		return entryRender{}, false
	}
	if entry.StructuralID != expectedStructural {
		return entryRender{}, false
	}
	deps := make([]string, 0, len(entry.ChildRefs))
	for _, ref := range entry.ChildRefs {
		currentHash := opts.Lookup.HashForStructural(ref.StructuralID)
		if currentHash == "" || currentHash != ref.Hash {
			// Child's structural id has been re-hashed (collision
			// extension) or removed entirely — cached body's baked
			// hash is stale.
			return entryRender{}, false
		}
		deps = append(deps, innerPrefix+currentHash)
	}
	crossFamilyDeps := make([]string, 0, len(entry.CrossFamilyRefs))
	for _, ref := range entry.CrossFamilyRefs {
		currentHash := opts.Lookup.HashForStructural(ref.StructuralID)
		if currentHash == "" || currentHash != ref.Hash {
			// Same drift rule as ChildRefs: the referenced member's hash
			// changed across builds, so the whole entry is stale.
			return entryRender{}, false
		}
		crossFamilyDeps = append(crossFamilyDeps, ref.Prefix+currentHash)
	}
	return entryRender{argsText: entry.ArgsText, deps: deps, crossFamilyDeps: crossFamilyDeps, isNoop: entry.IsNoop}, true
}

// splitNamespacedHash splits a namespaced cache hash into its family
// prefix (everything up to and including the first `_`, e.g. "<valHash>_") and
// the bare hash (the rest). Reports ok=false when there is no `_`
// separator — such an id can't be reconstructed as prefix+hash on read.
func splitNamespacedHash(namespaced string) (prefix string, bareHash string, ok bool) {
	idx := strings.IndexByte(namespaced, '_')
	if idx < 0 {
		return "", "", false
	}
	return namespaced[:idx+1], namespaced[idx+1:], true
}

// writeCachedEntry persists the freshly-rendered (argsText, deps,
// crossFamilyDeps, isNoop) tuple so the next build can skip the walker for
// this (typeID, fnTag) AND still reconstruct its cross-family edges and
// noop verdict on a hit.
// Failures are logged once to stderr and otherwise ignored — a read-only
// or out-of-space FS shouldn't break the build, and the next run will
// re-attempt the write.
//
// deps here are the namespaced rt-dependency hashes
// (walker.RTDependencies, e.g. "<valHash>_<childHash>"). We strip the prefix
// to recover the bare childHash and look up its structural id for the
// ChildRefs record. crossFamilyDeps (walker.CrossFamilyDeps) are
// foreign-prefixed namespaced hashes; we split each into its prefix (up to
// and including the first `_`) and bare hash, resolve the bare hash to its
// structural id, and store the triple as a CrossFamilyRef. As with
// ChildRefs, an unresolvable ref aborts the write cleanly rather than
// persisting a record the reader can't verify.
func writeCachedEntry(runType *protocol.RunType, settings constants.CacheModuleSettings, innerPrefix string, argsText string, deps []string, crossFamilyDeps []string, isNoop bool, opts RenderOpts) {
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
	crossFamilyRefs := make([]disk.CrossFamilyRef, 0, len(crossFamilyDeps))
	for _, dep := range crossFamilyDeps {
		prefix, bareHash, ok := splitNamespacedHash(dep)
		if !ok {
			// No `_` separator — can't recover a (prefix, hash) pair.
			// Abort the write rather than persist an unverifiable record.
			return
		}
		crossStructural := opts.Lookup.StructuralForHash(bareHash)
		if crossStructural == "" {
			return
		}
		crossFamilyRefs = append(crossFamilyRefs, disk.CrossFamilyRef{
			Prefix:       prefix,
			StructuralID: crossStructural,
			Hash:         bareHash,
		})
	}
	entry := disk.RTEntry{
		Format:          disk.FormatVersion,
		StructuralID:    structural,
		ArgsText:        argsText,
		IsNoop:          isNoop,
		ChildRefs:       childRefs,
		CrossFamilyRefs: crossFamilyRefs,
	}
	if err := opts.Store.WriteRT(runType.ID, settings.Tag, entry); err != nil {
		// Best-effort: report once per session would be ideal, but
		// keep it simple — fmt.Fprintln on the first failure is
		// enough to surface FS-permission misconfigurations without
		// spamming.
		fmt.Fprintln(os.Stderr, "ts-runtypes: disk-cache write failed:", err)
	}
}

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

// renderAlwaysThrowEntry emits the structured alwaysThrow tuple tail —
// the 8th positional argument is the per-family diag code; the JS-side
// tuple consumer resolves it to a human-readable message via
// messageForCode() and constructs the throwing factory at materialise
// time.
//
// The 9th argument is an optional `file:line:col` hint pointing at the FIRST
// known marker call site for the type. Appended to the runtime error
// message so a user who somehow ships an alwaysThrow factory to runtime
// sees `[CODE] msg (at src/foo.ts:7:18)` instead of an anonymous throw.
// When provenance is empty (orphaned entry), the slot is trimmed off the
// tail entirely — the JS-side record zips the absent slot to undefined.
//
// Shape (relative to the normal 7-arg tail):
//
//	'<hash>', '<typeName>',
//	undefined,  // code
//	false,      // isNoop
//	undefined,  // rtDependencies
//	undefined,  // pureFnDependencies
//	undefined,  // createRTFn — JS-side derives from diagCode
//	'<diagCode>',
//	'<siteHint>'
//
// See docs/UNSUPPORTED-KINDS.md "Wire format".
func renderAlwaysThrowEntry(runType *protocol.RunType, innerName string, diagCode string, provenance []diag.Site) string {
	args := trimArgsTail([]string{
		quoteJS(innerName),
		quoteJS(rtTypeName(runType)),
		"undefined", // code
		"false",     // isNoop
		"undefined", // rtDependencies
		"undefined", // pureFnDependencies
		"undefined", // createRTFn
		quoteJS(diagCode),
		formatCallSiteHint(provenance),
	}, alwaysThrowArgDefaults)
	return joinArgs(args)
}

// formatCallSiteHint renders the first call-site as `file:line:col` for
// the alwaysThrow 9th arg. Returns the literal `undefined` when no
// provenance is known so the JS-side tuple consumer treats the slot
// as absent.
func formatCallSiteHint(provenance []diag.Site) string {
	if len(provenance) == 0 {
		return "undefined"
	}
	site := provenance[0]
	return quoteJS(fmt.Sprintf("%s:%d:%d", site.FilePath, site.StartLine, site.StartCol))
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

// fnEntryArgDefaults holds the rendered default per slot of the normal
// 7-arg entry tail. Slots 0-2 (key/typeName/code) are pinned ("" = never
// trim) — code stays even as `undefined` in EmitFunctions mode. The JS-side
// tupleToRecord zips absent slots back to undefined and registration
// re-derives the same values (isNoop false, dep lists undefined like the
// noop short form, createRTFn rebuilt from `code`). When a factory is emitted
// (EmitFunctions/EmitBoth) the last slot carries the factory text, so the
// trim run never starts.
var fnEntryArgDefaults = []string{"", "", "", "false", "[]", "[]", "u"}

// alwaysThrowArgDefaults trims only the optional trailing site hint —
// the interior `undefined` slots stay explicit (diagCode follows them).
var alwaysThrowArgDefaults = []string{"", "", "", "", "", "", "", "", "undefined"}

// trimArgsTail returns args without its trailing run of default-valued
// slots; defaults[i] == "" pins slot i (never trimmed).
func trimArgsTail(args []string, defaults []string) []string {
	end := len(args)
	for end > 0 {
		i := end - 1
		if i >= len(defaults) || defaults[i] == "" || args[i] != defaults[i] {
			break
		}
		end--
	}
	return args[:end]
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
