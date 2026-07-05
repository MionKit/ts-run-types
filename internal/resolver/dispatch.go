package resolver

import (
	"context"
	"errors"
	"fmt"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/ts-runtypes/internal/compiled/entrymod"
	"github.com/mionkit/ts-runtypes/internal/compiled/runtype"
	"github.com/mionkit/ts-runtypes/internal/compiled/transform"
	"github.com/mionkit/ts-runtypes/internal/compiled/typefns"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/diag"
	"github.com/mionkit/ts-runtypes/internal/program"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// familyAddedFlag wires one family's per-scan added-flag: the pre-flight
// Supports probe plus the Response setter. pureFns / runTypes are not here —
// their flags come from the extractor / cache delta directly.
type familyAddedFlag struct {
	key          string
	anySupported func(runTypes []*protocol.RunType) bool
	setAdded     func(response *protocol.Response, added bool)
}

// familyAddedFlags enumerates the per-family added-flag wiring consumed by the
// Vite plugin's scan-change signals (and hmr-signals tests). Probe order is
// cosmetic — each row runs one shallow Supports pass over the scan's added
// nodes.
var familyAddedFlags = []familyAddedFlag{
	{key: "validationErrors",
		anySupported: typefns.FamilyByKey("validationErrors").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedValidationErrors = added }},
	{key: "prepareForJson",
		anySupported: typefns.FamilyByKey("prepareForJson").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedPrepareForJson = added }},
	{key: "restoreFromJson",
		anySupported: typefns.FamilyByKey("restoreFromJson").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedRestoreFromJson = added }},
	{key: "stringifyJson",
		anySupported: typefns.FamilyByKey("stringifyJson").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedStringifyJson = added }},
	{key: "prepareForJsonSafe",
		anySupported: typefns.FamilyByKey("prepareForJsonSafe").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedPrepareForJsonSafe = added }},
	{key: "hasUnknownKeys",
		anySupported: typefns.FamilyByKey("hasUnknownKeys").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedHasUnknownKeys = added }},
	{key: "stripUnknownKeys",
		anySupported: typefns.FamilyByKey("stripUnknownKeys").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedStripUnknownKeys = added }},
	{key: "unknownKeyErrors",
		anySupported: typefns.FamilyByKey("unknownKeyErrors").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedUnknownKeyErrors = added }},
	{key: "unknownKeysToUndefined",
		anySupported: typefns.FamilyByKey("unknownKeysToUndefined").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedUnknownKeysToUndefined = added }},
	{key: "unknownKeysToUndefinedWire",
		anySupported: typefns.FamilyByKey("unknownKeysToUndefinedWire").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedUnknownKeysToUndefinedWire = added }},
	{key: "toBinary",
		anySupported: typefns.FamilyByKey("toBinary").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedToBinary = added }},
	{key: "fromBinary",
		anySupported: typefns.FamilyByKey("fromBinary").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedFromBinary = added }},
	// NOT the registry generic: FormatTransformEmitter.Supports is true for
	// everything (identity is a valid transform), so the added-flag gates on
	// an actual value-transforming format instead.
	{key: "formatTransform",
		anySupported: typefns.AnyFormatTransformSupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedFormatTransform = added }},
	{key: "validate",
		anySupported: typefns.FamilyByKey("validate").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedValidate = added }},
}

// Dispatch routes a request to the correct handler. When the request sets
// IncludeMetrics, the response carries a Metrics block measured around the
// dispatch: total wall time, Go memory deltas/snapshots, tsgo
// extendedDiagnostics counters (read off the live Program), and the
// per-phase times the inner handler recorded.
func (resolver *Resolver) Dispatch(request protocol.Request) protocol.Response {
	if !request.IncludeMetrics {
		return resolver.dispatch(request, nil)
	}
	var memBefore runtime.MemStats
	runtime.ReadMemStats(&memBefore)
	metrics := &protocol.Metrics{RenderMs: map[string]float64{}}
	start := time.Now()
	response := resolver.dispatch(request, metrics)
	metrics.TotalMs = elapsedMs(start)
	var memAfter runtime.MemStats
	runtime.ReadMemStats(&memAfter)
	metrics.AllocBytes = memAfter.TotalAlloc - memBefore.TotalAlloc
	metrics.Mallocs = memAfter.Mallocs - memBefore.Mallocs
	metrics.NumGC = memAfter.NumGC - memBefore.NumGC
	metrics.HeapAlloc = memAfter.HeapAlloc
	metrics.HeapInuse = memAfter.HeapInuse
	if resolver.cache != nil {
		metrics.CacheNodes = resolver.cache.Size()
	}
	// extendedDiagnostics counters — tsgo checks lazily, so these are
	// post-op absolutes reflecting every check forced so far in this
	// Program's lifetime. The bench harness resets the Program per cycle,
	// which makes per-case numbers directly comparable.
	if resolver.Program != nil && resolver.Program.TS != nil {
		ts := resolver.Program.TS
		metrics.Files = len(ts.SourceFiles())
		metrics.Lines = ts.LineCount()
		metrics.Identifiers = ts.IdentifierCount()
		metrics.Symbols = ts.SymbolCount()
		metrics.Types = ts.TypeCount()
		metrics.Instantiations = ts.InstantiationCount()
	}
	response.Metrics = metrics
	return response
}

func elapsedMs(start time.Time) float64 {
	return float64(time.Since(start).Microseconds()) / 1000.0
}

