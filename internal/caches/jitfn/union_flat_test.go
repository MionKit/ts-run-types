package jitfn

import (
	"bytes"
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// makeRef returns a KindRef sentinel pointing at the supplied id —
// children inside a union/object live on the wire as refs (see
// internal/protocol). Tests build the same shape.
func makeRef(id string) *protocol.RunType {
	return &protocol.RunType{Kind: protocol.KindRef, ID: id}
}

// buildBigIntDateUnionFixture builds an objectLiteral union with two
// members:
//
//	{ a: bigint; b: Date }  |  { c: number; d: string }
//
// Every property is required. Two disjoint object members with
// non-overlapping property names exercise the merged-encode path
// without any conflict resolution.
func buildBigIntDateUnionFixture() []*protocol.RunType {
	bigint := &protocol.RunType{ID: "big", Kind: protocol.KindBigInt}
	date := &protocol.RunType{ID: "dat", Kind: protocol.KindClass, SubKind: protocol.SubKindDate}
	number := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}

	propA := &protocol.RunType{ID: "pa", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("big")}
	propB := &protocol.RunType{ID: "pb", Kind: protocol.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("dat")}
	propC := &protocol.RunType{ID: "pc", Kind: protocol.KindProperty, Name: "c", IsSafeName: true, Child: makeRef("num")}
	propD := &protocol.RunType{ID: "pd", Kind: protocol.KindProperty, Name: "d", IsSafeName: true, Child: makeRef("str")}

	obj1 := &protocol.RunType{
		ID: "ob1", Kind: protocol.KindObjectLiteral,
		Children: []*protocol.RunType{makeRef("pa"), makeRef("pb")},
	}
	obj2 := &protocol.RunType{
		ID: "ob2", Kind: protocol.KindObjectLiteral,
		Children: []*protocol.RunType{makeRef("pc"), makeRef("pd")},
	}

	union := &protocol.RunType{
		ID:                "uni", Kind: protocol.KindUnion,
		Children:          []*protocol.RunType{makeRef("ob1"), makeRef("ob2")},
		SafeUnionChildren: []*protocol.RunType{makeRef("ob1"), makeRef("ob2")},
	}

	return []*protocol.RunType{
		bigint, date, number, str,
		propA, propB, propC, propD,
		obj1, obj2,
		union,
	}
}

func renderModule(t *testing.T, dump protocol.Dump, fn func(*bytes.Buffer, protocol.Dump) error) string {
	t.Helper()
	var buf bytes.Buffer
	if err := fn(&buf, dump); err != nil {
		t.Fatalf("module render: %v", err)
	}
	return buf.String()
}

// TestPrepareForJsonFlatModule_ObjectUnionMergesProps — the rendered
// flat-prepare factory for `{a:bigint;b:Date} | {c:number;d:string}` MUST
// emit a single object branch that walks every merged property and
// wraps with `[-1, v]`. The factory MUST NOT emit per-member isType
// dispatch for the object members (the whole point of the optimisation).
func TestPrepareForJsonFlatModule_ObjectUnionMergesProps(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildBigIntDateUnionFixture()}
	out := renderModule(t, dump, func(w *bytes.Buffer, d protocol.Dump) error {
		return PrepareForJsonFlatModule(w, d)
	})

	if !strings.Contains(out, "g_pjf_uni") {
		t.Fatalf("expected the flat-union factory g_pjf_uni in rendered module:\n%s", out)
	}
	if !strings.Contains(out, "[-1, v]") {
		t.Errorf("expected `[-1, v]` envelope in object branch; got:\n%s", out)
	}
	if !strings.Contains(out, "v.a !== undefined") {
		t.Errorf("expected `v.a !== undefined` guard for merged prop a; got:\n%s", out)
	}
	if !strings.Contains(out, "v.a.toString()") {
		t.Errorf("expected bigint prep `v.a.toString()`; got:\n%s", out)
	}
	if !strings.Contains(out, "typeof v === 'object'") {
		t.Errorf("expected object-branch guard `typeof v === 'object'`; got:\n%s", out)
	}
	// No per-object isType dispatch on the union itself.
	if strings.Contains(out, "g_it_ob1") || strings.Contains(out, "g_it_ob2") {
		t.Errorf("flat encode should bypass per-object isType dispatch; got:\n%s", out)
	}
}

// TestRestoreFromJsonFlatModule_ObjectUnionDecodesFlat — the rendered
// flat-restore factory MUST detect the `[idx, value]` envelope, route
// idx === -1 to the merged-object walk, and emit per-merged-prop
// restore.
func TestRestoreFromJsonFlatModule_ObjectUnionDecodesFlat(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildBigIntDateUnionFixture()}
	out := renderModule(t, dump, func(w *bytes.Buffer, d protocol.Dump) error {
		return RestoreFromJsonFlatModule(w, d)
	})

	if !strings.Contains(out, "Array.isArray(v) && v.length === 2 && typeof v[0] === 'number'") {
		t.Errorf("expected tuple-shape gate; got:\n%s", out)
	}
	if !strings.Contains(out, "=== -1") {
		t.Errorf("expected `=== -1` dispatch for the merged-object branch; got:\n%s", out)
	}
	if !strings.Contains(out, "v.a = BigInt(v.a)") {
		t.Errorf("expected bigint restore `v.a = BigInt(v.a)`; got:\n%s", out)
	}
	if !strings.Contains(out, "v.b = new Date(v.b)") {
		t.Errorf("expected date restore `v.b = new Date(v.b)`; got:\n%s", out)
	}
}

