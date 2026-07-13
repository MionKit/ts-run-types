package resolver_test

import (
	"strings"
	"testing"

	// Register the concrete format emitters (stringFormat, …) — the
	// in-process resolver test doesn't go through main.go, which is
	// where the binary normally blank-imports this aggregator.
	_ "github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// A locally-declared TypeFormat alias produces the same brand
// intersection the published `ts-runtypes/formats` one does —
// the scanner recognises it structurally (the two sentinel properties),
// not by import source. Lets these tests stay self-contained.
const typeFormatBrandDecl = `type TypeFormat<Base, Name extends string, Params> = Base & {
  readonly __rtFormatName?: Name;
  readonly __rtFormatParams?: Params;
};
`

// TestFormatSamples_MismatchEmitsFMT001 — a mockSample that doesn't
// match the format's own pattern must surface as an FMT001 error at
// build time (the sample would otherwise feed createMockData an
// invalid value).
func TestFormatSamples_MismatchEmitsFMT001(t *testing.T) {
	code := `import {createValidate} from '@ts-runtypes/core';
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
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var found *diagnostics.Diagnostic
	for i := range resp.Diagnostics {
		if resp.Diagnostics[i].Code == diagnostics.CodeFMTSampleMismatch {
			found = &resp.Diagnostics[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("expected an %s diagnostic, got %+v", diagnostics.CodeFMTSampleMismatch, resp.Diagnostics)
	}
	if found.Severity != diagnostics.SeverityError {
		t.Errorf("severity: got %d want %d (error)", found.Severity, diagnostics.SeverityError)
	}
	// First arg is the offending sample.
	if len(found.Args) == 0 || found.Args[0] != "not-a-number" {
		t.Errorf("expected offending sample 'not-a-number' in args, got %+v", found.Args)
	}
}

// TestFormatSamples_AllValidNoDiagnostic — when every sample matches
// the pattern, no FMT001 fires.
func TestFormatSamples_AllValidNoDiagnostic(t *testing.T) {
	code := `import {createValidate} from '@ts-runtypes/core';
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
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	for i := range resp.Diagnostics {
		if resp.Diagnostics[i].Code == diagnostics.CodeFMTSampleMismatch {
			t.Fatalf("expected no FMT001 for all-valid samples, got %+v", resp.Diagnostics[i])
		}
	}
}

// findDiag returns the first diagnostic with the given code, or nil.
func findDiag(resp protocol.Response, code string) *diagnostics.Diagnostic {
	for i := range resp.Diagnostics {
		if resp.Diagnostics[i].Code == code {
			return &resp.Diagnostics[i]
		}
	}
	return nil
}

// scanBuild runs a build-lane scan (entry modules, no lint diagnostics).
func scanBuild(t testing.TB, session *resolver.Session) protocol.Response {
	t.Helper()
	resp := session.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

// TestFormatSamples_BoundsEmitFMT003 — a mockSample that satisfies the
// pattern but violates a sibling length bound surfaces FMT003, naming
// every offending sample in the one message (the diagnostic pipeline
// dedups per code per walk).
func TestFormatSamples_BoundsEmitFMT003(t *testing.T) {
	code := `import {createValidate} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidate<TypeFormat<string, 'stringFormat', {
  minLength: 5;
  pattern: {source: '^b+$'; flags: ''; mockSamples: ['b', 'bb']};
}>>();
`
	resp := scanBuild(t, setupInline(t, map[string]string{"a.ts": code}))
	found := findDiag(resp, diagnostics.CodeFMTSampleBounds)
	if found == nil {
		t.Fatalf("expected an %s diagnostic, got %+v", diagnostics.CodeFMTSampleBounds, resp.Diagnostics)
	}
	if found.Severity != diagnostics.SeverityError {
		t.Errorf("severity: got %d want %d (error)", found.Severity, diagnostics.SeverityError)
	}
	message := strings.Join(found.Args, " ")
	if !strings.Contains(message, `"b"`) || !strings.Contains(message, `"bb"`) {
		t.Errorf("expected both offending samples named in %q", message)
	}
	if !strings.Contains(message, "minLength") {
		t.Errorf("expected the violated constraint named in %q", message)
	}
}

// TestFormatSamples_PartialLengthSurvivorNoFMT003 — a length bound is a
// FILTER at mock time (filterSamplesByLength), so a sample list where SOME
// survive is valid: the mock draws from the survivors. FMT003 must NOT fire
// here (only the all-violate case throws). Guards the false positive found on
// the `Alpha<{maxLength:3}>` / `['aa','aaaaaa']` fixtures.
func TestFormatSamples_PartialLengthSurvivorNoFMT003(t *testing.T) {
	code := `import {createValidate} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidate<TypeFormat<string, 'stringFormat', {
  minLength: 5;
  pattern: {source: '^a+$'; flags: ''; mockSamples: ['aa', 'aaaaaa']};
}>>();
`
	resp := scanBuild(t, setupInline(t, map[string]string{"a.ts": code}))
	if found := findDiag(resp, diagnostics.CodeFMTSampleBounds); found != nil {
		t.Fatalf("expected no FMT003 when a length-compatible sample survives, got %+v", found)
	}
}

// TestFormatSamples_AstralLengthUTF16 — sample lengths are counted in
// UTF-16 code units, matching the emitted `.length` validator: an astral
// character (U+1D7D8 '𝟘', two UTF-16 units) trips maxLength 1 but not
// maxLength 2. Counting bytes (4) or runes (1) would disagree with the
// runtime.
func TestFormatSamples_AstralLengthUTF16(t *testing.T) {
	// maxLength 1: the astral sample is length 2 in UTF-16 → violation.
	tooLong := `import {createValidate} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidate<TypeFormat<string, 'stringFormat', {
  maxLength: 1;
  mockSamples: ['𝟘'];
}>>();
`
	resp := scanBuild(t, setupInline(t, map[string]string{"a.ts": tooLong}))
	if findDiag(resp, diagnostics.CodeFMTSampleBounds) == nil {
		t.Fatalf("maxLength 1: expected %s for a length-2 astral sample, got %+v",
			diagnostics.CodeFMTSampleBounds, resp.Diagnostics)
	}

	// maxLength 2: the same sample fits exactly → no violation.
	fits := `import {createValidate} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidate<TypeFormat<string, 'stringFormat', {
  maxLength: 2;
  mockSamples: ['𝟘'];
}>>();
`
	resp = scanBuild(t, setupInline(t, map[string]string{"a.ts": fits}))
	if found := findDiag(resp, diagnostics.CodeFMTSampleBounds); found != nil {
		t.Fatalf("maxLength 2: expected no bounds diagnostic (UTF-16 length 2 fits), got %+v", found)
	}
}

// uncheckedPatternSource is a pattern using a JS-only lookbehind that
// RE2 can't compile, carrying a mockSample. Shared by the FMT004 lane
// tests.
const uncheckedPatternSource = `import {createValidate} from '@ts-runtypes/core';
` + typeFormatBrandDecl + `
export const _ = createValidate<TypeFormat<string, 'stringFormat', {
  pattern: {source: '(?<=a)b'; flags: ''; mockSamples: ['ab']};
}>>();
`

// TestFormatSamples_UncheckedPatternBuildLaneFMT004 — a pattern RE2
// can't compile that carries mockSamples fails the build closed with
// FMT004 (default; allowUncheckedPatterns unset).
func TestFormatSamples_UncheckedPatternBuildLaneFMT004(t *testing.T) {
	resp := scanBuild(t, setupInline(t, map[string]string{"a.ts": uncheckedPatternSource}))
	found := findDiag(resp, diagnostics.CodeFMTUncheckedPattern)
	if found == nil {
		t.Fatalf("expected an %s diagnostic, got %+v", diagnostics.CodeFMTUncheckedPattern, resp.Diagnostics)
	}
	if found.Severity != diagnostics.SeverityError {
		t.Errorf("severity: got %d want %d (error)", found.Severity, diagnostics.SeverityError)
	}
	if len(found.Args) == 0 || found.Args[0] != "(?<=a)b" {
		t.Errorf("expected the pattern source in args, got %+v", found.Args)
	}
}

// TestFormatSamples_UncheckedPatternFlagSuppresses — with
// allowUncheckedPatterns set, the build lane no longer emits FMT004
// (the project asserts the JS linter owns the check).
func TestFormatSamples_UncheckedPatternFlagSuppresses(t *testing.T) {
	session := setupInlineWith(t, map[string]string{"a.ts": uncheckedPatternSource},
		func(programOpts *program.Options, resolverOpts *resolver.Options) {
			programOpts.SingleThreaded = true
			resolverOpts.SingleThreaded = true
			resolverOpts.AllowUncheckedPatterns = true
		})
	resp := scanBuild(t, session)
	if found := findDiag(resp, diagnostics.CodeFMTUncheckedPattern); found != nil {
		t.Fatalf("expected FMT004 suppressed by allowUncheckedPatterns, got %+v", found)
	}
}

// TestFormatSamples_UncheckedPatternLintLaneRecords — the lint lane
// (IncludeRtDiagnostics) never emits FMT004; instead it ships the pattern
// on Response.UncheckedPatterns for the JS linter to validate with the
// real regex engine, anchored at the definition site.
func TestFormatSamples_UncheckedPatternLintLaneRecords(t *testing.T) {
	session := setupInline(t, map[string]string{"a.ts": uncheckedPatternSource})
	resp := session.Dispatch(protocol.Request{
		Op:                   protocol.OpScanFiles,
		Files:                []string{"a.ts"},
		IncludeRtDiagnostics: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if found := findDiag(resp, diagnostics.CodeFMTUncheckedPattern); found != nil {
		t.Fatalf("lint lane must not emit FMT004 (the linter validates instead), got %+v", found)
	}
	if len(resp.UncheckedPatterns) == 0 {
		t.Fatalf("expected the pattern shipped on UncheckedPatterns, got none")
	}
	pattern := resp.UncheckedPatterns[0]
	if pattern.Source != "(?<=a)b" {
		t.Errorf("source: got %q want %q", pattern.Source, "(?<=a)b")
	}
	if len(pattern.Samples) != 1 || pattern.Samples[0] != "ab" {
		t.Errorf("samples: got %+v want [ab]", pattern.Samples)
	}
	if pattern.Site.FilePath == "" || pattern.Site.StartLine == 0 {
		t.Errorf("expected a definition site on the unchecked pattern, got %+v", pattern.Site)
	}
}
