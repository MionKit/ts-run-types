package typefns

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
	if err := IsTypeModule(&buf, dump, RenderOpts{}); err != nil {
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
		"function init(jitFnHash,",
		"jitUtils.addToJitCache({",
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
	want := "init(" +
		"'it_abc123'," +
		"'string'," +
		"'return function it_abc123(v){return typeof v === \\'string\\'}'," +
		"false," +
		"[]," +
		"[]," +
		"function g_it_abc123(utl){return function it_abc123(v){return typeof v === 'string'}}" +
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
		// KindSymbol is unsupported at root — see docs/UNSUPPORTED-KINDS.md
		// FAQ. Renderer emits an alwaysThrow factory keyed by IT002,
		// not a body-bearing validator.
		{"symbol", &protocol.RunType{ID: "sym", Kind: protocol.KindSymbol}, "init('it_sym','symbol',undefined,false,undefined,undefined,undefined,'IT002',undefined)", false},
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
				// Noop factories use the short-form init: only jitFnHash,
				// typeName, code=undefined, isNoop=true — no full body or
				// createJitFn closure. The cache module's init() sees
				// isNoop and pre-sets `fn` to the family identity. Assert
				// both: the short-form `init('<id>',...,undefined,true);`
				// is present, AND no full createJitFn closure leaks in.
				marker := "init('it_" + row.rt.ID + "',"
				if !strings.Contains(out, marker) {
					t.Errorf("noop kind %s expected short-form init line %q in:\n%s", row.name, marker, out)
				}
				if strings.Contains(out, "function g_it_"+row.rt.ID) {
					t.Errorf("noop kind %s should NOT emit a createJitFn closure, but found g_it_%s in:\n%s", row.name, row.rt.ID, out)
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

// TestIsTypeModule_ArrayEmitBody covers KindArray's canonical block
// (mion:nodes/member/array.ts:emitIsType). The outer array renders an
// Array.isArray guard, a numbered for-loop, and an inlined child check
// since the child (string) is atomic — no dependency call needed.
func TestIsTypeModule_ArrayEmitBody(t *testing.T) {
	// emit walks the *protocol.RunType graph as-given (not via cache
	// resolution) so the Child slot here is inlined as a KindString
	// rather than a KindRef sentinel — same shape the renderer sees
	// after the cache materialises children into the parent.
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{
			{ID: "ar1", Kind: protocol.KindArray, Child: &protocol.RunType{ID: "str", Kind: protocol.KindString}},
		},
	}
	out := renderToString(t, dump)
	for _, fragment := range []string{
		"if (!Array.isArray(v)) return false;",
		"for (let i0 = 0; i0 < v.length; i0++) {",
		"const res0 = typeof v[i0] === 'string';",
		"if (!(res0)) return false;",
		"return true",
	} {
		if !strings.Contains(out, fragment) {
			t.Errorf("expected array body fragment %q in:\n%s", fragment, out)
		}
	}
}

// TestIsTypeModule_NestedArrayDependencyCall covers `string[][]` — the
// first multi-level case in the suite. The outer array's body must
// invoke the inner array's pre-compiled validator via the dependency-
// call layer:
//
//   - The outer module's `jitDependencies` arg carries the inner
//     hash (non-empty `[…]`).
//   - The outer createJitFn closure has a `const <innerHash> =
//     utl.getJIT('<innerHash>')` context-item line.
//   - The outer body contains `<innerHash>.fn(v[i0])` at the element
//     check position.
//   - Both modules render (inner first, outer second — topo sort).
func TestIsTypeModule_NestedArrayDependencyCall(t *testing.T) {
	inner := &protocol.RunType{
		ID:    "inn",
		Kind:  protocol.KindArray,
		Child: &protocol.RunType{ID: "str", Kind: protocol.KindString},
	}
	outer := &protocol.RunType{
		ID:    "out",
		Kind:  protocol.KindArray,
		Child: &protocol.RunType{ID: "inn", Kind: protocol.KindArray, Child: &protocol.RunType{ID: "str", Kind: protocol.KindString}},
	}
	// Cache insertion order is parent-first (outer, inner). Renderer
	// must reorder to inner-before-outer so the outer's closure can
	// resolve `utl.getJIT('inn')` against an already-registered entry.
	dump := protocol.Dump{RunTypes: []*protocol.RunType{outer, inner}}
	out := renderToString(t, dump)

	innerFactory := "init('it_inn',"
	outerFactory := "init('it_out',"
	innerIdx := strings.Index(out, innerFactory)
	outerIdx := strings.Index(out, outerFactory)
	if innerIdx < 0 {
		t.Fatalf("inner factory missing in:\n%s", out)
	}
	if outerIdx < 0 {
		t.Fatalf("outer factory missing in:\n%s", out)
	}
	if innerIdx >= outerIdx {
		t.Errorf("inner factory must render before outer (topo sort); got innerIdx=%d outerIdx=%d in:\n%s", innerIdx, outerIdx, out)
	}
	if !strings.Contains(out, "['it_inn']") {
		t.Errorf("outer factory's jitDependencies arg must contain ['it_inn'], got:\n%s", out)
	}
	if !strings.Contains(out, "const it_inn = utl.getJIT('it_inn')") {
		t.Errorf("outer factory must register context item resolving the inner hash, got:\n%s", out)
	}
	if !strings.Contains(out, "it_inn.fn(v[i0])") {
		t.Errorf("outer body must call inner via `<hash>.fn(args)`, got:\n%s", out)
	}
}

// TestIsTypeModule_ArrayNoIsArrayCheck — when the noIsArrayCheck flag
// is set on the array RunType, the leading `if (!Array.isArray(v))
// return false;` guard is omitted. Mirrors mion's `comp.opts.noIsArrayCheck`
// branch in array.ts:emitIsType.
func TestIsTypeModule_ArrayNoIsArrayCheck(t *testing.T) {
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{
			{
				ID:    "an1",
				Kind:  protocol.KindArray,
				Flags: []string{"noIsArrayCheck"},
				Child: &protocol.RunType{ID: "str", Kind: protocol.KindString},
			},
		},
	}
	out := renderToString(t, dump)
	if strings.Contains(out, "Array.isArray") {
		t.Errorf("noIsArrayCheck array must omit `Array.isArray(…)` guard, got:\n%s", out)
	}
	if !strings.Contains(out, "for (let i0 = 0;") {
		t.Errorf("noIsArrayCheck array must still emit element loop, got:\n%s", out)
	}
}