// collectEntryModules runs the full per-entry pipeline against dump: runtype
// node entries for every dumped type, demand-driven family entries (parallel
// fan-out preserved), JSON composites, pure fns, the cross-family fixpoint,
// the global dangling-dep cascade, and missing stubs for demanded keys that
// didn't survive. Returns the rendered modules keyed by module BASENAME.
func (resolver *Resolver) collectEntryModules(dump protocol.Dump, rtOpts typefns.RenderOpts, pureFnGraph entrymod.Graph, metrics *protocol.Metrics) (map[string]string, error) {
	var graph entrymod.Graph
	if resolver.opts.ModuleMode == constants.ModuleModeAllModules {
		graph = runtype.CollectEntriesPerNode(dump)
	} else {
		graph = runtype.CollectEntries(dump)
	}

	familyGraphs, err := resolver.collectFamilies(dump, rtOpts, metrics)
	if err != nil {
		return nil, err
	}
	for _, familyGraph := range familyGraphs {
		graph.Merge(familyGraph)
	}
	// Composites collect AFTER the family merge so each one can read its
	// primitives' rendered IsNoop flags and elide dead identity bindings.
	graph.Merge(typefns.CollectJsonCompositeEntries(dump, rtOpts, graph))
	graph.Merge(pureFnGraph)

	// Link the reflection RunType bundle into the guarded fn entries of
	// circular types so the runtime circular-reference guard can walk values.
	resolver.wireCircularRunTypeDeps(graph, dump)

	resolver.resolveCrossFamilyEdges(graph, dump, rtOpts)
	// Composite prologues bind primitives with an unguarded
	// `utl.getRT(key).fn` — assert every referenced primitive actually
	// rendered (post-fixpoint) so an invariant breach fails the build
	// instead of crashing at runtime.
	typefns.AssertCompositeSoftDeps(graph, rtOpts.DiagSink)
	// Same invariant for cfn redirects: every `utl.usePureFn('cfn::…')` must
	// have its module in the graph or the build fails (OVR002) instead of
	// throwing at runtime.
	typefns.AssertOverrideCfn(graph, rtOpts.DiagSink)

	// Dropping an entry whose same-family dep never rendered mirrors the
	// pre-migration dangling cascade; the demanded roots that fall out (or
	// never rendered at all — unsupported kinds with no diag code) become
	// KindMissing stubs so the imports the plugin injected still resolve, and
	// the runtime degrades to the family identity fn exactly as before.
	graph.Cascade()
	demanded, demandTags := demandedEntryKeys(dump.Sites)
	graph.AddMissingStubs(demanded)
	// allSingle: a dropped demanded key must stay importable at the bundle
	// the site's import points at (Site.Module) — tag its stub so the
	// grouping routes it into that family bundle. Untagged stubs (soft-dep
	// fallbacks no site demanded) keep their own per-entry module.
	if resolver.opts.ModuleMode == constants.ModuleModeAllSingle {
		for key, entry := range graph {
			if entry.Kind == entrymod.KindMissing && entry.FamilyTag == "" {
				entry.FamilyTag = demandTags[key]
			}
		}
	}
	pruneUnreachableTypeFnEntries(graph, demanded)

	renderStart := time.Now()
	modules, err := entrymod.RenderGrouped(graph, resolver.moduleGrouping())
	if metrics != nil {
		metrics.RenderMs["entryModules"] = elapsedMs(renderStart)
	}
	return modules, err
}

// collectFamilies runs every type-walking family's per-entry collection.
// Families fan out across goroutines by default (collects are checker-free
// pure functions of (dump, RefTable, opts)); each goroutine gets a value copy
// of rtOpts with the two dispatch-shared mutable fields sharded: its own
// DiagSink slice and a fresh FactsTable. The join then, per family in
// registry order: first error wins, RenderMs recorded (values overlap
// wall-clock; their sum exceeds elapsed time), shard diagnostics appended
// (== the sequential order), and Facts shards merged into the dispatch opts.
func (resolver *Resolver) collectFamilies(dump protocol.Dump, rtOpts typefns.RenderOpts, metrics *protocol.Metrics) ([]entrymod.Graph, error) {
	families := typefns.Families
	graphs := make([]entrymod.Graph, len(families))
	if !resolver.parallelRenderEnabled() || len(families) < 2 {
		for familyIndex, spec := range families {
			collectStart := time.Now()
			graphs[familyIndex] = spec.Collect(dump, rtOpts, nil)
			if metrics != nil {
				metrics.RenderMs[spec.Key] = elapsedMs(collectStart)
			}
		}
		return graphs, nil
	}

	type familyResult struct {
		err       error
		collectMs float64
	}
	results := make([]familyResult, len(families))
	familyDiagnostics := make([][]diag.Diagnostic, len(families))
	factShards := make([]*typefns.FactsTable, len(families))
	var waitGroup sync.WaitGroup
	for familyIndex, spec := range families {
		factShards[familyIndex] = typefns.NewFactsTable()
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			defer func() {
				if recovered := recover(); recovered != nil {
					results[familyIndex].err = fmt.Errorf("collect %s: %v", spec.Key, recovered)
				}
			}()
			shardOpts := rtOpts
			if rtOpts.DiagSink != nil {
				shardOpts.DiagSink = &familyDiagnostics[familyIndex]
			}
			shardOpts.Facts = factShards[familyIndex]
			collectStart := time.Now()
			graphs[familyIndex] = spec.Collect(dump, shardOpts, nil)
			results[familyIndex].collectMs = elapsedMs(collectStart)
		}()
	}
	waitGroup.Wait()
	for familyIndex, spec := range families {
		if results[familyIndex].err != nil {
			return nil, results[familyIndex].err
		}
		if metrics != nil {
			metrics.RenderMs[spec.Key] = results[familyIndex].collectMs
		}
		if rtOpts.DiagSink != nil && len(familyDiagnostics[familyIndex]) > 0 {
			*rtOpts.DiagSink = append(*rtOpts.DiagSink, familyDiagnostics[familyIndex]...)
		}
		rtOpts.Facts.Merge(factShards[familyIndex])
	}
	return graphs, nil
}

