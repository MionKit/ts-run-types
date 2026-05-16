package parsedfn

import (
	"strings"
	"testing"
)

// withFactoryBody wraps a body into a complete registerPureFnFactory call
// so we can drive checkPurity end-to-end via ExtractFromProgram. Returns
// only the diagnostics that came back; entries are ignored for the
// purity test surface (we already cover the happy-path emission paths
// in extract_test.go).
func withFactoryBody(t *testing.T, body string) []Diagnostic {
	t.Helper()
	source := `declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
export const _ = registerPureFnFactory('test', 'fn', function () {
` + body + `
});`
	_, diags := extractFromOverlay(t, map[string]string{"case.ts": source})
	return diags
}

// purityCodes returns the codes of every PFE9006-PFE9011 diagnostic in
// diags. Order is preserved (sorted alphabetically by site upstream, so
// the slice is deterministic across runs).
func purityCodes(diags []Diagnostic) []string {
	var out []string
	for _, diag := range diags {
		switch diag.Code {
		case CodePurityThis, CodePurityAwait, CodePurityYield,
			CodePurityDynamicImport, CodePurityForbidden, CodePurityClosure:
			out = append(out, diag.Code)
		}
	}
	return out
}

func firstDiagWithCode(diags []Diagnostic, code string) (Diagnostic, bool) {
	for _, diag := range diags {
		if diag.Code == code {
			return diag, true
		}
	}
	return Diagnostic{}, false
}

// ──────────────────────────────────────────────────────────────────────
// Passing cases — factory body parses as a pure function.
// ──────────────────────────────────────────────────────────────────────

func TestPurity_PureBody_NoDiagnostics(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner(x: number) {
    const y = x * 2;
    return y + 1;
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("expected zero purity diagnostics, got %v\n(all diags: %+v)", got, diags)
	}
}

func TestPurity_AllowedGlobals_NoDiagnostics(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner(x: any) {
    const a = Math.floor(x);
    const b = JSON.stringify(x);
    const c = parseInt('42');
    const d = Array.from([1, 2]);
    const e = Number.isFinite(a);
    return [a, b, c, d, e];
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("allowed globals should not flag, got %v", got)
	}
}

func TestPurity_LocalDecls_NoDiagnostics(t *testing.T) {
	diags := withFactoryBody(t, `
  const factor = 2;
  return function inner(x: number) {
    return x * factor;
  };`)
	// `factor` is in the outer factory's scope; inner reaches up through
	// scope.parent.has, which returns true. No diagnostic.
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("local decls should be in scope, got %v", got)
	}
}

func TestPurity_ForOf_LocalIterator_NoDiagnostics(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner(items: number[]) {
    let total = 0;
    for (const item of items) {
      total = total + item;
    }
    return total;
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("for-of binding should be in scope, got %v", got)
	}
}

func TestPurity_TryCatch_LocalBinding_NoDiagnostics(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner() {
    try {
      return 1;
    } catch (err) {
      return err;
    }
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("catch binding should be in scope, got %v", got)
	}
}

func TestPurity_DestructuredLocal_NoDiagnostics(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner(arg: any) {
    const {a, b} = arg;
    return a + b;
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("destructured locals should be in scope, got %v", got)
	}
}