// TestIsTypeModule_InterfaceEmitBody covers KindObjectLiteral —
// the canonical interface check (`typeof v === 'object' && v !== null`)
// AND-chained with each PropertySignature child's check. Atomic
// children inline directly; the resolver normally hands child slots
// as KindRef sentinels which the walker derefs via the RefTable.
func TestIsTypeModule_InterfaceEmitBody(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	numberRT := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	propA := &protocol.RunType{
		ID:         "pA",
		Kind:       protocol.KindPropertySignature,
		Name:       "a",
		IsSafeName: true,
		Child:      &protocol.RunType{ID: "str", Kind: protocol.KindRef},
	}
	propB := &protocol.RunType{
		ID:         "pB",
		Kind:       protocol.KindPropertySignature,
		Name:       "b",
		IsSafeName: true,
		Child:      &protocol.RunType{ID: "num", Kind: protocol.KindRef},
	}
	iface := &protocol.RunType{
		ID:   "if1",
		Kind: protocol.KindObjectLiteral,
		Children: []*protocol.RunType{
			{ID: "pA", Kind: protocol.KindRef},
			{ID: "pB", Kind: protocol.KindRef},
		},
	}
	dump := protocol.Dump{RunTypes: []*protocol.RunType{iface, propA, propB, stringRT, numberRT}}
	out := renderToString(t, dump)
	if !strings.Contains(out, "init('it_if1',") {
		t.Fatalf("interface factory missing in:\n%s", out)
	}
	want := "(typeof v === 'object' && v !== null && typeof v.a === 'string' && Number.isFinite(v.b))"
	if !strings.Contains(out, want) {
		t.Errorf("expected interface body %q in:\n%s", want, out)
	}
}

