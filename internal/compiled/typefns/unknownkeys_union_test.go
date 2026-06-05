package typefns

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// unionUnknownKeysCtx — shim EmitContext for direct helper tests.
// Mirrors layoutCtx in union_flat_layout_test.go.
func unionUnknownKeysCtx(t *testing.T, runTypes []*protocol.RunType) *EmitContext {
	t.Helper()
	refTable := make(map[string]*protocol.RunType, len(runTypes))
	for _, rt := range runTypes {
		if rt == nil || rt.ID == "" {
			continue
		}
		refTable[rt.ID] = rt
	}
	walker := &Walker{RefTable: refTable, RTFnHash: "test", localVarCounters: make(map[string]int)}
	return &EmitContext{walker: walker, Vλl: "v"}
}

// stripSnippet — the public stripUnknownKeys snippet for assertions.
var stripSnippet = func(_ *EmitContext, accessor, keyVar string) string {
	return "delete " + accessor + "[" + keyVar + "]"
}

// ukuSnippet — the wireFormat=true ukuWire snippet.
var ukuSnippet = func(_ *EmitContext, accessor, keyVar string) string {
	return accessor + "[" + keyVar + "] = undefined"
}

// hasSnippet — returns true on hit; helper wraps in IIFE returning false.
var hasSnippet = func(_ *EmitContext, _ string, _ string) string { return "return true" }

// TestUnionUnknownKeys_DisjointKeys — `{a: string} | {b: number}`.
// Allowlist `{a, b}`; the for-loop guard rejects anything else.
func TestUnionUnknownKeys_DisjointKeys(t *testing.T) {
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	num := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	pa := &protocol.RunType{ID: "pa", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	pb := &protocol.RunType{ID: "pb", Kind: protocol.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("num")}
	obA := &protocol.RunType{ID: "obA", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pa")}}
	obB := &protocol.RunType{ID: "obB", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pb")}}
	union := &protocol.RunType{
		ID: "uni", Kind: protocol.KindUnion,
		Children:          []*protocol.RunType{makeRef("obA"), makeRef("obB")},
		SafeUnionChildren: []*protocol.RunType{makeRef("obA"), makeRef("obB")},
	}
	ctx := unionUnknownKeysCtx(t, []*protocol.RunType{str, num, pa, pb, obA, obB, union})

	// strip
	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet, CodeShape: CodeS})
	if !strings.Contains(out.Code, "=== 'a'") || !strings.Contains(out.Code, "=== 'b'") {
		t.Errorf("strip allowlist missing 'a' or 'b' check: %s", out.Code)
	}
	if !strings.Contains(out.Code, "delete v[") {
		t.Errorf("strip snippet not emitted: %s", out.Code)
	}
	if out.Type != CodeS {
		t.Errorf("strip CodeShape = %v, want CodeS", out.Type)
	}

	// hasUnknownKeys
	ctx = unionUnknownKeysCtx(t, []*protocol.RunType{str, num, pa, pb, obA, obB, union})
	out = emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: hasSnippet, CodeShape: CodeE})
	if !strings.Contains(out.Code, "return true") || !strings.Contains(out.Code, "return false") {
		t.Errorf("has IIFE missing true/false returns: %s", out.Code)
	}
	if out.Type != CodeE {
		t.Errorf("has CodeShape = %v, want CodeE", out.Type)
	}
}

// TestUnionUnknownKeys_OverlappingKeys — `{a: string, b: number} |
// {a: bigint, c: boolean}`. Merged allowlist `{a, b, c}`.
func TestUnionUnknownKeys_OverlappingKeys(t *testing.T) {
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	num := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	big := &protocol.RunType{ID: "big", Kind: protocol.KindBigInt}
	boolean := &protocol.RunType{ID: "bln", Kind: protocol.KindBoolean}
	paA := &protocol.RunType{ID: "paA", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	pbA := &protocol.RunType{ID: "pbA", Kind: protocol.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("num")}
	paB := &protocol.RunType{ID: "paB", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("big")}
	pcB := &protocol.RunType{ID: "pcB", Kind: protocol.KindProperty, Name: "c", IsSafeName: true, Child: makeRef("bln")}
	obA := &protocol.RunType{ID: "obA", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("paA"), makeRef("pbA")}}
	obB := &protocol.RunType{ID: "obB", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("paB"), makeRef("pcB")}}
	union := &protocol.RunType{
		ID: "uni", Kind: protocol.KindUnion,
		Children:          []*protocol.RunType{makeRef("obA"), makeRef("obB")},
		SafeUnionChildren: []*protocol.RunType{makeRef("obA"), makeRef("obB")},
	}
	ctx := unionUnknownKeysCtx(t, []*protocol.RunType{str, num, big, boolean, paA, pbA, paB, pcB, obA, obB, union})

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet, CodeShape: CodeS})
	for _, name := range []string{"'a'", "'b'", "'c'"} {
		if !strings.Contains(out.Code, name) {
			t.Errorf("merged allowlist missing %s: %s", name, out.Code)
		}
	}
}

