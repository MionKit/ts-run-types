package main

import (
	"path/filepath"
	"reflect"
	"testing"
)

// TestParseBreadcrumb verifies the source breadcrumb is extracted (skipping the
// ts-runtypes DSL import) and the type names + specifier are returned.
func TestParseBreadcrumb(t *testing.T) {
	tests := []struct {
		name      string
		contents  string
		wantNames []string
		wantSpec  string
		wantOK    bool
	}{
		{
			name: "source breadcrumb after dsl import",
			contents: "import type { User, Post } from '../../src/models/user';\n" +
				"import type { FriendlyType, MockData } from 'ts-runtypes';\n\n" +
				"export const friendlyUser = {};\n",
			wantNames: []string{"User", "Post"},
			wantSpec:  "../../src/models/user",
			wantOK:    true,
		},
		{
			name: "dsl import first still skipped",
			contents: "import type { FriendlyType, MockData } from 'ts-runtypes';\n" +
				"import type { Address } from './address';\n",
			wantNames: []string{"Address"},
			wantSpec:  "./address",
			wantOK:    true,
		},
		{
			name:      "aliased import uses original name",
			contents:  "import type { Address as Addr } from './address';\n",
			wantNames: []string{"Address"},
			wantSpec:  "./address",
			wantOK:    true,
		},
		{
			name:     "no source breadcrumb",
			contents: "import type { FriendlyType } from 'ts-runtypes';\nexport const x = {};\n",
			wantOK:   false,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			names, spec, ok := parseBreadcrumb(test.contents)
			if ok != test.wantOK {
				t.Fatalf("ok = %v, want %v", ok, test.wantOK)
			}
			if !ok {
				return
			}
			if !reflect.DeepEqual(names, test.wantNames) {
				t.Errorf("names = %v, want %v", names, test.wantNames)
			}
			if spec != test.wantSpec {
				t.Errorf("spec = %q, want %q", spec, test.wantSpec)
			}
		})
	}
}

// TestSourceDeclaresType verifies the textual declaration scan across the
// declaration forms gen tracks.
func TestSourceDeclaresType(t *testing.T) {
	src := "export interface User { name: string }\n" +
		"type Alias = string;\n" +
		"export abstract class Base {}\n" +
		"enum Color { Red }\n" +
		"declare type Ambient = number;\n"
	declared := []string{"User", "Alias", "Base", "Color", "Ambient"}
	for _, name := range declared {
		if !sourceDeclaresType(src, name) {
			t.Errorf("sourceDeclaresType should find %q", name)
		}
	}
	for _, name := range []string{"Missing", "Use", "Use"} {
		if sourceDeclaresType(src, name) {
			t.Errorf("sourceDeclaresType should NOT find %q", name)
		}
	}
	// A substring of a declared name must not match (word boundary).
	if sourceDeclaresType(src, "Use") {
		t.Errorf("sourceDeclaresType matched a substring of 'User'")
	}
}

// TestResolveBreadcrumb verifies the specifier resolves relative to the mirror
// file's directory, probing .ts then .d.ts.
func TestResolveBreadcrumb(t *testing.T) {
	dir := t.TempDir()
	mirror := filepath.Join(dir, "rt", "gen", "models", "user.ts")
	mustMkdirAll(t, filepath.Dir(mirror))
	source := filepath.Join(dir, "src", "models", "user.ts")
	writeTestFile(t, source, "export interface User {}")

	// The breadcrumb (relative, ext-stripped) from the mirror back to the source.
	spec := importSpecifier(mirror, source)
	got := resolveBreadcrumb(mirror, spec)
	if filepath.Clean(got) != filepath.Clean(source) {
		t.Errorf("resolveBreadcrumb(%q, %q) = %q, want %q", mirror, spec, got, source)
	}
}

// TestCheckMirrorFile_Clean: a mirror whose breadcrumb resolves to a source that
// still declares the type, at the correct mirror location, yields no findings.
func TestCheckMirrorFile_Clean(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{ "compilerOptions": { "rootDir": "src" } }`)
	writeTestFile(t, filepath.Join(dir, "src", "models", "user.ts"), "export interface User { name: string }")
	mirror := filepath.Join(dir, "runtypes", "generated", "models", "user.ts")
	writeTestFile(t, mirror, "import type { User } from '../../../src/models/user';\n"+
		"import type { FriendlyType } from 'ts-runtypes';\n\nexport const friendlyUser = {};\n")

	findings := checkMirrorFile(mirror, "")
	if len(findings) != 0 {
		t.Errorf("clean mirror should have no findings; got %+v", findings)
	}
}

// TestCheckMirrorFile_GE002: a deleted source produces a GE002 error.
func TestCheckMirrorFile_GE002(t *testing.T) {
	dir := t.TempDir()
	mirror := filepath.Join(dir, "runtypes", "generated", "models", "user.ts")
	writeTestFile(t, mirror, "import type { User } from '../../../src/models/user';\n")

	findings := checkMirrorFile(mirror, "")
	if len(findings) != 1 || findings[0].Code != "GE002" {
		t.Fatalf("want one GE002 finding; got %+v", findings)
	}
}

// TestCheckMirrorFile_GE003: a source that no longer declares the type produces
// a GE003 error.
func TestCheckMirrorFile_GE003(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, filepath.Join(dir, "tsconfig.json"), `{ "compilerOptions": { "rootDir": "src" } }`)
	writeTestFile(t, filepath.Join(dir, "src", "models", "user.ts"), "export interface Renamed {}")
	mirror := filepath.Join(dir, "runtypes", "generated", "models", "user.ts")
	writeTestFile(t, mirror, "import type { User } from '../../../src/models/user';\n")

	findings := checkMirrorFile(mirror, "")
	codes := map[string]bool{}
	for _, finding := range findings {
		codes[finding.Code] = true
	}
	if !codes["GE003"] {
		t.Errorf("want a GE003 finding; got %+v", findings)
	}
}

// TestIsUnder covers the source-vs-mirror gate that lets `gen <source> --check`
// redirect to the source's mirror instead of misreading the source as a mirror.
func TestIsUnder(t *testing.T) {
	dir := filepath.FromSlash("/repo/runtypes/generated")
	tests := []struct {
		name string
		path string
		want bool
	}{
		{"the dir itself", dir, true},
		{"a mirror inside", filepath.Join(dir, "models", "user.ts"), true},
		{"a source outside", filepath.FromSlash("/repo/src/models/user.ts"), false},
		{"a sibling prefix-sharing dir", filepath.FromSlash("/repo/runtypes/generated-x/a.ts"), false},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := isUnder(dir, test.path); got != test.want {
				t.Errorf("isUnder(%q, %q) = %v, want %v", dir, test.path, got, test.want)
			}
		})
	}
}
