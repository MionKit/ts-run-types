package jitfn

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

func newTestWalker() *Walker {
	rt := &protocol.RunType{Kind: protocol.KindString, ID: "root"}
	return NewWalker(rt, "isType_root", IsTypeEmitter{})
}

func TestNewWalker_DepsSlicesNonNilEmpty(t *testing.T) {
	w := newTestWalker()
	if w.JitDependencies == nil {
		t.Fatal("JitDependencies must be initialized as non-nil empty slice (rendered as `[]`, not `null`)")
	}
	if len(w.JitDependencies) != 0 {
		t.Fatalf("expected JitDependencies len 0, got %d", len(w.JitDependencies))
	}
	if w.PureFnDependencies == nil {
		t.Fatal("PureFnDependencies must be initialized as non-nil empty slice")
	}
	if len(w.PureFnDependencies) != 0 {
		t.Fatalf("expected PureFnDependencies len 0, got %d", len(w.PureFnDependencies))
	}
}

func TestUpdateDependencies_AppendsOnce(t *testing.T) {
	w := newTestWalker()
	w.UpdateDependencies("childA", false)
	w.UpdateDependencies("childB", false)
	if len(w.JitDependencies) != 2 {
		t.Fatalf("expected 2 deps, got %d (%v)", len(w.JitDependencies), w.JitDependencies)
	}
	if w.JitDependencies[0] != "childA" || w.JitDependencies[1] != "childB" {
		t.Fatalf("expected [childA childB], got %v", w.JitDependencies)
	}
}

func TestUpdateDependencies_DedupesRepeats(t *testing.T) {
	w := newTestWalker()
	w.UpdateDependencies("childA", false)
	w.UpdateDependencies("childA", false)
	w.UpdateDependencies("childA", false)
	if len(w.JitDependencies) != 1 {
		t.Fatalf("expected 1 dep after repeated adds, got %d (%v)", len(w.JitDependencies), w.JitDependencies)
	}
}

func TestUpdateDependencies_SkipsNoopChildren(t *testing.T) {
	w := newTestWalker()
	w.UpdateDependencies("childNoop", true)
	w.UpdateDependencies("childReal", false)
	if len(w.JitDependencies) != 1 {
		t.Fatalf("expected only the non-noop child, got %v", w.JitDependencies)
	}
	if w.JitDependencies[0] != "childReal" {
		t.Fatalf("expected [childReal], got %v", w.JitDependencies)
	}
}

// pureFnFixtureProgram builds an in-memory program holding a single TS
// file at <cwd>/pure-fns.ts whose body is the supplied source. Returns
// the program + absolute file path. Used by AddPureFnDependency tests
// to feed real registerPureFnFactory call sites to the integrity scan.
func pureFnFixtureProgram(t *testing.T, source string) (*program.Program, string) {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	filePath := tspath.ResolvePath(cwd, "pure-fns.ts")
	prog, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: true,
		Overlay:        map[string]string{filePath: source},
	}, []string{filePath})
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	return prog, filePath
}

func TestAddPureFnDependency_HappyPath(t *testing.T) {
	prog, filePath := pureFnFixtureProgram(t, `
declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
export const cpf = registerPureFnFactory('mion', 'asJSONString', function () { return JSON.stringify; });
`)
	w := newTestWalker()
	w.SourceLookup = prog
	if err := w.AddPureFnDependency("mion", "asJSONString", filePath); err != nil {
		t.Fatalf("AddPureFnDependency: %v", err)
	}
	if len(w.PureFnDependencies) != 1 {
		t.Fatalf("expected 1 dep, got %d (%v)", len(w.PureFnDependencies), w.PureFnDependencies)
	}
	got := w.PureFnDependencies[0]
	if got.Namespace != "mion" || got.FunctionName != "asJSONString" || got.FilePath != filePath {
		t.Fatalf("triple mismatch: got %+v", got)
	}
}

func TestAddPureFnDependency_MissingLookup(t *testing.T) {
	w := newTestWalker()
	err := w.AddPureFnDependency("mion", "asJSONString", "/nope.ts")
	if err == nil || !strings.Contains(err.Error(), "requires a SourceLookup") {
		t.Fatalf("expected SourceLookup error, got %v", err)
	}
}

func TestAddPureFnDependency_MissingFile(t *testing.T) {
	prog, _ := pureFnFixtureProgram(t, `export const x = 1;`)
	w := newTestWalker()
	w.SourceLookup = prog
	err := w.AddPureFnDependency("mion", "asJSONString", "/path/not/in/program.ts")
	if err == nil || !strings.Contains(err.Error(), "source file not in program") {
		t.Fatalf("expected missing-file error, got %v", err)
	}
}

func TestAddPureFnDependency_NoMatchingCall(t *testing.T) {
	prog, filePath := pureFnFixtureProgram(t, `
declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
export const cpf = registerPureFnFactory('mion', 'somethingElse', function () { return null; });
`)
	w := newTestWalker()
	w.SourceLookup = prog
	err := w.AddPureFnDependency("mion", "asJSONString", filePath)
	if err == nil || !strings.Contains(err.Error(), "not found in") {
		t.Fatalf("expected not-found error, got %v", err)
	}
	if len(w.PureFnDependencies) != 0 {
		t.Fatalf("nothing should be appended on failure, got %v", w.PureFnDependencies)
	}
}

func TestAddPureFnDependency_WrongNamespace(t *testing.T) {
	prog, filePath := pureFnFixtureProgram(t, `
declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
export const cpf = registerPureFnFactory('other', 'asJSONString', function () { return null; });
`)
	w := newTestWalker()
	w.SourceLookup = prog
	err := w.AddPureFnDependency("mion", "asJSONString", filePath)
	if err == nil || !strings.Contains(err.Error(), "not found in") {
		t.Fatalf("expected not-found error when namespace differs, got %v", err)
	}
}

func TestAddPureFnDependency_Dedup(t *testing.T) {
	prog, filePath := pureFnFixtureProgram(t, `
declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
export const cpf = registerPureFnFactory('mion', 'asJSONString', function () { return JSON.stringify; });
`)
	w := newTestWalker()
	w.SourceLookup = prog
	for i := 0; i < 3; i++ {
		if err := w.AddPureFnDependency("mion", "asJSONString", filePath); err != nil {
			t.Fatalf("AddPureFnDependency (iter %d): %v", i, err)
		}
	}
	if len(w.PureFnDependencies) != 1 {
		t.Fatalf("expected 1 dep after dedup, got %d (%v)", len(w.PureFnDependencies), w.PureFnDependencies)
	}
}