// TestUnionUnknownKeys_MixedAtomicAndObject — `string | {a: number}`.
// Allowlist `{a}`; the atomic branch contributes no keys.
func TestUnionUnknownKeys_MixedAtomicAndObject(t *testing.T) {
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	num := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	pa := &protocol.RunType{ID: "pa", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("num")}
	obj := &protocol.RunType{ID: "obj", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pa")}}
	union := &protocol.RunType{
		ID: "uni", Kind: protocol.KindUnion,
		Children:          []*protocol.RunType{makeRef("str"), makeRef("obj")},
		SafeUnionChildren: []*protocol.RunType{makeRef("str"), makeRef("obj")},
	}
	ctx := unionUnknownKeysCtx(t, []*protocol.RunType{str, num, pa, obj, union})

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet, CodeShape: CodeS})
	if !strings.Contains(out.Code, "=== 'a'") {
		t.Errorf("allowlist missing 'a': %s", out.Code)
	}
}

// TestUnionUnknownKeys_IndexSigCarveOut — `{[k: string]: number} |
// {b: boolean}`. Index-sig member → emit is a no-op for the whole union.
func TestUnionUnknownKeys_IndexSigCarveOut(t *testing.T) {
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	num := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	boolean := &protocol.RunType{ID: "bln", Kind: protocol.KindBoolean}
	idxSig := &protocol.RunType{ID: "idx", Kind: protocol.KindIndexSignature, IndexT: makeRef("str"), Child: makeRef("num")}
	pb := &protocol.RunType{ID: "pb", Kind: protocol.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("bln")}
	objIdx := &protocol.RunType{ID: "obI", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("idx")}}
	objB := &protocol.RunType{ID: "obB", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pb")}}
	union := &protocol.RunType{
		ID: "uni", Kind: protocol.KindUnion,
		Children:          []*protocol.RunType{makeRef("obI"), makeRef("obB")},
		SafeUnionChildren: []*protocol.RunType{makeRef("obI"), makeRef("obB")},
	}
	ctx := unionUnknownKeysCtx(t, []*protocol.RunType{str, num, boolean, idxSig, pb, objIdx, objB, union})

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet, CodeShape: CodeS})
	if out.Code != "" {
		t.Errorf("index-sig carve-out expected empty emit, got: %s", out.Code)
	}
}

// TestUnionUnknownKeys_AtomicOnlyUnion — `string | number | boolean`.
// No object members → emit is empty (atomics have no keys).
func TestUnionUnknownKeys_AtomicOnlyUnion(t *testing.T) {
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	num := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	boolean := &protocol.RunType{ID: "bln", Kind: protocol.KindBoolean}
	union := &protocol.RunType{
		ID: "uni", Kind: protocol.KindUnion,
		Children:          []*protocol.RunType{makeRef("str"), makeRef("num"), makeRef("bln")},
		SafeUnionChildren: []*protocol.RunType{makeRef("str"), makeRef("num"), makeRef("bln")},
	}
	ctx := unionUnknownKeysCtx(t, []*protocol.RunType{str, num, boolean, union})

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet, CodeShape: CodeS})
	if out.Code != "" {
		t.Errorf("atomic-only union expected empty emit, got: %s", out.Code)
	}
}

