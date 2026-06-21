package typefns

import (
	"testing"

	// Side-effect: registers the bigint format emitter so the BinarySizer-based
	// 64-bit gate resolves.
	_ "github.com/mionkit/ts-runtypes/internal/compiled/typefns/formats/all"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

func TestProtobufScalar_NumbersAndBounds(t *testing.T) {
	cases := []struct {
		name string
		rt   *protocol.RunType
		want ProtoScalar
	}{
		{"bool", &protocol.RunType{Kind: protocol.KindBoolean}, ProtoBool},
		{"string", &protocol.RunType{Kind: protocol.KindString}, ProtoString},
		{"bare number", &protocol.RunType{Kind: protocol.KindNumber}, ProtoDouble},
		{"float number", numberFmt(map[string]any{"float": true}), ProtoDouble},
		{"uint8 -> uint32", numberFmt(map[string]any{"integer": true, "min": 0.0, "max": 255.0}), ProtoUint32},
		{"uint near 2^32 -> uint32", numberFmt(map[string]any{"integer": true, "min": 0.0, "max": 4000000000.0}), ProtoUint32},
		{"small signed -> sint32", numberFmt(map[string]any{"integer": true, "min": -100.0, "max": 100.0}), ProtoSint32},
		{"int32 edges -> sint32", numberFmt(map[string]any{"integer": true, "min": -2147483648.0, "max": 2147483647.0}), ProtoSint32},
		{"wide signed -> double", numberFmt(map[string]any{"integer": true, "min": -3000000000.0, "max": 3000000000.0}), ProtoDouble},
		{"wide unsigned -> double", numberFmt(map[string]any{"integer": true, "min": 0.0, "max": 1e15}), ProtoDouble},
		{"unbounded integer -> double", numberFmt(map[string]any{"integer": true}), ProtoDouble},
	}
	for _, tc := range cases {
		got, ok := ProtobufScalarFor(tc.rt)
		if !ok {
			t.Errorf("%s: expected a scalar, got ok=false", tc.name)
			continue
		}
		if got != tc.want {
			t.Errorf("%s: scalar = %q, want %q", tc.name, got, tc.want)
		}
	}
}

func TestProtobufScalar_Bigint(t *testing.T) {
	unsigned := &protocol.RunType{Kind: protocol.KindBigInt, FormatAnnotation: &protocol.FormatAnnotation{
		Name: "bigintFormat", Params: map[string]any{"min": "0n", "max": "1000n"}}}
	if got, ok := ProtobufScalarFor(unsigned); !ok || got != ProtoUint64 {
		t.Errorf("unsigned bigint: got (%q, %v), want (uint64, true)", got, ok)
	}
	signed := &protocol.RunType{Kind: protocol.KindBigInt, FormatAnnotation: &protocol.FormatAnnotation{
		Name: "bigintFormat", Params: map[string]any{"min": "-5n", "max": "1000n"}}}
	if got, ok := ProtobufScalarFor(signed); !ok || got != ProtoSint64 {
		t.Errorf("signed bigint: got (%q, %v), want (sint64, true)", got, ok)
	}
	unbounded := &protocol.RunType{Kind: protocol.KindBigInt}
	if _, ok := ProtobufScalarFor(unbounded); ok {
		t.Errorf("unbounded bigint: expected ok=false (out-of-subset)")
	}
}

func TestProtobufScalar_Literals(t *testing.T) {
	cases := []struct {
		name string
		lit  any
		want ProtoScalar
	}{
		{"bool literal", true, ProtoBool},
		{"string literal", "circle", ProtoString},
		{"number literal", 5.0, ProtoDouble},
	}
	for _, tc := range cases {
		rt := &protocol.RunType{Kind: protocol.KindLiteral, Literal: tc.lit}
		got, ok := ProtobufScalarFor(rt)
		if !ok || got != tc.want {
			t.Errorf("%s: got (%q, %v), want (%q, true)", tc.name, got, ok, tc.want)
		}
	}
}

// Binary buffers map to the `bytes` scalar; other non-serializable classes do
// not.
func TestProtobufScalar_Bytes(t *testing.T) {
	for _, name := range []string{"Uint8Array", "Uint8ClampedArray", "ArrayBuffer"} {
		rt := &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindNonSerializable, ClassRef: &protocol.ClassRef{Builtin: name}}
		if got, ok := ProtobufScalarFor(rt); !ok || got != ProtoBytes {
			t.Errorf("%s: got (%q, %v), want (bytes, true)", name, got, ok)
		}
	}
	notBytes := &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindNonSerializable, ClassRef: &protocol.ClassRef{Builtin: "Error"}}
	if _, ok := ProtobufScalarFor(notBytes); ok {
		t.Errorf("Error class: expected ok=false")
	}
}

// Non-scalar kinds report ok=false (they are handled by the message/repeated/
// map/oneof paths, not as scalars).
func TestProtobufScalar_NonScalar(t *testing.T) {
	for _, rt := range []*protocol.RunType{
		{Kind: protocol.KindObjectLiteral},
		{Kind: protocol.KindArray},
		{Kind: protocol.KindUnion},
	} {
		if _, ok := ProtobufScalarFor(rt); ok {
			t.Errorf("kind %v: expected ok=false", rt.Kind)
		}
	}
}
