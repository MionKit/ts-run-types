package typefns

import (
	"testing"

	// Side-effect: registers the numeric/bigint/string format emitters so
	// LookupForRunType resolves them (the BinarySizer path used by the bigint
	// 64-bit gate).
	_ "github.com/mionkit/ts-runtypes/internal/compiled/typefns/formats/all"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// --- construction helpers -------------------------------------------------

func pbProp(name string, optional bool, child *protocol.RunType) *protocol.RunType {
	return &protocol.RunType{Kind: protocol.KindProperty, Name: name, Optional: optional, Child: child}
}

func pbMsg(children ...*protocol.RunType) *protocol.RunType {
	return &protocol.RunType{Kind: protocol.KindObjectLiteral, Children: children}
}

func pbNumber() *protocol.RunType  { return &protocol.RunType{Kind: protocol.KindNumber} }
func pbString() *protocol.RunType  { return &protocol.RunType{Kind: protocol.KindString} }
func pbBoolean() *protocol.RunType { return &protocol.RunType{Kind: protocol.KindBoolean} }

func pbBigintFmt(params map[string]any) *protocol.RunType {
	return &protocol.RunType{Kind: protocol.KindBigInt, FormatAnnotation: &protocol.FormatAnnotation{Name: "bigintFormat", Params: params}}
}

func pbExpressible(rt *protocol.RunType) ProtobufSupport {
	return ProtobufExpressible(rt, map[string]*protocol.RunType{})
}

// --- root gate ------------------------------------------------------------

func TestProtobuf_RootMustBeMessage(t *testing.T) {
	cases := []struct {
		name string
		rt   *protocol.RunType
	}{
		{"scalar root", pbNumber()},
		{"string root", pbString()},
		{"array root", &protocol.RunType{Kind: protocol.KindArray, Child: pbNumber()}},
		{"union root", &protocol.RunType{Kind: protocol.KindUnion, Children: []*protocol.RunType{pbMsg(pbProp("a", false, pbNumber()))}}},
		{"broad object root", &protocol.RunType{Kind: protocol.KindObject}},
		{"pure record root", &protocol.RunType{Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{
			{Kind: protocol.KindIndexSignature, Index: pbString(), Child: pbNumber()}}}},
	}
	for _, tc := range cases {
		got := pbExpressible(tc.rt)
		if got.OK {
			t.Errorf("%s: expected not protobuf-expressible at root", tc.name)
		}
		if got.Reason == "" {
			t.Errorf("%s: expected a non-empty reason", tc.name)
		}
	}
}

// --- in-subset messages ---------------------------------------------------

func TestProtobuf_InSubset(t *testing.T) {
	date := &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindDate}
	mapStrNum := &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindMap, Children: []*protocol.RunType{
		{Kind: protocol.KindString, SubKind: protocol.SubKindMapKey},
		{Kind: protocol.KindNumber, SubKind: protocol.SubKindMapValue},
	}}
	setNum := &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindSet, Children: []*protocol.RunType{
		{Kind: protocol.KindNumber, SubKind: protocol.SubKindSetItem},
	}}
	recordField := &protocol.RunType{Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{
		{Kind: protocol.KindIndexSignature, Index: pbString(), Child: pbNumber()}}}
	cases := []struct {
		name string
		rt   *protocol.RunType
	}{
		{"flat scalars", pbMsg(pbProp("id", false, pbNumber()), pbProp("name", false, pbString()), pbProp("ok", false, pbBoolean()))},
		{"optional field", pbMsg(pbProp("id", false, pbNumber()), pbProp("nick", true, pbString()))},
		{"nested message", pbMsg(pbProp("inner", false, pbMsg(pbProp("x", false, pbNumber()))))},
		{"repeated scalar", pbMsg(pbProp("tags", false, &protocol.RunType{Kind: protocol.KindArray, Child: pbString()}))},
		{"repeated message", pbMsg(pbProp("items", false, &protocol.RunType{Kind: protocol.KindArray, Child: pbMsg(pbProp("x", false, pbNumber()))}))},
		{"date -> timestamp", pbMsg(pbProp("created", false, date))},
		{"map<string,number>", pbMsg(pbProp("counts", false, mapStrNum))},
		{"set<number>", pbMsg(pbProp("ids", false, setNum))},
		{"record field -> map", pbMsg(pbProp("meta", false, recordField))},
		{"uint8array -> bytes", pbMsg(pbProp("buf", false, &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindNonSerializable, ClassRef: &protocol.ClassRef{Builtin: "Uint8Array"}}))},
		{"arraybuffer -> bytes", pbMsg(pbProp("raw", false, &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindNonSerializable, ClassRef: &protocol.ClassRef{Builtin: "ArrayBuffer"}}))},
		{"bigint 64-bit", pbMsg(pbProp("big", false, pbBigintFmt(map[string]any{"min": "-1000n", "max": "1000n"})))},
		{"homogeneous literal union -> string", pbMsg(pbProp("v", false, &protocol.RunType{Kind: protocol.KindUnion, Children: []*protocol.RunType{{Kind: protocol.KindLiteral, Literal: "a"}, {Kind: protocol.KindLiteral, Literal: "b"}}}))},
		{"optional via union", pbMsg(pbProp("v", false, &protocol.RunType{Kind: protocol.KindUnion, Children: []*protocol.RunType{pbString(), {Kind: protocol.KindUndefined}}}))},
	}
	for _, tc := range cases {
		got := pbExpressible(tc.rt)
		if !got.OK {
			t.Errorf("%s: expected protobuf-expressible, got fault at %q: %s", tc.name, got.Member, got.Reason)
		}
	}
}

// --- out-of-subset --------------------------------------------------------