// TestUnionUnknownKeys_WireFormatObjectBranch — ukuWire codegen on
// `{a: string} | {b: number}` MUST contain the wrapper-peel and reach
// into v[1].
func TestUnionUnknownKeys_WireFormatObjectBranch(t *testing.T) {
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	num := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	pa := &protocol.RunType{ID: "pa", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	pb := &protocol.RunType{ID: "pb", Kind: protocol.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("num")}
	obA := &protocol.RunType{ID: "obA", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pa")}}
	obB := &protocol.RunType{ID: "obB", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pb")}}
	union := &protocol.RunType{
		ID: "uni", Kind: protocol.KindUnion,
		Children:          []*protocol.RunType{makeRef("obA"), makeRef("obB")},
		SafeUnionChildren: []*protocol.RunType{makeRef("obA"), makeRef("obB")},
	}
	ctx := unionUnknownKeysCtx(t, []*protocol.RunType{str, num, pa, pb, obA, obB, union})

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: ukuSnippet, CodeShape: CodeS, JsonWireFormat: true})
	if !strings.Contains(out.Code, "Array.isArray(v)") {
		t.Errorf("wire-format emit missing Array.isArray gate: %s", out.Code)
	}
	if !strings.Contains(out.Code, "v[0] === -1") {
		t.Errorf("wire-format emit missing object-branch discriminator: %s", out.Code)
	}
	if !strings.Contains(out.Code, "in v[1]") {
		t.Errorf("wire-format emit must walk v[1], got: %s", out.Code)
	}
	if !strings.Contains(out.Code, "v[1][") {
		t.Errorf("wire-format emit must assign into v[1][k], got: %s", out.Code)
	}
}

// TestUnionUnknownKeys_NonWireGatesOnPlainObject — `string[] | {a: string}`.
// The non-wire emit MUST gate the merged-allowlist loop on a plain-object
// runtime check. Without it, runtime values that match the array atomic
// member would have their indices clobbered by the merged-allowlist
// strip/uku snippet (and primitive-string members would throw on assign).
// Pins the fix for the stripMutate/Unions failures (uku ran ungated on
// the raw runtime value).
func TestUnionUnknownKeys_NonWireGatesOnPlainObject(t *testing.T) {
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	num := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	arr := &protocol.RunType{ID: "arr", Kind: protocol.KindArray, Child: makeRef("str")}
	pa := &protocol.RunType{ID: "pa", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("num")}
	obj := &protocol.RunType{ID: "obj", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pa")}}
	union := &protocol.RunType{
		ID: "uni", Kind: protocol.KindUnion,
		Children:          []*protocol.RunType{makeRef("arr"), makeRef("obj")},
		SafeUnionChildren: []*protocol.RunType{makeRef("arr"), makeRef("obj")},
	}
	ctx := unionUnknownKeysCtx(t, []*protocol.RunType{str, num, arr, pa, obj, union})

	// strip / uku-style (CodeS)
	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: ukuSnippet, CodeShape: CodeS})
	if !strings.Contains(out.Code, "typeof v === 'object'") {
		t.Errorf("strip emit missing plain-object gate: %s", out.Code)
	}
	if !strings.Contains(out.Code, "!Array.isArray(v)") {
		t.Errorf("strip emit missing !Array.isArray gate: %s", out.Code)
	}
	if !strings.Contains(out.Code, "v !== null") {
		t.Errorf("strip emit missing v !== null guard: %s", out.Code)
	}

	// hasUnknownKeys (CodeE) — IIFE must also gate on plain object.
	ctx = unionUnknownKeysCtx(t, []*protocol.RunType{str, num, arr, pa, obj, union})
	out = emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: hasSnippet, CodeShape: CodeE})
	if !strings.Contains(out.Code, "typeof v === 'object'") || !strings.Contains(out.Code, "!Array.isArray(v)") {
		t.Errorf("has emit missing plain-object gate: %s", out.Code)
	}

	// JsonWireFormat path keeps its own wrapper gate and does NOT add
	// the plain-object gate (v[1] is already the inner merged object
	// post-wrapper-check).
	ctx = unionUnknownKeysCtx(t, []*protocol.RunType{str, num, arr, pa, obj, union})
	out = emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: ukuSnippet, CodeShape: CodeS, JsonWireFormat: true})
	if strings.Contains(out.Code, "typeof v === 'object'") {
		t.Errorf("wire-format path must not add plain-object gate (wrapper check already gates): %s", out.Code)
	}
	if !strings.Contains(out.Code, "v[0] === -1") {
		t.Errorf("wire-format path missing wrapper gate: %s", out.Code)
	}
}

// TestUnionUnknownKeys_OptionalDoesntChangeAllowlist —
// `{a?: string} | {b: number}`. The optional flag doesn't change the
// allowlist; still `{a, b}`.
func TestUnionUnknownKeys_OptionalDoesntChangeAllowlist(t *testing.T) {
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	num := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	paOpt := &protocol.RunType{ID: "paO", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Optional: true, Child: makeRef("str")}
	pb := &protocol.RunType{ID: "pb", Kind: protocol.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("num")}
	obA := &protocol.RunType{ID: "obA", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("paO")}}
	obB := &protocol.RunType{ID: "obB", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pb")}}
	union := &protocol.RunType{
		ID: "uni", Kind: protocol.KindUnion,
		Children:          []*protocol.RunType{makeRef("obA"), makeRef("obB")},
		SafeUnionChildren: []*protocol.RunType{makeRef("obA"), makeRef("obB")},
	}
	ctx := unionUnknownKeysCtx(t, []*protocol.RunType{str, num, paOpt, pb, obA, obB, union})

	out := emitUnionUnknownKeysMerged(union, ctx, UnknownKeysOpts{Snippet: stripSnippet, CodeShape: CodeS})
	for _, name := range []string{"'a'", "'b'"} {
		if !strings.Contains(out.Code, name) {
			t.Errorf("allowlist missing %s: %s", name, out.Code)
		}
	}
}