func TestPurity_ObjectLiteralKey_NotAReference(t *testing.T) {
	// `eval` here is a property KEY on an object literal — not a reference
	// to the global eval. Must not trigger PFE9010.
	diags := withFactoryBody(t, `
  return function inner() {
    const obj = {eval: 1, fetch: 2};
    return obj;
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("forbidden names as object keys should not flag, got %v", got)
	}
}

func TestPurity_Temporal_Allowed(t *testing.T) {
	// User-requested delta: Temporal is in allowedGlobals.
	diags := withFactoryBody(t, `
  return function inner() {
    return Temporal.PlainDate.from('2024-01-01');
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("Temporal must be allowed, got %v", got)
	}
}

// ──────────────────────────────────────────────────────────────────────
// Failing cases — purity violations.
// ──────────────────────────────────────────────────────────────────────

func TestPurity_This_PFE9006(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner() {
    return this;
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityThis); !ok {
		t.Fatalf("expected PFE9006 for `this`, got %+v", diags)
	}
}

func TestPurity_Await_PFE9007(t *testing.T) {
	diags := withFactoryBody(t, `
  return async function inner() {
    return await Promise.resolve(1);
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityAwait); !ok {
		t.Fatalf("expected PFE9007 for await, got %+v", diags)
	}
}

func TestPurity_Yield_PFE9008(t *testing.T) {
	diags := withFactoryBody(t, `
  return function* inner() {
    yield 1;
    yield 2;
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityYield); !ok {
		t.Fatalf("expected PFE9008 for yield, got %+v", diags)
	}
}

func TestPurity_DynamicImport_PFE9009(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner() {
    return import('./other.js');
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityDynamicImport); !ok {
		t.Fatalf("expected PFE9009 for dynamic import, got %+v", diags)
	}
}

func TestPurity_Eval_PFE9010(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner() {
    return eval('1+1');
  };`)
	diag, ok := firstDiagWithCode(diags, CodePurityForbidden)
	if !ok {
		t.Fatalf("expected PFE9010 for eval, got %+v", diags)
	}
	if !strings.Contains(diag.Message, "eval") {
		t.Errorf("message should reference `eval`, got %q", diag.Message)
	}
}

func TestPurity_Fetch_PFE9010(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner() {
    return fetch('/api');
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityForbidden); !ok {
		t.Fatalf("expected PFE9010 for fetch, got %+v", diags)
	}
}

func TestPurity_Process_PFE9010(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner() {
    return process.env.HOME;
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityForbidden); !ok {
		t.Fatalf("expected PFE9010 for process, got %+v", diags)
	}
}

func TestPurity_SetTimeout_PFE9010(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner() {
    setTimeout(() => {}, 0);
    return 1;
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityForbidden); !ok {
		t.Fatalf("expected PFE9010 for setTimeout, got %+v", diags)
	}
}

func TestPurity_GlobalThis_Forbidden(t *testing.T) {
	// User-requested delta: globalThis is now in forbiddenIdentifiers
	// (moved out of allowedGlobals).
	diags := withFactoryBody(t, `
  return function inner() {
    return globalThis;
  };`)
	diag, ok := firstDiagWithCode(diags, CodePurityForbidden)
	if !ok {
		t.Fatalf("expected PFE9010 for globalThis, got %+v", diags)
	}
	if !strings.Contains(diag.Message, "globalThis") {
		t.Errorf("message should reference `globalThis`, got %q", diag.Message)
	}
}

func TestPurity_ClosureVariable_PFE9011(t *testing.T) {
	// Reference an identifier that's neither in scope nor a known global.
	// In the test fixture, `SECRET` is referenced from inside the factory
	// without being declared. (mion's ESLint rule sees it as a closure
	// variable from the outer module; here, since the factory's parent
	// chain doesn't include any module-level declaration of SECRET, the
	// scope check fails and PFE9011 fires.)
	diags := withFactoryBody(t, `
  return function inner() {
    return SECRET;
  };`)
	diag, ok := firstDiagWithCode(diags, CodePurityClosure)
	if !ok {
		t.Fatalf("expected PFE9011 for SECRET closure, got %+v", diags)
	}
	if !strings.Contains(diag.Message, "SECRET") {
		t.Errorf("message should reference `SECRET`, got %q", diag.Message)
	}
}

func TestPurity_ModuleLevelConst_StillClosureViolation(t *testing.T) {
	// The whole point of the purity rule: a `const` declared OUTSIDE the
	// factory but INSIDE the same module — i.e. a real closure variable
	// at module scope — must still fail. `withFactoryBody` can't express
	// this shape (it wraps the body directly inside the call), so this
	// test uses extractFromOverlay to author the full source.
	_, diags := extractFromOverlay(t, map[string]string{
		"case.ts": `declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
const name = 'John';
export const sayHello = registerPureFnFactory('myNamespace', 'sayHello', function () {
  return function _greet() {
    return 'Hello ' + name;
  };
});
`,
	})
	diag, ok := firstDiagWithCode(diags, CodePurityClosure)
	if !ok {
		t.Fatalf("expected PFE9011 for module-level `name` closure, got %+v", diags)
	}
	if !strings.Contains(diag.Message, "name") {
		t.Errorf("message should reference `name`, got %q", diag.Message)
	}
}

func TestPurity_ModuleLevelFunction_StillClosureViolation(t *testing.T) {
	// A module-level helper function called from inside the factory is
	// also a closure access — the factory should not reach for it.
	_, diags := extractFromOverlay(t, map[string]string{
		"case.ts": `declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
function helper(x: number) { return x * 2; }
export const x = registerPureFnFactory('ns', 'fn', function () {
  return function _f(n: number) {
    return helper(n);
  };
});
`,
	})
	diag, ok := firstDiagWithCode(diags, CodePurityClosure)
	if !ok {
		t.Fatalf("expected PFE9011 for module-level `helper` closure, got %+v", diags)
	}
	if !strings.Contains(diag.Message, "helper") {
		t.Errorf("message should reference `helper`, got %q", diag.Message)
	}
}

func TestPurity_ImportedSymbol_StillClosureViolation(t *testing.T) {
	// Imports are bindings in the module scope. Referencing one from
	// inside the factory body is a closure access and must fail.
	_, diags := extractFromOverlay(t, map[string]string{
		"case.ts": `declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
declare const someImportedHelper: (n: number) => number;
export const x = registerPureFnFactory('ns', 'fn', function () {
  return function _f(n: number) {
    return someImportedHelper(n);
  };
});
`,
	})
	diag, ok := firstDiagWithCode(diags, CodePurityClosure)
	if !ok {
		t.Fatalf("expected PFE9011 for module-level imported symbol, got %+v", diags)
	}
	if !strings.Contains(diag.Message, "someImportedHelper") {
		t.Errorf("message should reference `someImportedHelper`, got %q", diag.Message)
	}
}

func TestPurity_NestedFunctionScopeBoundary(t *testing.T) {
	// Outer factory declares `X`. Inner function declares its own `X`
	// (via parameter). Reference to `X` inside the inner should resolve
	// to the inner's binding, not the outer's — no diagnostic.
	diags := withFactoryBody(t, `
  const X = 1;
  return function inner(X: number) {
    return X + 1;
  };`)
	if got := purityCodes(diags); len(got) != 0 {
		t.Fatalf("inner param `X` should shadow outer; got %v", got)
	}
}

func TestPurity_MultipleViolations_AllReported(t *testing.T) {
	diags := withFactoryBody(t, `
  return function inner() {
    eval('1');
    return fetch('/');
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityForbidden); !ok {
		t.Fatalf("expected at least one PFE9010, got %+v", diags)
	}
	// Verify both eval and fetch surface.
	var hasEval, hasFetch bool
	for _, diag := range diags {
		if diag.Code != CodePurityForbidden {
			continue
		}
		if strings.Contains(diag.Message, "eval") {
			hasEval = true
		}
		if strings.Contains(diag.Message, "fetch") {
			hasFetch = true
		}
	}
	if !hasEval || !hasFetch {
		t.Fatalf("expected both eval AND fetch flagged; hasEval=%v hasFetch=%v\ndiags=%+v", hasEval, hasFetch, diags)
	}
}

func TestPurity_PropertyAccess_NotAReference(t *testing.T) {
	// `obj.eval` — `eval` here is a property name on `obj`, not a
	// reference to the global eval. Should not fire.
	diags := withFactoryBody(t, `
  return function inner(obj: any) {
    return obj.eval;
  };`)
	if _, ok := firstDiagWithCode(diags, CodePurityForbidden); ok {
		t.Fatalf("property access name should not trigger PFE9010; diags=%+v", diags)
	}
}