// TestIsTypeModule_OptionalPropertyEmitBody checks the optional guard
// wrap — `(v.<name> === undefined || <childCheck>)`. Mirrors mion's
// PropertyRunType.emitIsType when src.optional is set.
func TestIsTypeModule_OptionalPropertyEmitBody(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	propA := &protocol.RunType{
		ID:         "pA",
		Kind:       protocol.KindPropertySignature,
		Name:       "a",
		IsSafeName: true,
		Optional:   true,
		Child:      &protocol.RunType{ID: "str", Kind: protocol.KindRef},
	}
	iface := &protocol.RunType{
		ID:       "if2",
		Kind:     protocol.KindObjectLiteral,
		Children: []*protocol.RunType{{ID: "pA", Kind: protocol.KindRef}},
	}
	out := renderToString(t, protocol.Dump{RunTypes: []*protocol.RunType{iface, propA, stringRT}})
	want := "(v.a === undefined || typeof v.a === 'string')"
	if !strings.Contains(out, want) {
		t.Errorf("expected optional-property body %q in:\n%s", want, out)
	}
}

// TestIsTypeModule_FunctionPropertyDropped — properties whose wrapped
// value is function-flavoured are dropped from the parent's AND
// chain. Mirrors mion's `getJitChild → undefined` short-circuit for
// methods. The interface body therefore reduces to the basic
// typeof-object guard + the non-function siblings.
func TestIsTypeModule_FunctionPropertyDropped(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	fnRT := &protocol.RunType{ID: "fn", Kind: protocol.KindFunction}
	propName := &protocol.RunType{
		ID:         "pN",
		Kind:       protocol.KindPropertySignature,
		Name:       "name",
		IsSafeName: true,
		Child:      &protocol.RunType{ID: "str", Kind: protocol.KindRef},
	}
	propMethod := &protocol.RunType{
		ID:         "pM",
		Kind:       protocol.KindPropertySignature,
		Name:       "method",
		IsSafeName: true,
		Child:      &protocol.RunType{ID: "fn", Kind: protocol.KindRef},
	}
	iface := &protocol.RunType{
		ID:   "if3",
		Kind: protocol.KindObjectLiteral,
		Children: []*protocol.RunType{
			{ID: "pN", Kind: protocol.KindRef},
			{ID: "pM", Kind: protocol.KindRef},
		},
	}
	out := renderToString(t, protocol.Dump{RunTypes: []*protocol.RunType{iface, propName, propMethod, stringRT, fnRT}})
	if strings.Contains(out, "v.method") {
		t.Errorf("function-typed property should be dropped from AND chain, but v.method appears:\n%s", out)
	}
	if !strings.Contains(out, "typeof v.name === 'string'") {
		t.Errorf("non-function sibling should still be checked, got:\n%s", out)
	}
}

// TestIsTypeModule_IndexSignatureEmitBody covers KindIndexSignature —
// the for-in iteration over the object's own keys with a value-type
// check. Mirrors mion's IndexSignatureRunType.emitIsType.
func TestIsTypeModule_IndexSignatureEmitBody(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	idx := &protocol.RunType{
		ID:    "ix",
		Kind:  protocol.KindIndexSignature,
		Child: &protocol.RunType{ID: "str", Kind: protocol.KindRef},
	}
	iface := &protocol.RunType{
		ID:       "if4",
		Kind:     protocol.KindObjectLiteral,
		Children: []*protocol.RunType{{ID: "ix", Kind: protocol.KindRef}},
	}
	out := renderToString(t, protocol.Dump{RunTypes: []*protocol.RunType{iface, idx, stringRT}})
	for _, fragment := range []string{
		"for (const k0 in v)",
		"typeof v[k0] === 'string'",
		"return true",
	} {
		if !strings.Contains(out, fragment) {
			t.Errorf("expected index-signature fragment %q in:\n%s", fragment, out)
		}
	}
}

// TestIsTypeModule_FunctionTopLevelEmitBody — a free-standing function
// runtype emits the bare `typeof === 'function'` check.
func TestIsTypeModule_FunctionTopLevelEmitBody(t *testing.T) {
	dump := protocol.Dump{RunTypes: []*protocol.RunType{{ID: "fn1", Kind: protocol.KindFunction}}}
	out := renderToString(t, dump)
	if !strings.Contains(out, "return typeof v === 'function'") {
		t.Errorf("expected function body in:\n%s", out)
	}
}

