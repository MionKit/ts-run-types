package purefns

import (
	"strings"
	"testing"
)

func depsOfFirst(t *testing.T, source string) ([]string, []Diagnostic) {
	t.Helper()
	entries, diags := extractFromOverlay(t, map[string]string{"a.ts": source})
	if len(entries) == 0 {
		t.Fatalf("expected at least one entry; diags=%+v", diags)
	}
	return entries[0].PureFnDependencies, diags
}

func TestDeps_LiteralKey_GetPureFn(t *testing.T) {
	deps, diags := depsOfFirst(t, `
import {registerPureFnFactory} from 'ts-runtypes';
export const _ = registerPureFnFactory('mion', 'consumer', function (utl) {
  return function _f(x: number) {
    return utl.getPureFn('mion::dep')(x);
  };
});`)
	for _, d := range diags {
		if d.Code == CodePurityDepNotLiteral {
			t.Fatalf("unexpected dep-literal diagnostic: %+v", d)
		}
	}
	if len(deps) != 1 || deps[0] != "mion::dep" {
		t.Fatalf("expected deps=[mion::dep], got %v", deps)
	}
}

func TestDeps_AllFourKeyMethods(t *testing.T) {
	deps, _ := depsOfFirst(t, `
import {registerPureFnFactory} from 'ts-runtypes';
export const _ = registerPureFnFactory('mion', 'multi', function (utl) {
  return function _f(x: any) {
    utl.getPureFn('mion::a')(x);
    utl.usePureFn('mion::b')(x);
    utl.getCompiledPureFn('mion::c');
    utl.hasPureFn('mion::d');
    return 1;
  };
});`)
	want := []string{"mion::a", "mion::b", "mion::c", "mion::d"}
	if strings.Join(deps, ",") != strings.Join(want, ",") {
		t.Fatalf("expected %v, got %v", want, deps)
	}
}

func TestDeps_FindCompiledPureFn_BareName(t *testing.T) {
	// findCompiledPureFn takes a bare fnName (no namespace). Emitted as
	// `::<fnName>` so the runtime suffix-matcher resolves it the same
	// way the old tracking proxy used to record it.
	deps, _ := depsOfFirst(t, `
import {registerPureFnFactory} from 'ts-runtypes';
export const _ = registerPureFnFactory('mion', 'findCaller', function (utl) {
  return function _f() {
    return utl.findCompiledPureFn('someBareName');
  };
});`)
	if len(deps) != 1 || deps[0] != "::someBareName" {
		t.Fatalf("expected ['::someBareName'], got %v", deps)
	}
}

func TestDeps_RenamedUtlParam(t *testing.T) {
	// User picks their own name for the rtUtils param — extractor reads
	// it off Parameters[0] rather than hardcoding `utl`.
	deps, _ := depsOfFirst(t, `
import {registerPureFnFactory} from 'ts-runtypes';
export const _ = registerPureFnFactory('mion', 'renamed', function (J) {
  return function _f(x: any) {
    return J.getPureFn('mion::renamedDep')(x);
  };
});`)
	if len(deps) != 1 || deps[0] != "mion::renamedDep" {
		t.Fatalf("expected ['mion::renamedDep'], got %v", deps)
	}
}

func TestDeps_FactoryLocalConst(t *testing.T) {
	// Dep key declared as a `const` *inside* the factory body. Local
	// table resolves it before the file-level fallback.
	deps, _ := depsOfFirst(t, `
import {registerPureFnFactory} from 'ts-runtypes';
export const _ = registerPureFnFactory('mion', 'local', function (utl) {
  const KEY = 'mion::localDep';
  return function _f(x: any) {
    return utl.getPureFn(KEY)(x);
  };
});`)
	if len(deps) != 1 || deps[0] != "mion::localDep" {
		t.Fatalf("expected ['mion::localDep'], got %v", deps)
	}
}

func TestDeps_FileLevelConst_Fallback(t *testing.T) {
	deps, _ := depsOfFirst(t, `
import {registerPureFnFactory} from 'ts-runtypes';
const FILE_KEY = 'mion::fileDep';
export const _ = registerPureFnFactory('mion', 'fileFb', function (utl) {
  return function _f(x: any) {
    return utl.getPureFn(FILE_KEY)(x);
  };
});`)
	if len(deps) != 1 || deps[0] != "mion::fileDep" {
		t.Fatalf("expected ['mion::fileDep'], got %v", deps)
	}
}

func TestDeps_DedupAndSort(t *testing.T) {
	// Same dep called multiple times in different positions → one
	// entry. Multiple distinct deps → sorted alphabetically.
	deps, _ := depsOfFirst(t, `
import {registerPureFnFactory} from 'ts-runtypes';
export const _ = registerPureFnFactory('mion', 'dedup', function (utl) {
  return function _f(x: any) {
    utl.getPureFn('mion::z')(x);
    utl.usePureFn('mion::a')(x);
    utl.getPureFn('mion::a')(x);
    return 1;
  };
});`)
	want := []string{"mion::a", "mion::z"}
	if strings.Join(deps, ",") != strings.Join(want, ",") {
		t.Fatalf("expected sorted-deduped %v, got %v", want, deps)
	}
}

func TestDeps_NonLiteralArg_PFE9013(t *testing.T) {
	_, diags := depsOfFirst(t, `
import {registerPureFnFactory} from 'ts-runtypes';
declare const buildKey: (n: number) => string;
export const _ = registerPureFnFactory('mion', 'bad', function (utl) {
  return function _f(x: any) {
    return utl.getPureFn(buildKey(1))(x);
  };
});`)
	found := false
	for _, d := range diags {
		if d.Code == CodePurityDepNotLiteral {
			found = true
			if len(d.Args) < 2 || d.Args[1] != "getPureFn" {
				t.Errorf("expected args[1]=getPureFn (the dep method name), got %v", d.Args)
			}
		}
	}
	if !found {
		t.Fatalf("expected PFE9013 for non-literal arg, got %+v", diags)
	}
}

func TestDeps_NoCalls_NilDeps(t *testing.T) {
	// Factory body has no utl.<dep-method>(...) calls → no deps slice.
	deps, _ := depsOfFirst(t, `
import {registerPureFnFactory} from 'ts-runtypes';
export const _ = registerPureFnFactory('mion', 'plain', function (utl) {
  return function _f(x: number) { return x + 1; };
});`)
	if len(deps) != 0 {
		t.Fatalf("expected no deps, got %v", deps)
	}
}

func TestDeps_NoFirstParam_NoExtraction(t *testing.T) {
	// Without a first parameter we can't identify utl; extractDeps
	// returns (nil, nil) so any utl-shaped calls in the body are
	// silently ignored. (They'd fail purity anyway — `utl` would be a
	// free identifier — but the dep extractor stays out of that path.)
	_, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerPureFnFactory} from 'ts-runtypes';
export const _ = registerPureFnFactory('mion', 'noParam', function () {
  return function _f() { return 1; };
});`,
	})
	for _, d := range diags {
		if d.Code == CodePurityDepNotLiteral {
			t.Fatalf("PFE9013 fired with no first param: %+v", d)
		}
	}
}
