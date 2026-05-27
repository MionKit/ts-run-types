package purefns

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-run-types/internal/program"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// countingLookup wraps a SourceFileLookup and tallies how many times
// SourceFile is invoked per path. Used by
// TestValidatePureFnDependencies_FileNeverReparsed to prove the lazy
// expansion path is single-shot per file.
type countingLookup struct {
	inner SourceFileLookup
	calls map[string]int
}

func newCountingLookup(inner SourceFileLookup) *countingLookup {
	return &countingLookup{inner: inner, calls: map[string]int{}}
}

func (c *countingLookup) SourceFile(absPath string) *ast.SourceFile {
	c.calls[absPath]++
	return c.inner.SourceFile(absPath)
}

// programForSources builds an in-memory program for the supplied
// (relativePath → source) map and returns the lookup plus the slice of
// absolute paths it ended up owning. Mirrors extractFromOverlay's
// pattern but exposes the lookup so tests can wrap it for counting.
func programForSources(t *testing.T, files map[string]string) (*program.Program, []string) {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := map[string]string{}
	abs := []string{}
	for name, source := range files {
		path := tspath.ResolvePath(cwd, name)
		overlay[path] = source
		abs = append(abs, path)
	}
	prog, err := program.NewInferred(program.Options{
		Cwd:            cwd,
		SingleThreaded: true,
		Overlay:        overlay,
	}, abs)
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	return prog, abs
}

func TestNewIndex_GetAndScanned(t *testing.T) {
	entries := []Entry{
		{Namespace: "mion", FunctionName: "asJSONString", BodyHash: "h1"},
		{Namespace: "mion", FunctionName: "safeKey", BodyHash: "h2"},
	}
	idx := NewIndex(entries, []string{"/a.ts", "/b.ts"})

	for _, key := range []string{"mion::asJSONString", "mion::safeKey"} {
		entry, ok := idx.Get(key)
		if !ok {
			t.Fatalf("expected to find %q", key)
		}
		if entry.Key() != key {
			t.Fatalf("entry.Key()=%q, want %q", entry.Key(), key)
		}
	}
	if _, ok := idx.Get("mion::missing"); ok {
		t.Fatal("expected miss for unknown key")
	}
	if !idx.Scanned("/a.ts") || !idx.Scanned("/b.ts") {
		t.Fatal("expected provided files to count as scanned")
	}
	if idx.Scanned("/c.ts") {
		t.Fatal("unprovided files must not be scanned")
	}
}

func TestValidatePureFnDependencies_AllSatisfied(t *testing.T) {
	prog, files := programForSources(t, map[string]string{
		"pure.ts": `declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
export const a = registerPureFnFactory('mion', 'asJSONString', function () { return function () { return 1; }; });
`,
	})
	entries, _ := ExtractFromProgram(prog, files)
	idx := NewIndex(entries, files)

	deps := []protocol.PureFnDep{
		{Namespace: "mion", FunctionName: "asJSONString", FilePath: files[0]},
	}
	diags := ValidatePureFnDependencies(deps, idx, prog)
	if len(diags) != 0 {
		t.Fatalf("expected no diagnostics, got %+v", diags)
	}
}

func TestValidatePureFnDependencies_MissingKey_PFE9012(t *testing.T) {
	// Empty index, dep references a key that doesn't exist anywhere.
	prog, files := programForSources(t, map[string]string{
		"empty.ts": `export const x = 1;`,
	})
	entries, _ := ExtractFromProgram(prog, files)
	idx := NewIndex(entries, files)

	deps := []protocol.PureFnDep{
		{Namespace: "mion", FunctionName: "doesNotExist", FilePath: ""},
	}
	diags := ValidatePureFnDependencies(deps, idx, prog)
	if len(diags) != 1 {
		t.Fatalf("expected exactly 1 diagnostic, got %d (%+v)", len(diags), diags)
	}
	if diags[0].Code != CodeMissingPureFnDep {
		t.Fatalf("expected %s, got %s", CodeMissingPureFnDep, diags[0].Code)
	}
	if len(diags[0].Args) == 0 || diags[0].Args[0] != "mion::doesNotExist" {
		t.Errorf("expected args[0]=mion::doesNotExist (the missing key), got %v", diags[0].Args)
	}
}

