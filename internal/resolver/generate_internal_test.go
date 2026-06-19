package resolver

import (
	"os"
	"path/filepath"
	"testing"
)

// materializeModules writes new/changed modules and skips byte-identical ones
// so a dev file-watcher is not retriggered for content-addressed modules.
func TestMaterializeModules_WriteOnlyOnChange(t *testing.T) {
	dir := t.TempDir()
	modules := map[string]string{
		"val_Foo1234": "export const __rt_val_Foo1234=1;\n",
		"fns/val":     "export const __rt_fns_val=2;\n",
	}

	written, err := materializeModules(dir, modules)
	if err != nil {
		t.Fatalf("first write: %v", err)
	}
	if len(written) != 2 {
		t.Fatalf("first write should write both modules, wrote %v", written)
	}
	// Slashed basenames nest into subdirs.
	if _, err := os.Stat(filepath.Join(dir, "fns", "val.js")); err != nil {
		t.Fatalf("fns/val.js not written: %v", err)
	}

	// Identical second pass touches nothing.
	written, err = materializeModules(dir, modules)
	if err != nil {
		t.Fatalf("second write: %v", err)
	}
	if len(written) != 0 {
		t.Fatalf("unchanged modules must not be rewritten, got %v", written)
	}

	// Changing one module rewrites only that one.
	modules["val_Foo1234"] = "export const __rt_val_Foo1234=99;\n"
	written, err = materializeModules(dir, modules)
	if err != nil {
		t.Fatalf("third write: %v", err)
	}
	if len(written) != 1 || written[0] != "val_Foo1234" {
		t.Fatalf("only the changed module should be rewritten, got %v", written)
	}
}

// pruneStaleModules removes generated files no longer in the live set and
// leaves live ones untouched.
func TestPruneStaleModules(t *testing.T) {
	dir := t.TempDir()
	live := map[string]string{"keep": "export const __rt_keep=1;\n"}
	if _, err := materializeModules(dir, live); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "stale.js"), []byte("old\n"), 0o644); err != nil {
		t.Fatalf("write stale: %v", err)
	}

	if err := pruneStaleModules(dir, live); err != nil {
		t.Fatalf("prune: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "stale.js")); !os.IsNotExist(err) {
		t.Fatalf("stale.js should have been pruned (err=%v)", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "keep.js")); err != nil {
		t.Fatalf("keep.js should survive prune: %v", err)
	}
}
