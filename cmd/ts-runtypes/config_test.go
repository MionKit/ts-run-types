package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/enrich/mirror"
)

// TestStripJSONC verifies comment + trailing-comma stripping is string-aware.
func TestStripJSONC(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"line comment", "{\n  // hi\n  \"a\": 1\n}", "{\n  \n  \"a\": 1\n}"},
		{"block comment", "{ /* hi */ \"a\": 1 }", "{  \"a\": 1 }"},
		{"trailing comma object", "{ \"a\": 1, }", "{ \"a\": 1 }"},
		{"trailing comma array", "[ 1, 2, ]", "[ 1, 2 ]"},
		{"slash in string kept", "{ \"a\": \"http://x\" }", "{ \"a\": \"http://x\" }"},
		{"comma in string kept", "{ \"a\": \"x,\" }", "{ \"a\": \"x,\" }"},
		{"escaped quote in string", "{ \"a\": \"x\\\"//\" }", "{ \"a\": \"x\\\"//\" }"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := stripJSONC(test.in); got != test.want {
				t.Errorf("stripJSONC(%q) = %q, want %q", test.in, got, test.want)
			}
		})
	}
}

// TestResolveEnrichConfig_NoTsconfig: with no tsconfig anywhere up the tree,
// projectRoot and rootDir both fall back to the file's dir and enrichDir to the
// default (resolved under the file's dir).
func TestResolveEnrichConfig_NoTsconfig(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "models", "user.ts")
	mustMkdirAll(t, filepath.Dir(target))

	config := resolveEnrichConfig(target, "")
	if config.ProjectRoot != filepath.Join(dir, "models") {
		t.Errorf("ProjectRoot = %q, want %q", config.ProjectRoot, filepath.Join(dir, "models"))
	}
	if config.RootDir != filepath.Join(dir, "models") {
		t.Errorf("RootDir = %q, want %q", config.RootDir, filepath.Join(dir, "models"))
	}
	wantEnrich := filepath.Join(dir, "models", defaultEnrichDir)
	if config.EnrichDir != wantEnrich {
		t.Errorf("EnrichDir = %q, want %q", config.EnrichDir, wantEnrich)
	}
}

// TestResolveEnrichConfig_TsconfigPlugin: the plugins[name=ts-runtypes] entry
// supplies enrichDir; rootDir comes from compilerOptions.rootDir; projectRoot is
// the tsconfig dir.
func TestResolveEnrichConfig_TsconfigPlugin(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{
  // ts-runtypes config
  "compilerOptions": {
    "rootDir": "src",
    "plugins": [
      { "name": "other" },
      {
        "name": "ts-runtypes",
        "enrichDir": "rt/gen",
        "moduleMode": "allSingle",
        "emitMode": "both",
        "inlineMode": "allInternal",
      },
    ],
  },
}`)
	target := filepath.Join(dir, "src", "models", "user.ts")
	mustMkdirAll(t, filepath.Dir(target))

	config := resolveEnrichConfig(target, "")
	if config.ProjectRoot != dir {
		t.Errorf("ProjectRoot = %q, want %q", config.ProjectRoot, dir)
	}
	if config.RootDir != filepath.Join(dir, "src") {
		t.Errorf("RootDir = %q, want %q", config.RootDir, filepath.Join(dir, "src"))
	}
	if config.EnrichDir != filepath.Join(dir, "rt/gen") {
		t.Errorf("EnrichDir = %q, want %q", config.EnrichDir, filepath.Join(dir, "rt/gen"))
	}
	if config.ModuleMode != "allSingle" || config.EmitMode != "both" || config.InlineMode != "allInternal" {
		t.Errorf("plugin modes not stored: %+v", config)
	}
}

// TestResolveEnrichConfig_FlagWins: --enrich-dir overrides both tsconfig and
// default.
func TestResolveEnrichConfig_FlagWins(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{
  "compilerOptions": { "plugins": [ { "name": "ts-runtypes", "enrichDir": "rt/gen" } ] }
}`)
	target := filepath.Join(dir, "user.ts")

	config := resolveEnrichConfig(target, "flag/dir")
	if config.EnrichDir != filepath.Join(dir, "flag/dir") {
		t.Errorf("EnrichDir = %q, want %q (flag should win)", config.EnrichDir, filepath.Join(dir, "flag/dir"))
	}
}

// TestResolveEnrichConfig_GarbageTsconfig: an unparseable tsconfig falls back to
// tsconfig-dir defaults (projectRoot/rootDir = tsconfig dir) without crashing.
func TestResolveEnrichConfig_GarbageTsconfig(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `this is not json at all {{{`)
	target := filepath.Join(dir, "user.ts")

	config := resolveEnrichConfig(target, "")
	if config.ProjectRoot != dir || config.RootDir != dir {
		t.Errorf("garbage tsconfig should fall back to tsconfig dir; got %+v", config)
	}
	if config.EnrichDir != filepath.Join(dir, defaultEnrichDir) {
		t.Errorf("EnrichDir = %q, want default", config.EnrichDir)
	}
}

// TestMirrorPath verifies the mirror path math, including the .d.ts → .ts
// collapse and the under-rootDir relativization.
func TestMirrorPath(t *testing.T) {
	config := enrichConfig{
		ProjectRoot: "/proj",
		RootDir:     "/proj/src",
		EnrichDir:   "/proj/runtypes/generated",
	}
	tests := []struct {
		name string
		src  string
		want string
	}{
		{"ts under root", "/proj/src/models/user.ts", "/proj/runtypes/generated/models/user.ts"},
		{"d.ts collapses to ts", "/proj/src/types/api.d.ts", "/proj/runtypes/generated/types/api.ts"},
		{"top-level file", "/proj/src/index.ts", "/proj/runtypes/generated/index.ts"},
		{"outside root falls back to base", "/elsewhere/foo.ts", "/proj/runtypes/generated/foo.ts"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := config.mirrorPath(test.src); got != test.want {
				t.Errorf("mirrorPath(%q) = %q, want %q", test.src, got, test.want)
			}
		})
	}
}

// TestImportSpecifier verifies relative module specifier computation: forward
// slashes, leading ./, stripped extension.
func TestImportSpecifier(t *testing.T) {
	tests := []struct {
		name   string
		from   string
		target string
		want   string
	}{
		{"sibling", "/a/b/mirror.ts", "/a/b/other.ts", "./other"},
		{"up two then source", "/proj/rt/gen/models/user.ts", "/proj/src/models/user.ts", "../../../src/models/user"},
		{"d.ts target stripped", "/a/b/mirror.ts", "/a/c/api.d.ts", "../c/api"},
		{"same dir mirror to mirror", "/rt/models/user.ts", "/rt/models/address.ts", "./address"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := mirror.ImportSpecifier(test.from, test.target); got != test.want {
				t.Errorf("ImportSpecifier(%q, %q) = %q, want %q", test.from, test.target, got, test.want)
			}
		})
	}
}

func writeTestFile(t *testing.T, path, content string) {
	t.Helper()
	mustMkdirAll(t, filepath.Dir(path))
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("write %s: %v", path, err)
	}
}

func mustMkdirAll(t *testing.T, dir string) {
	t.Helper()
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("mkdir %s: %v", dir, err)
	}
}
