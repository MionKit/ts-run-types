package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/diag"
	"github.com/mionkit/ts-runtypes/internal/operations"
	"github.com/mionkit/ts-runtypes/internal/protocol"
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
	const code = `import {createJsonEncoder} from 'ts-runtypes';
export const _ = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
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
	const code = `import {createJsonEncoder} from 'ts-runtypes';
export const _ = createJsonEncoder<() => void>(undefined, {strategy: 'mutate'});
`
	r := setupInline(t, map[string]string{"f.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"f.ts"},
		IncludeEntryModules: true,
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
	const code = `import {createJsonEncoder, createBinaryEncoder} from 'ts-runtypes';
export const _ = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
export const _s = createJsonEncoder<never>(undefined, {strategy: 'direct'});
export const _b = createBinaryEncoder<never>();
`
	r := setupInline(t, map[string]string{"n.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"n.ts"},
		IncludeEntryModules: true,
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
	const code = `import {createJsonEncoder} from 'ts-runtypes';
interface User { name: string; bad: never; }
export const _ = createJsonEncoder<User>(undefined, {strategy: 'mutate'});
`
	r := setupInline(t, map[string]string{"u.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"u.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	// Absorption means the User root does NOT become alwaysThrow. With the
	// never property dropped, the remaining shape (`name: string`) is
	// JSON-compatible, so the pj entry collapses to the noop short-form,
	// the jeMU composite elides its binding, and the emission prune drops
	// the orphan module entirely — absence of every pj module (and of any
	// 'PJ001' alwaysThrow arg in the payload) IS the absorption evidence.
	// An unabsorbed never would instead surface as an emitted alwaysThrow
	// entry referenced by the composite.
	var rootSiteID string
	for _, s := range resp.Sites {
		rootSiteID = s.ID
	}
	if rootSiteID == "" {
		t.Fatalf("expected at least one site for the User marker call")
	}
	if keys := familyEntryKeys(resp, "prepareForJson"); len(keys) != 0 {
		t.Errorf("the absorbed-to-identity pj entry must be elided + pruned, got %v", keys)
	}
	// The composite (the injected binding) survives as the bare-stringify
	// form, with no alwaysThrow code anywhere in the payload.
	jsonEncoderOp, ok := operations.ByName("jsonEncoder")
	if !ok {
		t.Fatal("jsonEncoder operation missing from the registry")
	}
	rootKey := operations.FnHashFor(jsonEncoderOp, nil, "mutate") + "_" + rootSiteID
	userModule := entryModule(resp, rootKey)
	if !strings.Contains(userModule, "return JSON.stringify(v);") {
		t.Errorf("jeMU composite for the absorbed User must collapse to bare JSON.stringify, got: %s", userModule)
	}
	if all := allEntrySources(resp); strings.Contains(all, "'PJ001'") {
		t.Errorf("no emitted module may carry the PJ001 alwaysThrow arg — property absorbs the never child. Got:\n%s", all)
	}
	// A PJ015 child-position WARNING should fire for the dropped never property
	// — NOT the PJ001 root error. `never` is directly DataOnly-stripped, so the
	// property is dropped (the object still serializes); an Error would wrongly
	// claim the factory throws at runtime when it serializes fine (F3).
	runtype := runtypeDiagsOf(resp.Diagnostics)
	var drop *diag.Diagnostic
	for i := range runtype {
		if runtype[i].Code == diag.CodePJNonSerializablePropDrop {
			drop = &runtype[i]
			break
		}
	}
	if drop == nil {
		t.Fatalf("expected PJ015 drop warning for the dropped never property, got %+v", runtype)
	}
	if drop.Severity != diag.SeverityWarning {
		t.Errorf("PJ015 severity = %v, want Warning (a dropped property serializes fine)", drop.Severity)
	}
	if len(drop.Args) != 1 || drop.Args[0] != "bad" {
		t.Errorf("expected args=[\"bad\"] (the dropped property name), got %v", drop.Args)
	}
	// The PJ001 root error must NOT fire — the property is dropped, not failed.
	for i := range runtype {
		if runtype[i].Code == diag.CodePJNeverRoot {
			t.Errorf("PJ001 (root never error) must not fire for a dropped never property, got %+v", runtype[i])
		}
	}
}

// TestDiag_SymbolUnsupported_PerFamily pins v2's reclassification of
// KindSymbol — `getRunTypeId<symbol>()` produces an alwaysThrow factory
// (or its per-family equivalent code) across every RT family.
func TestDiag_SymbolUnsupported_PerFamily(t *testing.T) {
	// validate seeds `it` (all-emit); pj/sj/tb are demand-driven, so seed pj via
	// createJsonEncoder(mutate), sj via createJsonEncoder(direct), tb via createBinaryEncoder.
	const code = `import {createValidate, createJsonEncoder, createBinaryEncoder} from 'ts-runtypes';
export const _ = createValidate<symbol>();
export const _p = createJsonEncoder<symbol>(undefined, {strategy: 'mutate'});
export const _s = createJsonEncoder<symbol>(undefined, {strategy: 'direct'});
export const _b = createBinaryEncoder<symbol>();
`
	r := setupInline(t, map[string]string{"s.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"s.ts"},
		IncludeEntryModules: true,
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

// TestDiag_AlwaysThrowEntry_EmbedsRenderedMessage pins the entry-module shape —
// when a root throws, the rendered init() carries the COMPLETE runtime throw
// message (rendered by the Go emitter and embedded in the tuple), not a bare
// code resolved JS-side and not an inline throwing factory body. The Go↔plugin
// wire still carries only the diagnostic code.
func TestDiag_AlwaysThrowEntry_EmbedsRenderedMessage(t *testing.T) {
	// pj is demand-driven now, so seed it via createJsonEncoder(mutate) → [pj].
	const code = `import {createJsonEncoder} from 'ts-runtypes';
export const _ = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
`
	r := setupInline(t, map[string]string{"n.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"n.ts"},
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	src := familyEntrySources(resp, "prepareForJson")
	// never under prepareForJson → PJ001; leaf kind label "Never".
	wantMessage := "[" + diag.CodePJNeverRoot + "] Cannot encode `Never` to JSON."
	if !strings.Contains(src, wantMessage) {
		t.Errorf("expected rendered alwaysThrow message %q embedded in init(), got:\n%s", wantMessage, src)
	}
	if strings.Contains(src, "throw new Error(") {
		t.Errorf("wire format should not embed inline throw bodies, got:\n%s", src)
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
	const code = `import {createValidate} from 'ts-runtypes';
interface User { name: string; onClick: () => void; }
export const _ = createValidate<User>();
`
	r := setupInline(t, map[string]string{"u.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"u.ts"},
		IncludeEntryModules: true,
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
	const code = `import {createJsonEncoder} from 'ts-runtypes';
export const a = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
export const b = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
export const c = createJsonEncoder<never>(undefined, {strategy: 'mutate'});
`
	r := setupInline(t, map[string]string{"multi.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"multi.ts"},
		IncludeEntryModules: true,
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
