package typeid_test

import (
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// These tests prove the regex VALUE is recoverable from the type system
// — not the erased `RegExp` interface shape — by walking the
// registerFormatPattern({regexp: /…/, …}) call AST from `typeof p`.
// Mirrors mion's deepkit-transformer behaviour, which is likewise an
// AST-level read, not a type-level one. (A regex's source can't live at
// the type level, so the call-site AST is the only door.)

// scanFormatPattern scans `pattern: typeof p` where p is built by a
// registerFormatPattern({...}) call and returns the resolved pattern
// object from FormatAnnotation.Params.
func scanFormatPattern(t *testing.T, constDecl string) (*protocol.RunType, map[string]any) {
	t.Helper()
	root := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/ts-go-run-types';
import type {TypeFormat} from '@mionjs/ts-go-run-types';
interface FormatPattern { readonly __fmtPatternBrand: true }
declare function registerFormatPattern(args: {regexp: RegExp; mockSamples: readonly string[]; message?: string}): FormatPattern;
`+constDecl+`
type Branded = TypeFormat<string, 'stringFormat', {pattern: typeof p}>;
getRunTypeId<Branded>();
`)
	if root.FormatAnnotation == nil {
		t.Fatalf("expected FormatAnnotation, got nil")
	}
	pattern, _ := root.FormatAnnotation.Params["pattern"].(map[string]any)
	return root, pattern
}

func TestFormatPattern_RecoversSourceAndFlags(t *testing.T) {
	_, pattern := scanFormatPattern(t,
		`const p = registerFormatPattern({regexp: /^[a-z0-9]+\.[a-z]{2,}$/i, mockSamples: ['mion.io']});`)
	if pattern == nil {
		t.Fatalf("expected a resolved pattern object")
	}
	if pattern["source"] != `^[a-z0-9]+\.[a-z]{2,}$` {
		t.Fatalf("recovered source = %q, want the original pattern", pattern["source"])
	}
	if pattern["flags"] != "i" {
		t.Fatalf("recovered flags = %q, want \"i\"", pattern["flags"])
	}
}

func TestFormatPattern_DistinctPatternsDistinctID(t *testing.T) {
	a, _ := scanFormatPattern(t, `const p = registerFormatPattern({regexp: /^[a-z]+$/, mockSamples: ['abc']});`)
	b, _ := scanFormatPattern(t, `const p = registerFormatPattern({regexp: /^[0-9]+$/, mockSamples: ['123']});`)
	if a.ID == b.ID {
		t.Fatalf("two different regexes must hash to distinct ids; both got %q", a.ID)
	}
}

func TestFormatPattern_SamePatternSameID(t *testing.T) {
	decl := `const p = registerFormatPattern({regexp: /^[a-z]+$/u, mockSamples: ['abc']});`
	a, _ := scanFormatPattern(t, decl)
	b, _ := scanFormatPattern(t, decl)
	if a.ID != b.ID {
		t.Fatalf("identical regexes must share one id; got %q vs %q", a.ID, b.ID)
	}
}

// Boundary: a `declare const p: FormatPattern` (no initializer — the
// shape a published .d.ts ships) is NOT traceable. The pattern object
// then carries no recovered source. Documents the limit of AST
// recovery: it needs a visible literal initializer, which is why the
// built-in formats use an inline string-literal source instead.
func TestFormatPattern_DeclareConstNotRecovered(t *testing.T) {
	_, pattern := scanFormatPattern(t, `declare const p: FormatPattern;`)
	if pattern != nil {
		if _, ok := pattern["source"]; ok {
			t.Fatalf("a declare-const FormatPattern has no initializer and must NOT yield a source: %#v", pattern)
		}
	}
}

// TestFormatPattern_ResolvedLiteralObject pins the "resolved object, not
// AST" guarantee: the pattern surfaces as a flat literal object
// {source, flags, mockSamples, message} — plain values the runtime reads
// without parsing, never the erased RegExp shape or AST nodes.
func TestFormatPattern_ResolvedLiteralObject(t *testing.T) {
	_, pattern := scanFormatPattern(t,
		`const p = registerFormatPattern({regexp: /^[a-z-]+$/, mockSamples: ['a-b', 'abc'], message: 'slug'});`)
	if pattern == nil {
		t.Fatalf("pattern is not a resolved object")
	}
	if pattern["source"] != "^[a-z-]+$" {
		t.Errorf("source = %#v, want the literal regex source", pattern["source"])
	}
	if pattern["flags"] != "" {
		t.Errorf("flags = %#v, want empty", pattern["flags"])
	}
	if pattern["message"] != "slug" {
		t.Errorf("message = %#v, want \"slug\"", pattern["message"])
	}
	samples, ok := pattern["mockSamples"].([]any)
	if !ok || len(samples) != 2 || samples[0] != "a-b" || samples[1] != "abc" {
		t.Errorf("mockSamples = %#v, want [\"a-b\",\"abc\"]", pattern["mockSamples"])
	}
}
