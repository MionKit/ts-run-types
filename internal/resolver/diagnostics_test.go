package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/diag"
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
	const code = `import {getRunTypeId} from '@mionjs/ts-go-run-types';
export const _ = getRunTypeId<never>();
`
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeCacheSources: []protocol.CacheKind{protocol.CacheKindPrepareForJson},
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
	const code = `import {getRunTypeId} from '@mionjs/ts-go-run-types';
export const _ = getRunTypeId<() => void>();
`
	r := setupInline(t, map[string]string{"f.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"f.ts"},
		IncludeCacheSources: []protocol.CacheKind{protocol.CacheKindPrepareForJson},
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
	// pj/sj are JSON families (still all-emit), so getRunTypeId seeds them;
	// tb is demand-driven, so it needs its own createBinaryEncoder call site.
	const code = `import {getRunTypeId, createBinaryEncoder} from '@mionjs/ts-go-run-types';
export const _ = getRunTypeId<never>();
export const _b = createBinaryEncoder<never>();
`
	r := setupInline(t, map[string]string{"n.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:    protocol.OpScanFiles,
		Files: []string{"n.ts"},
		IncludeCacheSources: []protocol.CacheKind{
			protocol.CacheKindPrepareForJson,
			protocol.CacheKindStringifyJson,
			protocol.CacheKindToBinary,
		},
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
	const code = `import {getRunTypeId} from '@mionjs/ts-go-run-types';
interface User { name: string; bad: never; }
export const _ = getRunTypeId<User>();
`
	r := setupInline(t, map[string]string{"u.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"u.ts"},
		IncludeCacheSources: []protocol.CacheKind{protocol.CacheKindPrepareForJson},
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	// The User factory should still be rendered (not absent) — the never
	// property is absorbed at the property level. The rendered init line
	// for the root User type must NOT carry an alwaysThrow code (8th arg).
	// Find the line referencing the User id (it's the objectLiteral with
	// children) and assert no 8-arg form.
	var rootSiteID string
	for _, s := range resp.Sites {
		rootSiteID = s.ID
	}
	if rootSiteID == "" {
		t.Fatalf("expected at least one site for the User marker call")
	}
	rootInit := "init('pj_" + rootSiteID + "',"
	if !strings.Contains(resp.PrepareForJsonCacheSource, rootInit) {
		t.Errorf("expected PrepareForJson cache to contain User init line %q, got:\n%s", rootInit, resp.PrepareForJsonCacheSource)
	}
	// Locate the User init() and confirm it's not the 8-arg alwaysThrow form.
	idx := strings.Index(resp.PrepareForJsonCacheSource, rootInit)
	if idx >= 0 {
		end := strings.Index(resp.PrepareForJsonCacheSource[idx:], ";")
		userLine := resp.PrepareForJsonCacheSource[idx : idx+end]
		if strings.Contains(userLine, "'PJ001'") {
			t.Errorf("User factory should NOT be alwaysThrow — property absorbs the never child. Got: %s", userLine)
		}
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
	// isType seeds `it`; pj/sj are all-emit JSON families; tb is demand-driven,
	// so it needs its own createBinaryEncoder call site to fan out TB001.
	const code = `import {createIsType, createBinaryEncoder} from '@mionjs/ts-go-run-types';
export const _ = createIsType<symbol>();
export const _b = createBinaryEncoder<symbol>();
`
	r := setupInline(t, map[string]string{"s.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:    protocol.OpScanFiles,
		Files: []string{"s.ts"},
		IncludeCacheSources: []protocol.CacheKind{
			protocol.CacheKindIsType,
			protocol.CacheKindPrepareForJson,
			protocol.CacheKindStringifyJson,
			protocol.CacheKindToBinary,
		},
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	codes := map[string]bool{}
	for _, d := range runtypeDiagsOf(resp.Diagnostics) {
		codes[d.Code] = true
	}
	// Each family emits its own Symbol-unsupported code.
	for _, want := range []string{diag.CodeISSymbolRoot, diag.CodePJSymbolRoot, diag.CodeSJSymbolRoot, diag.CodeTBSymbolRoot} {
		if !codes[want] {
			t.Errorf("expected diagnostic %s to fire for symbol at root, got %v", want, codes)
		}
	}
}

// TestDiag_AlwaysThrowEntry_HasCodeOnWire pins the v2 wire format —
// when a root throws, the rendered init() carries the diag code as
// the 8th arg, not an inline throwing factory body.
func TestDiag_AlwaysThrowEntry_HasCodeOnWire(t *testing.T) {
	const code = `import {getRunTypeId} from '@mionjs/ts-go-run-types';
export const _ = getRunTypeId<never>();
`
	r := setupInline(t, map[string]string{"n.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"n.ts"},
		IncludeCacheSources: []protocol.CacheKind{protocol.CacheKindPrepareForJson},
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if !strings.Contains(resp.PrepareForJsonCacheSource, "'PJ001'") {
		t.Errorf("expected rendered alwaysThrow init() to carry the 'PJ001' code as 8th arg, got:\n%s", resp.PrepareForJsonCacheSource)
	}
	if strings.Contains(resp.PrepareForJsonCacheSource, "throw new Error(") {
		t.Errorf("v2 wire format should not embed inline throw bodies, got:\n%s", resp.PrepareForJsonCacheSource)
	}
}

// TestDiag_SilentSkip_FunctionMember pins the Phase 3 silent-skip
// visibility: when an interface has a function-typed member, the RT
// silently drops it from the validator/serializer. The new diagnostic
// surfaces that drop at build time so the user knows e.g. `onClick`
// is not validated. The exact code (IT010 vs IT011) depends on whether
// TypeScript parses the member as a method or a property — both flow
// through the same family prefix (IT) so consumers can grep by prefix.
func TestDiag_SilentSkip_FunctionMember_IsType(t *testing.T) {
	const code = `import {createIsType} from '@mionjs/ts-go-run-types';
interface User { name: string; onClick: () => void; }
export const _ = createIsType<User>();
`
	r := setupInline(t, map[string]string{"u.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"u.ts"},
		IncludeCacheSources: []protocol.CacheKind{protocol.CacheKindIsType},
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var found *diag.Diagnostic
	for _, d := range runtypeDiagsOf(resp.Diagnostics) {
		switch d.Code {
		case diag.CodeISFunctionPropDropped, diag.CodeISMethodDropped:
			d := d
			found = &d
		}
		if found != nil {
			break
		}
	}
	if found == nil {
		t.Fatalf("expected IT010 or IT011 diagnostic, got %+v", resp.Diagnostics)
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
	const code = `import {getRunTypeId} from '@mionjs/ts-go-run-types';
export const a = getRunTypeId<never>();
export const b = getRunTypeId<never>();
export const c = getRunTypeId<never>();
`
	r := setupInline(t, map[string]string{"multi.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"multi.ts"},
		IncludeCacheSources: []protocol.CacheKind{protocol.CacheKindPrepareForJson},
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
