package marker

import (
	"path/filepath"
	"testing"
)

// Locks in the package.json walk used by DeclaredInModule. The Case 1
// path (ambient `declare module` declarations) is already covered
// end-to-end by the resolver test suite over internal/testfixtures —
// those fixtures rely on it for marker recognition. This file covers
// Case 2 (on-disk package.json with matching "name").

func TestPackageNameForFile_FindsEnclosingName(t *testing.T) {
	root := t.TempDir()
	pkgDir := filepath.Join(root, "my-pkg-dir-name")
	srcDir := filepath.Join(pkgDir, "src")
	mustMkdir(t, srcDir)
	writeFile(t, filepath.Join(pkgDir, "package.json"), `{"name": "@scope/published-name"}`)

	got := packageNameForFile(filepath.Join(srcDir, "index.ts"))
	if got != "@scope/published-name" {
		t.Fatalf("expected @scope/published-name, got %q", got)
	}
}

func TestPackageNameForFile_OnDiskDirNameIgnored(t *testing.T) {
	// Regression for the workspace-self-import case: the on-disk dir
	// is `ts-go-run-types/` but the package's published name is
	// `@mionjs/ts-go-run-types`. The old path-fragment heuristic
	// missed this; the package.json walk gets it right.
	root := t.TempDir()
	pkgDir := filepath.Join(root, "ts-go-run-types")
	srcDir := filepath.Join(pkgDir, "src")
	mustMkdir(t, srcDir)
	writeFile(t, filepath.Join(pkgDir, "package.json"), `{"name": "@mionjs/ts-go-run-types"}`)

	got := packageNameForFile(filepath.Join(srcDir, "index.ts"))
	if got != "@mionjs/ts-go-run-types" {
		t.Fatalf("expected @mionjs/ts-go-run-types, got %q", got)
	}
}

func TestPackageNameForFile_NoPackageJson(t *testing.T) {
	root := t.TempDir()
	srcDir := filepath.Join(root, "src")
	mustMkdir(t, srcDir)

	got := packageNameForFile(filepath.Join(srcDir, "orphan.ts"))
	if got != "" {
		t.Fatalf("expected empty, got %q", got)
	}
}

func TestPackageNameForFile_PackageJsonWithoutName(t *testing.T) {
	root := t.TempDir()
	pkgDir := filepath.Join(root, "pkg")
	srcDir := filepath.Join(pkgDir, "src")
	mustMkdir(t, srcDir)
	writeFile(t, filepath.Join(pkgDir, "package.json"), `{"version": "1.0.0"}`)
	// A monorepo root above with a name — the walk must STOP at the
	// nameless package.json, not continue up to this one.
	writeFile(t, filepath.Join(root, "package.json"), `{"name": "monorepo-root"}`)

	got := packageNameForFile(filepath.Join(srcDir, "file.ts"))
	if got != "" {
		t.Fatalf("expected empty (nameless boundary halts walk), got %q", got)
	}
}

func TestPackageNameForFile_MalformedJson(t *testing.T) {
	root := t.TempDir()
	pkgDir := filepath.Join(root, "pkg")
	srcDir := filepath.Join(pkgDir, "src")
	mustMkdir(t, srcDir)
	writeFile(t, filepath.Join(pkgDir, "package.json"), `{not json`)

	got := packageNameForFile(filepath.Join(srcDir, "file.ts"))
	if got != "" {
		t.Fatalf("expected empty on malformed json, got %q", got)
	}
}

func TestPackageNameForFile_NestedPackageWins(t *testing.T) {
	// Inner package.json takes precedence over outer one. Mirrors
	// node_modules-style nesting.
	root := t.TempDir()
	outerSrc := filepath.Join(root, "outer-src")
	mustMkdir(t, outerSrc)
	writeFile(t, filepath.Join(root, "package.json"), `{"name": "outer"}`)

	innerPkg := filepath.Join(root, "node_modules", "inner-pkg")
	innerSrc := filepath.Join(innerPkg, "dist")
	mustMkdir(t, innerSrc)
	writeFile(t, filepath.Join(innerPkg, "package.json"), `{"name": "@vendor/inner"}`)

	outer := packageNameForFile(filepath.Join(outerSrc, "a.ts"))
	if outer != "outer" {
		t.Fatalf("outer-src: expected outer, got %q", outer)
	}
	inner := packageNameForFile(filepath.Join(innerSrc, "b.ts"))
	if inner != "@vendor/inner" {
		t.Fatalf("inner: expected @vendor/inner, got %q", inner)
	}
}
