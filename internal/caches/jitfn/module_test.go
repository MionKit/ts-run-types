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
		"function factory(jitFnHash,",
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
	want := "factory(" +
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

// TestIsTypeModule_AtomicEmitBodies asserts the emit body for each
// atomic kind we ported from mion. One row per kind keeps the
// regression surface explicit — drift in any single arm of
// IsTypeEmitter.Emit lands as a focused failure here.
//
// Bodies must match the corresponding mion node's emitIsType output
// (mion-run-types:packages/run-types/src/nodes/atomic/<name>.ts).
// `return ` prefix is added by the walker / Finalize.
func TestIsTypeModule_AtomicEmitBodies(t *testing.T) {
	rows := []struct {
		name string
		rt   *protocol.RunType
		body string // expected inner-fn body (post-Finalize)
		noop bool   // true for any/unknown — Finalize collapses to noop, factory is skipped entirely
	}{
		{"number", &protocol.RunType{ID: "num", Kind: protocol.KindNumber}, "return Number.isFinite(v)", false},
		{"boolean", &protocol.RunType{ID: "boo", Kind: protocol.KindBoolean}, "return typeof v === 'boolean'", false},
		{"bigint", &protocol.RunType{ID: "big", Kind: protocol.KindBigInt}, "return typeof v === 'bigint'", false},
		{"symbol", &protocol.RunType{ID: "sym", Kind: protocol.KindSymbol}, "return typeof v === 'symbol'", false},
		{"null", &protocol.RunType{ID: "nul", Kind: protocol.KindNull}, "return v === null", false},
		{"undefined", &protocol.RunType{ID: "und", Kind: protocol.KindUndefined}, "return typeof v === 'undefined'", false},
		{"void", &protocol.RunType{ID: "voi", Kind: protocol.KindVoid}, "return v === undefined", false},
		{"never", &protocol.RunType{ID: "nev", Kind: protocol.KindNever}, "return false", false},
		{"any", &protocol.RunType{ID: "any", Kind: protocol.KindAny}, "", true},
		{"unknown", &protocol.RunType{ID: "unk", Kind: protocol.KindUnknown}, "", true},
		{"object", &protocol.RunType{ID: "obj", Kind: protocol.KindObject}, "return (typeof v === 'object' && v !== null)", false},
		{"regexp", &protocol.RunType{ID: "reg", Kind: protocol.KindRegexp}, "return (v instanceof RegExp)", false},
		{"date", &protocol.RunType{ID: "dat", Kind: protocol.KindClass, SubKind: protocol.SubKindDate}, "return (v instanceof Date && !isNaN(v.getTime()))", false},
	}
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) {
			dump := protocol.Dump{RunTypes: []*protocol.RunType{row.rt}}
			out := renderToString(t, dump)
			if row.noop {
				// Noop factories are skipped entirely — no `factory('<id>',` line
				// should appear in the rendered module.
				marker := "factory('" + row.rt.ID + "',"
				if strings.Contains(out, marker) {
					t.Errorf("noop kind %s should be skipped, but found %q in:\n%s", row.name, marker, out)
				}
				return
			}
			if !strings.Contains(out, row.body) {
				t.Errorf("expected body %q for kind %s in:\n%s", row.body, row.name, out)
			}
		})
	}
}

// TestIsTypeModule_LiteralEmitBodies covers the literal sub-cases
// (mion:literal.ts:88-105). One row per literal flavour: string,
// number, boolean, bigint (via Flags), symbol (via Flags + map),
// regexp (via map).
func TestIsTypeModule_LiteralEmitBodies(t *testing.T) {
	rows := []struct {
		name string
		rt   *protocol.RunType
		body string
	}{
		{
			"string", &protocol.RunType{ID: "ls", Kind: protocol.KindLiteral, Literal: "a"},
			"return v === 'a'",
		},
		{
			"number int", &protocol.RunType{ID: "li", Kind: protocol.KindLiteral, Literal: int64(2)},
			"return v === 2",
		},
		{
			"number float", &protocol.RunType{ID: "lf", Kind: protocol.KindLiteral, Literal: float64(1.5)},
			"return v === 1.5",
		},
		{
			"boolean", &protocol.RunType{ID: "lb", Kind: protocol.KindLiteral, Literal: true},
			"return v === true",
		},
		{
			"bigint", &protocol.RunType{ID: "lbi", Kind: protocol.KindLiteral, Literal: "1", Flags: []string{"bigint"}},
			"return v === 1n",
		},
		{
			"symbol", &protocol.RunType{ID: "lsy", Kind: protocol.KindLiteral, Literal: map[string]any{"symbol": "hello"}, Flags: []string{"symbol"}},
			"return typeof v === 'symbol' && v.description === 'hello'",
		},
		{
			"regexp", &protocol.RunType{ID: "lre", Kind: protocol.KindLiteral, Literal: map[string]any{"regexp": map[string]any{"source": "abc", "flags": "i"}}},
			"return v instanceof RegExp && v.source === 'abc' && v.flags === 'i'",
		},
	}
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) {
			dump := protocol.Dump{RunTypes: []*protocol.RunType{row.rt}}
			out := renderToString(t, dump)
			if !strings.Contains(out, row.body) {
				t.Errorf("expected body %q for literal %s in:\n%s", row.body, row.name, out)
			}
		})
	}
}

// TestIsTypeModule_EnumEmitBody covers KindEnum's mixed-value chain
// (mion:nodes/atomic/enum.ts:14). Uses the Color enum from
// enum.spec.ts: {Red=0, Green='green', Blue=2}. The Values slice
// carries the resolved values in declaration order; chain order
// follows.
func TestIsTypeModule_EnumEmitBody(t *testing.T) {
	rt := &protocol.RunType{
		ID:     "enm",
		Kind:   protocol.KindEnum,
		Values: []any{int64(0), "green", int64(2)},
	}
	out := renderToString(t, protocol.Dump{RunTypes: []*protocol.RunType{rt}})
	want := "return (v === 0 || v === 'green' || v === 2)"
	if !strings.Contains(out, want) {
		t.Errorf("expected enum body %q in:\n%s", want, out)
	}
}

func TestIsTypeModule_UnsupportedKindSkipped(t *testing.T) {
	// KindFunction and KindUnion remain unsupported after the atomic
	// emitIsType port — they belong to mion's function/collection
	// families, not the atomic family this emitter implements. The
	// renderer must skip them silently rather than panic, so kind-by-kind
	// rollout of follow-up families (collection, function) stays possible.
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{
			{ID: "f1", Kind: protocol.KindFunction},
			{ID: "u1", Kind: protocol.KindUnion},
			{ID: "s1", Kind: protocol.KindString},
		},
	}
	out := renderToString(t, dump)
	if strings.Contains(out, "'f1'") {
		t.Error("KindFunction should be skipped (unsupported), but f1 was rendered")
	}
	if strings.Contains(out, "'u1'") {
		t.Error("KindUnion should be skipped (unsupported), but u1 was rendered")
	}
	if !strings.Contains(out, "factory('s1',") {
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
	if !strings.Contains(out, "factory('s1',") {
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
