package resolver

import (
	"time"

	"github.com/mionkit/ts-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions"
	"github.com/mionkit/ts-runtypes/internal/compiler/virtualmodules"
	"github.com/mionkit/ts-runtypes/internal/diag"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/textpos"
)

// rtRenderOpts builds the RenderOpts the typefns entry collectors expect
// from the resolver's session state. The dispatch path feeds this into
// every collect call so the disk cache and runtype lookup follow the
// resolver across requests.
//
// sink (when non-nil) is the destination for compile-time diagnostics
// emitted by the walker at RTThrow / silent-skip sites; provenance
// (when non-nil) maps RT IDs to the marker call sites that reference
// them, so EmitDiagnostic can fan out one Diagnostic per call site.
func (resolver *Resolver) rtRenderOpts(sink *[]diag.Diagnostic, provenance map[string][]diag.Site) typefunctions.RenderOpts {
	if resolver == nil {
		return typefunctions.RenderOpts{}
	}
	return typefunctions.RenderOpts{
		Store:           resolver.rtStore,
		Lookup:          resolver.cache,
		DiagSink:        sink,
		ProvenanceSites: provenance,
		EmitMode:        resolver.opts.EmitMode,
		InlineMode:      resolver.opts.InlineMode,
		RefTable:        resolver.fullRefTable(),
		SizeEstimate: typefunctions.SizeEstimateConfig{
			Bias:        resolver.opts.SizeBias,
			Items:       resolver.opts.SizeItems,
			StringBytes: resolver.opts.SizeStringBytes,
			MaxBytes:    resolver.opts.SizeMaxBytes,
		},
		// One predicate memo per dispatch, shared by every family collect
		// (the predicates are emitter-independent).
		Facts: typefunctions.NewFactsTable(),
	}
}

// fullRefTable indexes every interned RunType by id for the typefns collectors.
// A collect seeds its roots from the (possibly scoped) dump but must resolve those
// roots' child KindRef sentinels against the FULL session cache — a root can
// reference children interned while scanning a different file. This is the
// cache's own live table (read-only contract — see Cache.NodesView), so no
// per-dispatch rebuild/sort/re-stamp happens anymore.
func (resolver *Resolver) fullRefTable() map[string]*protocol.RunType {
	if resolver == nil || resolver.cache == nil {
		return nil
	}
	return resolver.cache.NodesView()
}

// buildProvenanceSites converts the resolver's protocol.Site list into
// the (RT ID → []diag.Site) map the typefns walker uses to fan out
// per-call-site diagnostics. Pos→line/col is computed against the
// resolver's current Program; sites whose file isn't in the program
// (defensive) are skipped.
func (resolver *Resolver) buildProvenanceSites() map[string][]diag.Site {
	if resolver == nil || resolver.Program == nil {
		return nil
	}
	sites := resolver.Sites()
	if len(sites) == 0 {
		return nil
	}
	out := make(map[string][]diag.Site, len(sites))
	for _, site := range sites {
		if site.ID == "" {
			continue
		}
		sourceFile, err := resolver.sourceFile(site.File)
		if err != nil || sourceFile == nil {
			// Fall back to file-only — better than dropping the entry
			// entirely; the user still sees which file the error belongs
			// to even when line/col can't be resolved.
			out[site.ID] = append(out[site.ID], diag.Site{FilePath: site.File})
			continue
		}
		line, col := textpos.LineCol(sourceFile, site.Pos)
		out[site.ID] = append(out[site.ID], diag.Site{
			FilePath:  site.File,
			StartLine: line,
			StartCol:  col,
		})
	}
	return out
}

// collectProgramPureFns walks every file in the program through the pure-fn
// extractor and returns the per-entry graph (the OpDump path; OpScanFiles
// reuses its own per-request extraction instead). Returns the wire-shaped
// diagnostics from the in-place extraction alongside.
func (resolver *Resolver) collectProgramPureFns(metrics *protocol.Metrics) (virtualmodules.Graph, []diag.Diagnostic) {
	if resolver.Program == nil {
		return virtualmodules.Graph{}, nil
	}
	// The override pass extracts the cfn pure-fn entries the type-fn redirects
	// forward to; idempotent, so this is a cheap guard when scanning already ran.
	resolver.ensureOverrides()
	pureFnsStart := time.Now()
	sourceFiles := resolver.Program.TS.SourceFiles()
	walkFiles := make([]string, 0, len(sourceFiles))
	for _, sf := range sourceFiles {
		if sf == nil {
			continue
		}
		walkFiles = append(walkFiles, sf.FileName())
	}
	entries, diagnostics := purefunctions.ExtractFromProgramCached(resolver.checker, resolver.marker, resolver.Program, walkFiles, resolver.pureFnFileCache)
	// Override cfn entries (whole-program) join the program pure-fn graph so the
	// type-fn redirects resolve their `cfn::` dep modules on the OpDump /
	// OpGenerate paths too — not just OpScanFiles. Without this the plugin's
	// generate() emits the redirect but not the cfn module it imports, and the
	// runtime throws "Pure function not found" at the first createX call.
	entries = append(entries, resolver.overrideEntries...)
	if metrics != nil {
		metrics.PureFnsMs = elapsedMs(pureFnsStart)
	}
	return purefunctions.CollectEntries(entries), diagnostics
}
