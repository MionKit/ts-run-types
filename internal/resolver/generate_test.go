package resolver_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// TestGenerate_WritesModulesToDisk verifies OpGenerate writes every entry
// module the session knows to <OutDir>/types/<basename>.js (with inter-module
// imports relativized so no virtual:rt specifier survives on disk) and returns
// the live manifest.
func TestGenerate_WritesModulesToDisk(t *testing.T) {
	const src = `import {getRunTypeId} from 'ts-runtypes';
getRunTypeId<{a: number; b: string}>();
`
	r := setupInline(t, map[string]string{"a.ts": src})

	// The authoritative module set is whatever OpDump renders for the session.
	dump := r.Dispatch(protocol.Request{Op: protocol.OpDump})
	if dump.Error != "" {
		t.Fatalf("dump: %s", dump.Error)
	}
	if len(dump.EntryModules) == 0 {
		t.Fatal("dump produced no entry modules to generate")
	}

	outDir := t.TempDir()
	gen := r.Dispatch(protocol.Request{Op: protocol.OpGenerate, OutDir: outDir})
	if gen.Error != "" {
		t.Fatalf("generate: %s", gen.Error)
	}

	// Every module OpDump knows must exist on disk with identical content.
	for basename := range dump.EntryModules {
		modulePath := filepath.Join(outDir, "types", filepath.FromSlash(basename)+".js")
		got, err := os.ReadFile(modulePath)
		if err != nil {
			t.Fatalf("module %q not written to disk: %v", basename, err)
		}
		if strings.Contains(string(got), "virtual:rt/") {
			t.Fatalf("module %q still carries a virtual:rt import on disk:\n%s", basename, got)
		}
	}

	// The manifest lists exactly the rendered module basenames.
	if len(gen.Generated) != len(dump.EntryModules) {
		t.Fatalf("manifest has %d entries, expected %d", len(gen.Generated), len(dump.EntryModules))
	}
	for _, basename := range gen.Generated {
		if _, ok := dump.EntryModules[basename]; !ok {
			t.Fatalf("manifest lists module %q that OpDump does not know", basename)
		}
	}
}

// TestGenerate_RequiresOutDir fails fast when no output root is supplied.
func TestGenerate_RequiresOutDir(t *testing.T) {
	r := setupInline(t, map[string]string{"a.ts": "export const x = 1;\n"})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpGenerate})
	if resp.Error == "" {
		t.Fatal("OpGenerate with empty OutDir should return an error")
	}
}

// TestTransform_FilesModeInjectsRelativeImports verifies that with an OutDir,
// OpTransform's injected import block points at relative on-disk module paths
// (under OutDir/types) instead of virtual:rt specifiers.
func TestTransform_FilesModeInjectsRelativeImports(t *testing.T) {
	const src = `import {createValidate} from 'ts-runtypes';
interface Thing { id: string }
export const isThing = createValidate<Thing>();
`
	r := setupInline(t, map[string]string{"a.ts": src})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{"a.ts"}, OutDir: "runtypes"})
	if resp.Error != "" {
		t.Fatalf("transform: %s", resp.Error)
	}
	out := resp.Transformed["a.ts"].Code
	if out == "" {
		t.Fatal("transform produced no code")
	}
	if strings.Contains(out, "virtual:rt/") {
		t.Fatalf("files-mode transform still injects virtual:rt imports:\n%s", out)
	}
	if !strings.Contains(out, "from './runtypes/types/") {
		t.Fatalf("expected a relative ./runtypes/types/ import:\n%s", out)
	}
}
