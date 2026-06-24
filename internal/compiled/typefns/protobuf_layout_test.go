package typefns

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

func TestProtobufFields_DeclOrderNumbers(t *testing.T) {
	msg := pbMsg(
		pbProp("id", false, pbNumber()),
		pbProp("nick", true, pbString()),
		pbProp("ok", false, pbBoolean()),
	)
	slots := ProtobufFields(msg, map[string]*protocol.RunType{})
	want := []ProtoFieldSlot{
		{Name: "id", Number: 1, Optional: false},
		{Name: "nick", Number: 2, Optional: true},
		{Name: "ok", Number: 3, Optional: false},
	}
	if len(slots) != len(want) {
		t.Fatalf("got %d slots, want %d", len(slots), len(want))
	}
	for i, w := range want {
		if slots[i].Name != w.Name || slots[i].Number != w.Number || slots[i].Optional != w.Optional {
			t.Errorf("slot %d = {%s, %d, %v}, want {%s, %d, %v}", i,
				slots[i].Name, slots[i].Number, slots[i].Optional, w.Name, w.Number, w.Optional)
		}
	}
}

// Non-data members are dropped and do NOT consume a field number — the next
// real field keeps the next sequential number.
func TestProtobufFields_DropsNonDataNoGaps(t *testing.T) {
	method := &protocol.RunType{Kind: protocol.KindMethod, Name: "doThing"}
	fnProp := &protocol.RunType{Kind: protocol.KindProperty, Name: "onClick",
		Child: &protocol.RunType{Kind: protocol.KindFunction, NotSupported: true}}
	msg := pbMsg(pbProp("id", false, pbNumber()), method, fnProp, pbProp("name", false, pbString()))
	slots := ProtobufFields(msg, map[string]*protocol.RunType{})
	if len(slots) != 2 {
		t.Fatalf("got %d slots, want 2 (method + fn prop dropped)", len(slots))
	}
	if slots[0].Name != "id" || slots[0].Number != 1 {
		t.Errorf("slot 0 = {%s, %d}, want {id, 1}", slots[0].Name, slots[0].Number)
	}
	if slots[1].Name != "name" || slots[1].Number != 2 {
		t.Errorf("slot 1 = {%s, %d}, want {name, 2} (no gap from dropped members)", slots[1].Name, slots[1].Number)
	}
}

// A property whose type is a KindRef resolves to the canonical node in refTable.
func TestProtobufFields_DerefValue(t *testing.T) {
	canonical := &protocol.RunType{ID: "n1", Kind: protocol.KindNumber}
	msg := pbMsg(pbProp("x", false, &protocol.RunType{Kind: protocol.KindRef, ID: "n1"}))
	slots := ProtobufFields(msg, map[string]*protocol.RunType{"n1": canonical})
	if len(slots) != 1 {
		t.Fatalf("got %d slots, want 1", len(slots))
	}
	if slots[0].Value == nil || slots[0].Value.Kind != protocol.KindNumber {
		t.Errorf("value not deref'd: got %+v", slots[0].Value)
	}
}

func TestIsReservedFieldNumber(t *testing.T) {
	cases := []struct {
		n    int
		want bool
	}{
		{0, true}, {1, false}, {18999, false}, {19000, true}, {19999, true},
		{20000, false}, {536870911, false}, {536870912, true},
	}
	for _, tc := range cases {
		if got := isReservedFieldNumber(tc.n); got != tc.want {
			t.Errorf("isReservedFieldNumber(%d) = %v, want %v", tc.n, got, tc.want)
		}
	}
}
