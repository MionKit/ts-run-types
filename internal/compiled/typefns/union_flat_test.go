package typefns

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-run-types/internal/operations"
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
		ID: "uni", Kind: protocol.KindUnion,
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

func renderModule(t *testing.T, dump protocol.Dump, familyKey string) string {
	t.Helper()
	// EmitMode 'both' so body assertions match the un-escaped form inside
	// the inline closure — see module_test.go's renderToString rationale.
	return joinEntries(t, FamilyByKey(familyKey).Collect(dump, RenderOpts{EmitMode: "both"}, nil))
}

// renderModuleDefault is the production-default (EmitMode 'code')
// sibling — bodies live only in the quoted `code` string.
func renderModuleDefault(t *testing.T, dump protocol.Dump, familyKey string) string {
	t.Helper()
	return joinEntries(t, FamilyByKey(familyKey).Collect(dump, RenderOpts{}, nil))
}

// TestPrepareForJsonModule_ObjectUnionMergesProps — the rendered
// flat-prepare factory for `{a:bigint;b:Date} | {c:number;d:string}` MUST
// emit a single object branch that walks every merged property and
// wraps with `[-1, v]`. The factory MUST NOT emit per-member validate
// dispatch for the object members (the whole point of the optimisation).
func TestPrepareForJsonModule_ObjectUnionMergesProps(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildBigIntDateUnionFixture()}
	// EmitMode 'both' so the body assertions below match the
	// un-escaped form inside the `function g_pj_uni(utl){…}` closure.
	// See module_test.go's renderToString comment for the rationale.
	out := renderModule(t, dump, "prepareForJson")

	pjUniFactory := "g_" + operations.PlainHash("prepareForJson") + "_uni"
	if !strings.Contains(out, pjUniFactory) {
		t.Fatalf("expected the prepareForJson union factory %s in rendered module:\n%s", pjUniFactory, out)
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
	// No per-object validate dispatch on the union itself.
	if strings.Contains(out, "g_"+valKey("ob1")) || strings.Contains(out, "g_"+valKey("ob2")) {
		t.Errorf("flat encode should bypass per-object validate dispatch; got:\n%s", out)
	}
}