// parallelRenderEnabled reports whether family collects may fan out.
// Parallel is the default; SingleThreaded means "no concurrency at all",
// covering collects too even though they never touch a checker.
func (resolver *Resolver) parallelRenderEnabled() bool {
	return !resolver.opts.DisableParallelRender && !resolver.opts.SingleThreaded
}

// familyByPlainHash maps each type-walking family's PLAIN fnHash to its spec —
// the reverse lookup the cross-family fixpoint needs to route a missing
// `<fnHash>_<id>` dep to the family that renders it. Cross-family edges always
// target plain (no-variant) entries, so plain hashes suffice.
var familyByPlainHash = func() map[string]typefns.FamilySpec {
	out := make(map[string]typefns.FamilySpec, len(typefns.Families))
	for _, spec := range typefns.Families {
		op, ok := operations.ByFamilyTag(spec.Settings.Tag)
		if !ok {
			continue
		}
		out[operations.PlainHash(op.Name)] = spec
	}
	return out
}()

// resolveCrossFamilyEdges renders, to fixpoint, every foreign-family entry the
// graph's deps reference but no family demanded directly — the
// `<valHash>_<member>` lookups union decoders / validationErrors bodies reach at
// runtime. This replaces the pre-migration CrossFamilyValRoots seeding pass:
// instead of collecting edges into the validate render, each missing edge is
// routed to its owning family (via the plain-fnHash reverse map) and collected
// as a plain root + same-family closure. Sites are stripped from the seed dump
// so the sub-collect renders ONLY the requested roots (no demand re-render, no
// duplicate diagnostics).
//
// Iteration is bounded: each pass only renders keys that were missing, and the
// rendered set grows monotonically toward the (finite) session type set. The
// guard cap is defensive — hitting it leaves the remaining edges to the stub
// pass, which preserves the build (runtime degrades to identity fallback).
func (resolver *Resolver) resolveCrossFamilyEdges(graph entrymod.Graph, dump protocol.Dump, rtOpts typefns.RenderOpts) {
	seedDump := protocol.Dump{RunTypes: dump.RunTypes}
	for iteration := 0; iteration < 8; iteration++ {
		missingByFamily := map[string]map[string]bool{}
		for _, entry := range graph {
			if entry.Kind != entrymod.KindTypeFn {
				continue
			}
			// Cross-family edges ride SoftDeps (hard Deps are same-family and
			// always rendered by the family's own collect or cascaded away).
			for _, dep := range entry.SoftDeps {
				if dep == "" || dep == entry.Key {
					continue
				}
				if _, ok := graph[dep]; ok {
					continue
				}
				separator := strings.IndexByte(dep, '_')
				if separator < 0 {
					continue
				}
				spec, ok := familyByPlainHash[dep[:separator]]
				if !ok {
					continue
				}
				if missingByFamily[spec.Key] == nil {
					missingByFamily[spec.Key] = map[string]bool{}
				}
				missingByFamily[spec.Key][dep[separator+1:]] = true
			}
		}
		if len(missingByFamily) == 0 {
			return
		}
		familyKeys := make([]string, 0, len(missingByFamily))
		for key := range missingByFamily {
			familyKeys = append(familyKeys, key)
		}
		sort.Strings(familyKeys)
		progressed := false
		for _, key := range familyKeys {
			ids := make([]string, 0, len(missingByFamily[key]))
			for id := range missingByFamily[key] {
				ids = append(ids, id)
			}
			sort.Strings(ids)
			before := len(graph)
			graph.Merge(typefns.FamilyByKey(key).Collect(seedDump, rtOpts, ids))
			if len(graph) > before {
				progressed = true
			}
		}
		// No progress means every remaining edge points at an unsupported
		// type — the stub pass will cover them; looping again would spin.
		if !progressed {
			return
		}
	}
}

// demandedEntryKeys lists the entry keys user call sites import: the
// `<fnHash>_<typeId>` key for every createX site (reflection sites import the
// runtype entry, which always exists for interned types). The stub pass turns
// any demanded key that didn't survive collection into a resolvable
// KindMissing module. The second return maps each demanded key to its
// family tag (the Demand entry whose FnHash keyed the site) — allSingle mode
// uses it to place dropped-key stubs inside the family bundle the site's
// import points at.
func demandedEntryKeys(sites []protocol.Site) ([]string, map[string]string) {
	var keys []string
	seen := map[string]bool{}
	tags := map[string]string{}
	for _, site := range sites {
		if site.ID == "" {
			continue
		}
		// A multi-function site (createStandardSchema's <T,'val','verr'>) injects
		// SEVERAL entry bindings at one slot; each is a key the plugin imports
		// directly, so every fnId is demanded — not just the scalar FnId mirror.
		fnIds := site.FnIds
		if len(fnIds) == 0 {
			fnIds = []string{site.FnId}
		}
		for _, fnId := range fnIds {
			if fnId == "" {
				continue
			}
			key := fnId + "_" + site.ID
			if seen[key] {
				continue
			}
			seen[key] = true
			keys = append(keys, key)
			for _, demand := range site.Demand {
				if demand.FnHash == fnId {
					tags[key] = demand.FamilyTag
					break
				}
			}
		}
	}
	sort.Strings(keys)
	return keys, tags
}

