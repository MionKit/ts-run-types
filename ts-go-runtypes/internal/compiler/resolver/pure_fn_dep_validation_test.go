package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// runtypesDTSWithPureFn is the ambient `ts-runtypes` module used by the
// PFE9012 tests. It carries just enough surface to (a) demand a verr entry —
// whose live body reaches `utl.getPureFn('rt::newRunTypeErr')` — and (b) let a
// companion .ts file register that pure fn so the extractor recognizes it. The
// shared runtypesDTS deliberately omits the registerPureFnFactory brands: a
// real program gets the `rt::` registrations from the ts-runtypes package's own
// source (its index side-effect-imports them), never from an ambient .d.ts, so
// a bare test program has no registration and PFE9012 correctly fires.
const runtypesDTSWithPureFn = `declare module '@ts-runtypes/core' {
  export type CompTimeArgs<T> = T & {readonly __rtCompTimeArgsBrand?: never};
  export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};
  export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3]};
  export interface ValidateOptions {noLiterals?: boolean; noIsArrayCheck?: boolean; rejectCircularRefs?: boolean}
  export function createGetValidationErrors<T>(val?: T, options?: CompTimeFnArgs<ValidateOptions>, id?: InjectTypeFnArgs<T, 'verr'>): (v: unknown, p?: unknown[], e?: unknown[]) => unknown[];
  export type PureFunction<F> = F & {readonly __rtPureFunctionBrand?: never};
  export type PureFnId = string & {readonly __rtPureFnIdBrand?: never};
  export interface RTUtils {
    usePureFn(key: CompTimeArgs<string>): any;
    getPureFn(key: CompTimeArgs<string>): any;
  }
  export function registerPureFnFactory(
    pureFnId: CompTimeArgs<PureFnId>,
    factory: PureFunction<(utl: RTUtils) => any> | null
  ): any;
}
`

// pureFnDepDiags filters a response's diagnostics down to the pure-fn family
// (PFE*) so the assertions ignore any marker/runtype diagnostics the fixture
// also produces.
func pureFnDepDiags(diags []diagnostics.Diagnostic) []diagnostics.Diagnostic {
	return filterDiagsByFamily(diags, diagnostics.FamilyPureFn)
}

// TestPureFnDepValidation_MissingRegistration_PFE9012 — a createGetValidationErrors
// call compiles a verr body that reaches `utl.getPureFn('rt::newRunTypeErr')`,
// but no registerPureFnFactory for that key exists in the program. The scan and
// dump responses must both carry a PFE9012 naming the missing key.
//
// The program DOES register an unrelated built-in (rt::asJSONString) so the
// pure-fn mechanism is present — validation only runs when it is (see
// validateProgramPureFnDeps); a program with zero registrations is a stub and
// is deliberately not validated.
func TestPureFnDepValidation_MissingRegistration_PFE9012(t *testing.T) {
	sources := map[string]string{
		"runtypes.d.ts": runtypesDTSWithPureFn,
		"a.ts": `import {createGetValidationErrors} from '@ts-runtypes/core';
export const errorsOf = createGetValidationErrors<{a: string; b: number}>();
`,
		// An unrelated registration wires the mechanism into the program, but
		// NOT the rt::newRunTypeErr key the verr body reaches.
		"reg.ts": `import {registerPureFnFactory} from '@ts-runtypes/core';
export const _reg = registerPureFnFactory('rt::asJSONString', function () { return function () { return ''; }; });
`,
	}

	assertMissing := func(t *testing.T, diags []diagnostics.Diagnostic) {
		t.Helper()
		pureDiags := pureFnDepDiags(diags)
		var found *diagnostics.Diagnostic
		for i := range pureDiags {
			if pureDiags[i].Code == diagnostics.CodeMissingPureFnDep {
				found = &pureDiags[i]
			}
		}
		if found == nil {
			t.Fatalf("expected a %s diagnostic, got %+v", diagnostics.CodeMissingPureFnDep, pureDiags)
		}
		if found.Severity != diagnostics.SeverityError {
			t.Errorf("PFE9012 severity: got %d, want Error (%d)", found.Severity, diagnostics.SeverityError)
		}
		if len(found.Args) == 0 || found.Args[0] != "rt::newRunTypeErr" {
			t.Errorf("expected args[0]=rt::newRunTypeErr (the missing key), got %v", found.Args)
		}
		// Site attribution: the diagnostic must anchor at the createGetValidationErrors
		// call site in a.ts (not be reported file-less).
		if !strings.Contains(found.Site.FilePath, "a.ts") {
			t.Errorf("expected site anchored at a.ts, got FilePath=%q", found.Site.FilePath)
		}
		if found.Site.StartLine == 0 || found.Site.StartCol == 0 {
			t.Errorf("expected populated line/col at the call site, got line=%d col=%d", found.Site.StartLine, found.Site.StartCol)
		}
	}

	t.Run("scanFiles", func(t *testing.T) {
		r := setupInline(t, sources)
		resp := r.Dispatch(protocol.Request{
			Op:                  protocol.OpScanFiles,
			Files:               []string{"a.ts"},
			IncludeEntryModules: true,
		})
		if resp.Error != "" {
			t.Fatalf("scanFiles: %s", resp.Error)
		}
		assertMissing(t, resp.Diagnostics)
	})

	// IncludeRtDiagnostics (the lint flag) surfaces the same PFE9012 without
	// asking for the module payload — the linter-plugin path.
	t.Run("scanFiles_lintOnly", func(t *testing.T) {
		r := setupInline(t, sources)
		resp := r.Dispatch(protocol.Request{
			Op:                   protocol.OpScanFiles,
			Files:                []string{"a.ts"},
			IncludeRtDiagnostics: true,
		})
		if resp.Error != "" {
			t.Fatalf("scanFiles: %s", resp.Error)
		}
		assertMissing(t, resp.Diagnostics)
	})

	t.Run("dump", func(t *testing.T) {
		r := setupInline(t, sources)
		resp := r.Dispatch(protocol.Request{Op: protocol.OpDump})
		if resp.Error != "" {
			t.Fatalf("dump: %s", resp.Error)
		}
		assertMissing(t, resp.Diagnostics)
	})
}