func TestValidatePureFnDependencies_LazyExpansion_FindsRegistration(t *testing.T) {
	// File a.ts is in the program but NOT in the original scan set.
	// b.ts is the only file scanned at extract time. The dep references
	// a key that's registered in a.ts. Validation lazily parses a.ts,
	// finds the registration, and emits NO diagnostic.
	prog, _ := programForSources(t, map[string]string{
		"a.ts": `declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
export const r = registerPureFnFactory('mion', 'asJSONString', function () { return function () { return 1; }; });
`,
		"b.ts": `export const x = 1;`,
	})
	// Manually find the absolute paths from the program.
	var aPath, bPath string
	for _, sf := range prog.TS.SourceFiles() {
		if sf == nil {
			continue
		}
		if strings.HasSuffix(sf.FileName(), "/a.ts") {
			aPath = sf.FileName()
		}
		if strings.HasSuffix(sf.FileName(), "/b.ts") {
			bPath = sf.FileName()
		}
	}
	if aPath == "" || bPath == "" {
		t.Fatalf("expected to resolve both a.ts and b.ts, got a=%q b=%q", aPath, bPath)
	}

	// Initial scan covers ONLY b.ts.
	entries, _ := ExtractFromProgram(prog, []string{bPath})
	idx := NewIndex(entries, []string{bPath})
	if _, ok := idx.Get("mion::asJSONString"); ok {
		t.Fatal("setup: key should NOT yet be in the index — it lives in unscanned a.ts")
	}

	// Dep points at the unscanned a.ts; lazy expansion should find it.
	deps := []protocol.PureFnDep{
		{Namespace: "mion", FunctionName: "asJSONString", FilePath: aPath},
	}
	diags := ValidatePureFnDependencies(deps, idx, prog)
	if len(diags) != 0 {
		t.Fatalf("lazy expansion should satisfy the dep, got %+v", diags)
	}
	if _, ok := idx.Get("mion::asJSONString"); !ok {
		t.Fatal("after lazy expansion, the key must be in the index")
	}
	if !idx.Scanned(aPath) {
		t.Fatal("after lazy expansion, the file must be marked scanned")
	}
}

func TestValidatePureFnDependencies_LazyExpansion_StillMissing(t *testing.T) {
	// File a.ts is in the program but doesn't contain the expected
	// registration. Lazy expansion parses it, finds nothing matching
	// the key, and emits PFE9012.
	prog, files := programForSources(t, map[string]string{
		"a.ts": `declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
export const x = registerPureFnFactory('mion', 'somethingElse', function () { return function () {}; });
`,
	})
	// Initial scan covers no files so a.ts is unscanned from idx's perspective.
	idx := NewIndex(nil, nil)

	deps := []protocol.PureFnDep{
		{Namespace: "mion", FunctionName: "asJSONString", FilePath: files[0]},
	}
	diags := ValidatePureFnDependencies(deps, idx, prog)
	if len(diags) != 1 || diags[0].Code != CodeMissingPureFnDep {
		t.Fatalf("expected one PFE9012 diagnostic, got %+v", diags)
	}
	if len(diags[0].Args) == 0 || diags[0].Args[0] != "mion::asJSONString" {
		t.Errorf("expected args[0]=mion::asJSONString (the missing key), got %v", diags[0].Args)
	}
	if !idx.Scanned(files[0]) {
		t.Fatal("the file must still be marked scanned (so future passes don't re-parse)")
	}
}

func TestValidatePureFnDependencies_DedupesRepeatedMisses(t *testing.T) {
	prog, files := programForSources(t, map[string]string{
		"empty.ts": `export const x = 1;`,
	})
	entries, _ := ExtractFromProgram(prog, files)
	idx := NewIndex(entries, files)

	// Same missing key referenced four times — should produce only one diagnostic.
	deps := []protocol.PureFnDep{
		{Namespace: "mion", FunctionName: "missing", FilePath: ""},
		{Namespace: "mion", FunctionName: "missing", FilePath: ""},
		{Namespace: "mion", FunctionName: "missing", FilePath: ""},
		{Namespace: "mion", FunctionName: "missing", FilePath: ""},
	}
	diags := ValidatePureFnDependencies(deps, idx, prog)
	if len(diags) != 1 {
		t.Fatalf("expected 1 dedupe-collapsed diagnostic, got %d (%+v)", len(diags), diags)
	}
}

func TestValidatePureFnDependencies_FileNeverReparsed(t *testing.T) {
	// Call validate twice with the same missing-but-pointing-at-a-file
	// dep. The lookup should be invoked exactly ONCE for the dep's
	// filePath — once expanded, the scanned flag prevents re-parse.
	prog, files := programForSources(t, map[string]string{
		"a.ts": `declare function registerPureFnFactory(ns: string, fn: string, factory: any): any;
export const r = registerPureFnFactory('mion', 'asJSONString', function () { return function () {}; });
`,
	})
	idx := NewIndex(nil, nil) // start empty so a.ts is unscanned

	counter := newCountingLookup(prog)
	deps := []protocol.PureFnDep{
		{Namespace: "mion", FunctionName: "asJSONString", FilePath: files[0]},
	}

	// First pass — should trigger one lookup on files[0].
	if diags := ValidatePureFnDependencies(deps, idx, counter); len(diags) != 0 {
		t.Fatalf("first pass should satisfy via lazy expand, got %+v", diags)
	}
	firstCallCount := counter.calls[files[0]]
	if firstCallCount == 0 {
		t.Fatalf("expected lookup to be called at least once on first pass, got %d", firstCallCount)
	}

	// Second pass with the same deps — must NOT re-parse, since the
	// file is already in idx.scanned. Lookup call count for files[0]
	// stays unchanged.
	if diags := ValidatePureFnDependencies(deps, idx, counter); len(diags) != 0 {
		t.Fatalf("second pass should be satisfied without re-parse, got %+v", diags)
	}
	if counter.calls[files[0]] != firstCallCount {
		t.Fatalf("second pass re-parsed: lookup count went from %d to %d", firstCallCount, counter.calls[files[0]])
	}
}
