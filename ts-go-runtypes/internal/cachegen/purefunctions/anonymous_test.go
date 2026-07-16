package purefunctions

import (
	"strings"
	"testing"
)

// The anonymous lane (registerAnonymousPureFn) extracts the factory the same way
// the named lane does, but derives the identity from the body content hash and
// splices `"rt::<hash>"` into the empty trailing slot. Per the repo's
// marker-test discipline the lane is covered both DIRECTLY and THROUGH A LIBRARY
// WRAPPER (a fixture that forwards the markers), asserting they inject the same
// hash.

func TestExtractAnonymous_DirectCall(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const cpf = registerAnonymousPureFn(function () {
  return function _double(n: number): number {
    return n * 2;
  };
});`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	got := entries[0]
	if got.Namespace != AnonymousNamespace {
		t.Errorf("expected namespace %q, got %q", AnonymousNamespace, got.Namespace)
	}
	if len(got.FunctionName) != bodyHashLength {
		t.Errorf("functionName should be a %d-char content hash, got %q", bodyHashLength, got.FunctionName)
	}
	if strings.Contains(got.Code, ": number") {
		t.Errorf("inner annotations should be stripped, got code:\n%s", got.Code)
	}
	// The injected trailing arg is the SAME key the entry is registered under.
	wantText := ", '" + got.Key() + "'"
	if got.HashInjectText != wantText {
		t.Errorf("hash inject text = %q, want %q", got.HashInjectText, wantText)
	}
	if got.HashInjectPos == 0 {
		t.Errorf("hash inject pos should be the closing-paren offset, got 0")
	}
}

func TestExtractAnonymous_ContentAddressedDedup(t *testing.T) {
	// Two structurally-identical bodies (different var names in the surrounding
	// module, identical factory body) collapse to ONE rt::<hash> entry.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const first = registerAnonymousPureFn(function () {
  return function _id(n: number): number {
    return n;
  };
});`,
		"b.ts": `
import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const second = registerAnonymousPureFn(function () {
  return function _id(n: number): number {
    return n;
  };
});`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics (equal bodies must not collide): %+v", diags)
	}
	if len(entries) != 1 {
		t.Fatalf("equal bodies should collapse to 1 entry, got %d: %+v", len(entries), entries)
	}
}

func TestExtractAnonymous_DifferentBodiesDistinctHash(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const doubler = registerAnonymousPureFn(function () {
  return function _double(n: number): number {
    return n * 2;
  };
});
export const tripler = registerAnonymousPureFn(function () {
  return function _triple(n: number): number {
    return n * 3;
  };
});`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	if len(entries) != 2 {
		t.Fatalf("different bodies should produce 2 entries, got %d", len(entries))
	}
	if entries[0].Key() == entries[1].Key() {
		t.Errorf("different bodies must not share a key: %q", entries[0].Key())
	}
}

func TestExtractAnonymous_ThroughLibraryWrapper(t *testing.T) {
	// A library wrapper forwards the InjectPureFnHash + PureFunction markers.
	// Its consumer call site is recognised by BRAND (not callee name), extracted,
	// and injects the SAME rt::<hash> a direct call to the same body would.
	direct, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const cpf = registerAnonymousPureFn(function () {
  return function _slug(s: string): string {
    return s.toLowerCase();
  };
});`,
	})
	if len(diags) != 0 || len(direct) != 1 {
		t.Fatalf("direct extraction failed: entries=%d diags=%+v", len(direct), diags)
	}

	wrapped, wdiags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn, type PureFunction, type InjectPureFnHash, type RTUtils} from '@ts-runtypes/core';
function registerAcmePureFn<F extends (utl: RTUtils) => any>(fn: PureFunction<F>, hash?: InjectPureFnHash<F>) {
  if (!hash) throw new Error('plugin did not run');
  return registerAnonymousPureFn(fn, hash);
}
export const cpf = registerAcmePureFn(function () {
  return function _slug(s: string): string {
    return s.toLowerCase();
  };
});`,
	})
	if len(wdiags) != 0 {
		t.Fatalf("wrapper extraction diagnostics: %+v", wdiags)
	}
	if len(wrapped) != 1 {
		t.Fatalf("wrapper consumer call must extract exactly one entry, got %d: %+v", len(wrapped), wrapped)
	}
	if wrapped[0].Key() != direct[0].Key() {
		t.Errorf("wrapper injected %q, direct injected %q — should match", wrapped[0].Key(), direct[0].Key())
	}
	if wrapped[0].HashInjectText != direct[0].HashInjectText {
		t.Errorf("wrapper hash text %q != direct %q", wrapped[0].HashInjectText, direct[0].HashInjectText)
	}
}

func TestExtractAnonymous_Replacements(t *testing.T) {
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn} from '@ts-runtypes/core';
export const cpf = registerAnonymousPureFn(function () {
  return function _double(n: number): number {
    return n * 2;
  };
});`,
	})
	if len(diags) != 0 || len(entries) != 1 {
		t.Fatalf("extraction failed: entries=%d diags=%+v", len(entries), diags)
	}
	reps := Replacements(entries, false)
	if len(reps) != 2 {
		t.Fatalf("anonymous entry should yield 2 replacements (factory rewrite + hash splice), got %d: %+v", len(reps), reps)
	}
	// One replacement rewrites the factory arg to a pf binding (ImportFrom set);
	// the other is a point insertion splicing the hash literal (no ImportFrom).
	var factoryRep, hashRep int = -1, -1
	for i, rep := range reps {
		if rep.ImportFrom != "" {
			factoryRep = i
		} else if rep.Start == rep.End {
			hashRep = i
		}
	}
	if factoryRep < 0 {
		t.Fatalf("missing factory-rewrite replacement in %+v", reps)
	}
	if hashRep < 0 {
		t.Fatalf("missing hash-insertion replacement in %+v", reps)
	}
	if !strings.HasPrefix(reps[factoryRep].Text, "__rt_pf") {
		t.Errorf("factory replacement text should be a pf binding, got %q", reps[factoryRep].Text)
	}
	if !strings.Contains(reps[hashRep].Text, "'"+entries[0].Key()+"'") {
		t.Errorf("hash replacement should splice the entry key, got %q", reps[hashRep].Text)
	}
}

func TestExtractAnonymous_ForwardedFactoryNotExtracted(t *testing.T) {
	// A call whose factory arg is a forwarded identifier (not an inline function)
	// — e.g. the wrapper body's own registerAnonymousPureFn(fn, hash) — extracts
	// nothing: PFN001 is the resolver's job, so this pass bails quietly and the
	// rewrite stays idempotent.
	entries, diags := extractFromOverlay(t, map[string]string{
		"a.ts": `
import {registerAnonymousPureFn, type PureFunction, type InjectPureFnHash, type RTUtils} from '@ts-runtypes/core';
export function reg<F extends (utl: RTUtils) => any>(fn: PureFunction<F>, hash?: InjectPureFnHash<F>) {
  return registerAnonymousPureFn(fn, hash);
}`,
	})
	if len(entries) != 0 {
		t.Fatalf("forwarded factory param must not extract, got %d entries: %+v", len(entries), entries)
	}
	if len(diags) != 0 {
		t.Fatalf("forwarded factory param must be a quiet no-op, got diags: %+v", diags)
	}
}
