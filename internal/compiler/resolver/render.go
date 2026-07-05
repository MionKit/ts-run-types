package resolver

import (
	"sort"
	"time"

	"github.com/mionkit/ts-runtypes/internal/cachegen/purefunctions"
	"github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions"
	"github.com/mionkit/ts-runtypes/internal/compiler/virtualmodules"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
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
func (sess *Session) rtRenderOpts(sink *[]diagnostics.Diagnostic, provenance map[string][]diagnostics.Site) typefunctions.RenderOpts {
	if sess == nil {
		return typefunctions.RenderOpts{}
	}
	return typefunctions.RenderOpts{
		Store:           sess.rtStore,
		Lookup:          sess.cache,
		DiagSink:        sink,
		ProvenanceSites: provenance,
		EmitMode:        sess.opts.EmitMode,
		InlineMode:      sess.opts.InlineMode,
		RefTable:        sess.fullRefTable(),
		SizeEstimate: typefunctions.SizeEstimateConfig{
			Bias:        sess.opts.SizeBias,
			Items:       sess.opts.SizeItems,
			StringBytes: sess.opts.SizeStringBytes,
			MaxBytes:    sess.opts.SizeMaxBytes,
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
func (sess *Session) fullRefTable() map[string]*protocol.RunType {
	if sess == nil || sess.cache == nil {
		return nil
	}
	return sess.cache.NodesView()
}

// buildProvenanceSites converts the resolver's protocol.Site list into
// the (RT ID → []diagnostics.Site) map the typefns walker uses to fan out
// per-call-site diagnostics. Pos→line/col is computed against the
// resolver's current Program; sites whose file isn't in the program
// (defensive) are skipped.
func (sess *Session) buildProvenanceSites() map[string][]diagnostics.Site {
	if sess == nil || sess.Program == nil {
		return nil
	}
	sites := sess.Sites()
	if len(sites) == 0 {
		return nil
	}
	out := make(map[string][]diagnostics.Site, len(sites))
	for _, site := range sites {
		if site.ID == "" {
			continue
		}
		sourceFile, err := sess.sourceFile(site.File)
		if err != nil || sourceFile == nil {
			// Fall back to file-only — better than dropping the entry
			// entirely; the user still sees which file the error belongs
			// to even when line/col can't be resolved.
			out[site.ID] = append(out[site.ID], diagnostics.Site{FilePath: site.File})
			continue
		}
		line, col := textpos.LineCol(sourceFile, site.Pos)
		out[site.ID] = append(out[site.ID], diagnostics.Site{
			FilePath:  site.File,
			StartLine: line,
			StartCol:  col,
		})
	}
	return out
}

// extractProgramPureFns walks every source file in the program through the
// pure-fn extractor (memoized per file via pureFnFileCache, so repeat calls in
// one dispatch are cheap) and returns the registration entries, the exact
// walked-file set, and the wire-shaped diagnostics. Shared by
// collectProgramPureFns (the entry-graph path) and validateProgramPureFnDeps
// (the PFE9012 registration index) so both observe the SAME whole-program
// registration set. overrideEntries are NOT folded in here — callers that need
// them (the graph, the index) append resolver.overrideEntries themselves.
func (sess *Session) extractProgramPureFns(metrics *protocol.Metrics) (entries []purefunctions.Entry, walkFiles []string, diags []diagnostics.Diagnostic) {
	if sess.Program == nil {
		return nil, nil, nil
	}
	// The override pass extracts the cfn pure-fn entries the type-fn redirects
	// forward to; idempotent, so this is a cheap guard when scanning already ran.
	sess.ensureOverrides()
	pureFnsStart := time.Now()
	sourceFiles := sess.Program.TS.SourceFiles()
	walkFiles = make([]string, 0, len(sourceFiles))
	for _, sf := range sourceFiles {
		if sf == nil {
			continue
		}
		walkFiles = append(walkFiles, sf.FileName())
	}
	entries, diags = purefunctions.ExtractFromProgramCached(sess.checker, sess.marker, sess.Program, walkFiles, sess.pureFnFileCache)
	if metrics != nil {
		metrics.PureFnsMs = elapsedMs(pureFnsStart)
	}
	return entries, walkFiles, diags
}

// collectProgramPureFns walks every file in the program through the pure-fn
// extractor and returns the per-entry graph (the OpDump path; OpScanFiles
// reuses its own per-request extraction instead). Returns the wire-shaped
// diagnostics from the in-place extraction alongside.
func (sess *Session) collectProgramPureFns(metrics *protocol.Metrics) (virtualmodules.Graph, []diagnostics.Diagnostic) {
	entries, _, diags := sess.extractProgramPureFns(metrics)
	// Override cfn entries (whole-program) join the program pure-fn graph so the
	// type-fn redirects resolve their `cfn::` dep modules on the OpDump /
	// OpGenerate paths too — not just OpScanFiles. Without this the plugin's
	// generate() emits the redirect but not the cfn module it imports, and the
	// runtime throws "Pure function not found" at the first createX call.
	entries = append(entries, sess.overrideEntries...)
	return purefunctions.CollectEntries(entries), diags
}

// validateProgramPureFnDeps cross-checks the pure-fn dependencies aggregated
// while rendering RT function entries (opts.PureFnDepSink) against the
// program-wide pure-fn registration set, returning one PFE9012 diagnostic per
// dep whose `<namespace>::<fnName>` registration is missing from every scanned
// source file. Empty deps (the common non-linting path, or a build that
// renders no pure-fn-bearing family) or no Program short-circuits to nil.
//
// The index is a WHOLE-program extraction — a registration in ANY program file
// satisfies the dep by key. This is the correctness pivot: the per-file scan
// set (extractPureFnsForScan) covers only the requested files, so validating
// against it would false-positive on `rt::newRunTypeErr` and friends, which
// register in the ts-runtypes package's own source (pulled into the program by
// its side-effect import), never in the user's requested files. The dep's
// FilePath hint drives only ValidatePureFnDependencies' lazy expansion, which
// stays a no-op here because the whole program is already walked.
//
// The returned diagnostics are sorted by missing key so the response is
// deterministic regardless of family-collect order (serial vs parallel).
//
// Guard: a program that compiles ZERO registerPureFnFactory calls has no pure-fn
// registration mechanism in it at all — a stub / ambient-only setup (e.g.
// `ts-runtypes` typed through a hand-written .d.ts with no runtime source, as
// the test harnesses use). There a "missing" verdict is a false positive:
// nothing is registered because the source that registers isn't part of the
// program, not because a specific fn is genuinely absent. A real build importing
// `ts-runtypes` always pulls its side-effect-registered rt:: built-ins into the
// program, so the mechanism is present and a genuinely dangling key (e.g. an
// unimported format's rtFormats:: fn while the rt:: built-ins ARE present) still
// fires. This keeps the static check faithful to runtime: validate only when the
// program demonstrably wires the registrations the runtime would load.
func (sess *Session) validateProgramPureFnDeps(deps []protocol.PureFnDep) []diagnostics.Diagnostic {
	if len(deps) == 0 || sess.Program == nil {
		return nil
	}
	entries, walkFiles, _ := sess.extractProgramPureFns(nil)
	if len(entries) == 0 {
		return nil
	}
	// Override cfn registrations count too — they only add keys, never remove.
	entries = append(entries, sess.overrideEntries...)
	index := purefunctions.NewIndex(entries, walkFiles)
	diags := purefunctions.ValidatePureFnDependencies(sess.checker, sess.marker, deps, index, sess.Program)
	sort.SliceStable(diags, func(i, j int) bool {
		return pureFnDepDiagKey(diags[i]) < pureFnDepDiagKey(diags[j])
	})
	return diags
}

// pureFnDepDiagKey returns the missing `<namespace>::<fnName>` key a PFE9012
// diagnostic carries in its first arg (see ValidatePureFnDependencies), for
// deterministic sorting. Falls back to the code for a malformed diagnostic.
func pureFnDepDiagKey(diag diagnostics.Diagnostic) string {
	if len(diag.Args) > 0 {
		return diag.Args[0]
	}
	return diag.Code
}