// TestStringifyJsonFlatModule_ObjectUnionEmitsFlatEnvelope — the
// rendered flat-stringify factory MUST emit the `'[-1,'+…+']'` envelope
// for the object branch.
func TestStringifyJsonFlatModule_ObjectUnionEmitsFlatEnvelope(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildBigIntDateUnionFixture()}
	out := renderModule(t, dump, func(w *bytes.Buffer, d protocol.Dump) error {
		return StringifyJsonFlatModule(w, d)
	})

	if !strings.Contains(out, "'[-1,'") {
		t.Errorf("expected `'[-1,'` envelope prefix; got:\n%s", out)
	}
	if !strings.Contains(out, "filter(Boolean)") {
		t.Errorf("expected `filter(Boolean)` join for optional merged props; got:\n%s", out)
	}
}

// TestPrepareForJsonFlatModule_MixedUnionKeepsAtomicTuple — for
// `string | {a:bigint}`, the string member keeps its `[memberIndex,v]`
// dispatch (with per-member isType) while the object member goes
// through the merged-flat path.
func TestPrepareForJsonFlatModule_MixedUnionKeepsAtomicTuple(t *testing.T) {
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	bigint := &protocol.RunType{ID: "big", Kind: protocol.KindBigInt}
	propA := &protocol.RunType{ID: "pa", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("big")}
	obj := &protocol.RunType{
		ID: "ob1", Kind: protocol.KindObjectLiteral,
		Children: []*protocol.RunType{makeRef("pa")},
	}
	union := &protocol.RunType{
		ID: "uni", Kind: protocol.KindUnion,
		Children:          []*protocol.RunType{makeRef("str"), makeRef("ob1")},
		SafeUnionChildren: []*protocol.RunType{makeRef("str"), makeRef("ob1")},
	}
	dump := protocol.Dump{RunTypes: []*protocol.RunType{str, bigint, propA, obj, union}}
	out := renderModule(t, dump, func(w *bytes.Buffer, d protocol.Dump) error {
		return PrepareForJsonFlatModule(w, d)
	})

	// String is noop-on-both-halves so it should NOT wrap with [0, v].
	if strings.Contains(out, "[0, v]") {
		t.Errorf("noop string member should skip tuple wrap; got:\n%s", out)
	}
	// Object branch still uses the flat envelope.
	if !strings.Contains(out, "[-1, v]") {
		t.Errorf("expected `[-1, v]` envelope for object branch; got:\n%s", out)
	}
	// And the per-merged-prop transform must run on the object branch.
	if !strings.Contains(out, "v.a.toString()") {
		t.Errorf("expected bigint prep on merged prop a; got:\n%s", out)
	}
}

// TestPrepareForJsonFlatModule_ConflictingPropSynthesizesSubUnion — when
// two object members share a property name with different JSON
// transforms ({a: bigint} | {a: Date}), the merged-prop encoder MUST
// emit an inline isType dispatch + `[subIdx, value]` wrap on `v.a` so
// the decoder can distinguish them.
func TestPrepareForJsonFlatModule_ConflictingPropSynthesizesSubUnion(t *testing.T) {
	bigint := &protocol.RunType{ID: "big", Kind: protocol.KindBigInt}
	date := &protocol.RunType{ID: "dat", Kind: protocol.KindClass, SubKind: protocol.SubKindDate}
	propABig := &protocol.RunType{ID: "pab", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("big")}
	propADat := &protocol.RunType{ID: "pad", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("dat")}
	obj1 := &protocol.RunType{ID: "ob1", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pab")}}
	obj2 := &protocol.RunType{ID: "ob2", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pad")}}
	union := &protocol.RunType{
		ID: "uni", Kind: protocol.KindUnion,
		Children:          []*protocol.RunType{makeRef("ob1"), makeRef("ob2")},
		SafeUnionChildren: []*protocol.RunType{makeRef("ob1"), makeRef("ob2")},
	}
	dump := protocol.Dump{RunTypes: []*protocol.RunType{bigint, date, propABig, propADat, obj1, obj2, union}}
	out := renderModule(t, dump, func(w *bytes.Buffer, d protocol.Dump) error {
		return PrepareForJsonFlatModule(w, d)
	})

	if !strings.Contains(out, "v.a = [0, v.a]") {
		t.Errorf("expected inline sub-union wrap `[0, v.a]` for conflicting prop; got:\n%s", out)
	}
	if !strings.Contains(out, "v.a = [1, v.a]") {
		t.Errorf("expected inline sub-union wrap `[1, v.a]` for conflicting prop; got:\n%s", out)
	}
	if !strings.Contains(out, "v.a.toString()") {
		t.Errorf("expected bigint candidate prep on v.a; got:\n%s", out)
	}
}