// pruneUnreachableTypeFnEntries drops every KindTypeFn entry nothing can
// load: not a rewrite-injected binding (`demanded` — each site's own
// `<FnId>_<ID>`, the only fn keys the plugin ever imports directly) and not
// reachable from a live module through import edges (Deps + SoftDeps,
// transitively). The noop-elision gate stopped REFERENCING identity entries;
// this stops EMITTING them — the demand machinery still renders a short-form
// for every primitive a composite site demands, but once the composite elides
// its binding the orphan (and anything only it pulled in) cascades out of the
// module set entirely.
//
// Non-typefn kinds are unconditional roots: the runtype bundle/facades load
// via reflection-site bindings and pure-fn modules via their own injected
// registration sites — neither rides the fn-site demand list, so reachability
// over it would under-approximate their liveness.
func pruneUnreachableTypeFnEntries(graph entrymod.Graph, demanded []string) {
	live := make(map[string]bool, len(graph))
	stack := make([]string, 0, len(graph))
	enqueue := func(key string) {
		if entry, ok := graph[key]; ok && entry != nil && !live[key] {
			live[key] = true
			stack = append(stack, key)
		}
	}
	for key, entry := range graph {
		if entry != nil && entry.Kind != entrymod.KindTypeFn {
			enqueue(key)
		}
	}
	for _, key := range demanded {
		enqueue(key)
	}
	for len(stack) > 0 {
		key := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		entry := graph[key]
		if entry == nil {
			continue
		}
		for _, dep := range entry.Deps {
			enqueue(dep)
		}
		for _, dep := range entry.SoftDeps {
			enqueue(dep)
		}
	}
	for key, entry := range graph {
		if entry != nil && entry.Kind == entrymod.KindTypeFn && !live[key] {
			delete(graph, key)
		}
	}
}

// moduleGrouping returns the entrymod.Grouping for the resolver's module
// mode. Nil (everything per-entry, the runtype bundle shaping its own module
// via CollectEntries) for default/allModules; the allSingle partition
// otherwise: fn/composite entries ride `fns/<familyTag>` bundles, pure fns
// the `pf` bundle, the reflection facades fold into the runtypes bundle, and
// missing stubs follow their demanding site's family (per-entry when no site
// demanded them — soft-dep stubs keep their own resolvable module).
func (resolver *Resolver) moduleGrouping() entrymod.Grouping {
	if resolver.opts.ModuleMode != constants.ModuleModeAllSingle {
		return nil
	}
	return func(entry *entrymod.Entry) string {
		switch entry.Kind {
		case entrymod.KindTypeFn:
			return constants.FnsBundleDir + "/" + entry.FamilyTag
		case entrymod.KindMissing:
			if entry.FamilyTag != "" {
				return constants.FnsBundleDir + "/" + entry.FamilyTag
			}
			return ""
		case entrymod.KindPureFn:
			return constants.PureFnModuleDir
		case entrymod.KindRunTypeBundle, entrymod.KindRunTypeFacade:
			return constants.RunTypesBundleBasename
		}
		return ""
	}
}

// stampSiteModules annotates sites with the bundle basename their entry rides
// in under allSingle mode (Site.Module). The mapping is mode-static —
// reflection sites point at the runtypes bundle, createX sites at their
// demand family's bundle — so the plain transform scan (no entry-module
// collection) stamps identically to the dump path. Returns a copy when
// stamping occurs; other modes pass sites through untouched.
func (resolver *Resolver) stampSiteModules(sites []protocol.Site) []protocol.Site {
	if resolver.opts.ModuleMode != constants.ModuleModeAllSingle || len(sites) == 0 {
		return sites
	}
	out := make([]protocol.Site, len(sites))
	copy(out, sites)
	for i := range out {
		if out[i].ID == "" {
			continue
		}
		if out[i].FnId == "" {
			out[i].Module = constants.RunTypesBundleBasename
			continue
		}
		for _, demand := range out[i].Demand {
			if demand.FnHash == out[i].FnId {
				out[i].Module = constants.FnsBundleDir + "/" + demand.FamilyTag
				break
			}
		}
	}
	return out
}

// circularGuardedFamilyTags are the family tags whose runtime factory applies
// the circular-reference guard: createValidate ('val'),
// createGetValidationErrors ('verr'), createBinaryEncoder ('tb'), and the four
// createJsonEncoder composites ('jeCL'/'jeMU'/'jeDI'/'jeCO'). Only these entries
// get the reflection RunType bundle linked into their dep closure; every other
// family of a circular type pays nothing (decoders take serialized input that
// cannot cycle; the leaf families never guard).
var circularGuardedFamilyTags = map[string]bool{
	"val":  true,
	"verr": true,
	"tb":   true,
	"jeCL": true,
	"jeMU": true,
	"jeDI": true,
	"jeCO": true,
}