// TestRestoreFromJsonModule_ObjectUnionDecodesFlat — the rendered
// flat-restore factory unconditionally unwraps the `[idx, value]`
// envelope (no runtime shape gate) and dispatches via `idx === -1` for
// the merged-object branch. Under the all-or-nothing wrap rule the
// decoder knows the wire shape at compile time so the fragile
// length-2 + typeof-number heuristic is gone.
func TestRestoreFromJsonModule_ObjectUnionDecodesFlat(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildBigIntDateUnionFixture()}
	out := renderModuleDefault(t, dump, "restoreFromJson")

	if strings.Contains(out, "Array.isArray(v) && v.length === 2 && typeof v[0] === 'number'") {
		t.Errorf("optimised emit must NOT use the length-2 + typeof[0]==='number' shape gate — it false-positives on legitimate raw values; got:\n%s", out)
	}
	if !strings.Contains(out, "const dec0 = v[0]") {
		t.Errorf("expected unconditional unwrap `const dec0 = v[0]`; got:\n%s", out)
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

// TestStringifyJsonModule_ObjectUnionEmitsFlatEnvelope — the
// rendered flat-stringify factory MUST emit the `'[-1,'+…+']'` envelope
// for the object branch. The fixture has two disjoint members
// `{a:bigint; b:Date} | {c:number; d:string}` — no shared properties,
// so every merged prop is optional from the union's perspective. The
// emit uses the slice(1) trick to strip the leading comma after
// conditional concat (one comma is prepended per populated branch).
func TestStringifyJsonModule_ObjectUnionEmitsFlatEnvelope(t *testing.T) {
	dump := protocol.Dump{RunTypes: buildBigIntDateUnionFixture()}
	// EmitMode 'both' so the body assertions match the
	// un-escaped form inside the inline factory closure.
	out := renderModule(t, dump, "stringifyJson")

	if !strings.Contains(out, "'[-1,'") {
		t.Errorf("expected `'[-1,'` envelope prefix; got:\n%s", out)
	}
	if !strings.Contains(out, ".slice(1)") {
		t.Errorf("expected `.slice(1)` leading-comma strip for all-optional merged props; got:\n%s", out)
	}
	if strings.Contains(out, "filter(Boolean)") {
		t.Errorf("optimised emit must NOT use filter(Boolean) — that pattern allocates two arrays per call; got:\n%s", out)
	}
}

// TestStringifyJsonModule_RequiredPropsSkipUndefinedGuard — when
// every union member declares the same set of non-optional properties,
// the merged emit must omit the per-property `=== undefined` guard. The
// fixture is a 3-member union `{discriminator:'a';name:string;date:Date}
// | …'b' | …'c'` where every prop is shared and required; the emit
// should collapse to flat string concat matching the non-flat
// per-member factory shape.
func TestStringifyJsonModule_RequiredPropsSkipUndefinedGuard(t *testing.T) {
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	date := &protocol.RunType{ID: "dat", Kind: protocol.KindClass, SubKind: protocol.SubKindDate}
	litA := &protocol.RunType{ID: "litA", Kind: protocol.KindLiteral, Literal: "a"}
	litB := &protocol.RunType{ID: "litB", Kind: protocol.KindLiteral, Literal: "b"}
	litC := &protocol.RunType{ID: "litC", Kind: protocol.KindLiteral, Literal: "c"}
	pdA := &protocol.RunType{ID: "pdA", Kind: protocol.KindProperty, Name: "discriminator", IsSafeName: true, Child: makeRef("litA")}
	pdB := &protocol.RunType{ID: "pdB", Kind: protocol.KindProperty, Name: "discriminator", IsSafeName: true, Child: makeRef("litB")}
	pdC := &protocol.RunType{ID: "pdC", Kind: protocol.KindProperty, Name: "discriminator", IsSafeName: true, Child: makeRef("litC")}
	pnA := &protocol.RunType{ID: "pnA", Kind: protocol.KindProperty, Name: "name", IsSafeName: true, Child: makeRef("str")}
	pnB := &protocol.RunType{ID: "pnB", Kind: protocol.KindProperty, Name: "name", IsSafeName: true, Child: makeRef("str")}
	pnC := &protocol.RunType{ID: "pnC", Kind: protocol.KindProperty, Name: "name", IsSafeName: true, Child: makeRef("str")}
	pdaA := &protocol.RunType{ID: "pdaA", Kind: protocol.KindProperty, Name: "date", IsSafeName: true, Child: makeRef("dat")}
	pdaB := &protocol.RunType{ID: "pdaB", Kind: protocol.KindProperty, Name: "date", IsSafeName: true, Child: makeRef("dat")}
	pdaC := &protocol.RunType{ID: "pdaC", Kind: protocol.KindProperty, Name: "date", IsSafeName: true, Child: makeRef("dat")}
	obA := &protocol.RunType{ID: "obA", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pdA"), makeRef("pnA"), makeRef("pdaA")}}
	obB := &protocol.RunType{ID: "obB", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pdB"), makeRef("pnB"), makeRef("pdaB")}}
	obC := &protocol.RunType{ID: "obC", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pdC"), makeRef("pnC"), makeRef("pdaC")}}
	union := &protocol.RunType{
		ID:                "uni",
		Kind:              protocol.KindUnion,
		Children:          []*protocol.RunType{makeRef("obA"), makeRef("obB"), makeRef("obC")},
		SafeUnionChildren: []*protocol.RunType{makeRef("obA"), makeRef("obB"), makeRef("obC")},
	}
	dump := protocol.Dump{RunTypes: []*protocol.RunType{
		str, date, litA, litB, litC,
		pdA, pdB, pdC, pnA, pnB, pnC, pdaA, pdaB, pdaC,
		obA, obB, obC, union,
	}}
	out := renderModuleDefault(t, dump, "stringifyJson")

	// No per-property undefined guard in the union root's emit — every
	// prop is required across all members.
	if strings.Contains(out, "v.name === undefined") || strings.Contains(out, "v.date === undefined") {
		t.Errorf("required props must skip `=== undefined` guard; got:\n%s", out)
	}
	// No IIFE per-property dispatch for the literal discriminator — all
	// three literal candidates produce identical childCode, so the
	// dispatch collapses to the shared `JSON.stringify(v.discriminator)`.
	if strings.Contains(out, "function(){if (") {
		t.Errorf("multi-candidate literal discriminator must collapse to single shared childCode; got:\n%s", out)
	}
	// Pure-concat shape — the slice(1) trick is for all-optional cases;
	// when at least one required prop exists, the emit must use direct
	// concat with no slice() call.
	if strings.Contains(out, ".slice(1)") {
		t.Errorf("required-anchored emit must use direct concat (no slice); got:\n%s", out)
	}
}

// TestPrepareForJsonModule_MixedUnionWrapsEveryMember — for
// `string | {a:bigint}` the all-or-nothing wrap rule kicks in: an
// object branch is present, so the decoder must unconditionally
// unwrap, which forces the atomic string member to wrap too even
// though it's noop on both halves. Previously the per-member rule
// skipped the string wrap, but that left the decoder relying on a
// fragile shape gate to distinguish wrapped from raw values.
func TestPrepareForJsonModule_MixedUnionWrapsEveryMember(t *testing.T) {
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
	out := renderModuleDefault(t, dump, "prepareForJson")

	// Object branch exists so string member MUST wrap too — every
	// encoded value must be unambiguously [idx, value] on the wire.
	if !strings.Contains(out, "v = [0, v]") {
		t.Errorf("string member must wrap as [0, v] when object branch coexists; got:\n%s", out)
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

// TestPrepareForJsonModule_ConflictingPropSynthesizesSubUnion — when
// two object members share a property name with different JSON
// transforms ({a: bigint} | {a: Date}), the merged-prop encoder MUST
// emit an inline validate dispatch + `[subIdx, value]` wrap on `v.a` so
// the decoder can distinguish them.
func TestPrepareForJsonModule_ConflictingPropSynthesizesSubUnion(t *testing.T) {
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
	out := renderModuleDefault(t, dump, "prepareForJson")

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
