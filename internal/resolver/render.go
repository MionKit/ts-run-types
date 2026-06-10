package resolver

import (
	"bytes"
	"fmt"
	"io"
	"strings"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-run-types/internal/compiled/purefns"
	"github.com/mionkit/ts-run-types/internal/compiled/runtype"
	"github.com/mionkit/ts-run-types/internal/compiled/typefns"
	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/marker"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/textpos"
)

// rtRenderOpts builds the RenderOpts the typefns module renderers expect
// from the resolver's session state. Callers that need a one-off render
// (the dispatch path, render.go wrappers) feed this into every typefns
// module call so the disk cache and runtype lookup follow the resolver
// across requests.
//
// sink (when non-nil) is the destination for compile-time diagnostics
// emitted by the walker at RTThrow / silent-skip sites; provenance
// (when non-nil) maps RT IDs to the marker call sites that reference
// them, so EmitDiagnostic can fan out one Diagnostic per call site.
func (resolver *Resolver) rtRenderOpts(sink *[]diag.Diagnostic, provenance map[string][]diag.Site) typefns.RenderOpts {
	if resolver == nil {
		return typefns.RenderOpts{}
	}
	return typefns.RenderOpts{
		Store:           resolver.rtStore,
		Lookup:          resolver.cache,
		DiagSink:        sink,
		ProvenanceSites: provenance,
		EmitCreateRTFn:  resolver.opts.EmitCreateRTFn,
		RefTable:        resolver.fullRefTable(),
		// One entry memo per dispatch — real family renders populate it,
		// CrossFamilyValRoots' collection passes reuse it. See the
		// familyRenders ordering note in dispatch.go.
		EntryCache: typefns.NewEntryRenderCache(),
		// One predicate memo per dispatch, shared by every family render
		// (the predicates are emitter-independent).
		Facts: typefns.NewFactsTable(),
	}
}

// fullRefTable indexes every interned RunType by id for the typefns renderers.
// A render seeds its roots from the (possibly scoped) dump but must resolve those
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

// renderToString invokes a cache-module writer against a buffer and
// returns the rendered source. `label` shows up in the wrapped error so
// the per-cache call site is still identifiable.
func renderToString(label string, write func(io.Writer) error) (string, error) {
	var buf bytes.Buffer
	if err := write(&buf); err != nil {
		return "", fmt.Errorf("%s: %w", label, err)
	}
	return buf.String(), nil
}

// renderRunTypesModule emits the JS runTypes cache module for dump. The
// runtype package is the single source of truth; the plugin no longer
// renders the module on the JS side.
func renderRunTypesModule(dump protocol.Dump) (string, error) {
	return renderToString("renderRunTypesModule", func(w io.Writer) error {
		return runtype.RunTypesModule(w, dump)
	})
}

// renderFamilyModule builds the render closure for one registry family.
// The error label "render<Key>Module" matches the old per-family wrapper
// names byte-for-byte, so wrapped error text is unchanged.
func renderFamilyModule(key string) func(protocol.Dump, typefns.RenderOpts) (string, error) {
	spec := typefns.FamilyByKey(key)
	label := "render" + strings.ToUpper(key[:1]) + key[1:] + "Module"
	return func(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
		return renderToString(label, func(w io.Writer) error {
			return spec.Render(w, dump, opts)
		})
	}
}

// renderValidateModule emits the `virtual:runtypes-validate` module —
// one factory per cached RunType the precompiler knows how to handle.
// Not a plain renderFamilyModule closure: validate seeds ExtraRoots first.
func renderValidateModule(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
	// `it` is demand-scoped like every function family, so a createValidate
	// site alone doesn't pull the `val_<member>` entries the JSON/binary union
	// decoders + validationErrors child checks reference at runtime. Seed those
	// missing roots from the cross-family edges the OTHER demanded families keep
	// — CrossFamilyValRoots renders them (Store-bypassed so the walker always
	// runs) and returns the bare member ids. The createValidate-site demand is
	// still handled by the normal demand path inside the family render.
	opts.ExtraRoots = typefns.CrossFamilyValRoots(dump, opts)
	return renderToString("renderValidateModule", func(w io.Writer) error {
		return typefns.FamilyByKey("validate").Render(w, dump, opts)
	})
}

// renderPrepareForJsonModule emits the prepareForJson cache module —
// the JSON serializer half of the round-trip pair. The JSON-encoder
// composite `init(…)` lines (createJsonEncoder's per-strategy entries)
// ride this module's body via ExtraBodyLines — both are loaded into the
// same rtUtils, and the composite references the prepareForJson /
// stringifyJson / uku primitives by fnHash.
func renderPrepareForJsonModule(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
	opts.ExtraBodyLines = typefns.JsonEncoderModule(dump, opts)
	return renderToString("renderPrepareForJsonModule", func(w io.Writer) error {
		return typefns.FamilyByKey("prepareForJson").Render(w, dump, opts)
	})
}

// renderRestoreFromJsonModule emits the restoreFromJson cache module —
// the JSON deserializer half of the round-trip pair. The JSON-decoder
// composite `init(…)` lines (createJsonDecoder's per-strategy entries)
// ride this module's body via ExtraBodyLines — the composite references
// the restoreFromJson / ukuWire primitives by fnHash.
func renderRestoreFromJsonModule(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
	opts.ExtraBodyLines = typefns.JsonDecoderModule(dump, opts)
	return renderToString("renderRestoreFromJsonModule", func(w io.Writer) error {
		return typefns.FamilyByKey("restoreFromJson").Render(w, dump, opts)
	})
}

// renderPureFnsModule renders the pureFns cache-module body for the
// program. When `entries` is non-nil it's used directly (the
// OpScanFiles caller already ran extractPureFnsForScan and passes its
// result through); otherwise the function walks every file in the
// program and runs the extractor itself (the OpDump path). Returns the
// rendered source plus any wire-shaped diagnostics from the in-place
// extraction.
func renderPureFnsModule(typeChecker *checker.Checker, markerOpts marker.Options, prog *program.Program, fileCache *purefns.FileCache, entries []purefns.Entry, ranExtraction bool) (string, []diag.Diagnostic, error) {
	if prog == nil {
		return "", nil, nil
	}
	var diagnostics []diag.Diagnostic
	if !ranExtraction {
		sourceFiles := prog.TS.SourceFiles()
		walkFiles := make([]string, 0, len(sourceFiles))
		for _, sf := range sourceFiles {
			if sf == nil {
				continue
			}
			walkFiles = append(walkFiles, sf.FileName())
		}
		entries, diagnostics = purefns.ExtractFromProgramCached(typeChecker, markerOpts, prog, walkFiles, fileCache)
	}

	rendered, err := renderToString("renderPureFnsModule", func(w io.Writer) error {
		return purefns.PureFnsModule(w, entries)
	})
	if err != nil {
		return "", nil, err
	}
	return rendered, diagnostics, nil
}
