package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/operations"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// runtypeDiagsOf is the analogue of filterDiagsByFamily for runtype
// diagnostics — keeps the assertions terse without forcing a map lookup
// per test.
func runtypeDiagsOf(diagnostics []diag.Diagnostic) []diag.Diagnostic {
	return filterDiagsByFamily(diagnostics, diag.FamilyRunType)
}

// TestDiag_RunTypeRTThrow_NeverAtRoot pins the end-to-end runtype
// diagnostic flow. A `getRunTypeId<never>()` call site reaches the
// prepareForJson emitter's RTThrow site for KindNever, which records
// a PJ001 diagnostic against the marker call site. The diagnostic
// fans out one entry per call site (per user direction: dedup is
// one-per-call-site, not one-per-type-id).
func TestDiag_RunTypeRTThrow_NeverAtRoot_PrepareForJson(t *testing.T) {
	// pj is demand-driven now, so seed it via createJsonEncoder(mutate) → [pj].
	const code = `import {createJsonEncoder} from '@mionjs/ts-go-run-types';
export const _ = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:             protocol.OpScanFiles,
		Files:          []string{"a.ts"},
		IncludeModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	runtypeDiags := runtypeDiagsOf(resp.Diagnostics)
	if len(runtypeDiags) == 0 {
		t.Fatalf("expected at least one runtype diagnostic, got 0 (%+v)", resp.Diagnostics)
	}
	var found *diag.Diagnostic
	for i := range runtypeDiags {
		if runtypeDiags[i].Code == diag.CodePJNeverRoot {
			found = &runtypeDiags[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("expected a %s diagnostic, got %+v", diag.CodePJNeverRoot, runtypeDiags)
	}
	if found.Severity != diag.SeverityError {
		t.Errorf("severity: got %d want %d", found.Severity, diag.SeverityError)
	}
	if !strings.Contains(found.Site.FilePath, "a.ts") {
		t.Errorf("site filePath: got %q, expected to contain 'a.ts'", found.Site.FilePath)
	}
	if found.Site.StartLine == 0 || found.Site.StartCol == 0 {
		t.Errorf("expected populated line/col, got line=%d col=%d", found.Site.StartLine, found.Site.StartCol)
	}
	if len(found.Args) != 1 || found.Args[0] != "Never" {
		t.Errorf("args: got %v, expected [\"Never\"]", found.Args)
	}
}

// TestDiag_RunTypeRTThrow_FunctionAtRoot exercises the function-root
// throw across the JSON families. `getRunTypeId<() => void>()` reaches
// the function-root RTThrow in each family.
func TestDiag_RunTypeRTThrow_FunctionAtRoot_PrepareForJson(t *testing.T) {
	// pj is demand-driven now, so seed it via createJsonEncoder(mutate) → [pj].
	const code = `import {createJsonEncoder} from '@mionjs/ts-go-run-types';
export const _ = createJsonEncoder<() => void>(undefined, {strategy: 'mutate'});
`
	r := setupInline(t, map[string]string{"f.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:             protocol.OpScanFiles,
		Files:          []string{"f.ts"},
		IncludeModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	runtypeDiags := runtypeDiagsOf(resp.Diagnostics)
	var found *diag.Diagnostic
	for i := range runtypeDiags {
		if runtypeDiags[i].Code == diag.CodePJFunctionRoot {
			found = &runtypeDiags[i]
			break
		}
	}
	if found == nil {
		t.Fatalf("expected a %s diagnostic, got %+v", diag.CodePJFunctionRoot, runtypeDiags)
	}
}

// TestDiag_PerFamilyPrefix_DistinctCodes pins the per-family prefix
// scheme. The same logical throw (Never at root) under different
// emitters surfaces as distinct codes — SJ001 for stringifyJson,
// TB001 for toBinary, etc. — so users reading their build log can
// see which RT family produced the diagnostic without parsing
// message text.
func TestDiag_PerFamilyPrefix_NeverAtRoot_DistinctCodes(t *testing.T) {
	// All three families are demand-driven now: seed pj via createJsonEncoder(mutate),
	// sj via createJsonEncoder(direct), and tb via its own createBinaryEncoder.
	const code = `import {createJsonEncoder, createBinaryEncoder} from '@mionjs/ts-go-run-types';
export const _ = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
export const _s = createJsonEncoder<never>(undefined, {strategy: 'direct'});
export const _b = createBinaryEncoder<never>();
`
	r := setupInline(t, map[string]string{"n.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:             protocol.OpScanFiles,
		Files:          []string{"n.ts"},
		IncludeModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	codes := map[string]bool{}
	for _, d := range runtypeDiagsOf(resp.Diagnostics) {
		codes[d.Code] = true
	}
	for _, expected := range []string{diag.CodePJNeverRoot, diag.CodeSJNeverRoot, diag.CodeTBNeverRoot} {
		if !codes[expected] {
			t.Errorf("expected diagnostic code %s in %v", expected, codes)
		}
	}
}

// TestDiag_PropertyAbsorbsUnsupportedChild pins the v2 property-
// absorption rule: when an interface has an unsupported property
// (Never, Symbol, NonSerializable class, etc.), the property emit
// drops it from the parent's chain rather than propagating CodeNS
// to the root. The rest of the object's validator still works.
// See docs/UNSUPPORTED-KINDS.md.
func TestDiag_PropertyAbsorbsUnsupportedChild_NeverProp(t *testing.T) {
	// pj is demand-driven now, so seed it via createJsonEncoder(mutate) → [pj].
	const code = `import {createJsonEncoder} from '@mionjs/ts-go-run-types';
interface User { name: string; bad: never; }
export const _ = createJsonEncoder<User>(undefined, {strategy: 'mutate'});
`
	r := setupInline(t, map[string]string{"u.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:             protocol.OpScanFiles,
		Files:          []string{"u.ts"},
		IncludeModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	// The User entry should still render (not absent) — the never property
	// is absorbed at the property level. Its module must NOT carry the
	// alwaysThrow code slot.
	var rootSiteID string
	for _, s := range resp.Sites {
		rootSiteID = s.ID
	}
	if rootSiteID == "" {
		t.Fatalf("expected at least one site for the User marker call")
	}
	// The module key is `<prepareForJson-fnHash>_<id>` (opaque per-family
	// hash), not the readable `pj_` tag. Derive the prefix via the operation
	// registry so the assertion stays correct across version-isolated hashes.
	rootKey := operations.PlainHash("prepareForJson") + "_" + rootSiteID
	rootModule := resp.Modules[rootKey]
	if rootModule == "" {
		t.Errorf("expected a rendered pj module for the User root %q, got modules %v", rootKey, len(resp.Modules))
	}
	if strings.Contains(rootModule, "'PJ001'") {
		t.Errorf("User entry should NOT be alwaysThrow — property absorbs the never child. Got: %s", rootModule)
	}
	// A PJ001 diagnostic should fire for the absorbed never child.
	runtype := runtypeDiagsOf(resp.Diagnostics)
	var pj001 *diag.Diagnostic
	for i := range runtype {
		if runtype[i].Code == diag.CodePJNeverRoot {
			pj001 = &runtype[i]
			break
		}
	}
	if pj001 == nil {
		t.Fatalf("expected PJ001 diagnostic for the absorbed never property, got %+v", runtype)
	}
	if len(pj001.Args) != 1 || pj001.Args[0] != "bad" {
		t.Errorf("expected args=[\"bad\"] (the absorbed property name), got %v", pj001.Args)
	}
}

// TestDiag_SymbolUnsupported_PerFamily pins v2's reclassification of
// KindSymbol — `getRunTypeId<symbol>()` produces an alwaysThrow factory
// (or its per-family equivalent code) across every RT family.
func TestDiag_SymbolUnsupported_PerFamily(t *testing.T) {
	// validate seeds `it` (all-emit); pj/sj/tb are demand-driven, so seed pj via
	// createJsonEncoder(mutate), sj via createJsonEncoder(direct), tb via createBinaryEncoder.
	const code = `import {createValidate, createJsonEncoder, createBinaryEncoder} from '@mionjs/ts-go-run-types';
export const _ = createValidate<symbol>();
export const _p = createJsonEncoder<symbol>(undefined, {strategy: 'mutate'});
export const _s = createJsonEncoder<symbol>(undefined, {strategy: 'direct'});
export const _b = createBinaryEncoder<symbol>();
`
	r := setupInline(t, map[string]string{"s.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:             protocol.OpScanFiles,
		Files:          []string{"s.ts"},
		IncludeModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	codes := map[string]bool{}
	for _, d := range runtypeDiagsOf(resp.Diagnostics) {
		codes[d.Code] = true
	}
	// Each family emits its own Symbol-unsupported code.
	for _, want := range []string{diag.CodeVLSymbolRoot, diag.CodePJSymbolRoot, diag.CodeSJSymbolRoot, diag.CodeTBSymbolRoot} {
		if !codes[want] {
			t.Errorf("expected diagnostic %s to fire for symbol at root, got %v", want, codes)
		}
	}
}

// TestDiag_AlwaysThrowEntry_HasCodeOnWire pins the wire format — when a
// root throws, the rendered entry module carries the diag code in the
// alwaysThrow slot, not an inline throwing factory body.
func TestDiag_AlwaysThrowEntry_HasCodeOnWire(t *testing.T) {
	// pj is demand-driven now, so seed it via createJsonEncoder(mutate) → [pj].
	const code = `import {createJsonEncoder} from '@mionjs/ts-go-run-types';
export const _ = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
`
	r := setupInline(t, map[string]string{"n.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:             protocol.OpScanFiles,
		Files:          []string{"n.ts"},
		IncludeModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var rootSiteID string
	for _, s := range resp.Sites {
		rootSiteID = s.ID
	}
	pjModule := resp.Modules[operations.PlainHash("prepareForJson")+"_"+rootSiteID]
	if pjModule == "" {
		t.Fatalf("expected a rendered pj module for the never root, got modules %v", len(resp.Modules))
	}
	if !strings.Contains(pjModule, "'PJ001'") {
		t.Errorf("expected the alwaysThrow entry module to carry the 'PJ001' code, got:\n%s", pjModule)
	}
	if strings.Contains(pjModule, "throw new Error(") {
		t.Errorf("wire format should not embed inline throw bodies, got:\n%s", pjModule)
	}
}

// TestDiag_SilentSkip_FunctionMember pins the Phase 3 silent-skip
// visibility: when an interface has a function-typed member, the RT
// silently drops it from the validator/serializer. The new diagnostic
// surfaces that drop at build time so the user knows e.g. `onClick`
// is not validated. The exact code (VL010 vs VL011) depends on whether
// TypeScript parses the member as a method or a property — both flow
// through the same family prefix (IT) so consumers can grep by prefix.
func TestDiag_SilentSkip_FunctionMember_Validate(t *testing.T) {
	const code = `import {createValidate} from '@mionjs/ts-go-run-types';
interface User { name: string; onClick: () => void; }
export const _ = createValidate<User>();
`
	r := setupInline(t, map[string]string{"u.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:             protocol.OpScanFiles,
		Files:          []string{"u.ts"},
		IncludeModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var found *diag.Diagnostic
	for _, d := range runtypeDiagsOf(resp.Diagnostics) {
		switch d.Code {
		case diag.CodeVLFunctionPropDropped, diag.CodeVLMethodDropped:
			d := d
			found = &d
		}
		if found != nil {
			break
		}
	}
	if found == nil {
		t.Fatalf("expected VL010 or VL011 diagnostic, got %+v", resp.Diagnostics)
	}
	if found.Severity != diag.SeverityWarning {
		t.Errorf("severity: got %d want %d", found.Severity, diag.SeverityWarning)
	}
	if len(found.Args) != 1 || found.Args[0] != "onClick" {
		t.Errorf("args: got %v, expected [\"onClick\"]", found.Args)
	}
}

// TestDiag_RunTypeFansOutAcrossCallSites pins the per-user-direction
// dedup rule: when N marker calls reference the same RT ID with the
// same problem, emit N diagnostics — one per call site — not one
// shared by them all.
func TestDiag_RunTypeFansOutAcrossCallSites(t *testing.T) {
	// pj is demand-driven; three createJsonEncoder(mutate) sites share one `never`
	// id, so the single rendered pj entry fans the PJ001 diag out to all three.
	const code = `import {createJsonEncoder} from '@mionjs/ts-go-run-types';
export const a = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
export const b = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
export const c = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
`
	r := setupInline(t, map[string]string{"multi.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:             protocol.OpScanFiles,
		Files:          []string{"multi.ts"},
		IncludeModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var neverDiags []diag.Diagnostic
	for _, d := range runtypeDiagsOf(resp.Diagnostics) {
		if d.Code == diag.CodePJNeverRoot {
			neverDiags = append(neverDiags, d)
		}
	}
	if len(neverDiags) != 3 {
		t.Fatalf("expected 3 diagnostics (one per call site), got %d (%+v)", len(neverDiags), neverDiags)
	}
	// Each entry has its own distinct line.
	seenLines := map[int]bool{}
	for _, d := range neverDiags {
		seenLines[d.Site.StartLine] = true
	}
	if len(seenLines) != 3 {
		t.Errorf("expected 3 distinct call-site lines, got %d (%v)", len(seenLines), seenLines)
	}
}
