package typefns

import (
	"testing"

	_ "github.com/mionkit/ts-runtypes/internal/compiled/typefns/formats/all"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

func TestGenerateProto_FlatScalars(t *testing.T) {
	msg := pbMsg(
		pbProp("id", false, numberFmt(map[string]any{"integer": true, "min": 0.0, "max": 255.0})),
		pbProp("name", false, pbString()),
		pbProp("active", false, pbBoolean()),
		pbProp("nick", true, pbString()),
	)
	msg.TypeName = "User"
	got, err := GenerateProto(msg, map[string]*protocol.RunType{})
	if err != nil {
		t.Fatal(err)
	}
	want := `syntax = "proto3";

message User {
  uint32 id = 1;
  string name = 2;
  bool active = 3;
  optional string nick = 4;
}
`
	if got != want {
		t.Errorf("got:\n%s\nwant:\n%s", got, want)
	}
}

func TestGenerateProto_Composite(t *testing.T) {
	address := pbMsg(pbProp("city", false, pbString()))
	address.TypeName = "Address"
	mapStrNum := &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindMap, Children: []*protocol.RunType{
		{Kind: protocol.KindString, SubKind: protocol.SubKindMapKey},
		{Kind: protocol.KindNumber, SubKind: protocol.SubKindMapValue},
	}}
	uint8arr := &protocol.RunType{Kind: protocol.KindClass, SubKind: protocol.SubKindNonSerializable, ClassRef: &protocol.ClassRef{Builtin: "Uint8Array"}}
	user := pbMsg(
		pbProp("id", false, numberFmt(map[string]any{"integer": true, "min": 0.0, "max": 255.0})),
		pbProp("tags", false, &protocol.RunType{Kind: protocol.KindArray, Child: pbString()}),
		pbProp("home", false, address),
		pbProp("counts", false, mapStrNum),
		pbProp("avatar", false, uint8arr),
	)
	user.TypeName = "User"
	got, err := GenerateProto(user, map[string]*protocol.RunType{})
	if err != nil {
		t.Fatal(err)
	}
	want := `syntax = "proto3";

message User {
  uint32 id = 1;
  repeated string tags = 2;
  Address home = 3;
  map<string, double> counts = 4;
  bytes avatar = 5;
}

message Address {
  string city = 1;
}
`
	if got != want {
		t.Errorf("got:\n%s\nwant:\n%s", got, want)
	}
}

// A self-referential message terminates (the message is named once) and renders
// a single definition.
func TestGenerateProto_Recursive(t *testing.T) {
	node := &protocol.RunType{ID: "node", Kind: protocol.KindObjectLiteral, TypeName: "Node"}
	node.Children = []*protocol.RunType{
		pbProp("value", false, pbNumber()),
		pbProp("next", true, &protocol.RunType{Kind: protocol.KindRef, ID: "node"}),
	}
	got, err := GenerateProto(node, map[string]*protocol.RunType{"node": node})
	if err != nil {
		t.Fatal(err)
	}
	want := `syntax = "proto3";

message Node {
  double value = 1;
  optional Node next = 2;
}
`
	if got != want {
		t.Errorf("got:\n%s\nwant:\n%s", got, want)
	}
}

// A non-message root is rejected (protobuf requires a top-level message).
func TestGenerateProto_RejectsNonMessage(t *testing.T) {
	if _, err := GenerateProto(pbNumber(), map[string]*protocol.RunType{}); err == nil {
		t.Errorf("expected an error for a scalar root")
	}
}
