package typefns

import (
	"testing"

	_ "github.com/mionkit/ts-runtypes/internal/compiled/typefns/formats/all"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

func classify(rt *protocol.RunType) (ProtoFieldClass, bool) {
	return ClassifyProtoField(rt, map[string]*protocol.RunType{})
}

func TestClassify_Scalars(t *testing.T) {
	cases := []struct {
		name   string
		rt     *protocol.RunType
		scalar ProtoScalar
	}{
		{"number", pbNumber(), ProtoDouble},
		{"uint8 fmt", numberFmt(map[string]any{"integer": true, "min": 0.0, "max": 255.0}), ProtoUint32},
		{"string", pbString(), ProtoString},
		{"bool", pbBoolean(), ProtoBool},
		{"uint8array -> bytes", &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindNonSerializable, ClassRef: &protocol.ClassRef{Builtin: "Uint8Array"}}, ProtoBytes},
	}
	for _, tc := range cases {
		got, ok := classify(tc.rt)
		if !ok || got.Form != ProtoFormScalar || got.Scalar != tc.scalar {
			t.Errorf("%s: got (form=%d scalar=%q ok=%v), want scalar %q", tc.name, got.Form, got.Scalar, ok, tc.scalar)
		}
	}
}

func TestClassify_Composites(t *testing.T) {
	msg := pbMsg(pbProp("x", false, pbNumber()))
	if got, ok := classify(msg); !ok || got.Form != ProtoFormMessage || got.Value != msg {
		t.Errorf("message: got (form=%d ok=%v)", got.Form, ok)
	}

	enum := &protocol.RunType{Kind: protocol.KindEnum}
	if got, ok := classify(enum); !ok || got.Form != ProtoFormEnum {
		t.Errorf("enum: got (form=%d ok=%v)", got.Form, ok)
	}

	arr := &protocol.RunType{Kind: protocol.KindArray, Child: pbString()}
	if got, ok := classify(arr); !ok || got.Form != ProtoFormRepeated || got.Value.Kind != protocol.KindString {
		t.Errorf("repeated: got (form=%d ok=%v)", got.Form, ok)
	}

	set := &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindSet, Children: []*protocol.RunType{
		{Kind: protocol.KindNumber, SubKind: protocol.SubKindSetItem}}}
	if got, ok := classify(set); !ok || got.Form != ProtoFormRepeated || got.Value.Kind != protocol.KindNumber {
		t.Errorf("set->repeated: got (form=%d ok=%v)", got.Form, ok)
	}
}

func TestClassify_MapAndRecord(t *testing.T) {
	mapStrNum := &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindMap, Children: []*protocol.RunType{
		{Kind: protocol.KindString, SubKind: protocol.SubKindMapKey},
		{Kind: protocol.KindNumber, SubKind: protocol.SubKindMapValue}}}
	got, ok := classify(mapStrNum)
	if !ok || got.Form != ProtoFormMap || got.MapKey != ProtoString || got.Value.Kind != protocol.KindNumber {
		t.Errorf("map: got (form=%d key=%q ok=%v)", got.Form, got.MapKey, ok)
	}

	record := &protocol.RunType{Kind: protocol.KindObjectLiteral, Children: []*protocol.RunType{
		{Kind: protocol.KindIndexSignature, Index: pbString(), Child: pbNumber()}}}
	got, ok = classify(record)
	if !ok || got.Form != ProtoFormMap || got.MapKey != ProtoString {
		t.Errorf("record->map: got (form=%d key=%q ok=%v)", got.Form, got.MapKey, ok)
	}
}

func TestClassify_Unions(t *testing.T) {
	// discriminated message union → oneof
	oneof := &protocol.RunType{Kind: protocol.KindUnion, Children: []*protocol.RunType{
		pbMsg(pbProp("a", false, pbNumber())), pbMsg(pbProp("b", false, pbString()))}}
	if got, ok := classify(oneof); !ok || got.Form != ProtoFormOneof || len(got.Members) != 2 {
		t.Errorf("oneof: got (form=%d members=%d ok=%v)", got.Form, len(got.Members), ok)
	}

	// homogeneous string-literal union → single string scalar
	litUnion := &protocol.RunType{Kind: protocol.KindUnion, Children: []*protocol.RunType{
		{Kind: protocol.KindLiteral, Literal: "a"}, {Kind: protocol.KindLiteral, Literal: "b"}}}
	if got, ok := classify(litUnion); !ok || got.Form != ProtoFormScalar || got.Scalar != ProtoString {
		t.Errorf("literal union: got (form=%d scalar=%q ok=%v)", got.Form, got.Scalar, ok)
	}

	// optional via union (string | undefined) → scalar (consumer marks optional)
	optional := &protocol.RunType{Kind: protocol.KindUnion, Children: []*protocol.RunType{
		pbString(), {Kind: protocol.KindUndefined}}}
	if got, ok := classify(optional); !ok || got.Form != ProtoFormScalar || got.Scalar != ProtoString {
		t.Errorf("optional union: got (form=%d scalar=%q ok=%v)", got.Form, got.Scalar, ok)
	}
}

func TestClassify_WellKnown(t *testing.T) {
	date := &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindDate}
	if got, ok := classify(date); !ok || got.Form != ProtoFormWellKnown || got.WellKnown != "google.protobuf.Timestamp" {
		t.Errorf("date: got (form=%d wk=%q ok=%v)", got.Form, got.WellKnown, ok)
	}
	duration := &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindTemporalDuration}
	if got, ok := classify(duration); !ok || got.Form != ProtoFormWellKnown || got.WellKnown != "google.protobuf.Duration" {
		t.Errorf("duration: got (form=%d wk=%q ok=%v)", got.Form, got.WellKnown, ok)
	}
}