// TestPureFnDepValidation_RegistrationPresent_NoDiagnostic — the converse: the
// same verr-bearing fixture, but a companion source registers the pure fn the
// body reaches. The registration lives in a file OUTSIDE the scanned set to
// pin that validation indexes the WHOLE program (a per-file scan set would
// false-positive here). No PFE9012 must appear.
func TestPureFnDepValidation_RegistrationPresent_NoDiagnostic(t *testing.T) {
	sources := map[string]string{
		"runtypes.d.ts": runtypesDTSWithPureFn,
		"a.ts": `import {createGetValidationErrors} from '@ts-runtypes/core';
export const errorsOf = createGetValidationErrors<{a: string; b: number}>();
`,
		// Registration in a non-scanned file — the whole-program index must
		// still find it by key.
		"reg.ts": `import {registerPureFnFactory} from '@ts-runtypes/core';
export const _reg = registerPureFnFactory('rt::newRunTypeErr', function () { return function () { return []; }; });
`,
	}

	assertNoMissing := func(t *testing.T, diags []diagnostics.Diagnostic) {
		t.Helper()
		for _, diag := range pureFnDepDiags(diags) {
			if diag.Code == diagnostics.CodeMissingPureFnDep {
				t.Fatalf("unexpected %s when the pure fn IS registered: %+v", diagnostics.CodeMissingPureFnDep, diag)
			}
		}
	}

	t.Run("scanFiles", func(t *testing.T) {
		r := setupInline(t, sources)
		resp := r.Dispatch(protocol.Request{
			Op:                  protocol.OpScanFiles,
			Files:               []string{"a.ts"},
			IncludeEntryModules: true,
		})
		if resp.Error != "" {
			t.Fatalf("scanFiles: %s", resp.Error)
		}
		assertNoMissing(t, resp.Diagnostics)
	})

	t.Run("dump", func(t *testing.T) {
		r := setupInline(t, sources)
		resp := r.Dispatch(protocol.Request{Op: protocol.OpDump})
		if resp.Error != "" {
			t.Fatalf("dump: %s", resp.Error)
		}
		assertNoMissing(t, resp.Diagnostics)
	})
}

// TestPureFnDepValidation_StubProgramSuppressed pins the mechanism guard: a
// program with ZERO registerPureFnFactory calls (the default ambient stub the
// test harnesses use) does not emit PFE9012 even though the verr body reaches a
// pure fn, because the registration source simply isn't part of the program. A
// real build importing ts-runtypes always has the mechanism, so this only
// suppresses stub/ambient setups — never a genuine consumer build.
func TestPureFnDepValidation_StubProgramSuppressed(t *testing.T) {
	// The default runtypesDTS (via setupInline) declares no registerPureFnFactory
	// and the fixture registers nothing, so the program has zero registrations.
	r := setupInline(t, map[string]string{
		"a.ts": `import {createGetValidationErrors} from '@ts-runtypes/core';
export const errorsOf = createGetValidationErrors<{a: string; b: number}>();
`,
	})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	for _, diag := range pureFnDepDiags(resp.Diagnostics) {
		if diag.Code == diagnostics.CodeMissingPureFnDep {
			t.Fatalf("stub program (no registrations) must not emit %s, got %+v", diagnostics.CodeMissingPureFnDep, diag)
		}
	}
}