// wireCircularRunTypeDeps links the reflection RunType graph into the dep
// closure of every guarded fn entry whose type can cycle, so the runtime guard
// (setRejectCircularRefs) can walk the value against its RunType. The graph rides as
// a SOFT dep — imported and registered by initFromTuple, but never cascaded
// (the fn body never references it; only the runtime wrapper does). In the
// default / allSingle bundle modes the dep is the single data bundle; in
// allModules mode it is the type's own per-node module (key == typeId).
func (resolver *Resolver) wireCircularRunTypeDeps(graph entrymod.Graph, dump protocol.Dump) {
	circular := runtype.CircularGuardTypeIDs(dump)
	if len(circular) == 0 {
		return
	}
	perNode := resolver.opts.ModuleMode == constants.ModuleModeAllModules
	bundleKey := ""
	if !perNode {
		for key, entry := range graph {
			if entry.Kind == entrymod.KindRunTypeBundle {
				bundleKey = key
				break
			}
		}
		if bundleKey == "" {
			return
		}
	}
	for _, entry := range graph {
		if entry.Kind != entrymod.KindTypeFn || !circularGuardedFamilyTags[entry.FamilyTag] {
			continue
		}
		typeID := typeIDFromEntryKey(entry.Key)
		if typeID == "" || !circular[typeID] {
			continue
		}
		dep := bundleKey
		if perNode {
			if _, ok := graph[typeID]; !ok {
				continue
			}
			dep = typeID
		}
		if dep == "" || dep == entry.Key || containsString(entry.SoftDeps, dep) {
			continue
		}
		entry.SoftDeps = append(entry.SoftDeps, dep)
	}
}

// typeIDFromEntryKey splits a `<fnHash>_<typeId>` fn-entry key at the first
// underscore, returning the type-id tail (empty when the key has no underscore).
func typeIDFromEntryKey(key string) string {
	if idx := strings.IndexByte(key, '_'); idx >= 0 {
		return key[idx+1:]
	}
	return ""
}

// sameTransformPath matches a wire-tagged file path against a requested path,
// tolerating the abs-vs-rel skew: scan Sites echo the REQUESTED (often
// relative) path, but pure-fn Replacements carry the program's ABSOLUTE file
// name (the extractor records positions against the tsgo program). Mirrors the
// JS scan-batcher's projectFile/samePath rule so transform partitions edits to
// the right file. Matching on a separator boundary keeps `a/user.ts` from
// claiming `another-user.ts`.
func sameTransformPath(tagged, requested string) bool {
	return tagged == requested || strings.HasSuffix(tagged, "/"+requested) || strings.HasSuffix(tagged, "\\"+requested)
}

// containsString reports whether values contains target.
func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

