package jitfn

import (
	"bytes"
	"strings"
	"testing"

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

func TestIsTypeModule_PreamblePresent(t *testing.T) {
	out := renderToString(t, protocol.Dump{})
	for _, line := range []string{
		"'use strict';",
		"import {getJitUtils} from '@mionjs/ts-go-run-types';",
		"const u = undefined;",
		"const J = (jitFnHash, typeName, code, isNoop, jitDependencies, pureFnDependencies, createJitFn) => {",
		"utl.addToJitCache(entry);",
		"return entry;",
	} {
		if !strings.Contains(out, line) {
			t.Errorf("preamble missing line %q in:\n%s", line, out)
		}
	}
}

func TestIsTypeModule_EmptyDump(t *testing.T) {
	out := renderToString(t, protocol.Dump{})
	if strings.Contains(out, "export const") {
		t.Errorf("expected no entries in empty dump, got:\n%s", out)
	}
}

func TestIsTypeModule_SingleEntryShape(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{{ID: "abc123", Kind: protocol.KindString}},
	}
	out := renderToString(t, dump)
	want := "export const get_isType_abc123 = J(" +
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
	if strings.Contains(out, "get_isType_n1") {
		t.Error("KindNumber should be skipped (unsupported), but n1 was rendered")
	}
	if strings.Contains(out, "get_isType_b1") {
		t.Error("KindBoolean should be skipped (unsupported), but b1 was rendered")
	}
	if !strings.Contains(out, "get_isType_s1") {
		t.Error("KindString should be rendered, but s1 is missing")
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
	if !strings.Contains(out, "get_isType_s1") {
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
