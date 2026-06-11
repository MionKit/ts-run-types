package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/operations"
)

// demand_scope_test.go pins the demand-driven invariant in module mode: a
// site's Deps closure contains exactly the cache entries its own createX
// demand requires — no other family's keys ride along. `te`
// (validationErrors) is one demand-driven leaf — a type reached only through
// getRunTypeId (reflection) or through createValidate leaves no verr keys.
//
// `it` (validate) is demand-scoped too, EXCEPT for the cross-family edges
// other families' bodies reach (the JSON/binary union decoders discriminate
// members via `val_<member>` lookups), which closure assembly follows
// transitively. So a reflection-only file yields ZERO modules, a
// createValidate file yields the validate closure, and a file that ONLY
// serializes a (non-merging) union still pulls the per-member val_ entries
// its decoder needs. See docs/DEMAND-DRIVEN-FN-CACHES.md.

// keysWithPrefix returns the deps whose fnHash prefix matches `<hash>_`.
func keysWithPrefix(deps []string, fnHash string) []string {
	var out []string
	for _, dep := range deps {
		if strings.HasPrefix(dep, fnHash+"_") {
			out = append(out, dep)
		}
	}
	return out
}

// TestDemandScope_ValidationErrorsScopedToItsCallSites — verr keys appear in
// a site's closure only for createGetValidationErrors call sites, not for
// getRunTypeId or createValidate.
func TestDemandScope_ValidationErrorsScopedToItsCallSites(t *testing.T) {
	verrHash := operations.PlainHash("validationErrors")

	// Reflection only: no modules at all (and so no verr keys).
	reflect := scanModules(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/ts-go-run-types';
export const _ = getRunTypeId<{a: string; b: number}>();
`,
	}, "a.ts")
	if site := siteFor(t, reflect, "a.ts"); len(site.Deps) != 0 {
		t.Errorf("reflection-only site must have no deps, got %v", site.Deps)
	}

	// createValidate demands `it`, not `te` — so still no verr keys.
	validate := scanModules(t, map[string]string{
		"a.ts": `import {createValidate} from '@mionjs/ts-go-run-types';
export const _ = createValidate<{a: string}>();
`,
	}, "a.ts")
	if got := keysWithPrefix(siteFor(t, validate, "a.ts").Deps, verrHash); len(got) != 0 {
		t.Errorf("createValidate must NOT pull verr entries, got %v", got)
	}

	// createGetValidationErrors demands `te`.
	validationErrors := scanModules(t, map[string]string{
		"a.ts": `import {createGetValidationErrors} from '@mionjs/ts-go-run-types';
export const _ = createGetValidationErrors<{a: string}>();
`,
	}, "a.ts")
	site := siteFor(t, validationErrors, "a.ts")
	if got := keysWithPrefix(site.Deps, verrHash); len(got) == 0 {
		t.Errorf("createGetValidationErrors must pull a verr entry, got deps %v", site.Deps)
	}
	if validationErrors.Modules[verrHash+"_"+site.ID] == "" {
		t.Errorf("verr root module missing from response")
	}
}

// TestDemandScope_ValidationErrorsTransitiveChildren — createGetValidationErrors
// on a parent pulls verr entries for the parent AND its non-inlined children
// (so dependency calls resolve), even though only the parent has a call site.
func TestDemandScope_ValidationErrorsTransitiveChildren(t *testing.T) {
	resp := scanModules(t, map[string]string{
		"a.ts": `import {createGetValidationErrors} from '@mionjs/ts-go-run-types';
interface Child { c: string }
interface Parent { child: Child[] }
export const _ = createGetValidationErrors<Parent>();
`,
	}, "a.ts")
	site := siteFor(t, resp, "a.ts")
	verrKeys := keysWithPrefix(site.Deps, operations.PlainHash("validationErrors"))
	if len(verrKeys) < 2 {
		t.Errorf("expected the parent + transitive child verr entries (>=2), got %v in %v", verrKeys, site.Deps)
	}
}

// TestDemandScope_ItScopedReflectionOnly — a getRunTypeId-only (reflection)
// file yields ZERO modules: no createValidate site, no other family
// referencing val_ cross-family.
func TestDemandScope_ItScopedReflectionOnly(t *testing.T) {
	resp := scanModules(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/ts-go-run-types';
export const _ = getRunTypeId<{a: string; b: number}>();
`,
	}, "a.ts")
	site := siteFor(t, resp, "a.ts")
	if site.ID == "" {
		t.Fatalf("reflection site must still resolve an id")
	}
	if len(site.Deps) != 0 {
		t.Errorf("reflection-only site must have no deps, got %v", site.Deps)
	}
	if len(resp.Modules) != 0 {
		t.Errorf("reflection-only scan must render no modules, got %v", keysOf(resp.Modules))
	}
}