func TestProtobuf_OutOfSubset(t *testing.T) {
	mapBadKey := &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindMap, Children: []*protocol.RunType{
		{Kind: protocol.KindNumber, SubKind: protocol.SubKindMapKey}, // number key with no integer format
		{Kind: protocol.KindNumber, SubKind: protocol.SubKindMapValue},
	}}
	cases := []struct {
		name       string
		rt         *protocol.RunType
		wantMember string
	}{
		{"tuple field", pbMsg(pbProp("pair", false, &protocol.RunType{Kind: protocol.KindTuple, Children: []*protocol.RunType{pbNumber(), pbString()}})), "pair"},
		{"any field", pbMsg(pbProp("blob", false, &protocol.RunType{Kind: protocol.KindAny})), "blob"},
		{"intersection field", pbMsg(pbProp("x", false, &protocol.RunType{Kind: protocol.KindIntersection})), "x"},
		{"regexp field", pbMsg(pbProp("re", false, &protocol.RunType{Kind: protocol.KindRegexp})), "re"},
		{"nested array of array", pbMsg(pbProp("grid", false, &protocol.RunType{Kind: protocol.KindArray, Child: &protocol.RunType{Kind: protocol.KindArray, Child: pbNumber()}})), "grid[]"},
		{"bigint unbounded", pbMsg(pbProp("big", false, &protocol.RunType{Kind: protocol.KindBigInt})), "big"},
		{"non-serializable class", pbMsg(pbProp("err", false, &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindNonSerializable, ClassRef: &protocol.ClassRef{Builtin: "Error"}})), "err"},
		{"dataview not bytes", pbMsg(pbProp("dv", false, &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindNonSerializable, ClassRef: &protocol.ClassRef{Builtin: "DataView"}})), "dv"},
		{"map bad key", pbMsg(pbProp("m", false, mapBadKey)), "m{key}"},
		{"mixed union", pbMsg(pbProp("v", false, &protocol.RunType{Kind: protocol.KindUnion, Children: []*protocol.RunType{pbString(), pbMsg(pbProp("a", false, pbNumber()))}})), "v"},
		{"message union (oneof deferred)", pbMsg(pbProp("v", false, &protocol.RunType{Kind: protocol.KindUnion, Children: []*protocol.RunType{pbMsg(pbProp("a", false, pbNumber())), pbMsg(pbProp("b", false, pbString()))}})), "v"},
		{"heterogeneous scalar union", pbMsg(pbProp("v", false, &protocol.RunType{Kind: protocol.KindUnion, Children: []*protocol.RunType{pbString(), pbNumber()}})), "v"},
	}
	for _, tc := range cases {
		got := pbExpressible(tc.rt)
		if got.OK {
			t.Errorf("%s: expected out-of-subset", tc.name)
			continue
		}
		if got.Member != tc.wantMember {
			t.Errorf("%s: offending member = %q, want %q (reason: %s)", tc.name, got.Member, tc.wantMember, got.Reason)
		}
	}
}

// Non-data members (methods, function-valued props) are dropped like the
// data-only contract — they never block a message.
func TestProtobuf_NonDataMembersDropped(t *testing.T) {
	method := &protocol.RunType{Kind: protocol.KindMethod, Name: "doThing"}
	fnProp := &protocol.RunType{Kind: protocol.KindProperty, Name: "onClick",
		Child: &protocol.RunType{Kind: protocol.KindFunction, NotSupported: true}}
	rt := pbMsg(pbProp("id", false, pbNumber()), method, fnProp)
	if got := pbExpressible(rt); !got.OK {
		t.Errorf("expected expressible after dropping non-data members, got fault at %q: %s", got.Member, got.Reason)
	}
}

// The offending path points at the first bad member, including nesting.
func TestProtobuf_OffendingPathNested(t *testing.T) {
	inner := pbMsg(pbProp("when", false, &protocol.RunType{Kind: protocol.KindRegexp}))
	rt := pbMsg(pbProp("id", false, pbNumber()), pbProp("inner", false, inner))
	got := pbExpressible(rt)
	if got.OK {
		t.Fatalf("expected out-of-subset for nested regexp")
	}
	if got.Member != "inner.when" {
		t.Errorf("offending member = %q, want %q", got.Member, "inner.when")
	}
}

// A self-referential message must terminate and stay in-subset.
func TestProtobuf_CycleTerminates(t *testing.T) {
	node := &protocol.RunType{ID: "n1", Kind: protocol.KindObjectLiteral}
	selfRef := &protocol.RunType{Kind: protocol.KindRef, ID: "n1"}
	node.Children = []*protocol.RunType{
		pbProp("id", false, pbNumber()),
		pbProp("next", true, selfRef),
	}
	refTable := map[string]*protocol.RunType{"n1": node}
	got := ProtobufExpressible(node, refTable)
	if !got.OK {
		t.Errorf("recursive message: expected expressible, got fault at %q: %s", got.Member, got.Reason)
	}
}

// Integer-formatted number keys are valid protobuf map keys.
func TestProtobuf_IntegerMapKey(t *testing.T) {
	mapIntNum := &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindMap, Children: []*protocol.RunType{
		{Kind: protocol.KindNumber, SubKind: protocol.SubKindMapKey, FormatAnnotation: &protocol.FormatAnnotation{Name: "numberFormat", Params: map[string]any{"integer": true}}},
		{Kind: protocol.KindString, SubKind: protocol.SubKindMapValue},
	}}
	if got := pbExpressible(pbMsg(pbProp("byId", false, mapIntNum))); !got.OK {
		t.Errorf("integer map key: expected expressible, got fault at %q: %s", got.Member, got.Reason)
	}
}
