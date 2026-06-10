package resolver

import (
	"context"
	"errors"
	"fmt"
	"runtime"
	"sync"
	"time"

	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-run-types/internal/compiled/purefns"
	"github.com/mionkit/ts-run-types/internal/compiled/typefns"
	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// familyRender bundles one dump-driven cache-family render: the wire kind it
// answers to, the render wrapper, the Response slot the body lands in, and
// the registry hooks for the per-scan added-flag (nil for runType — its flag
// is len(added)>0, computed by the caller). Shared by the OpScanFiles (scoped
// dump) and OpDump (full dump) branches — the only per-op differences are the
// dump that seeds the render and the want-gate. pureFns is NOT here: it
// renders from extractor entries, not from a Dump (see the
// renderPureFnsModule call sites). This table is the resolver-side family
// enumeration; the typefns side lives in typefns.Families.
type familyRender struct {
	kind         protocol.CacheKind
	render       func(dump protocol.Dump, opts typefns.RenderOpts) (string, error)
	assign       func(response *protocol.Response, body string)
	anySupported func(runTypes []*protocol.RunType) bool
	setAdded     func(response *protocol.Response, added bool)
}

// familyRenders is ordered with validate LAST on purpose: renderValidateModule
// runs CrossFamilyValRoots, whose collection passes reuse the per-dispatch
// EntryRenderCache that the OTHER families' real renders populate. Rendering
// validate after every other requested family turns those 13 collection
// renders into cache hits whenever the family was requested anyway.
var familyRenders = []familyRender{
	{kind: protocol.CacheKindRunType,
		render: func(dump protocol.Dump, _ typefns.RenderOpts) (string, error) { return renderRunTypesModule(dump) },
		assign: func(response *protocol.Response, body string) { response.RunTypeCacheSource = body }},
	{kind: protocol.CacheKindValidationErrors,
		render:       renderFamilyModule("validationErrors"),
		assign:       func(response *protocol.Response, body string) { response.ValidationErrorsCacheSource = body },
		anySupported: typefns.FamilyByKey("validationErrors").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedValidationErrors = added }},
	{kind: protocol.CacheKindPrepareForJson,
		render:       renderPrepareForJsonModule,
		assign:       func(response *protocol.Response, body string) { response.PrepareForJsonCacheSource = body },
		anySupported: typefns.FamilyByKey("prepareForJson").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedPrepareForJson = added }},
	{kind: protocol.CacheKindRestoreFromJson,
		render:       renderRestoreFromJsonModule,
		assign:       func(response *protocol.Response, body string) { response.RestoreFromJsonCacheSource = body },
		anySupported: typefns.FamilyByKey("restoreFromJson").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedRestoreFromJson = added }},
	{kind: protocol.CacheKindStringifyJson,
		render:       renderFamilyModule("stringifyJson"),
		assign:       func(response *protocol.Response, body string) { response.StringifyJsonCacheSource = body },
		anySupported: typefns.FamilyByKey("stringifyJson").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedStringifyJson = added }},
	{kind: protocol.CacheKindPrepareForJsonSafe,
		render:       renderFamilyModule("prepareForJsonSafe"),
		assign:       func(response *protocol.Response, body string) { response.PrepareForJsonSafeCacheSource = body },
		anySupported: typefns.FamilyByKey("prepareForJsonSafe").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedPrepareForJsonSafe = added }},
	{kind: protocol.CacheKindHasUnknownKeys,
		render:       renderFamilyModule("hasUnknownKeys"),
		assign:       func(response *protocol.Response, body string) { response.HasUnknownKeysCacheSource = body },
		anySupported: typefns.FamilyByKey("hasUnknownKeys").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedHasUnknownKeys = added }},
	{kind: protocol.CacheKindStripUnknownKeys,
		render:       renderFamilyModule("stripUnknownKeys"),
		assign:       func(response *protocol.Response, body string) { response.StripUnknownKeysCacheSource = body },
		anySupported: typefns.FamilyByKey("stripUnknownKeys").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedStripUnknownKeys = added }},
	{kind: protocol.CacheKindUnknownKeyErrors,
		render:       renderFamilyModule("unknownKeyErrors"),
		assign:       func(response *protocol.Response, body string) { response.UnknownKeyErrorsCacheSource = body },
		anySupported: typefns.FamilyByKey("unknownKeyErrors").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedUnknownKeyErrors = added }},
	{kind: protocol.CacheKindUnknownKeysToUndefined,
		render:       renderFamilyModule("unknownKeysToUndefined"),
		assign:       func(response *protocol.Response, body string) { response.UnknownKeysToUndefinedCacheSource = body },
		anySupported: typefns.FamilyByKey("unknownKeysToUndefined").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedUnknownKeysToUndefined = added }},
	{kind: protocol.CacheKindUnknownKeysToUndefinedWire,
		render:       renderFamilyModule("unknownKeysToUndefinedWire"),
		assign:       func(response *protocol.Response, body string) { response.UnknownKeysToUndefinedWireCacheSource = body },
		anySupported: typefns.FamilyByKey("unknownKeysToUndefinedWire").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedUnknownKeysToUndefinedWire = added }},
	{kind: protocol.CacheKindToBinary,
		render:       renderFamilyModule("toBinary"),
		assign:       func(response *protocol.Response, body string) { response.ToBinaryCacheSource = body },
		anySupported: typefns.FamilyByKey("toBinary").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedToBinary = added }},
	{kind: protocol.CacheKindFromBinary,
		render:       renderFamilyModule("fromBinary"),
		assign:       func(response *protocol.Response, body string) { response.FromBinaryCacheSource = body },
		anySupported: typefns.FamilyByKey("fromBinary").AnySupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedFromBinary = added }},
	{kind: protocol.CacheKindFormatTransform,
		render: renderFamilyModule("formatTransform"),
		assign: func(response *protocol.Response, body string) { response.FormatTransformCacheSource = body },
		// NOT the registry generic: FormatTransformEmitter.Supports is true for
		// everything (identity is a valid transform), so the added-flag gates on
		// an actual value-transforming format instead.
		anySupported: typefns.AnyFormatTransformSupported,
		setAdded:     func(response *protocol.Response, added bool) { response.AddedFormatTransform = added }},
	{kind: protocol.CacheKindValidate,
		render:       renderValidateModule,
		assign:       func(response *protocol.Response, body string) { response.ValidateCacheSource = body },
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

// renderFamilies runs every requested family render against dump, timing
// each into metrics and assigning the rendered body to its response slot.
// Returns the first render error in familyRenders order. Shared by the
// OpScanFiles (scoped dump) and OpDump (full dump) branches — `wants`
// folds each branch's request-filter semantics.
//
// Renders are checker-free pure functions of (dump, RefTable, opts), so
// by default the requested non-validate families run concurrently (see
// renderFamiliesParallel); validate always renders last and serially —
// its CrossFamilyValRoots collection passes read the entries the other
// families' renders populated.
func (resolver *Resolver) renderFamilies(wants func(protocol.CacheKind) bool, dump protocol.Dump, rtOpts typefns.RenderOpts, metrics *protocol.Metrics, response *protocol.Response) error {
	requested := make([]familyRender, 0, len(familyRenders))
	for _, family := range familyRenders {
		if wants(family.kind) {
			requested = append(requested, family)
		}
	}
	if len(requested) == 0 {
		return nil
	}
	// familyRenders orders validate last, so when requested it is the
	// final entry — everything before it may fan out.
	nonValidate := requested
	if requested[len(requested)-1].kind == protocol.CacheKindValidate {
		nonValidate = requested[:len(requested)-1]
	}
	if resolver.parallelRenderEnabled() && len(nonValidate) >= 2 {
		return resolver.renderFamiliesParallel(requested, nonValidate, dump, rtOpts, metrics, response)
	}
	return renderFamiliesSerial(requested, dump, rtOpts, metrics, response)
}

// parallelRenderEnabled reports whether family renders may fan out.
// Parallel is the default; SingleThreaded means "no concurrency at all",
// covering renders too even though they never touch a checker.
func (resolver *Resolver) parallelRenderEnabled() bool {
	return !resolver.opts.DisableParallelRender && !resolver.opts.SingleThreaded
}

// renderFamiliesSerial is the sequential render loop — the serial scan
// path's contract and the fallback when fewer than two non-validate
// families are requested.
func renderFamiliesSerial(requested []familyRender, dump protocol.Dump, rtOpts typefns.RenderOpts, metrics *protocol.Metrics, response *protocol.Response) error {
	for _, family := range requested {
		renderStart := time.Now()
		body, renderErr := family.render(dump, rtOpts)
		if renderErr != nil {
			return renderErr
		}
		if metrics != nil {
			metrics.RenderMs[string(family.kind)] = elapsedMs(renderStart)
		}
		family.assign(response, body)
	}
	return nil
}

// renderFamiliesParallel fans the non-validate family renders out across
// goroutines, then joins in familyRenders order and renders validate
// serially. Each goroutine gets a value copy of rtOpts with the three
// dispatch-shared mutable fields sharded: its own DiagSink slice, a fresh
// EntryRenderCache, and a fresh FactsTable (everything else — RefTable,
// ProvenanceSites, Store, Lookup — is read-only or internally safe during
// renders). The join then, per family in deterministic order: first error
// wins, RenderMs recorded (values overlap wall-clock; their sum exceeds
// elapsed time), response slot assigned, shard diagnostics appended (==
// the sequential order), and the Entry/Facts shards merged into the
// dispatch opts so validate's CrossFamilyValRoots collection passes see
// the same entries a sequential dispatch would have cached.
//
// On a family error, sibling renders have already run (unlike the serial
// loop, which stops at the first failure) — their work is discarded with
// the error response; disk-store writes are atomic and idempotent, so the
// extra renders leave no inconsistent state behind.
func (resolver *Resolver) renderFamiliesParallel(requested, nonValidate []familyRender, dump protocol.Dump, rtOpts typefns.RenderOpts, metrics *protocol.Metrics, response *protocol.Response) error {
	type familyResult struct {
		body     string
		err      error
		renderMs float64
	}
	results := make([]familyResult, len(nonValidate))
	familyDiagnostics := make([][]diag.Diagnostic, len(nonValidate))
	entryShards := make([]*typefns.EntryRenderCache, len(nonValidate))
	factShards := make([]*typefns.FactsTable, len(nonValidate))
	var waitGroup sync.WaitGroup
	for familyIndex, family := range nonValidate {
		entryShards[familyIndex] = typefns.NewEntryRenderCache()
		factShards[familyIndex] = typefns.NewFactsTable()
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			defer func() {
				if recovered := recover(); recovered != nil {
					results[familyIndex].err = fmt.Errorf("render %s: %v", family.kind, recovered)
				}
			}()
			shardOpts := rtOpts
			// Keep the EntryCache write gate intact: a per-family sink only
			// when the dispatch wired a live one.
			if rtOpts.DiagSink != nil {
				shardOpts.DiagSink = &familyDiagnostics[familyIndex]
			}
			shardOpts.EntryCache = entryShards[familyIndex]
			shardOpts.Facts = factShards[familyIndex]
			renderStart := time.Now()
			body, renderErr := family.render(dump, shardOpts)
			results[familyIndex] = familyResult{body: body, err: renderErr, renderMs: elapsedMs(renderStart)}
		}()
	}
	waitGroup.Wait()
	for familyIndex, family := range nonValidate {
		result := results[familyIndex]
		if result.err != nil {
			return result.err
		}
		if metrics != nil {
			metrics.RenderMs[string(family.kind)] = result.renderMs
		}
		family.assign(response, result.body)
		if rtOpts.DiagSink != nil && len(familyDiagnostics[familyIndex]) > 0 {
			*rtOpts.DiagSink = append(*rtOpts.DiagSink, familyDiagnostics[familyIndex]...)
		}
		rtOpts.EntryCache.Merge(entryShards[familyIndex])
		rtOpts.Facts.Merge(factShards[familyIndex])
	}
	if len(requested) > len(nonValidate) {
		validate := requested[len(requested)-1]
		renderStart := time.Now()
		body, renderErr := validate.render(dump, rtOpts)
		if renderErr != nil {
			return renderErr
		}
		if metrics != nil {
			metrics.RenderMs[string(validate.kind)] = elapsedMs(renderStart)
		}
		validate.assign(response, body)
	}
	return nil
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
		// one Replacement record the Vite plugin uses to null out the
		// factory argument in the user's source. Diagnostics flow
		// unconditionally so editor surfaces update as the user types.
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
		combinedDiagnostics := append(append([]diag.Diagnostic{}, pureFnDiagnostics...), markerDiagnostics...)
		response := protocol.Response{
			Sites:         sites,
			Replacements:  pureFnReplacements,
			AddedRunTypes: addedRunTypes,
			AddedPureFns:  addedPureFns,
			Diagnostics:   combinedDiagnostics,
		}
		// Per-family added flags, one shallow Supports pass each (the
		// addedRunTypes short-circuit skips all passes on no-change scans).
		for _, family := range familyRenders {
			if family.setAdded == nil {
				continue
			}
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
		wantPureFns := wantsCache(request.IncludeCacheSources, protocol.CacheKindPureFns)
		anyCache := wantPureFns
		for _, family := range familyRenders {
			if wantsCache(request.IncludeCacheSources, family.kind) {
				anyCache = true
				break
			}
		}
		// rtDiagnostics is the sink the walker appends to at every
		// RTThrow / silent-skip site reached during the cache renders
		// below. Single sink covers every render in this dispatch so a
		// single shared throw-site emits one diag per call site. The
		// render opts (provenance line/col conversion + full ref table +
		// per-dispatch entry memo) are built ONLY when a render will
		// actually run — the plain rewrite-pipeline scan (no cache
		// sources requested) skips all of that work.
		var rtDiagnostics []diag.Diagnostic
		var rtOpts typefns.RenderOpts
		if anyCache {
			rtOptsStart := time.Now()
			rtOpts = resolver.rtRenderOpts(&rtDiagnostics, resolver.buildProvenanceSites())
			if metrics != nil {
				metrics.PrepMs += elapsedMs(rtOptsStart)
			}
		}
		if request.IncludeRunTypes || anyCache {
			scopedStart := time.Now()
			scoped := resolver.scopedDump(request.Files)
			if metrics != nil {
				metrics.ScopedDumpMs = elapsedMs(scopedStart)
			}
			if request.IncludeRunTypes {
				response.RunTypes = scoped.RunTypes
			}
			wants := func(kind protocol.CacheKind) bool {
				return wantsCache(request.IncludeCacheSources, kind)
			}
			if renderErr := resolver.renderFamilies(wants, scoped, rtOpts, metrics, &response); renderErr != nil {
				return protocol.Response{Error: renderErr.Error()}
			}
			if wantPureFns {
				renderStart := time.Now()
				pureFnsRendered, _, pureFnsErr := renderPureFnsModule(resolver.checker, resolver.marker, resolver.Program, resolver.pureFnFileCache, pureFnEntries, true)
				if pureFnsErr != nil {
					return protocol.Response{Error: pureFnsErr.Error()}
				}
				if metrics != nil {
					metrics.RenderMs[string(protocol.CacheKindPureFns)] = elapsedMs(renderStart)
				}
				response.PureFnsCacheSource = pureFnsRendered
			}
		}
		// Flush RT diagnostics into the unified response.Diagnostics slice
		// so the Vite plugin's reception loop surfaces them via this.warn.
		response.Diagnostics = append(response.Diagnostics, rtDiagnostics...)
		return response
	case protocol.OpDump:
		// Ensure every source file in the Program has been scanned for
		// marker calls before the dump is serialized. Without this,
		// the Vite plugin's cache module transform — which fires on
		// the first import of any cache file — may run BEFORE the
		// user's marker-bearing source files have been transformed
		// (and therefore scanned). The cache module would then be
		// rendered with an empty `init(...)` body, even though the
		// runtypes will appear in the resolver state moments later.
		// The eager scan amortises any per-file scan that hasn't
		// happened yet, so OpDump always returns the complete picture.
		scanStart := time.Now()
		if resolver.Program != nil {
			resolver.scanAllProgramFiles()
		}
		if metrics != nil {
			metrics.MarkerScanMs = elapsedMs(scanStart)
		}
		fullDump := protocol.Dump{
			RunTypes: resolver.cache.Dump(),
			Sites:    resolver.Sites(),
		}
		response := protocol.Response{
			RunTypes: fullDump.RunTypes,
			Sites:    fullDump.Sites,
		}
		// Per-kind opt-in mirrors OpScanFiles. When IncludeCacheSources is
		// omitted, callers get every cache source (legacy "give me
		// everything" behavior preserved). When set, only the requested
		// kinds are rendered — lets the Vite plugin's transform() ask
		// for just the one cache it's serving in this hook call.
		noFilter := len(request.IncludeCacheSources) == 0
		anyFamily := noFilter
		for _, family := range familyRenders {
			if anyFamily {
				break
			}
			anyFamily = wantsCache(request.IncludeCacheSources, family.kind)
		}
		// rtDiagnostics is the RT-render diagnostic sink for this dump.
		// Mirrors the OpScanFiles branch — one sink shared across every
		// per-kind render, flushed into response.Diagnostics once all
		// renders have completed. Built lazily: a pureFns-only dump
		// doesn't need provenance or the ref table.
		var rtDiagnostics []diag.Diagnostic
		var rtOpts typefns.RenderOpts
		if anyFamily {
			rtOpts = resolver.rtRenderOpts(&rtDiagnostics, resolver.buildProvenanceSites())
		}
		wants := func(kind protocol.CacheKind) bool {
			return noFilter || wantsCache(request.IncludeCacheSources, kind)
		}
		if renderErr := resolver.renderFamilies(wants, fullDump, rtOpts, metrics, &response); renderErr != nil {
			return protocol.Response{Error: renderErr.Error()}
		}
		if noFilter || wantsCache(request.IncludeCacheSources, protocol.CacheKindPureFns) {
			renderStart := time.Now()
			pureFnsRendered, pureFnsDiagnostics, pureFnsErr := renderPureFnsModule(resolver.checker, resolver.marker, resolver.Program, resolver.pureFnFileCache, nil, false)
			if pureFnsErr != nil {
				return protocol.Response{Error: pureFnsErr.Error()}
			}
			if metrics != nil {
				metrics.RenderMs[string(protocol.CacheKindPureFns)] = elapsedMs(renderStart)
			}
			response.PureFnsCacheSource = pureFnsRendered
			response.Diagnostics = append(response.Diagnostics, pureFnsDiagnostics...)
		}
		response.Diagnostics = append(response.Diagnostics, rtDiagnostics...)
		return response
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
// (so renderPureFnsModule doesn't extract a second time), the wire
// diagnostics, the byte-range replacements for the user's source
// (factory-arg-to-null), and a `changed` flag indicating that at
// least one entry's bodyHash differs from the session index.
//
// The session index (pureFnHashes) is mutated in place so subsequent
// scans see the new state. Removals are not detected here — a file
// that drops one of its pure-fn calls still leaves the session entry
// behind (matches the runTypes cache's structural-dedup contract;
// the orphan is harmless until the next process restart).
func (resolver *Resolver) extractPureFnsForScan(files []string) (entries []purefns.Entry, diagnostics []diag.Diagnostic, replacements []protocol.Replacement, changed bool) {
	if resolver.Program == nil || len(files) == 0 {
		return nil, nil, nil, false
	}
	entries, diagnostics = purefns.ExtractFromProgramCached(resolver.checker, resolver.marker, resolver.Program, files, resolver.pureFnFileCache)
	for _, entry := range entries {
		key := entry.Key()
		if existing, ok := resolver.pureFnHashes[key]; !ok || existing != entry.BodyHash {
			resolver.pureFnHashes[key] = entry.BodyHash
			changed = true
		}
	}
	replacements = purefns.Replacements(entries)
	return entries, diagnostics, replacements, changed
}

// wantsCache reports whether a scanFiles caller asked for `kind` — either
// explicitly or via the CacheKindAll shortcut.
func wantsCache(requested []protocol.CacheKind, kind protocol.CacheKind) bool {
	for _, k := range requested {
		if k == kind || k == protocol.CacheKindAll {
			return true
		}
	}
	return false
}

// dispatchTsCompile runs the embedded tsgo through a full bind +
// typecheck + emit pass on the resolver's current Program. Returns the
// wall time in milliseconds. The emit output bytes are discarded — we
// only care about timing. Does NOT walk markers, does NOT render any
// ts-go-run-types cache modules — this is the pure-TypeScript baseline
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