// TestIsTypeModule_TupleEmitBody covers KindTuple. Body shape (CodeRB)
// is: Array.isArray guard → length-bound guard (when no rest) → per-
// member check sequence → return true.
func TestIsTypeModule_TupleEmitBody(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	numberRT := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	pos0 := 0
	pos1 := 1
	member0 := &protocol.RunType{
		ID:       "m0",
		Kind:     protocol.KindTupleMember,
		Position: &pos0,
		Child:    &protocol.RunType{ID: "str", Kind: protocol.KindRef},
	}
	member1 := &protocol.RunType{
		ID:       "m1",
		Kind:     protocol.KindTupleMember,
		Position: &pos1,
		Child:    &protocol.RunType{ID: "num", Kind: protocol.KindRef},
	}
	tup := &protocol.RunType{
		ID:   "tp1",
		Kind: protocol.KindTuple,
		Children: []*protocol.RunType{
			{ID: "m0", Kind: protocol.KindRef},
			{ID: "m1", Kind: protocol.KindRef},
		},
	}
	dump := protocol.Dump{RunTypes: []*protocol.RunType{tup, member0, member1, stringRT, numberRT}}
	out := renderToString(t, dump)
	for _, fragment := range []string{
		"if (!Array.isArray(v)) return false;",
		"if (v.length > 2) return false;",
		"(typeof v[0] === 'string')",
		"(Number.isFinite(v[1]))",
		"return true",
	} {
		if !strings.Contains(out, fragment) {
			t.Errorf("expected tuple fragment %q in:\n%s", fragment, out)
		}
	}
}

// TestIsTypeModule_TupleOptionalMember — optional tuple element wraps
// with `(v[i] === undefined || (childCheck))`.
func TestIsTypeModule_TupleOptionalMember(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	pos0 := 0
	member0 := &protocol.RunType{
		ID:       "m0",
		Kind:     protocol.KindTupleMember,
		Position: &pos0,
		Optional: true,
		Child:    &protocol.RunType{ID: "str", Kind: protocol.KindRef},
	}
	tup := &protocol.RunType{
		ID:       "tp2",
		Kind:     protocol.KindTuple,
		Children: []*protocol.RunType{{ID: "m0", Kind: protocol.KindRef}},
	}
	out := renderToString(t, protocol.Dump{RunTypes: []*protocol.RunType{tup, member0, stringRT}})
	want := "(v[0] === undefined || (typeof v[0] === 'string'))"
	if !strings.Contains(out, want) {
		t.Errorf("expected optional tuple member %q in:\n%s", want, out)
	}
}

// TestIsTypeModule_UnionAtomicEmitBody — union of atomic types
// produces an OR-chain.
func TestIsTypeModule_UnionAtomicEmitBody(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	numberRT := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	un := &protocol.RunType{
		ID:   "un1",
		Kind: protocol.KindUnion,
		Children: []*protocol.RunType{
			{ID: "str", Kind: protocol.KindRef},
			{ID: "num", Kind: protocol.KindRef},
		},
	}
	dump := protocol.Dump{RunTypes: []*protocol.RunType{un, stringRT, numberRT}}
	out := renderToString(t, dump)
	want := "(typeof v === 'string' || Number.isFinite(v))"
	if !strings.Contains(out, want) {
		t.Errorf("expected atomic union body %q in:\n%s", want, out)
	}
}

// TestIsTypeModule_UnionObjectsShareNullGuard — when union members
// include object-like kinds, the emit lifts the
// `typeof === 'object' && !== null` guard outside their OR-chain so a
// null input short-circuits before any property access.
func TestIsTypeModule_UnionObjectsShareNullGuard(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	propA := &protocol.RunType{
		ID:         "pA",
		Kind:       protocol.KindPropertySignature,
		Name:       "a",
		IsSafeName: true,
		Child:      &protocol.RunType{ID: "str", Kind: protocol.KindRef},
	}
	obj1 := &protocol.RunType{
		ID:       "ob1",
		Kind:     protocol.KindObjectLiteral,
		Children: []*protocol.RunType{{ID: "pA", Kind: protocol.KindRef}},
	}
	un := &protocol.RunType{
		ID:   "un2",
		Kind: protocol.KindUnion,
		Children: []*protocol.RunType{
			{ID: "str", Kind: protocol.KindRef},
			{ID: "ob1", Kind: protocol.KindRef},
		},
	}
	dump := protocol.Dump{RunTypes: []*protocol.RunType{un, obj1, propA, stringRT}}
	out := renderToString(t, dump)
	if !strings.Contains(out, "typeof v === 'object' && v !== null") {
		t.Errorf("expected shared object-null guard in union body, got:\n%s", out)
	}
}

