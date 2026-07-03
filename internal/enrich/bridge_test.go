package enrich_test

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/enrich"
	"github.com/mionkit/ts-runtypes/internal/program"
	"github.com/mionkit/ts-runtypes/internal/resolver"
)

// resolveFixture builds an inferred Program from in-memory sources, a resolver
// over it, and resolves typeName in relPath to a canonical RunType. Hermetic —
// no disk fixtures. Mirrors the resolver suite's setupInline overlay pattern.
func resolveFixture(t *testing.T, relPath, typeName string, sources map[string]string) *enrich.Resolved {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := make(map[string]string, len(sources))
	fileNames := make([]string, 0, len(sources))
	var absTarget string
	for rel, code := range sources {
		abs := tspath.ResolvePath(cwd, rel)
		overlay[abs] = code
		fileNames = append(fileNames, abs)
		if rel == relPath {
			absTarget = abs
		}
	}

	prog, err := program.NewInferred(program.Options{Cwd: cwd, Overlay: overlay}, fileNames)
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(res.Close)

	resolved, err := enrich.ResolveType(prog, res.Checker(), res.Cache(), absTarget, typeName)
	if err != nil {
		t.Fatalf("ResolveType(%s): %v", typeName, err)
	}
	return resolved
}

func TestResolveType_Describe(t *testing.T) {
	resolved := resolveFixture(t, "user.ts", "User", map[string]string{
		"user.ts": "export interface User { name: string; age: number }\n",
	})
	got := enrich.Describe(resolved.Node, enrich.DescribeOptions{
		TypeName: "User",
		Resolve:  resolved.Resolve,
	})
	if !strings.Contains(got, "name: string") {
		t.Errorf("Describe missing 'name: string'; got:\n%s", got)
	}
	if !strings.Contains(got, "age: number") {
		t.Errorf("Describe missing 'age: number'; got:\n%s", got)
	}
}

func TestResolveType_EmitFriendly(t *testing.T) {
	resolved := resolveFixture(t, "user.ts", "User", map[string]string{
		"user.ts": "export interface User { name: string; age: number }\n",
	})
	got := enrich.EmitFriendly(resolved.Node, enrich.EmitOptions{
		VarName:  "userFriendly",
		TypeName: "User",
		Resolve:  resolved.Resolve,
	})
	if !strings.Contains(got, "FriendlyType<User>") {
		t.Errorf("EmitFriendly missing 'FriendlyType<User>'; got:\n%s", got)
	}
	if !strings.Contains(got, "name:") {
		t.Errorf("EmitFriendly missing 'name:' entry; got:\n%s", got)
	}
}

func TestResolveType_UnknownTypeErrors(t *testing.T) {
	cwd := tspath.NormalizePath(t.TempDir())
	abs := tspath.ResolvePath(cwd, "user.ts")
	overlay := map[string]string{abs: "export interface User { name: string }\n"}
	prog, err := program.NewInferred(program.Options{Cwd: cwd, Overlay: overlay}, []string{abs})
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(res.Close)

	if _, err := enrich.ResolveType(prog, res.Checker(), res.Cache(), abs, "Missing"); err == nil {
		t.Fatal("ResolveType(Missing): expected error, got nil")
	}
}

// TestSkeletons_ObjectLiteralOnly pins the batch (`gen --files`) skeleton path:
// FriendlySkeleton / MockSkeleton return ONLY the object literal (no
// `export const … =` wrapper, no type annotation) so the test harness compares
// against a case's authored initializer.
func TestSkeletons_ObjectLiteralOnly(t *testing.T) {
	resolved := resolveFixture(t, "user.ts", "User", map[string]string{
		"user.ts": "export interface User { name: string; tags: string[] }\n",
	})
	friendly := enrich.FriendlySkeleton(resolved.Node, resolved.Resolve)
	mock := enrich.MockSkeleton(resolved.Node, resolved.Resolve)

	if strings.Contains(friendly, "export const") || strings.Contains(friendly, "FriendlyType<") {
		t.Errorf("FriendlySkeleton should be a bare object literal; got:\n%s", friendly)
	}
	if !strings.HasPrefix(strings.TrimSpace(friendly), "{") {
		t.Errorf("FriendlySkeleton should start with '{'; got:\n%s", friendly)
	}
	for _, want := range []string{"rt$label: ''", "name:", "tags:", "rt$items"} {
		if !strings.Contains(friendly, want) {
			t.Errorf("FriendlySkeleton missing %q; got:\n%s", want, friendly)
		}
	}
	if strings.Contains(mock, "export const") {
		t.Errorf("MockSkeleton should be a bare object literal; got:\n%s", mock)
	}
	for _, want := range []string{"name: {pool: []}", "rt$length: [1, 3]"} {
		if !strings.Contains(mock, want) {
			t.Errorf("MockSkeleton missing %q; got:\n%s", want, mock)
		}
	}
}
