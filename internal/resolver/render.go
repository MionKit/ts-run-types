package resolver

import (
	"bytes"
	"fmt"
	"io"

	"github.com/mionkit/ts-run-types/internal/caches/jitfn"
	"github.com/mionkit/ts-run-types/internal/caches/purefn"
	"github.com/mionkit/ts-run-types/internal/caches/runtype"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

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
// for KindString; other kinds are silently skipped (see jitfn.IsTypeModule).
func renderIsTypeModule(dump protocol.Dump) (string, error) {
	return renderToString("renderIsTypeModule", func(w io.Writer) error {
		return jitfn.IsTypeModule(w, dump)
	})
}

// renderTypeErrorsModule emits the `virtual:runtypes-typeErrors` module —
// sibling of renderIsTypeModule, same factory shape with three-arg
// validators (value, path, errors) that accumulate RunTypeError
// entries instead of returning a boolean. Backed by jitfn.TypeErrorsEmitter.
func renderTypeErrorsModule(dump protocol.Dump) (string, error) {
	return renderToString("renderTypeErrorsModule", func(w io.Writer) error {
		return jitfn.TypeErrorsModule(w, dump)
	})
}

// renderPrepareForJsonModule emits the prepareForJson cache module —
// the JSON serializer half of the round-trip pair. Backed by
// jitfn.PrepareForJsonEmitter.
func renderPrepareForJsonModule(dump protocol.Dump) (string, error) {
	return renderToString("renderPrepareForJsonModule", func(w io.Writer) error {
		return jitfn.PrepareForJsonModule(w, dump)
	})
}

// renderRestoreFromJsonModule emits the restoreFromJson cache module —
// the JSON deserializer half of the round-trip pair. Backed by
// jitfn.RestoreFromJsonEmitter.
func renderRestoreFromJsonModule(dump protocol.Dump) (string, error) {
	return renderToString("renderRestoreFromJsonModule", func(w io.Writer) error {
		return jitfn.RestoreFromJsonModule(w, dump)
	})
}

// renderStringifyJsonModule emits the stringifyJson cache module —
// mion's single-pass JSON serialiser that walks the type and emits
// the JSON string directly. Backed by jitfn.StringifyJsonEmitter.
func renderStringifyJsonModule(dump protocol.Dump) (string, error) {
	return renderToString("renderStringifyJsonModule", func(w io.Writer) error {
		return jitfn.StringifyJsonModule(w, dump)
	})
}

// renderPrepareForJsonSafeModule emits the prepareForJsonSafe cache
// module — non-mutating sibling of renderPrepareForJsonModule.
func renderPrepareForJsonSafeModule(dump protocol.Dump) (string, error) {
	return renderToString("renderPrepareForJsonSafeModule", func(w io.Writer) error {
		return jitfn.PrepareForJsonSafeModule(w, dump)
	})
}

// renderHasUnknownKeysModule emits the hasUnknownKeys cache module —
// boolean predicate per mion's emitHasUnknownKeys (returns true when
// the value has properties outside the schema). Backed by
// jitfn.HasUnknownKeysEmitter.
func renderHasUnknownKeysModule(dump protocol.Dump) (string, error) {
	return renderToString("renderHasUnknownKeysModule", func(w io.Writer) error {
		return jitfn.HasUnknownKeysModule(w, dump)
	})
}

// renderStripUnknownKeysModule emits the stripUnknownKeys cache
// module — mutator that deletes unknown keys from the value.
func renderStripUnknownKeysModule(dump protocol.Dump) (string, error) {
	return renderToString("renderStripUnknownKeysModule", func(w io.Writer) error {
		return jitfn.StripUnknownKeysModule(w, dump)
	})
}

// renderUnknownKeyErrorsModule emits the unknownKeyErrors cache
// module — error accumulator that records one 'never' RunTypeError per
// unknown key (same arg shape as typeErrors).
func renderUnknownKeyErrorsModule(dump protocol.Dump) (string, error) {
	return renderToString("renderUnknownKeyErrorsModule", func(w io.Writer) error {
		return jitfn.UnknownKeyErrorsModule(w, dump)
	})
}

// renderUnknownKeysToUndefinedModule emits the
// unknownKeysToUndefined cache module — mutator that sets unknown
// keys to undefined (instead of deleting them).
func renderUnknownKeysToUndefinedModule(dump protocol.Dump) (string, error) {
	return renderToString("renderUnknownKeysToUndefinedModule", func(w io.Writer) error {
		return jitfn.UnknownKeysToUndefinedModule(w, dump)
	})
}

// renderPureFnsModule renders the pureFns cache-module body for the
// program. When `entries` is non-nil it's used directly (the
// OpScanFiles caller already ran extractPureFnsForScan and passes its
// result through); otherwise the function walks every file in the
// program and runs the extractor itself (the OpDump path). Returns the
// rendered source plus any wire-shaped diagnostics from the in-place
// extraction.
func renderPureFnsModule(prog *program.Program, entries []purefn.Entry, ranExtraction bool) (string, []protocol.PureFnDiagnostic, error) {
	if prog == nil {
		return "", nil, nil
	}
	var diagnostics []purefn.Diagnostic
	if !ranExtraction {
		sourceFiles := prog.TS.SourceFiles()
		walkFiles := make([]string, 0, len(sourceFiles))
		for _, sf := range sourceFiles {
			if sf == nil {
				continue
			}
			walkFiles = append(walkFiles, sf.FileName())
		}
		entries, diagnostics = purefn.ExtractFromProgram(prog, walkFiles)
	}

	rendered, err := renderToString("renderPureFnsModule", func(w io.Writer) error {
		return purefn.PureFnsModule(w, entries)
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
func toWireDiagnostic(diag purefn.Diagnostic) protocol.PureFnDiagnostic {
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

func toWireSite(site purefn.DiagnosticSite) protocol.PureFnDiagSite {
	return protocol.PureFnDiagSite{
		FilePath:  site.FilePath,
		StartLine: site.StartLine,
		StartCol:  site.StartCol,
		EndLine:   site.EndLine,
		EndCol:    site.EndCol,
	}
}
