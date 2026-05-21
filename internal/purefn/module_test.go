package purefn

import (
	"bytes"
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/cachetpl"
)

func TestParsedFnsModule_EmptyInput(t *testing.T) {
	var buf bytes.Buffer
	if err := ParsedFnsModule(&buf, nil); err != nil {
		t.Fatalf("ParsedFnsModule: %v", err)
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

func TestParsedFnsModule_SingleEntry(t *testing.T) {
	var buf bytes.Buffer
	entries := []ParsedFn{{
		Namespace:    "mion",
		FunctionName: "asJSONString",
		ParamNames:   []string{},
		Code:         "return function _f() {};",
		BodyHash:     "aBcDeFgHiJkLmN",
	}}
	if err := ParsedFnsModule(&buf, entries); err != nil {
		t.Fatalf("ParsedFnsModule: %v", err)
	}
	got := buf.String()
	want := "factory(jitUtils,'mion::asJSONString','aBcDeFgHiJkLmN',[],'return function _f() {};');"
	if !strings.Contains(got, want) {
		t.Errorf("expected entry line\n  %s\nin rendered module:\n%s", want, got)
	}
}

func TestParsedFnsModule_QuoteEscapes(t *testing.T) {
	var buf bytes.Buffer
	entries := []ParsedFn{{
		Namespace:    "test",
		FunctionName: "withQuote",
		ParamNames:   []string{"x"},
		Code:         "return 'has \\'inner\\'';",
		BodyHash:     "abc1234567890_",
	}}
	if err := ParsedFnsModule(&buf, entries); err != nil {
		t.Fatalf("ParsedFnsModule: %v", err)
	}
	got := buf.String()
	if !strings.Contains(got, `['x']`) {
		t.Errorf("paramNames not rendered correctly:\n%s", got)
	}
	if !strings.Contains(got, `\\`) {
		t.Errorf("backslashes not escaped in code field:\n%s", got)
	}
}

func TestParsedFnsModule_DeterministicOrder(t *testing.T) {
	entries := []ParsedFn{
		{Namespace: "a", FunctionName: "x", Code: "return 1;", BodyHash: "h1", ParamNames: []string{}},
		{Namespace: "b", FunctionName: "y", Code: "return 2;", BodyHash: "h2", ParamNames: []string{}},
	}
	var buf1, buf2 bytes.Buffer
	_ = ParsedFnsModule(&buf1, entries)
	_ = ParsedFnsModule(&buf2, entries)
	if buf1.String() != buf2.String() {
		t.Errorf("non-deterministic output:\nfirst:\n%s\nsecond:\n%s", buf1.String(), buf2.String())
	}
}
