package batchcompile

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/compiler/sourcerewrite"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/protocol"
	"github.com/mionkit/ts-runtypes/internal/resolver"
)

// Minimal ambient marker declaration so `ts-runtypes` resolves in a bare temp
// project (the marker scanner honors the `declare module` form).
const runtypesDTS = `declare module 'ts-runtypes' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
}
`

const tsconfigJSON = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "rootDir": "src",
    "outDir": "dist",
    "sourceMap": true,
    "strict": true
  },
  "include": ["src"]
}
`

const fooTS = `import {getRunTypeId} from 'ts-runtypes';
type User = {id: number; name: string};
export const userId = getRunTypeId<User>();
`

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

// TestCompile_EmitsJsWithComposedMap is the load-bearing integration test: a
// real temp project compiles to .js + a source map, and the map — after
// composing our rewrite map with tsgo's emit map — points at the ORIGINAL .ts
// line, not the import-shifted rewritten line.
func TestCompile_EmitsJsWithComposedMap(t *testing.T) {
	tmp := t.TempDir()
	writeFile(t, filepath.Join(tmp, "tsconfig.json"), tsconfigJSON)
	writeFile(t, filepath.Join(tmp, "src", "runtypes.d.ts"), runtypesDTS)
	writeFile(t, filepath.Join(tmp, "src", "foo.ts"), fooTS)

	result, err := Run(Options{
		Cwd:          tmp,
		TsconfigPath: "tsconfig.json",
		GenDir:       filepath.Join(tmp, "__runtypes"),
		ResolverOpts: resolver.Options{
			Cwd:        tmp,
			EmitMode:   constants.EmitCode,
			ModuleMode: constants.ModuleModeDefault,
			InlineMode: constants.InlineModeDefault,
			CacheDir:   filepath.Join(tmp, ".cache"),
		},
	})
	if err != nil {
		t.Fatalf("compile: %v", err)
	}

	// The .js was emitted (types stripped) with the rewrite applied.
	jsPath := filepath.Join(tmp, "dist", "foo.js")
	jsBytes, err := os.ReadFile(jsPath)
	if err != nil {
		t.Fatalf("read emitted js: %v", err)
	}
	js := string(jsBytes)
	if !strings.Contains(js, "getRunTypeId(") {
		t.Errorf("emitted js missing the call:\n%s", js)
	}
	if !strings.Contains(js, "__rt_") {
		t.Errorf("emitted js missing the injected binding:\n%s", js)
	}
	// virtual:rt specifiers must be relativized to the cache dir in the OUTPUT.
	if strings.Contains(js, "virtual:rt") {
		t.Errorf("emitted js still has a virtual:rt specifier (not relativized):\n%s", js)
	}
	if !strings.Contains(js, "__runtypes/types/") {
		t.Errorf("emitted js import not relativized to the cache dir:\n%s", js)
	}

	// The composed map must resolve to the ORIGINAL foo.ts (3 lines, 0..2), NOT
	// the rewritten source (4 lines — an import line prepended). If composition
	// were missing, a segment would reference original line 3.
	mapBytes, err := os.ReadFile(jsPath + ".map")
	if err != nil {
		t.Fatalf("read emitted map: %v", err)
	}
	var sm protocol.SourceMap
	if err := json.Unmarshal(mapBytes, &sm); err != nil {
		t.Fatalf("parse map: %v", err)
	}
	if len(sm.Sources) != 1 || !strings.HasSuffix(sm.Sources[0], "foo.ts") {
		t.Errorf("map sources = %v, want [..foo.ts]", sm.Sources)
	}
	maxLine, sawCallLine := -1, false
	for _, line := range sourcerewrite.OriginalLines(sm.Mappings) {
		if line > maxLine {
			maxLine = line
		}
		if line == 2 {
			sawCallLine = true
		}
	}
	if maxLine > 2 {
		t.Errorf("composed map references original line %d — composition failed (rewritten line leaked)", maxLine)
	}
	if !sawCallLine {
		t.Errorf("composed map has no segment for the call line (original line 2)")
	}

	// Cache modules were generated to <genDir>/types.
	if len(result.Caches) == 0 {
		t.Errorf("no cache modules generated")
	}
	if entries, _ := os.ReadDir(filepath.Join(tmp, "__runtypes", "types")); len(entries) == 0 {
		t.Errorf("no cache module files written under __runtypes/types")
	}
}