// dispatch is the un-instrumented op switch. metrics may be nil (the
// no-IncludeMetrics fast path); phase recordings are guarded per site.
func (resolver *Resolver) dispatch(request protocol.Request, metrics *protocol.Metrics) protocol.Response {
	before := resolver.cache.Size()
	switch request.Op {
	case protocol.OpScanFiles:
		if resolver.Program == nil {
			return protocol.Response{Error: "scanFiles: no Program loaded — call setSources first"}
		}
		if len(request.Files) == 0 {
			return protocol.Response{Error: "scanFiles: files is required and must be non-empty"}
		}
		scanStart := time.Now()
		sites, markerDiagnostics, err := resolver.dispatchScanFiles(request.Files)
		if err != nil {
			return protocol.Response{Error: err.Error()}
		}
		if metrics != nil {
			metrics.MarkerScanMs = elapsedMs(scanStart)
		}
		// Pure-fn extraction runs every scanFiles call: the request's
		// files may add or modify registerPureFnFactory calls without
		// producing any new RunTypes, AND every accepted entry yields
		// one Replacement record the Vite plugin uses to swap the
		// factory argument for the entry-module binding in the user's
		// source. Diagnostics flow unconditionally so editor surfaces
		// update as the user types.
		pureFnsStart := time.Now()
		pureFnEntries, pureFnDiagnostics, pureFnReplacements, addedPureFns := resolver.extractPureFnsForScan(request.Files)
		if metrics != nil {
			metrics.PureFnsMs = elapsedMs(pureFnsStart)
		}
		prepStart := time.Now()
		added := resolver.cache.Added(before)
		// Per-cache "did this scan change anything?" signals consumed by
		// the Vite plugin's handleHotUpdate.
		addedRunTypes := len(added) > 0
		combinedDiagnostics := append(append(append([]diag.Diagnostic{}, pureFnDiagnostics...), markerDiagnostics...), resolver.overrideDiagnostics...)
		// Opt-in enrichment-health pass (tag hygiene + FriendlyText/MockData
		// content + breadcrumb drift) for the lint surfaces. Runs AFTER
		// cache.Added(before) so the types the content checks intern never
		// leak into this response's added* HMR signals.
		if request.CheckEnrich {
			combinedDiagnostics = append(combinedDiagnostics, resolver.checkEnrichFiles(request.Files)...)
		}
		// Override arg-nulling replacements (scoped to the requested files) ride
		// the same Replacements channel as pure-fn factory nullings.
		allReplacements := append(append([]protocol.Replacement(nil), pureFnReplacements...), resolver.collectOverrideReplacements(request.Files)...)
		response := protocol.Response{
			Sites:         resolver.stampSiteModules(sites),
			Replacements:  allReplacements,
			AddedRunTypes: addedRunTypes,
			AddedPureFns:  addedPureFns,
			Diagnostics:   combinedDiagnostics,
		}
		// Per-family added flags, one shallow Supports pass each (the
		// addedRunTypes short-circuit skips all passes on no-change scans).
		for _, family := range familyAddedFlags {
			family.setAdded(&response, addedRunTypes && family.anySupported(added))
		}
		// The full added-node payload is attached only when the caller
		// opted into type payloads — the Vite plugin and the bench client
		// read just the added* booleans, so marshalling every new RunType
		// graph on every scan was pure wire/encode waste.
		if request.IncludeRunTypes {
			response.Added = added
		}
		if metrics != nil {
			metrics.PrepMs = elapsedMs(prepStart)
		}
		// rtDiagnostics is the sink the walker appends to at every
		// RTThrow / silent-skip site reached during the entry collection
		// below. Single sink covers every collect in this dispatch so a
		// single shared throw-site emits one diag per call site. The
		// render opts (provenance line/col conversion + full ref table)
		// are built ONLY when collection will actually run — the plain
		// rewrite-pipeline scan (no entry modules requested) skips all of
		// that work. IncludeRtDiagnostics runs the SAME collection for its
		// diagnostics but drops the module payload (lint pass).
		renderEntries := request.IncludeEntryModules || request.IncludeRtDiagnostics
		var rtDiagnostics []diag.Diagnostic
		var rtOpts typefns.RenderOpts
		if renderEntries {
			rtOptsStart := time.Now()
			rtOpts = resolver.rtRenderOpts(&rtDiagnostics, resolver.buildProvenanceSites())
			if metrics != nil {
				metrics.PrepMs += elapsedMs(rtOptsStart)
			}
		}
		if request.IncludeRunTypes || renderEntries {
			scopedStart := time.Now()
			scoped := resolver.scopedDump(request.Files)
			if metrics != nil {
				metrics.ScopedDumpMs = elapsedMs(scopedStart)
			}
			if request.IncludeRunTypes {
				response.RunTypes = scoped.RunTypes
			}
			if renderEntries {
				// Override cfn entries (whole-program) ride the pure-fn collection
				// so the type-fn redirects resolve their `cfn::` dep modules. Kept
				// out of the per-file pure-fn signals (replacements / addedPureFns)
				// — those track registerPureFnFactory rewrites, not overrides.
				allPureFns := append(append([]purefunctions.Entry(nil), pureFnEntries...), resolver.overrideEntries...)
				modules, modulesErr := resolver.collectEntryModules(scoped, rtOpts, purefunctions.CollectEntries(allPureFns), metrics)
				if modulesErr != nil {
					return protocol.Response{Error: modulesErr.Error()}
				}
				if request.IncludeEntryModules {
					response.EntryModules = modules
				}
			}
		}
		// Flush RT diagnostics into the unified response.Diagnostics slice
		// so the Vite plugin's reception loop surfaces them via this.warn.
		response.Diagnostics = append(response.Diagnostics, rtDiagnostics...)
		return response
	case protocol.OpDump:
		// Ensure every source file in the Program has been scanned for
		// marker calls before the dump is serialized. Without this,
		// the Vite plugin's virtual-module load — which fires on the
		// first import of any entry module — may run BEFORE the user's
		// marker-bearing source files have been transformed (and
		// therefore scanned). The eager scan amortises any per-file scan
		// that hasn't happened yet, so OpDump always returns the
		// complete picture.
		scanStart := time.Now()
		if resolver.Program != nil {
			resolver.scanAllProgramFiles()
		}
		if metrics != nil {
			metrics.MarkerScanMs = elapsedMs(scanStart)
		}
		fullDump := protocol.Dump{
			RunTypes: resolver.cache.Dump(),
			Sites:    resolver.stampSiteModules(resolver.Sites()),
		}
		response := protocol.Response{
			RunTypes: fullDump.RunTypes,
			Sites:    fullDump.Sites,
		}
		// rtDiagnostics mirrors the OpScanFiles branch — one sink shared
		// across the whole collection, flushed into response.Diagnostics
		// once the render completes.
		var rtDiagnostics []diag.Diagnostic
		rtOpts := resolver.rtRenderOpts(&rtDiagnostics, resolver.buildProvenanceSites())
		pureFnGraph, pureFnsDiagnostics := resolver.collectProgramPureFns(metrics)
		response.Diagnostics = append(response.Diagnostics, pureFnsDiagnostics...)
		modules, modulesErr := resolver.collectEntryModules(fullDump, rtOpts, pureFnGraph, metrics)
		if modulesErr != nil {
			return protocol.Response{Error: modulesErr.Error()}
		}
		response.EntryModules = modules
		response.Diagnostics = append(response.Diagnostics, rtDiagnostics...)
		return response
	case protocol.OpGenerate:
		// Filesystem-output sibling of OpDump: the same full-program entry
		// collection, but the modules are WRITTEN under <OutDir>/types/ (real
		// files the bundler resolves natively) instead of returned on the wire.
		// An empty OutDir infers <srcDir>/__runtypes from the tsconfig and echoes
		// the resolved path back so the plugin can adopt it.
		outDir := resolver.resolveOutDir(request.OutDir)
		if outDir == "" {
			return protocol.Response{Error: "generate: could not resolve an output dir (no OutDir, no tsconfig srcDir)"}
		}
		if resolver.Program != nil {
			resolver.scanAllProgramFiles()
		}
		genDump := protocol.Dump{
			RunTypes: resolver.cache.Dump(),
			Sites:    resolver.stampSiteModules(resolver.Sites()),
		}
		var genDiagnostics []diag.Diagnostic
		genOpts := resolver.rtRenderOpts(&genDiagnostics, resolver.buildProvenanceSites())
		genPureFnGraph, genPureFnsDiagnostics := resolver.collectProgramPureFns(metrics)
		genModules, genModulesErr := resolver.collectEntryModules(genDump, genOpts, genPureFnGraph, metrics)
		if genModulesErr != nil {
			return protocol.Response{Error: genModulesErr.Error()}
		}
		manifest, genErr := generateToDisk(outDir, genModules)
		if genErr != nil {
			return protocol.Response{Error: genErr.Error()}
		}
		genResponse := protocol.Response{Generated: manifest, OutDir: outDir}
		genResponse.Diagnostics = append(genResponse.Diagnostics, genPureFnsDiagnostics...)
		genResponse.Diagnostics = append(genResponse.Diagnostics, genDiagnostics...)
		return genResponse
	case protocol.OpSetSources:
		setStart := time.Now()
		if err := resolver.dispatchSetSources(request.Sources); err != nil {
			return protocol.Response{Error: err.Error()}
		}
		if metrics != nil {
			metrics.SetSourcesMs = elapsedMs(setStart)
		}
		return protocol.Response{OK: true}
	case protocol.OpReset:
		resolver.Reset()
		return protocol.Response{OK: true}
	case protocol.OpResolveID:
		runType := resolver.ResolveID(request.ID)
		if runType == nil {
			return protocol.Response{}
		}
		return protocol.Response{RunTypes: []*protocol.RunType{runType}}
	case protocol.OpTsCompile:
		ms, err := resolver.dispatchTsCompile()
		if err != nil {
			return protocol.Response{Error: err.Error()}
		}
		return protocol.Response{TsCompileMs: ms}
	case protocol.OpTransform:
		// The compiler-driven transform: scan the requested files exactly as
		// OpScanFiles does (sites + pure-fn replacements), then apply the
		// rewrite + source-map generation IN GO (internal/compiled/transform)
		// rather than handing offsets back to the JS plugin. Returns one
		// TransformResult per file. The added* flags ride along so the thin
		// Vite wrapper can still drive data-bundle HMR off this single call.
		if resolver.Program == nil {
			return protocol.Response{Error: "transform: no Program loaded — call setSources first"}
		}
		if len(request.Files) == 0 {
			return protocol.Response{Error: "transform: files is required and must be non-empty"}
		}
		scanStart := time.Now()
		sites, markerDiagnostics, err := resolver.dispatchScanFiles(request.Files)
		if err != nil {
			return protocol.Response{Error: err.Error()}
		}
		if metrics != nil {
			metrics.MarkerScanMs = elapsedMs(scanStart)
		}
		pureFnsStart := time.Now()
		_, pureFnDiagnostics, pureFnReplacements, addedPureFns := resolver.extractPureFnsForScan(request.Files)
		if metrics != nil {
			metrics.PureFnsMs = elapsedMs(pureFnsStart)
		}
		// Override arg-nulling replacements (scoped to the requested files) join
		// the pure-fn factory nullings; both are partitioned per file below.
		allReplacements := append(append([]protocol.Replacement(nil), pureFnReplacements...), resolver.collectOverrideReplacements(request.Files)...)
		sites = resolver.stampSiteModules(sites)
		added := resolver.cache.Added(before)
		addedRunTypes := len(added) > 0
		// Apply the rewrite per file. Sites/replacements come back flat across
		// all requested files, so partition them by File. Source text is read
		// from the Program (the authoritative bytes Site.Pos byte-offsets index).
		transformed := make(map[string]protocol.TransformResult, len(request.Files))
		for _, file := range request.Files {
			sourceFile, sourceErr := resolver.sourceFile(file)
			if sourceErr != nil {
				return protocol.Response{Error: sourceErr.Error()}
			}
			var fileSites []protocol.Site
			for _, site := range sites {
				if sameTransformPath(site.File, file) {
					fileSites = append(fileSites, site)
				}
			}
			var fileReplacements []protocol.Replacement
			for _, replacement := range allReplacements {
				if sameTransformPath(replacement.File, file) {
					fileReplacements = append(fileReplacements, replacement)
				}
			}
			source := sourceFile.Text()
			if request.EmitEdits {
				// 'edits' mode: hand the FE the raw edit list instead of the
				// rewritten file + map. ComputeEdits shares Apply's insertion /
				// import-block machinery, so applying these edits with the FE's
				// EditBuffer reproduces Apply's output byte-for-byte. The
				// SourceHash lets the FE detect an upstream pre-plugin that
				// edited the source out from under the resolver's byte offsets.
				importBlock, edits := transform.ComputeEdits(source, fileSites, fileReplacements)
				if importBlock != "" && request.OutDir != "" {
					// Files-mode: relativize the injected block's virtual:rt
					// specifiers exactly as 'go' mode does to the whole file —
					// the block is the only place those specifiers appear.
					importBlock = relativizeUserImports(resolver.absPath(file), resolver.absPath(request.OutDir), importBlock)
				}
				transformed[file] = protocol.TransformResult{
					ImportBlock: importBlock,
					Edits:       edits,
					SourceHash:  transform.SourceHash(source),
				}
				continue
			}
			code, sourceMap := transform.Apply(file, source, fileSites, fileReplacements)
			if request.OutDir != "" {
				// Files-mode: rewrite the injected import block's virtual:rt
				// specifiers to paths relative to this file (the generated
				// modules live on disk under OutDir/types). Both bases are
				// absolutized against the resolver cwd so filepath.Rel always
				// relates them. The block is one physical line, so this leaves
				// the source map valid.
				code = relativizeUserImports(resolver.absPath(file), resolver.absPath(request.OutDir), code)
			}
			if request.OmitSourcesContent && sourceMap != nil {
				// Drop the embedded original source — the bundler fills it from
				// its own copy when composing the chained map. One nil slot per
				// source keeps the array length aligned with Sources.
				sourceMap.SourcesContent = make([]*string, len(sourceMap.Sources))
			}
			// SourceHash rides go-mode too (8 bytes) so the plugin can DETECT an
			// upstream pre-plugin that edited the source before us — 'go' rebuilds
			// from the resolver's view and would otherwise clobber that edit
			// silently. The plugin warns on mismatch; the transform itself is
			// unaffected either way.
			transformed[file] = protocol.TransformResult{Code: code, Map: sourceMap, SourceHash: transform.SourceHash(source)}
		}
		combinedDiagnostics := append(append(append([]diag.Diagnostic{}, pureFnDiagnostics...), markerDiagnostics...), resolver.overrideDiagnostics...)
		response := protocol.Response{
			Transformed:   transformed,
			Sites:         sites,
			Replacements:  allReplacements,
			AddedRunTypes: addedRunTypes,
			AddedPureFns:  addedPureFns,
			Diagnostics:   combinedDiagnostics,
		}
		for _, family := range familyAddedFlags {
			family.setAdded(&response, addedRunTypes && family.anySupported(added))
		}
		return response
	default:
		return protocol.Response{Error: "unknown op: " + request.Op}
	}
}

