package resolver_test

import (
	"testing"

	_ "github.com/mionkit/ts-run-types/internal/compiled/typefns/formats/all"
	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// temporalNotLoadedDiags scans `code` and returns the TMP001 diagnostics.
// When suppressAmbient is true, an EMPTY temporal.d.ts is overlaid so the
// `Temporal` namespace is NOT declared — simulating a consumer whose tsconfig
// lib doesn't load Temporal (the type resolves to `any`).
func temporalNotLoadedDiags(t *testing.T, code string, suppressAmbient bool) []diag.Diagnostic {
	t.Helper()
	sources := map[string]string{"a.ts": code}
	if suppressAmbient {
		sources["temporal.d.ts"] = "// no Temporal namespace declared\n"
	}
	r := setupInline(t, sources)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	var out []diag.Diagnostic
	for _, d := range resp.Diagnostics {
		if d.Code == diag.CodeTemporalNotLoaded {
			out = append(out, d)
		}
	}
	return out
}

func TestTemporalGuard_FiresWhenLibMissing(t *testing.T) {
	code := `import {getRunTypeId} from '@mionjs/ts-go-run-types';
export const _ = getRunTypeId<Temporal.PlainDate>();
`
	diags := temporalNotLoadedDiags(t, code, true)
	if len(diags) != 1 {
		t.Fatalf("expected 1 TMP001 when Temporal lib missing, got %d", len(diags))
	}
	if diags[0].Severity != diag.SeverityError {
		t.Errorf("expected Error severity, got %d", diags[0].Severity)
	}
	if len(diags[0].Args) == 0 || diags[0].Args[0] != "Temporal.PlainDate" {
		t.Errorf("expected arg Temporal.PlainDate, got %+v", diags[0].Args)
	}
}

func TestTemporalGuard_SilentWhenLibLoaded(t *testing.T) {
	code := `import {getRunTypeId} from '@mionjs/ts-go-run-types';
export const _ = getRunTypeId<Temporal.PlainDate>();
`
	// Ambient present (default) → Temporal.PlainDate is a real type → no diag.
	if diags := temporalNotLoadedDiags(t, code, false); len(diags) != 0 {
		t.Fatalf("expected NO TMP001 when Temporal lib loaded, got %+v", diags)
	}
}

func TestTemporalGuard_FiresForNestedTemporalProperty(t *testing.T) {
	code := `import {getRunTypeId} from '@mionjs/ts-go-run-types';
export const _ = getRunTypeId<{createdAt: Temporal.Instant; name: string}>();
`
	diags := temporalNotLoadedDiags(t, code, true)
	if len(diags) != 1 {
		t.Fatalf("expected 1 TMP001 for nested Temporal.Instant, got %d", len(diags))
	}
	if diags[0].Args[0] != "Temporal.Instant" {
		t.Errorf("expected Temporal.Instant, got %+v", diags[0].Args)
	}
}

// A user type literally named `Temporal.Foo` (not a builtin) or a bare
// `PlainDate` must NOT trip the guard.
func TestTemporalGuard_IgnoresNonBuiltinNames(t *testing.T) {
	code := `import {getRunTypeId} from '@mionjs/ts-go-run-types';
interface PlainDate { y: number }
export const _ = getRunTypeId<PlainDate>();
`
	if diags := temporalNotLoadedDiags(t, code, true); len(diags) != 0 {
		t.Fatalf("bare PlainDate should not trip the guard, got %+v", diags)
	}
}
