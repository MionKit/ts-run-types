package jitfn

import (
	"bytes"
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/cachetpl"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

func renderToString(t *testing.T, dump protocol.Dump) string {
	t.Helper()
	var buf bytes.Buffer
	if err := IsTypeModule(&buf, dump); err != nil {
		t.Fatalf("IsTypeModule: %v", err)
	}
	return buf.String()
}

// TestIsTypeModule_SkeletonPresent — the rendered body must include the
// hand-authored skeleton wrappers, with the marker replaced.
func TestIsTypeModule_SkeletonPresent(t *testing.T) {
	out := renderToString(t, protocol.Dump{})
	for _, fragment := range []string{
		"'use strict';",
		"export function initCache(jitUtils)",
		"function factory(jitUtils,",
		"jitUtils.addToJitCache(entry);",
	} {
		if !strings.Contains(out, fragment) {
			t.Errorf("expected fragment %q in:\n%s", fragment, out)
		}
	}
	if strings.Contains(out, cachetpl.MarkerLine) {
		t.Errorf("marker line should be replaced, but is still present:\n%s", out)
	}
}

func TestIsTypeModule_NoSideEffectImport(t *testing.T) {
	out := renderToString(t, protocol.Dump{})
	if strings.Contains(out, "import ") {
		t.Errorf("rendered module must not import anything at top-level (pure module), got:\n%s", out)
	}
	if strings.Contains(out, "getJitUtils()") {
		t.Errorf("rendered module must not invoke getJitUtils() — utl is supplied via initCache(jitUtils), got:\n%s", out)
	}
}

func TestIsTypeModule_EmptyDump(t *testing.T) {
	out := renderToString(t, protocol.Dump{})
	if strings.Contains(out, "export const") {
		t.Errorf("module no longer emits named export consts; got:\n%s", out)
	}
	if !strings.Contains(out, "export function initCache") {
		t.Errorf("empty dump must still emit the initCache() function shell, got:\n%s", out)
	}
}

func TestIsTypeModule_SingleEntryShape(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{{ID: "abc123", Kind: protocol.KindString}},
	}
	out := renderToString(t, dump)
	want := "factory(jitUtils," +
		"'abc123'," +
		"'string'," +
		"'return typeof v === \\'string\\''," +
		"false," +
		"[]," +
		"[]," +
		"function get_isType_abc123(utl){return function isType_abc123(v){return typeof v === 'string'}}" +
		");"
	if !strings.Contains(out, want) {
		t.Errorf("expected entry line\n  %s\nin rendered module:\n%s", want, out)
	}
}

func TestIsTypeModule_UnsupportedKindSkipped(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{
			{ID: "n1", Kind: protocol.KindNumber},
			{ID: "b1", Kind: protocol.KindBoolean},
			{ID: "s1", Kind: protocol.KindString},
		},
	}
	out := renderToString(t, dump)
	if strings.Contains(out, "'n1'") {
		t.Error("KindNumber should be skipped (unsupported), but n1 was rendered")
	}
	if strings.Contains(out, "'b1'") {
		t.Error("KindBoolean should be skipped (unsupported), but b1 was rendered")
	}
	if !strings.Contains(out, "factory(jitUtils,'s1',") {
		t.Errorf("KindString should be rendered as factory call, got:\n%s", out)
	}
}

func TestIsTypeModule_NilRunTypeSkipped(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{
			nil,
			{ID: "s1", Kind: protocol.KindString},
			nil,
		},
	}
	out := renderToString(t, dump)
	if !strings.Contains(out, "factory(jitUtils,'s1',") {
		t.Error("nil entries should be skipped without affecting the real one")
	}
}

func TestIsTypeModule_DeterministicOutput(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{
			{ID: "a", Kind: protocol.KindString},
			{ID: "b", Kind: protocol.KindString},
		},
	}
	first := renderToString(t, dump)
	second := renderToString(t, dump)
	if first != second {
		t.Errorf("rendered output is non-deterministic:\nfirst:\n%s\nsecond:\n%s", first, second)
	}
}

func TestIsTypeModule_TypeNameUsesDeclaredOverride(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{
			{ID: "x", Kind: protocol.KindString, TypeName: "MyBrandedString"},
		},
	}
	out := renderToString(t, dump)
	if !strings.Contains(out, "'MyBrandedString'") {
		t.Errorf("expected declared TypeName to land as the J typeName arg, got:\n%s", out)
	}
}

func TestQuoteJS_EscapesSpecialChars(t *testing.T) {
	cases := map[string]string{
		"hello":       "'hello'",
		"with'quote":  `'with\'quote'`,
		"back\\slash": `'back\\slash'`,
		"new\nline":   `'new\nline'`,
		"tab\there":   `'tab\there'`,
	}
	for in, want := range cases {
		if got := quoteJS(in); got != want {
			t.Errorf("quoteJS(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestStringSliceJS_EmptyAndPopulated(t *testing.T) {
	if got := stringSliceJS(nil); got != "[]" {
		t.Errorf("nil → %q, want []", got)
	}
	if got := stringSliceJS([]string{}); got != "[]" {
		t.Errorf("empty → %q, want []", got)
	}
	if got := stringSliceJS([]string{"a", "b"}); got != "['a','b']" {
		t.Errorf("two → %q, want ['a','b']", got)
	}
}

func TestPureFnDepsJS_EmptyAndPopulated(t *testing.T) {
	if got := pureFnDepsJS(nil); got != "[]" {
		t.Errorf("nil → %q, want []", got)
	}
	if got := pureFnDepsJS([]protocol.PureFnDep{}); got != "[]" {
		t.Errorf("empty → %q, want []", got)
	}
	deps := []protocol.PureFnDep{
		{Namespace: "mion", FunctionName: "asJSONString", FilePath: "/abs/run-types-pure-fns.ts"},
		{Namespace: "mion", FunctionName: "newRunTypeErr", FilePath: "/abs/run-types-pure-fns.ts"},
	}
	want := "['mion::asJSONString','mion::newRunTypeErr']"
	if got := pureFnDepsJS(deps); got != want {
		t.Errorf("populated → %q, want %q", got, want)
	}
}

func TestIsTypeModule_PureFnDepsRendered(t *testing.T) {
	deps := pureFnDepsJS([]protocol.PureFnDep{
		{Namespace: "mion", FunctionName: "asJSONString", FilePath: "/some/abs/run-types-pure-fns.ts"},
	})
	if deps != "['mion::asJSONString']" {
		t.Fatalf("projection mismatch: got %q", deps)
	}
	if strings.Contains(deps, "/some/abs/") || strings.Contains(deps, "filePath") {
		t.Fatalf("filePath must NOT leak into emitted JS, got %q", deps)
	}
}