// ResolveID returns the canonical full Type for id, or nil if no such id
// has been interned. Child slots inside the returned Type remain KindRef
// sentinels — callers re-issue ResolveID per id to drill in.
func (resolver *Resolver) ResolveID(id string) *protocol.RunType {
	if id == "" {
		return nil
	}
	return resolver.cache.NodeByID(id)
}

// dispatchSetSources builds an inferred Program from the supplied overlay
// and swaps it into the resolver. Relative file names are resolved against
// the working directory the resolver's previous Program had (or, on first
// call before any Program exists, against os.Getwd at start — but we don't
// have that here; main passes an absCwd via Options for server mode).
func (resolver *Resolver) dispatchSetSources(sources map[string]string) error {
	if sources == nil {
		sources = map[string]string{}
	}
	cwd := resolver.opts.Cwd
	if cwd == "" && resolver.Program != nil {
		cwd = resolver.Program.TS.GetCurrentDirectory()
	}
	if cwd == "" {
		return errors.New("setSources: no cwd configured")
	}
	cwd = tspath.NormalizePath(cwd)
	overlay := make(map[string]string, len(sources))
	fileNames := make([]string, 0, len(sources))
	for relativePath, content := range sources {
		absolutePath := tspath.ResolvePath(cwd, relativePath)
		overlay[absolutePath] = content
		fileNames = append(fileNames, absolutePath)
	}
	prog, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: resolver.opts.SingleThreaded,
		Overlay:        overlay,
	}, fileNames)
	if err != nil {
		return fmt.Errorf("setSources: %w", err)
	}
	return resolver.SetProgram(prog)
}

