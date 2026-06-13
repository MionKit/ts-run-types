package enrichment_test

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
	"github.com/mionkit/ts-runtypes/internal/program"
	"github.com/mionkit/ts-runtypes/internal/resolver"
)

// resolveFixture builds an inferred Program from in-memory sources, a resolver
// over it, and resolves typeName in relPath to a canonical RunType. Hermetic —
// no disk fixtures. Mirrors the resolver suite's setupInline overlay pattern.
func resolveFixture(t *testing.T, relPath, typeName string, sources map[string]string) *enrichment.Resolved {
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

	resolved, err := enrichment.ResolveType(prog, res, absTarget, typeName)
	if err != nil {
		t.Fatalf("ResolveType(%s): %v", typeName, err)
	}
	return resolved
}

func TestResolveType_Describe(t *testing.T) {
	resolved := resolveFixture(t, "user.ts", "User", map[string]string{
		"user.ts": "export interface User { name: string; age: number }\n",
	})
	got := enrichment.Describe(resolved.Node, enrichment.DescribeOptions{
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
	got := enrichment.EmitFriendly(resolved.Node, enrichment.EmitOptions{
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

	if _, err := enrichment.ResolveType(prog, res, abs, "Missing"); err == nil {
		t.Fatal("ResolveType(Missing): expected error, got nil")
	}
}
