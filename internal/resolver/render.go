package resolver

import (
	"bytes"
	"fmt"
	"io"

	"github.com/mionkit/ts-run-types/internal/compiled/typefns"
	"github.com/mionkit/ts-run-types/internal/compiled/purefns"
	"github.com/mionkit/ts-run-types/internal/compiled/runtype"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// jitRenderOpts builds the RenderOpts the typefns module renderers expect
// from the resolver's session state. Callers that need a one-off render
// (the dispatch path, render.go wrappers) feed this into every typefns
// module call so the disk cache and runtype lookup follow the resolver
// across requests.
func (resolver *Resolver) jitRenderOpts() typefns.RenderOpts {
	if resolver == nil {
		return typefns.RenderOpts{}
	}
	return typefns.RenderOpts{
		Store:  resolver.jitStore,
		Lookup: resolver.cache,
	}
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

// renderIsTypeModule emits the sibling `virtual:runtypes-isType` module —
// one `export function get_isType_<hash>(utl){…}` factory per cached
// RunType the precompiler knows how to handle. v1 only emits factories
// for KindString; other kinds are silently skipped (see typefns.IsTypeModule).
func renderIsTypeModule(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
	return renderToString("renderIsTypeModule", func(w io.Writer) error {
		return typefns.IsTypeModule(w, dump, opts)
	})
}

// renderTypeErrorsModule emits the `virtual:runtypes-typeErrors` module —
// sibling of renderIsTypeModule, same factory shape with three-arg
// validators (value, path, errors) that accumulate RunTypeError
// entries instead of returning a boolean. Backed by typefns.TypeErrorsEmitter.
func renderTypeErrorsModule(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
	return renderToString("renderTypeErrorsModule", func(w io.Writer) error {
		return typefns.TypeErrorsModule(w, dump, opts)
	})
}

// renderPrepareForJsonModule emits the prepareForJson cache module —
// the JSON serializer half of the round-trip pair. Backed by
// typefns.PrepareForJsonEmitter.
func renderPrepareForJsonModule(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
	return renderToString("renderPrepareForJsonModule", func(w io.Writer) error {
		return typefns.PrepareForJsonModule(w, dump, opts)
	})
}

// renderRestoreFromJsonModule emits the restoreFromJson cache module —
// the JSON deserializer half of the round-trip pair. Backed by
// typefns.RestoreFromJsonEmitter.
func renderRestoreFromJsonModule(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
	return renderToString("renderRestoreFromJsonModule", func(w io.Writer) error {
		return typefns.RestoreFromJsonModule(w, dump, opts)
	})
}

// renderStringifyJsonModule emits the stringifyJson cache module —
// mion's single-pass JSON serialiser that walks the type and emits
// the JSON string directly. Backed by typefns.StringifyJsonEmitter.
func renderStringifyJsonModule(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
	return renderToString("renderStringifyJsonModule", func(w io.Writer) error {
		return typefns.StringifyJsonModule(w, dump, opts)
	})
}

// renderPrepareForJsonSafeModule emits the prepareForJsonSafe cache
// module — non-mutating sibling of renderPrepareForJsonModule.
func renderPrepareForJsonSafeModule(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
	return renderToString("renderPrepareForJsonSafeModule", func(w io.Writer) error {
		return typefns.PrepareForJsonSafeModule(w, dump, opts)
	})
}

// renderPrepareForJsonSafePreserveModule emits the clone+preserve
// variant — same shape as renderPrepareForJsonSafeModule but every
// cloned object literal spreads `...v` so extras survive.
func renderPrepareForJsonSafePreserveModule(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
	return renderToString("renderPrepareForJsonSafePreserveModule", func(w io.Writer) error {
		return typefns.PrepareForJsonSafePreserveModule(w, dump, opts)
	})
}

// renderHasUnknownKeysModule emits the hasUnknownKeys cache module —
// boolean predicate per mion's emitHasUnknownKeys (returns true when
// the value has properties outside the schema). Backed by
// typefns.HasUnknownKeysEmitter.
func renderHasUnknownKeysModule(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
	return renderToString("renderHasUnknownKeysModule", func(w io.Writer) error {
		return typefns.HasUnknownKeysModule(w, dump, opts)
	})
}

// renderStripUnknownKeysModule emits the stripUnknownKeys cache
// module — mutator that deletes unknown keys from the value.
func renderStripUnknownKeysModule(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
	return renderToString("renderStripUnknownKeysModule", func(w io.Writer) error {
		return typefns.StripUnknownKeysModule(w, dump, opts)
	})
}

// renderUnknownKeyErrorsModule emits the unknownKeyErrors cache
// module — error accumulator that records one 'never' RunTypeError per
// unknown key (same arg shape as typeErrors).
func renderUnknownKeyErrorsModule(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
	return renderToString("renderUnknownKeyErrorsModule", func(w io.Writer) error {
		return typefns.UnknownKeyErrorsModule(w, dump, opts)
	})
}

// renderUnknownKeysToUndefinedModule emits the
// unknownKeysToUndefined cache module — mutator that sets unknown
// keys to undefined (instead of deleting them).
func renderUnknownKeysToUndefinedModule(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
	return renderToString("renderUnknownKeysToUndefinedModule", func(w io.Writer) error {
		return typefns.UnknownKeysToUndefinedModule(w, dump, opts)
	})
}

// renderUnknownKeysToUndefinedWireModule emits the decoder-internal
// ukuWire cache module — sibling of uku that emits the wire-format
// reach-into-v[1] strip at union nodes.
func renderUnknownKeysToUndefinedWireModule(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
	return renderToString("renderUnknownKeysToUndefinedWireModule", func(w io.Writer) error {
		return typefns.UnknownKeysToUndefinedWireModule(w, dump, opts)
	})
}

// renderToBinaryModule emits the toBinary cache module — binary
// serializer half of the round-trip pair. Backed by typefns.ToBinaryEmitter.
func renderToBinaryModule(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
	return renderToString("renderToBinaryModule", func(w io.Writer) error {
		return typefns.ToBinaryModule(w, dump, opts)
	})
}

// renderFromBinaryModule emits the fromBinary cache module — binary
// deserializer half of the round-trip pair. Backed by
// typefns.FromBinaryEmitter.
func renderFromBinaryModule(dump protocol.Dump, opts typefns.RenderOpts) (string, error) {
	return renderToString("renderFromBinaryModule", func(w io.Writer) error {
		return typefns.FromBinaryModule(w, dump, opts)
	})
}

// renderPureFnsModule renders the pureFns cache-module body for the
// program. When `entries` is non-nil it's used directly (the
// OpScanFiles caller already ran extractPureFnsForScan and passes its
// result through); otherwise the function walks every file in the
// program and runs the extractor itself (the OpDump path). Returns the
// rendered source plus any wire-shaped diagnostics from the in-place
// extraction.
func renderPureFnsModule(prog *program.Program, entries []purefns.Entry, ranExtraction bool) (string, []protocol.PureFnDiagnostic, error) {
	if prog == nil {
		return "", nil, nil
	}
	var diagnostics []purefns.Diagnostic
	if !ranExtraction {
		sourceFiles := prog.TS.SourceFiles()
		walkFiles := make([]string, 0, len(sourceFiles))
		for _, sf := range sourceFiles {
			if sf == nil {
				continue
			}
			walkFiles = append(walkFiles, sf.FileName())
		}
		entries, diagnostics = purefns.ExtractFromProgram(prog, walkFiles)
	}

	rendered, err := renderToString("renderPureFnsModule", func(w io.Writer) error {
		return purefns.PureFnsModule(w, entries)
	})
	if err != nil {
		return "", nil, err
	}

	wireDiags := make([]protocol.PureFnDiagnostic, 0, len(diagnostics))
	for _, diag := range diagnostics {
		wireDiags = append(wireDiags, toWireDiagnostic(diag))
	}
	return rendered, wireDiags, nil
}

// toWireDiagnostic translates the in-Go diagnostic shape to the protocol's
// JSON-friendly mirror. Same fields, different package edge.
func toWireDiagnostic(diag purefns.Diagnostic) protocol.PureFnDiagnostic {
	out := protocol.PureFnDiagnostic{
		Code:     diag.Code,
		Category: diag.Category,
		Message:  diag.Message,
		Site:     toWireSite(diag.Site),
	}
	for _, related := range diag.Related {
		out.Related = append(out.Related, protocol.PureFnRelated{
			PureFnDiagSite: toWireSite(related.DiagnosticSite),
			Message:        related.Message,
		})
	}
	return out
}

func toWireSite(site purefns.DiagnosticSite) protocol.PureFnDiagSite {
	return protocol.PureFnDiagSite{
		FilePath:  site.FilePath,
		StartLine: site.StartLine,
		StartCol:  site.StartCol,
		EndLine:   site.EndLine,
		EndCol:    site.EndCol,
	}
}