// extractPureFnsForScan runs the pure-fn extractor once per scanFiles
// request and returns everything downstream code needs: the entries
// (so the entry-module collection doesn't extract a second time), the wire
// diagnostics, the byte-range replacements for the user's source
// (factory-arg-to-binding), and a `changed` flag indicating that at
// least one entry's bodyHash differs from the session index.
//
// The session index (pureFnHashes) is mutated in place so subsequent
// scans see the new state. Removals are not detected here — a file
// that drops one of its pure-fn calls still leaves the session entry
// behind (matches the runTypes cache's structural-dedup contract;
// the orphan is harmless until the next process restart).
func (resolver *Resolver) extractPureFnsForScan(files []string) (entries []purefunctions.Entry, diagnostics []diag.Diagnostic, replacements []protocol.Replacement, changed bool) {
	if resolver.Program == nil || len(files) == 0 {
		return nil, nil, nil, false
	}
	entries, diagnostics = purefunctions.ExtractFromProgramCached(resolver.checker, resolver.marker, resolver.Program, files, resolver.pureFnFileCache)
	for _, entry := range entries {
		key := entry.Key()
		if existing, ok := resolver.pureFnHashes[key]; !ok || existing != entry.BodyHash {
			resolver.pureFnHashes[key] = entry.BodyHash
			changed = true
		}
	}
	replacements = purefunctions.Replacements(entries, resolver.opts.ModuleMode == constants.ModuleModeAllSingle)
	return entries, diagnostics, replacements, changed
}

// dispatchTsCompile runs the embedded tsgo through a full bind +
// typecheck + emit pass on the resolver's current Program. Returns the
// wall time in milliseconds. The emit output bytes are discarded — we
// only care about timing. Does NOT walk markers, does NOT collect any
// ts-runtypes entry modules — this is the pure-TypeScript baseline
// measurement the bench orchestrators record alongside the existing
// scanFiles latency.
func (resolver *Resolver) dispatchTsCompile() (float64, error) {
	if resolver.Program == nil || resolver.Program.TS == nil {
		return 0, errors.New("tsCompile: no Program loaded; call setSources first")
	}
	start := time.Now()
	// EmitOptions.WriteFile is the sink for emitted bytes. Discard
	// everything — the test is the timing, not the output.
	options := compiler.EmitOptions{
		WriteFile: func(_ string, _ string, _ *compiler.WriteFileData) error {
			// discard emit output — only the timing matters here
			return nil
		},
	}
	resolver.Program.TS.Emit(context.Background(), options)
	return float64(time.Since(start).Microseconds()) / 1000.0, nil
}
