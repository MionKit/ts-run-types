package typefunctions

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// jsonCompatCtx builds the minimal EmitContext + RefTable that
// `isJsonCompatible` needs for ResolveRef. The walker is a hollow
// shell — the predicate only ever calls ResolveRef on it.
func jsonCompatCtx(t *testing.T, runTypes []*protocol.RunType) *EmitContext {
	t.Helper()
	refTable := make(map[string]*protocol.RunType, len(runTypes))
	for _, rt := range runTypes {
		if rt == nil || rt.ID == "" {
			continue
		}
		refTable[rt.ID] = rt
	}
	walker := &Walker{RefTable: refTable}
	return &EmitContext{walker: walker}
}

// TestIsJsonCompatible exercises every kind the predicate covers,
// including composites, conflict-free unions, mixed unions, and a
// cycle.
func TestIsJsonCompatible(t *testing.T) {
	str := &protocol.RunType{ID: "str", Kind: protocol.KindString}
	num := &protocol.RunType{ID: "num", Kind: protocol.KindNumber}
	boolean := &protocol.RunType{ID: "bln", Kind: protocol.KindBoolean}
	null := &protocol.RunType{ID: "nul", Kind: protocol.KindNull}
	undef := &protocol.RunType{ID: "und", Kind: protocol.KindUndefined}
	voidT := &protocol.RunType{ID: "vd", Kind: protocol.KindVoid}
	bigint := &protocol.RunType{ID: "big", Kind: protocol.KindBigInt}
	symbol := &protocol.RunType{ID: "sym", Kind: protocol.KindSymbol}
	regexp := &protocol.RunType{ID: "re", Kind: protocol.KindRegexp}
	anyT := &protocol.RunType{ID: "any", Kind: protocol.KindAny}
	unknownT := &protocol.RunType{ID: "ukn", Kind: protocol.KindUnknown}
	objectT := &protocol.RunType{ID: "obj", Kind: protocol.KindObject}
	enumT := &protocol.RunType{ID: "enm", Kind: protocol.KindEnum}
	templateLit := &protocol.RunType{ID: "tmpl", Kind: protocol.KindTemplateLiteral}
	literalStr := &protocol.RunType{ID: "lstr", Kind: protocol.KindLiteral, Literal: "hello"}
	literalNum := &protocol.RunType{ID: "lnum", Kind: protocol.KindLiteral, Literal: 42.0}
	literalBigint := &protocol.RunType{ID: "lbig", Kind: protocol.KindLiteral, Literal: "1", Flags: []string{"bigint"}}
	literalSym := &protocol.RunType{ID: "lsym", Kind: protocol.KindLiteral, Literal: "x", Flags: []string{"symbol"}}
	date := &protocol.RunType{ID: "dat", Kind: protocol.KindClass, SubKind: protocol.SubKindDate}
	mapT := &protocol.RunType{ID: "mp", Kind: protocol.KindClass, SubKind: protocol.SubKindMap}
	setT := &protocol.RunType{ID: "st", Kind: protocol.KindClass, SubKind: protocol.SubKindSet}
	never := &protocol.RunType{ID: "nev", Kind: protocol.KindNever}
	promise := &protocol.RunType{ID: "prm", Kind: protocol.KindPromise}
	function := &protocol.RunType{ID: "fn", Kind: protocol.KindFunction}

	// Composites.
	arrStr := &protocol.RunType{ID: "arrStr", Kind: protocol.KindArray, Child: makeRef("str")}
	arrDate := &protocol.RunType{ID: "arrDat", Kind: protocol.KindArray, Child: makeRef("dat")}

	propA := &protocol.RunType{ID: "pa", Kind: protocol.KindProperty, Name: "a", IsSafeName: true, Child: makeRef("str")}
	propB := &protocol.RunType{ID: "pb", Kind: protocol.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("num")}
	propBDate := &protocol.RunType{ID: "pbd", Kind: protocol.KindProperty, Name: "b", IsSafeName: true, Child: makeRef("dat")}
	objCompat := &protocol.RunType{ID: "objCompat", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pa"), makeRef("pb")}}
	objMixed := &protocol.RunType{ID: "objMixed", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pa"), makeRef("pbd")}}

	// Tuple<string, number>; Tuple<string, Date>.
	tmA := &protocol.RunType{ID: "tmA", Kind: protocol.KindTupleMember, Child: makeRef("str")}
	tmB := &protocol.RunType{ID: "tmB", Kind: protocol.KindTupleMember, Child: makeRef("num")}
	tmDate := &protocol.RunType{ID: "tmD", Kind: protocol.KindTupleMember, Child: makeRef("dat")}
	tupleCompat := &protocol.RunType{ID: "tCompat", Kind: protocol.KindTuple, Children: []*protocol.RunType{makeRef("tmA"), makeRef("tmB")}}
	tupleMixed := &protocol.RunType{ID: "tMixed", Kind: protocol.KindTuple, Children: []*protocol.RunType{makeRef("tmA"), makeRef("tmD")}}

	// Union of compatibles; union with one non-compatible.
	unionCompat := &protocol.RunType{ID: "uOK", Kind: protocol.KindUnion, Children: []*protocol.RunType{makeRef("str"), makeRef("num")}, SafeUnionChildren: []*protocol.RunType{makeRef("str"), makeRef("num")}}
	unionMixed := &protocol.RunType{ID: "uMix", Kind: protocol.KindUnion, Children: []*protocol.RunType{makeRef("str"), makeRef("dat")}, SafeUnionChildren: []*protocol.RunType{makeRef("str"), makeRef("dat")}}
	// Union of two OBJECT members: each is individually JSON-compatible, but the
	// flat-union envelopes object members ([-1, …]) so the union does NOT round-
	// trip raw — a Map/Set value-type containing it must NOT fast-path past the
	// envelope (G5).
	unionObjs := &protocol.RunType{ID: "uObj", Kind: protocol.KindUnion, Children: []*protocol.RunType{makeRef("objCompat"), makeRef("cls")}, SafeUnionChildren: []*protocol.RunType{makeRef("objCompat"), makeRef("cls")}}

	// Class with all-compatible properties.
	classCompat := &protocol.RunType{ID: "cls", Kind: protocol.KindClass, SubKind: protocol.SubKindNone, Children: []*protocol.RunType{makeRef("pa"), makeRef("pb")}}

	// Cycle: object self-references via a property of its own type.
	propSelf := &protocol.RunType{ID: "psf", Kind: protocol.KindProperty, Name: "child", IsSafeName: true, Optional: true, Child: makeRef("objSelf")}
	objSelf := &protocol.RunType{ID: "objSelf", Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{makeRef("pa"), makeRef("psf")}}

	// Class with a function-typed property — skipped per
	// objectChildrenCompat, so the rest of the props decide compatibility.
	propFn := &protocol.RunType{ID: "pfn", Kind: protocol.KindProperty, Name: "fn", IsSafeName: true, Child: makeRef("fn")}
	classWithFn := &protocol.RunType{ID: "clsFn", Kind: protocol.KindClass, SubKind: protocol.SubKindNone, Children: []*protocol.RunType{makeRef("pa"), makeRef("pfn")}}

	all := []*protocol.RunType{
		str, num, boolean, null, undef, voidT, bigint, symbol, regexp,
		anyT, unknownT, objectT, enumT, templateLit,
		literalStr, literalNum, literalBigint, literalSym,
		date, mapT, setT, never, promise, function,
		arrStr, arrDate,
		propA, propB, propBDate, objCompat, objMixed,
		tmA, tmB, tmDate, tupleCompat, tupleMixed,
		unionCompat, unionMixed, unionObjs,
		classCompat,
		propSelf, objSelf,
		propFn, classWithFn,
	}
	ctx := jsonCompatCtx(t, all)

	cases := []struct {
		name string
		rt   *protocol.RunType
		want bool
	}{
		{"string", str, true},
		{"number", num, true},
		{"boolean", boolean, true},
		{"null", null, true},
		{"any", anyT, true},
		{"unknown", unknownT, true},
		{"object (broad)", objectT, true},
		{"enum", enumT, true},
		{"template literal", templateLit, true},
		{"primitive literal (string)", literalStr, true},
		{"primitive literal (number)", literalNum, true},
		{"bigint literal", literalBigint, false},
		{"symbol literal", literalSym, false},
		{"undefined", undef, false},
		{"void", voidT, false},
		{"bigint", bigint, false},
		{"symbol", symbol, false},
		{"regexp", regexp, false},
		{"Date", date, false},
		{"Map", mapT, false},
		{"Set", setT, false},
		{"never", never, false},
		{"Promise", promise, false},
		{"function", function, false},
		{"string[]", arrStr, true},
		{"Date[]", arrDate, false},
		{"object literal {a:string;b:number}", objCompat, true},
		{"object literal {a:string;b:Date}", objMixed, false},
		{"tuple [string, number]", tupleCompat, true},
		{"tuple [string, Date]", tupleMixed, false},
		{"union string | number", unionCompat, true},
		{"union string | Date", unionMixed, false},
		{"union of object members (envelopes)", unionObjs, false},
		{"class with all-JSON props", classCompat, true},
		{"class with function prop (function skipped)", classWithFn, true},
		{"self-referential object literal", objSelf, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := isJsonCompatible(c.rt, ctx)
			if got != c.want {
				t.Errorf("isJsonCompatible(%s) = %v, want %v", c.name, got, c.want)
			}
		})
	}
}
