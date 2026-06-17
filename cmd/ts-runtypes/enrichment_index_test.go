package main

import (
	"reflect"
	"strings"
	"testing"
)

// TestParseMirror_IndexConsts indexes consts by their @rtType id (with the
// @rtIds child map) and falls back to the var name when no marker is present.
func TestParseMirror_IndexConsts(t *testing.T) {
	src := "import type { User } from '../../models/user';\n" +
		"import type { FriendlyType, MockData } from 'ts-runtypes';\n" +
		"\n" +
		"/** @rtType User#abc1234 @rtIds {name: string#n1, age: number#a2} */\n" +
		"export const friendlyUser: FriendlyType<User> = {\n" +
		"  $label: 'User',\n" +
		"  name: { $label: 'Name' },\n" +
		"  age: { $label: 'Age' },\n" +
		"};\n" +
		"\n" +
		"export const mockUser: MockData<User> = {\n" +
		"  name: { pool: ['Alice'] },\n" +
		"};\n"

	index := parseMirror("/rt/gen/models/user.ts", []byte(src))

	// friendlyUser is keyed by its @rtType id.
	friendly, ok := index.consts["abc1234"]
	if !ok {
		t.Fatalf("friendlyUser not indexed by @rtType id; keys=%v", index.constOrder)
	}
	if friendly.varName != "friendlyUser" || !friendly.isFriendly {
		t.Errorf("friendly entry = %+v", friendly)
	}
	if friendly.typeID != "abc1234" {
		t.Errorf("typeID = %q, want abc1234", friendly.typeID)
	}
	wantChildIDs := map[string]string{"name": "n1", "age": "a2"}
	if !reflect.DeepEqual(friendly.childIDs, wantChildIDs) {
		t.Errorf("childIDs = %v, want %v", friendly.childIDs, wantChildIDs)
	}
	if friendly.body == nil {
		t.Errorf("friendly body should be an object literal")
	}

	// mockUser has no marker → keyed by its var name.
	mock, ok := index.consts["mockUser"]
	if !ok {
		t.Fatalf("mockUser not indexed by var name; keys=%v", index.constOrder)
	}
	if mock.isFriendly {
		t.Errorf("mockUser should be a mock entry")
	}

	// Byte ranges are sane: the friendly entry's range must contain its var name
	// and span a `{ … }` body within the file.
	slice := src[friendly.tokenStart:friendly.end]
	if !strings.HasPrefix(slice, "export const friendlyUser") {
		t.Errorf("token range does not start at the const: %q", slice[:min(40, len(slice))])
	}
	leading := src[friendly.fullStart:friendly.tokenStart]
	if !strings.Contains(leading, "@rtType") {
		t.Errorf("leading-comment range should hold the JSDoc marker: %q", leading)
	}
}

// TestParseMirror_IndexImports indexes the source breadcrumb, the DSL import,
// and cross-file value imports, with the breadcrumb clause byte range.
func TestParseMirror_IndexImports(t *testing.T) {
	src := "import type { User, Post } from '../../models/user';\n" +
		"import type { FriendlyType, MockData } from 'ts-runtypes';\n" +
		"import { friendlyAddress, mockAddress } from './address';\n" +
		"export const friendlyUser: FriendlyType<User> = { $label: '' };\n"

	index := parseMirror("/rt/gen/models/user.ts", []byte(src))

	if index.breadcrumb == nil {
		t.Fatalf("breadcrumb not indexed")
	}
	if !reflect.DeepEqual(index.breadcrumb.names, []string{"User", "Post"}) {
		t.Errorf("breadcrumb names = %v", index.breadcrumb.names)
	}
	if index.breadcrumb.specifier != "../../models/user" {
		t.Errorf("breadcrumb specifier = %q", index.breadcrumb.specifier)
	}
	// The clause range must bound exactly the `User, Post` names.
	clause := src[index.breadcrumb.clauseStart:index.breadcrumb.clauseEnd]
	if clause != "User, Post" {
		t.Errorf("breadcrumb clause = %q, want %q", clause, "User, Post")
	}

	if index.dslImport == nil {
		t.Errorf("DSL import not indexed")
	}
	if len(index.valueImports) != 1 {
		t.Fatalf("want 1 value import; got %d", len(index.valueImports))
	}
	if !reflect.DeepEqual(index.valueImports[0].names, []string{"friendlyAddress", "mockAddress"}) {
		t.Errorf("value import names = %v", index.valueImports[0].names)
	}
}

// TestParseConstMarkers parses @rtType + @rtIds from a leading comment.
func TestParseConstMarkers(t *testing.T) {
	typeID, childIDs := parseConstMarkers("/** @rtType User#9f3a @rtIds {name: string#a1, age: number#b2, address: Address#c3} */")
	if typeID != "9f3a" {
		t.Errorf("typeID = %q, want 9f3a", typeID)
	}
	want := map[string]string{"name": "a1", "age": "b2", "address": "c3"}
	if !reflect.DeepEqual(childIDs, want) {
		t.Errorf("childIDs = %v, want %v", childIDs, want)
	}

	// No markers → empties.
	noID, noChild := parseConstMarkers("// just a plain comment")
	if noID != "" || noChild != nil {
		t.Errorf("expected empties; got %q / %v", noID, noChild)
	}
}

// TestHasCamelSuffix gates friendly*/mock* var recognition on a CamelCase suffix.
func TestHasCamelSuffix(t *testing.T) {
	cases := map[string]bool{
		"friendlyUser": true,
		"mockUser":     true,
		"friendly":     false,
		"mock":         false,
		"friendlyx":    false,
		"mockish":      false,
		"mockA":        true,
	}
	for name, want := range cases {
		got := isFriendlyVar(name) || isMockVar(name)
		if got != want {
			t.Errorf("recognized(%q) = %v, want %v", name, got, want)
		}
	}
}
