package resolver_test

import (
	"testing"

	// Register the concrete format emitters (stringFormat, …) — the
	// in-process resolver test doesn't go through main.go, which is
	// where the binary normally blank-imports this aggregator.
	_ "github.com/mionkit/ts-run-types/internal/compiled/typefns/formats/all"
	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// A locally-declared TypeFormat alias produces the same brand
// intersection the published `@mionjs/ts-go-run-types/formats` one does —
// the scanner recognises it structurally (the two sentinel properties),
// not by import source. Lets these tests stay self-contained.
const typeFormatBrandDecl = `type TypeFormat<Base, Name extends string, Params> = Base & {
  readonly __rtFormatName: Name;
  readonly __rtFormatParams: Params;
};
`

// TestFormatSamples_MismatchEmitsFMT001 — a mockSample that doesn't
// match the format's own pattern must surface as an FMT001 error at
// build time (the sample would otherwise feed createMockType an
// invalid value).
func TestFormatSamples_MismatchEmitsFMT001(t *testing.T) {
	code := `import {createValidate} from '@mionjs/ts-go-run-types';
` + typeFormatBrandDecl + `
export const _ = createValidate<TypeFormat<string, 'stringFormat', {
  pattern: {source: '^[0-9]+$'; flags: ''};
  mockSamples: ['42', 'not-a-number', '7'];
}>>();
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeCacheSources: []protocol.CacheKind{protocol.CacheKindValidate},
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var found *diag.Diagnostic
	for i := range resp.Diagnostics {
		if resp.Diagnostics[i].Code == diag.CodeFMTSampleMismatch {
			found = &resp.Diagnostics[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("expected an %s diagnostic, got %+v", diag.CodeFMTSampleMismatch, resp.Diagnostics)
	}
	if found.Severity != diag.SeverityError {
		t.Errorf("severity: got %d want %d (error)", found.Severity, diag.SeverityError)
	}
	// First arg is the offending sample.
	if len(found.Args) == 0 || found.Args[0] != "not-a-number" {
		t.Errorf("expected offending sample 'not-a-number' in args, got %+v", found.Args)
	}
}

// TestFormatSamples_AllValidNoDiagnostic — when every sample matches
// the pattern, no FMT001 fires.
func TestFormatSamples_AllValidNoDiagnostic(t *testing.T) {
	code := `import {createValidate} from '@mionjs/ts-go-run-types';
` + typeFormatBrandDecl + `
export const _ = createValidate<TypeFormat<string, 'stringFormat', {
  pattern: {source: '^[0-9]+$'; flags: ''};
  mockSamples: ['42', '7', '007'];
}>>();
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeCacheSources: []protocol.CacheKind{protocol.CacheKindValidate},
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	for i := range resp.Diagnostics {
		if resp.Diagnostics[i].Code == diag.CodeFMTSampleMismatch {
			t.Fatalf("expected no FMT001 for all-valid samples, got %+v", resp.Diagnostics[i])
		}
	}
}
