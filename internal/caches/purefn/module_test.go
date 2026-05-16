package purefn

import (
	"bytes"
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/cachetpl"
)

func TestPureFnsModule_EmptyInput(t *testing.T) {
	var buf bytes.Buffer
	if err := PureFnsModule(&buf, nil); err != nil {
		t.Fatalf("PureFnsModule: %v", err)
	}
	got := buf.String()
	// Skeleton wrappers must always be present, even with zero entries.
	for _, fragment := range []string{
		"'use strict';",
		"export function initCache(jitUtils)",
		"function factory(",
	} {
		if !strings.Contains(got, fragment) {
			t.Errorf("expected fragment %q in empty render:\n%s", fragment, got)
		}
	}
	if strings.Contains(got, cachetpl.MarkerLine) {
		t.Errorf("marker line should be replaced even with empty body, got:\n%s", got)
	}
}

func TestPureFnsModule_SingleEntry(t *testing.T) {
	var buf bytes.Buffer
	entries := []Entry{{
		Namespace:    "mion",
		FunctionName: "asJSONString",
		ParamNames:   []string{},
		Code:         "return function _f() {};",
		BodyHash:     "aBcDeFgHiJkLmN",
	}}
	if err := PureFnsModule(&buf, entries); err != nil {
		t.Fatalf("PureFnsModule: %v", err)
	}
	got := buf.String()
	// 6-arg factory: key, bodyHash, paramNames, code, pureFnDependencies, createPureFn.
	// createPureFn is the inline `function(utl){<code>}` literal templated from `code`.
	want := "factory('mion::asJSONString','aBcDeFgHiJkLmN',[],'return function _f() {};',[],function(utl){return function _f() {};});"
	if !strings.Contains(got, want) {
		t.Errorf("expected entry line\n  %s\nin rendered module:\n%s", want, got)
	}
}

func TestPureFnsModule_WithDependencies(t *testing.T) {
	var buf bytes.Buffer
	entries := []Entry{{
		Namespace:          "mion",
		FunctionName:       "consumer",
		ParamNames:         []string{"x"},
		Code:               "return function _f(x){return utl.getPureFn('mion::dep')(x);};",
		BodyHash:           "h1",
		PureFnDependencies: []string{"mion::dep", "other::helper"},
	}}
	if err := PureFnsModule(&buf, entries); err != nil {
		t.Fatalf("PureFnsModule: %v", err)
	}
	got := buf.String()
	if !strings.Contains(got, `['mion::dep','other::helper']`) {
		t.Errorf("dep array not rendered correctly:\n%s", got)
	}
}

func TestPureFnsModule_QuoteEscapes(t *testing.T) {
	var buf bytes.Buffer
	entries := []Entry{{
		Namespace:    "test",
		FunctionName: "withQuote",
		ParamNames:   []string{"x"},
		Code:         "return 'has \\'inner\\'';",
		BodyHash:     "abc1234567890_",
	}}
	if err := PureFnsModule(&buf, entries); err != nil {
		t.Fatalf("PureFnsModule: %v", err)
	}
	got := buf.String()
	if !strings.Contains(got, `['x']`) {
		t.Errorf("paramNames not rendered correctly:\n%s", got)
	}
	if !strings.Contains(got, `\\`) {
		t.Errorf("backslashes not escaped in code field:\n%s", got)
	}
}

func TestPureFnsModule_DeterministicOrder(t *testing.T) {
	entries := []Entry{
		{Namespace: "a", FunctionName: "x", Code: "return 1;", BodyHash: "h1", ParamNames: []string{}},
		{Namespace: "b", FunctionName: "y", Code: "return 2;", BodyHash: "h2", ParamNames: []string{}},
	}
	var buf1, buf2 bytes.Buffer
	_ = PureFnsModule(&buf1, entries)
	_ = PureFnsModule(&buf2, entries)
	if buf1.String() != buf2.String() {
		t.Errorf("non-deterministic output:\nfirst:\n%s\nsecond:\n%s", buf1.String(), buf2.String())
	}
}

func TestReplacements_NullsOutFactoryArg(t *testing.T) {
	entries := []Entry{{
		Namespace:       "mion",
		FunctionName:    "foo",
		FilePath:        "/abs/a.ts",
		FactoryArgStart: 50,
		FactoryArgEnd:   100,
	}}
	got := Replacements(entries)
	if len(got) != 1 {
		t.Fatalf("expected 1 replacement, got %d (%+v)", len(got), got)
	}
	if got[0].File != "/abs/a.ts" || got[0].Start != 50 || got[0].End != 100 || got[0].Text != "null" {
		t.Errorf("unexpected replacement: %+v", got[0])
	}
}

func TestReplacements_SkipsEntriesWithoutBounds(t *testing.T) {
	// Synthetic entries (e.g. those built in module_test fixtures above)
	// lack FactoryArgStart/End. Replacements must skip them so we don't
	// emit zero-width or nonsensical rewrites.
	entries := []Entry{
		{Namespace: "a", FunctionName: "b", FilePath: "/x.ts"},                 // missing bounds
		{Namespace: "c", FunctionName: "d", FactoryArgStart: 10, FactoryArgEnd: 20}, // missing FilePath
	}
	if got := Replacements(entries); len(got) != 0 {
		t.Errorf("expected zero replacements for malformed entries, got %+v", got)
	}
}
