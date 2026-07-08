package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// countMKR003 tallies the free-type-parameter marker diagnostics in a response.
func countMKR003(diags []diagnostics.Diagnostic) int {
	n := 0
	for _, diag := range diags {
		if diag.Code == diagnostics.CodeMarkerFreeTypeParameter {
			n++
		}
	}
	return n
}

// TestScan_WrapperForwardsHandle_NoMKR003 pins the fix for the documented
// wrapper pattern (docs/done/inject-runtypeid-helper-getruntype-undefined.md):
// a helper `describe<T>(id?: InjectRunTypeId<T>)` resolves its injected handle
// by FORWARDING it to a public resolver as the explicit trailing arg
// (`getRunTypeId<T>(undefined, id)`). The forward call has its id slot filled,
// so it is a pass-through: no injection AND no MKR003 — even though `T` is the
// wrapper's free type parameter. Only the outer `describe<{…}>()` call, whose
// slot is empty, gets an injection site.
func TestScan_WrapperForwardsHandle_NoMKR003(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId, type InjectRunTypeId} from '@ts-runtypes/core';
function describe<T>(id?: InjectRunTypeId<T>): string {
  return getRunTypeId<T>(undefined, id);
}
export const d = describe<{a: number}>();
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	if got := countMKR003(resp.Diagnostics); got != 0 {
		t.Fatalf("forwarding a handle must NOT emit MKR003, got %d", got)
	}
	// Exactly one injection site: the outer describe<{a:number}>() call.
	if len(resp.Sites) != 1 {
		t.Fatalf("expected exactly 1 injection site (the outer wrapper call), got %d: %+v", len(resp.Sites), resp.Sites)
	}
	if resp.Sites[0].ID == "" {
		t.Fatalf("the outer wrapper call site must carry a resolved id, got %+v", resp.Sites[0])
	}
}

// TestScan_ValueFirstLocalConst_NonGeneric pins that value-first
// getRunTypeId(localConst) inside a NON-generic function body is injected just
// like a module-level const — settling the misdiagnosed sibling (b) of the
// todo. Both call sites resolve to the same structural id.
func TestScan_ValueFirstLocalConst_NonGeneric(t *testing.T) {
	r := setupInline(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@ts-runtypes/core';
const moduleConst: {a: number} = {a: 1};
export const idModule = getRunTypeId(moduleConst);
function useLocal() {
  const localConst: {a: number} = {a: 1};
  return getRunTypeId(localConst);
}
export const idLocal = useLocal();
`,
	})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	if got := countMKR003(resp.Diagnostics); got != 0 {
		t.Fatalf("a non-generic function-body const must NOT emit MKR003, got %d", got)
	}
	if len(resp.Sites) != 2 {
		t.Fatalf("expected 2 injection sites (module-level + function-body-local), got %d: %+v", len(resp.Sites), resp.Sites)
	}
	if resp.Sites[0].ID == "" || resp.Sites[0].ID != resp.Sites[1].ID {
		t.Fatalf("both value-first sites must resolve to the same structural id, got %q and %q", resp.Sites[0].ID, resp.Sites[1].ID)
	}
}

// TestScan_MarkerInGenericBody_EmitsMKR003 pins that a marker call with an EMPTY
// trailing slot inside a generic body (the genuinely-unsupported case — `T`
// unresolved, no handle to forward) still emits the MKR003 build-time error for
// BOTH the reflection marker (getRunTypeId) and a createX fn-args marker
// (createValidate). This is the "never a silent runtime throw" guarantee.
func TestScan_MarkerInGenericBody_EmitsMKR003(t *testing.T) {
	cases := map[string]string{
		"getRunTypeId": `import {getRunTypeId} from '@ts-runtypes/core';
function wrap<T>() { return getRunTypeId<T>(); }
export const x = wrap<{a: number}>();`,
		"createValidate": `import {createValidate} from '@ts-runtypes/core';
function wrap<T>() { return createValidate<T>(); }
export const x = wrap<{a: number}>();`,
	}
	for name, src := range cases {
		t.Run(name, func(t *testing.T) {
			r := setupInline(t, map[string]string{"a.ts": src})
			resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
			if resp.Error != "" {
				t.Fatalf("scan: %s", resp.Error)
			}
			if got := countMKR003(resp.Diagnostics); got != 1 {
				t.Fatalf("expected exactly 1 MKR003 for the free-T marker call, got %d (%+v)", got, resp.Diagnostics)
			}
			// The inner marker call emits no site (nothing to inject for free T);
			// the outer wrap<{a}>() has no marker param, so zero sites overall.
			if len(resp.Sites) != 0 {
				t.Fatalf("expected 0 injection sites for a free-T marker call, got %d: %+v", len(resp.Sites), resp.Sites)
			}
			// Severity must be Error so the plugin halts the production build.
			for _, d := range resp.Diagnostics {
				if d.Code == diagnostics.CodeMarkerFreeTypeParameter && d.Severity != diagnostics.SeverityError {
					t.Fatalf("MKR003 must be Error severity, got %d", d.Severity)
				}
			}
		})
	}
}
