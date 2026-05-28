package typeid_test

import (
	"testing"

	"github.com/mionkit/ts-run-types/internal/compiled/runtype/typeid"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// These tests prove the original regex VALUE is recoverable from the
// type system — not the erased `RegExp` interface shape — by walking
// the param's declaration AST (typeof const → const initializer →
// regex literal). Mirrors mion's deepkit-transformer behaviour, which
// is likewise an AST-level read, not a type-level one.

func TestFormatRegexp_RecoversLiteralSourceAndFlags(t *testing.T) {
	root := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/ts-go-run-types';
import type {TypeFormat} from '@mionjs/ts-go-run-types';
const DOMAIN_PATTERN = /^[a-z0-9]+\.[a-z]{2,}$/i;
type Branded = TypeFormat<string, 'domain', {pattern: {val: typeof DOMAIN_PATTERN}}>;
getRunTypeId<Branded>();
`)
	if root.FormatAnnotation == nil {
		t.Fatalf("expected FormatAnnotation, got nil")
	}
	pattern, ok := root.FormatAnnotation.Params["pattern"].(map[string]any)
	if !ok {
		t.Fatalf("expected params.pattern to be an object, got %#v", root.FormatAnnotation.Params["pattern"])
	}
	// The recovered regex marshals to {source, flags} on the wire; in-process
	// it round-trips as a map after JSON normalisation, so accept either the
	// typed struct or the decoded map form.
	val := pattern["val"]
	source, flags := extractRegexp(t, val)
	if source != `^[a-z0-9]+\.[a-z]{2,}$` {
		t.Fatalf("recovered source = %q, want the original pattern", source)
	}
	if flags != "i" {
		t.Fatalf("recovered flags = %q, want \"i\"", flags)
	}
}

func TestFormatRegexp_DistinctPatternsDistinctID(t *testing.T) {
	a := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/ts-go-run-types';
import type {TypeFormat} from '@mionjs/ts-go-run-types';
const P = /^[a-z]+$/;
type Branded = TypeFormat<string, 'domain', {pattern: {val: typeof P}}>;
getRunTypeId<Branded>();
`)
	b := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/ts-go-run-types';
import type {TypeFormat} from '@mionjs/ts-go-run-types';
const P = /^[0-9]+$/;
type Branded = TypeFormat<string, 'domain', {pattern: {val: typeof P}}>;
getRunTypeId<Branded>();
`)
	if a.ID == b.ID {
		t.Fatalf("two different regexes must hash to distinct ids; both got %q", a.ID)
	}
}

func TestFormatRegexp_SamePatternSameID(t *testing.T) {
	mk := func() *protocol.RunType {
		return runFormatScan(t, `
import {getRunTypeId} from '@mionjs/ts-go-run-types';
import type {TypeFormat} from '@mionjs/ts-go-run-types';
const P = /^[a-z]+$/u;
type Branded = TypeFormat<string, 'domain', {pattern: {val: typeof P}}>;
getRunTypeId<Branded>();
`)
	}
	if a, b := mk(), mk(); a.ID != b.ID {
		t.Fatalf("identical regexes must share one id; got %q vs %q", a.ID, b.ID)
	}
}

// Boundary: a `declare const X: RegExp` (no initializer — the shape a
// published .d.ts ships) is NOT traceable. Must fall back gracefully to
// the resolved-type extraction, never crash. Documents the limit of
// AST recovery: it needs a visible literal initializer.
func TestFormatRegexp_DeclareConstFallsBackGracefully(t *testing.T) {
	root := runFormatScan(t, `
import {getRunTypeId} from '@mionjs/ts-go-run-types';
import type {TypeFormat} from '@mionjs/ts-go-run-types';
declare const DECLARED: RegExp;
type Branded = TypeFormat<string, 'domain', {pattern: {val: typeof DECLARED}}>;
getRunTypeId<Branded>();
`)
	if root.FormatAnnotation == nil {
		t.Fatalf("expected FormatAnnotation even when the regex is untraceable")
	}
	pattern, _ := root.FormatAnnotation.Params["pattern"].(map[string]any)
	if _, recovered := pattern["val"].(typeid.RegexpParam); recovered {
		t.Fatalf("a declare-const regex has no initializer and must NOT be recoverable")
	}
}

func extractRegexp(t *testing.T, val any) (source, flags string) {
	t.Helper()
	switch typed := val.(type) {
	case typeid.RegexpParam:
		return typed.Source, typed.Flags
	case map[string]any: // post-JSON-roundtrip form
		src, _ := typed["source"].(string)
		flg, _ := typed["flags"].(string)
		return src, flg
	default:
		t.Fatalf("params.pattern.val is not a recovered regexp: %#v", val)
		return "", ""
	}
}