func TestIsTypeModule_UnsupportedKindSkipped(t *testing.T) {
	// KindIntersection stays unsupported — mion resolves intersections
	// at compile time into ObjectLiteral / Never, so the emitter never
	// renders an Intersection factory. KindUnion with no children also
	// degenerates to unsupported. The renderer must skip both
	// silently rather than panic so kind-by-kind rollout is possible.
	dump := protocol.Dump{
		RunTypes: []*protocol.RunType{
			{ID: "u1", Kind: protocol.KindUnion}, // no children → unsupported
			{ID: "x1", Kind: protocol.KindIntersection},
			{ID: "s1", Kind: protocol.KindString},
		},
	}
	out := renderToString(t, dump)
	if strings.Contains(out, "'it_u1'") {
		t.Error("empty KindUnion should be skipped (unsupported), but u1 was rendered")
	}
	if strings.Contains(out, "'it_x1'") {
		t.Error("KindIntersection should be skipped (unsupported), but x1 was rendered")
	}
	if !strings.Contains(out, "init('it_s1',") {
		t.Errorf("KindString should be rendered as factory call, got:\n%s", out)
	}
}

// TestIsTypeModule_CodeNSPropagation covers the bubble-up semantics
// the renderer relies on now that the per-entry `subtreeFullySupported`
// pre-walk is gone. Each row asserts that an unsupported leaf
// somewhere in the subtree causes the top-level factory to be silently
// skipped (no panic, no malformed code), while sibling supported
// entries in the same dump still render normally.
func TestIsTypeModule_CodeNSPropagation(t *testing.T) {
	stringRT := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	// KindIntersection is unsupported at the leaf — used here as a
	// stand-in for "any future kind without an emit". We could equally
	// well synthesize a brand-new ReflectionKind value; KindIntersection
	// has the advantage of being a real cache shape today.
	unsupportedLeaf := &protocol.RunType{ID: "uns", Kind: protocol.KindIntersection}

	t.Run("array_of_unsupported_skipped", func(t *testing.T) {
		arr := &protocol.RunType{
			ID:    "ar1",
			Kind:  protocol.KindArray,
			Child: &protocol.RunType{ID: "uns", Kind: protocol.KindRef},
		}
		dump := protocol.Dump{RunTypes: []*protocol.RunType{arr, unsupportedLeaf, stringRT}}
		out := renderToString(t, dump)
		if strings.Contains(out, "init('it_ar1',") {
			t.Errorf("array with unsupported child must be skipped, got:\n%s", out)
		}
		if !strings.Contains(out, "init('it_str',") {
			t.Errorf("supported sibling must still render, got:\n%s", out)
		}
	})

	t.Run("object_with_one_unsupported_prop_renders_without_it", func(t *testing.T) {
		// v2: property positions ABSORB unsupported children rather than
		// propagating CodeNS to root. The object's emit drops the unsupported
		// property from its AND chain and still renders for the supported
		// siblings. See docs/UNSUPPORTED-KINDS.md "How a parent absorbs".
		propUns := &protocol.RunType{
			ID:         "pU",
			Kind:       protocol.KindPropertySignature,
			Name:       "u",
			IsSafeName: true,
			Child:      &protocol.RunType{ID: "uns", Kind: protocol.KindRef},
		}
		propOk := &protocol.RunType{
			ID:         "pO",
			Kind:       protocol.KindPropertySignature,
			Name:       "o",
			IsSafeName: true,
			Child:      &protocol.RunType{ID: "str", Kind: protocol.KindRef},
		}
		iface := &protocol.RunType{
			ID:   "if1",
			Kind: protocol.KindObjectLiteral,
			Children: []*protocol.RunType{
				{ID: "pU", Kind: protocol.KindRef},
				{ID: "pO", Kind: protocol.KindRef},
			},
		}
		dump := protocol.Dump{RunTypes: []*protocol.RunType{iface, propUns, propOk, unsupportedLeaf, stringRT}}
		out := renderToString(t, dump)
		if !strings.Contains(out, "init('it_if1',") {
			t.Errorf("object with one unsupported property must still render (absorption), got:\n%s", out)
		}
		// The body must NOT reference the dropped property's accessor.
		if strings.Contains(out, "v.u") {
			t.Errorf("rendered body should not reference dropped property 'u', got:\n%s", out)
		}
		// The supported sibling's accessor must be present.
		if !strings.Contains(out, "v.o") {
			t.Errorf("rendered body should reference surviving property 'o', got:\n%s", out)
		}
	})

	t.Run("union_with_one_unsupported_member_skipped", func(t *testing.T) {
		un := &protocol.RunType{
			ID:   "un1",
			Kind: protocol.KindUnion,
			Children: []*protocol.RunType{
				{ID: "str", Kind: protocol.KindRef},
				{ID: "uns", Kind: protocol.KindRef},
			},
		}
		dump := protocol.Dump{RunTypes: []*protocol.RunType{un, unsupportedLeaf, stringRT}}
		out := renderToString(t, dump)
		if strings.Contains(out, "init('it_un1',") {
			t.Errorf("union with one unsupported member must be skipped, got:\n%s", out)
		}
	})

	t.Run("nested_array_of_unsupported_skipped", func(t *testing.T) {
		// Outer Array[Array[Unsupported]] — the inner array's child
		// returns CodeNS; inner array propagates; outer array
		// propagates. Net effect: both inner and outer factories
		// silently absent from the rendered module.
		innerArr := &protocol.RunType{
			ID:    "ai",
			Kind:  protocol.KindArray,
			Child: &protocol.RunType{ID: "uns", Kind: protocol.KindRef},
		}
		outerArr := &protocol.RunType{
			ID:    "ao",
			Kind:  protocol.KindArray,
			Child: &protocol.RunType{ID: "ai", Kind: protocol.KindRef},
		}
		dump := protocol.Dump{RunTypes: []*protocol.RunType{outerArr, innerArr, unsupportedLeaf}}
		out := renderToString(t, dump)
		if strings.Contains(out, "init('it_ao',") {
			t.Errorf("outer array of unsupported must be skipped, got:\n%s", out)
		}
		if strings.Contains(out, "init('it_ai',") {
			t.Errorf("inner array of unsupported must be skipped, got:\n%s", out)
		}
	})

	t.Run("plain_user_class_with_nonserializable_subkind_throws", func(t *testing.T) {
		// v2: alwaysThrow init() carries the diag code as the 8th arg
		// (no embedded throw body). JS side resolves the code to a
		// message via messageForCode() at materialise time. See
		// docs/UNSUPPORTED-KINDS.md "Wire format".
		ns := &protocol.RunType{ID: "ns1", Kind: protocol.KindClass, SubKind: protocol.SubKindNonSerializable}
		dump := protocol.Dump{RunTypes: []*protocol.RunType{ns, stringRT}}
		out := renderToString(t, dump)
		if !strings.Contains(out, "init('it_ns1','class',undefined,false,undefined,undefined,undefined,'IT001',undefined)") {
			t.Errorf("KindClass+SubKindNonSerializable must emit an alwaysThrow init with code IT001, got:\n%s", out)
		}
		// No inline throwing function body should remain.
		if strings.Contains(out, "throw new Error(") {
			t.Errorf("v2 wire format should not embed throw-body strings, got:\n%s", out)
		}
		if !strings.Contains(out, "init('it_str',") {
			t.Errorf("supported sibling must still render, got:\n%s", out)
		}
	})
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
	if !strings.Contains(out, "init('it_s1',") {
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
	// Aliased pure-fns (see purefn_aliases.go) emit a bare identifier
	// reference to the matching `k_<alias>` module-level const declared
	// in the cache skeleton; unaliased ones fall back to the quoted
	// "<ns>::<fn>" literal.
	deps := []protocol.PureFnDep{
		{Namespace: "mion", FunctionName: "asJSONString", FilePath: "/abs/run-types-pure-fns.ts"},
		{Namespace: "mion", FunctionName: "newRunTypeErr", FilePath: "/abs/run-types-pure-fns.ts"},
	}
	want := "['mion::asJSONString',k_nRT]"
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