// TestDemandScope_ItScopedToCreateValidate_Static — a static-form
// createValidate<T>() site demands the `it` family: its closure is exactly
// the validate keys (no other family tags leak in).
func TestDemandScope_ItScopedToCreateValidate_Static(t *testing.T) {
	resp := scanModules(t, map[string]string{
		"a.ts": `import {createValidate} from '@mionjs/ts-go-run-types';
export const _ = createValidate<{a: string}>();
`,
	}, "a.ts")
	site := siteFor(t, resp, "a.ts")
	valHash := operations.PlainHash("validate")
	if keyPosition(site.Deps, valHash+"_"+site.ID) == -1 {
		t.Fatalf("createValidate must pull the val root %q, got %v", valHash+"_"+site.ID, site.Deps)
	}
	for _, dep := range site.Deps {
		if !strings.HasPrefix(dep, valHash+"_") {
			t.Errorf("validate-only site must pull ONLY validate keys, got %q in %v", dep, site.Deps)
		}
	}
}

// TestDemandScope_ItScopedToCreateValidate_Reflect — the reflection form
// (`createValidate(value)`) demands the same validate-only closure.
func TestDemandScope_ItScopedToCreateValidate_Reflect(t *testing.T) {
	resp := scanModules(t, map[string]string{
		"a.ts": `import {createValidate} from '@mionjs/ts-go-run-types';
const value: {a: string} = {a: 'x'};
export const _ = createValidate(value);
`,
	}, "a.ts")
	site := siteFor(t, resp, "a.ts")
	valHash := operations.PlainHash("validate")
	if keyPosition(site.Deps, valHash+"_"+site.ID) == -1 {
		t.Fatalf("reflect-form createValidate must pull the val root, got %v", site.Deps)
	}
	for _, dep := range site.Deps {
		if !strings.HasPrefix(dep, valHash+"_") {
			t.Errorf("reflect-form validate site must pull ONLY validate keys, got %q in %v", dep, site.Deps)
		}
	}
}

// TestDemandScope_ValidateOptionsVariantRoot — a ValidateOptions call site
// demands the VARIANT fnHash root, not the plain one.
func TestDemandScope_ValidateOptionsVariantRoot(t *testing.T) {
	resp := scanModules(t, map[string]string{
		"a.ts": `import {createValidate} from '@mionjs/ts-go-run-types';
export const _ = createValidate<string[]>(undefined, {noIsArrayCheck: true});
`,
	}, "a.ts")
	site := siteFor(t, resp, "a.ts")
	validateOp, _ := operations.ByName("validate")
	variantHash := operations.FnHashFor(validateOp, []string{"noIsArrayCheck"}, "")
	variantRoot := variantHash + "_" + site.ID
	if keyPosition(site.Deps, variantRoot) == -1 {
		t.Fatalf("options site must demand the variant root %q, got %v", variantRoot, site.Deps)
	}
	plainRoot := operations.PlainHash("validate") + "_" + site.ID
	if keyPosition(site.Deps, plainRoot) != -1 {
		t.Errorf("variant-only site must not also pull the plain root %q, got %v", plainRoot, site.Deps)
	}
}

// TestDemandScope_ItSeededByCrossFamilyUnion — the cross-family edge proof: a
// file that ONLY serializes a NON-merging union (conflicting shared prop, so
// the binary encoder discriminates members via the per-member validate
// validators) and NEVER calls createValidate MUST still pull val_ entries —
// closure assembly follows the toBinary entry's crossFamilyDeps. Without that
// the union round-trip silently corrupts (missing val_<member> ⇒ `?? true` ⇒
// first member always matches).
func TestDemandScope_ItSeededByCrossFamilyUnion(t *testing.T) {
	resp := scanModules(t, map[string]string{
		"a.ts": `import {createBinaryEncoder} from '@mionjs/ts-go-run-types';
export const _ = createBinaryEncoder<{a: bigint} | {a: Date}>();
`,
	}, "a.ts")
	site := siteFor(t, resp, "a.ts")
	// Sanity: the binary family IS demanded by createBinaryEncoder.
	tbRoot := operations.PlainHash("toBinary") + "_" + site.ID
	if keyPosition(site.Deps, tbRoot) == -1 {
		t.Fatalf("createBinaryEncoder must pull the tb root %q, got %v", tbRoot, site.Deps)
	}
	// The proof: no createValidate site, yet the union's per-member val_
	// entries ride the closure via the cross-family edges.
	valKeys := keysWithPrefix(site.Deps, operations.PlainHash("validate"))
	if len(valKeys) < 2 {
		t.Fatalf("cross-family seeding broken: a createBinaryEncoder-only union file must still pull val_ member entries, got %v in %v", valKeys, site.Deps)
	}
	for _, key := range valKeys {
		if resp.Modules[key] == "" {
			t.Errorf("cross-family val module %q missing body", key)
		}
	}
}
