package resolver

import (
	"context"
	"errors"
	"fmt"
	"runtime"
	"time"

	"github.com/microsoft/typescript-go/shim/compiler"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-run-types/internal/compiled/purefns"
	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

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
		// "Did this scan change anything?" signals consumed by the Vite
		// plugin's handleHotUpdate. Per-family flags died with the aggregate
		// overlays — virtual modules are content-addressed (never
		// invalidated), so only the runTypes / pureFns signals remain.
		addedRunTypes := len(added) > 0
		combinedDiagnostics := append(append([]diag.Diagnostic{}, pureFnDiagnostics...), markerDiagnostics...)
		response := protocol.Response{
			Sites:         sites,
			Replacements:  pureFnReplacements,
			AddedRunTypes: addedRunTypes,
			AddedPureFns:  addedPureFns,
			Diagnostics:   combinedDiagnostics,
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
		// rtDiagnostics is the sink the walker appends to at every RTThrow /
		// silent-skip site reached during module assembly. The render opts
		// (provenance line/col conversion + full ref table + per-dispatch
		// entry memo) are built ONLY when assembly will actually run — the
		// plain rewrite-pipeline scan skips all of that work.
		var rtDiagnostics []diag.Diagnostic
		// Module mode: assemble each site's per-entry module closure (fills
		// Site.Deps in place on the response's slice) and attach the union
		// module map. Walker diagnostics ride the shared rtDiagnostics sink.
		if request.IncludeModules && len(response.Sites) > 0 {
			rtOptsStart := time.Now()
			rtOpts := resolver.rtRenderOpts(&rtDiagnostics, resolver.buildProvenanceSites())
			if metrics != nil {
				metrics.PrepMs += elapsedMs(rtOptsStart)
			}
			modulesStart := time.Now()
			response.Modules = resolver.AssembleSiteClosures(response.Sites, rtOpts)
			if metrics != nil {
				metrics.RenderMs["modules"] = elapsedMs(modulesStart)
			}
		}
		if request.IncludeRunTypes {
			scopedStart := time.Now()
			scoped := resolver.scopedDump(request.Files)
			if metrics != nil {
				metrics.ScopedDumpMs = elapsedMs(scopedStart)
			}
			response.RunTypes = scoped.RunTypes
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
		response := protocol.Response{
			RunTypes: resolver.cache.Dump(),
			Sites:    resolver.Sites(),
		}
		// pureFns is the only cache-source render left (the per-type caches
		// are served as per-entry virtual modules). Rendered when requested
		// explicitly OR when IncludeCacheSources is omitted (the legacy
		// "give me everything" dump shape, which now means types + sites +
		// pureFns).
		if len(request.IncludeCacheSources) == 0 || wantsCache(request.IncludeCacheSources, protocol.CacheKindPureFns) {
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
	case protocol.OpResolveModules:
		// Cache-miss fallback for the plugin's virtual-module load() hook —
		// e.g. a dev-server restart with a warm client graph requests a
		// module before any scan ran. The eager program scan mirrors OpDump:
		// a cold request must see every interned type before rendering.
		if resolver.Program == nil {
			return protocol.Response{Error: "resolveModules: no Program loaded — call setSources first"}
		}
		if len(request.Keys) == 0 {
			return protocol.Response{OK: true}
		}
		resolver.scanAllProgramFiles()
		var moduleDiagnostics []diag.Diagnostic
		moduleOpts := resolver.rtRenderOpts(&moduleDiagnostics, resolver.buildProvenanceSites())
		return protocol.Response{
			OK:          true,
			Modules:     resolver.ResolveModuleKeys(request.Keys, moduleOpts),
			Diagnostics: moduleDiagnostics,
		}
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
