package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// End-to-end coverage for the inline circular-reference guard (the compile-time
// `rejectCircularRefs` option). The armed variant of a guarded family must (a)
// bake the guard prologue + skeleton into its body, (b) demand rt::findCycleParent
// by body reference (delivered like any built-in), while (c) a PLAIN cyclable type
// carries no guard, no walker, and no RunType bundle — the pay-for-use win.

func scanEntryModules(t *testing.T, src string) map[string]string {
	t.Helper()
	r := setupInline(t, map[string]string{"a.ts": src})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scan: %s", resp.Error)
	}
	return resp.EntryModules
}

// findEntry returns the first entry module whose body factory has the given tag
// prefix (e.g. "cCe_" for armed validate) — the module carrying that factory.
func findEntryWith(modules map[string]string, needle string) (string, bool) {
	for name, mod := range modules {
		if strings.Contains(mod, needle) {
			return name, true
		}
	}
	return "", false
}

func TestInlineGuard_ArmedValidateBakesGuardAndDemandsFindCycleParent(t *testing.T) {
	modules := scanEntryModules(t, `import {createValidate} from '@ts-runtypes/core';
interface Node {name: string; next?: Node}
export const isNode = createValidate<Node>(undefined, {rejectCircularRefs: true});
`)

	// The armed entry (val|C = "cCe") must carry the guard prologue.
	armedName, ok := findEntryWith(modules, "cCe_")
	if !ok {
		t.Fatalf("no armed validate entry emitted\nmodules: %v", keys(modules))
	}
	armed := modules[armedName]
	// Quote-free substrings: the factory body is a quoted JS string, so single
	// quotes inside it are escaped (\'), but these fragments carry none.
	for _, want := range []string{"fcp = utl.getPureFn(", "if(fcp(v,cyP))return false", "const cyP = {c:["} {
		if !strings.Contains(armed, want) {
			t.Errorf("armed validate entry missing %q:\n%s", want, armed)
		}
	}
	// It demands the built-in by body reference (the pure-fn dep tuple slot is a
	// real JS array literal, so its single quotes are NOT escaped).
	if !strings.Contains(armed, "'rt::findCycleParent'") {
		t.Errorf("armed entry does not list the findCycleParent pure-fn dep:\n%s", armed)
	}
	if _, ok := modules["pf/rt/findCycleParent"]; !ok {
		t.Errorf("rt::findCycleParent module was not served\nmodules: %v", keys(modules))
	}
}

func TestInlineGuard_PlainCyclableTypeShipsNoGuardNoBundle(t *testing.T) {
	// A plain (unarmed) createValidate over a cyclable type — the common case.
	modules := scanEntryModules(t, `import {createValidate} from '@ts-runtypes/core';
interface Node {name: string; next?: Node}
export const isNode = createValidate<Node>();
`)
	for name, mod := range modules {
		if strings.Contains(mod, "findCycleParent") {
			t.Errorf("plain cyclable type served the walker in %q — demand leaked:\n%s", name, mod)
		}
		// No RunType data bundle (kind-4 row bundle) for a plain createX cyclable type.
		if strings.HasPrefix(mod, "export const __rt_runtypes") || strings.Contains(mod, "virtual:rt/runtypes.js") {
			t.Errorf("plain cyclable type emitted / imported a RunType bundle in %q:\n%s", name, mod)
		}
	}
}

func TestInlineGuard_ArmedEncodersThrow(t *testing.T) {
	// toBinary (tb|C) and jsonEncoder (jeCL|C) armed entries throw a
	// CircularReferenceError via utl.circularError.
	modules := scanEntryModules(t, `import {createBinaryEncoder, createJsonEncoder} from '@ts-runtypes/core';
interface Node {name: string; next?: Node}
export const tb = createBinaryEncoder<Node>(undefined, {rejectCircularRefs: true});
export const je = createJsonEncoder<Node>(undefined, {rejectCircularRefs: true});
`)
	throwers := 0
	for _, mod := range modules {
		if strings.Contains(mod, "if(cyR)throw utl.circularError(cyR)") {
			throwers++
		}
	}
	if throwers < 2 {
		t.Errorf("expected both armed encoders (tb + je) to throw via utl.circularError, found %d\nmodules: %v", throwers, keys(modules))
	}
	if _, ok := modules["pf/rt/findCycleParent"]; !ok {
		t.Errorf("rt::findCycleParent not served for armed encoders\nmodules: %v", keys(modules))
	}
}
