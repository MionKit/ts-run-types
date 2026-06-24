package typefns

import "github.com/mionkit/ts-runtypes/internal/protocol"

// protobuf_layout.go — the single source of truth for a message's protobuf field
// NUMBERS. Both .proto generation and the wire emitter consume ProtoFieldSlot,
// so the number written on the wire and the number declared in the .proto cannot
// drift. Classification of each field's value (scalar / message / map / oneof /
// repeated / bytes) is left to the consumer (it uses ProtobufScalarFor + the
// kind checks); this layer owns only the stable name+number+presence mapping.

// ProtoFieldSlot is one serializable field of a message: its protobuf field
// number, the TS property name, whether it is optional (TS `?` → proto3
// optional), and the (deref'd) declared value type.
type ProtoFieldSlot struct {
	Name     string
	Number   int
	Optional bool
	Value    *protocol.RunType
}

// ProtobufFields returns the protobuf field layout of a message in declaration
// order. Field numbers default to 1-based declaration order; a property pinned
// with an explicit ProtoField<N> keeps N and the unmarked fields fill the
// remaining free numbers (skipping N and the reserved 19000–19999 range). The
// two-pass assignment is already marker-ready — only protoExplicitFieldNumber
// needs to start returning marker values.
//
// Non-data members (methods, function-valued / symbol-keyed props) are dropped
// exactly like the data-only contract, and do NOT consume a field number.
func ProtobufFields(msg *protocol.RunType, refTable map[string]*protocol.RunType) []ProtoFieldSlot {
	deref := func(rt *protocol.RunType) *protocol.RunType {
		if rt != nil && rt.Kind == protocol.KindRef {
			return refTable[rt.ID]
		}
		return rt
	}

	type rawField struct {
		name     string
		optional bool
		value    *protocol.RunType
		number   int
		pinned   bool
	}
	var raws []rawField
	used := map[int]bool{}
	for _, child := range msg.Children {
		member := deref(child)
		if member == nil || member.IsStatic {
			continue
		}
		if member.Kind != protocol.KindProperty && member.Kind != protocol.KindPropertySignature {
			continue
		}
		value := deref(member.Child)
		if member.NotSupported || value == nil || value.NotSupported {
			continue
		}
		number, pinned := protoExplicitFieldNumber(member)
		if pinned {
			used[number] = true
		}
		raws = append(raws, rawField{name: member.Name, optional: member.Optional, value: value, number: number, pinned: pinned})
	}

	next := 1
	nextFree := func() int {
		for used[next] || isReservedFieldNumber(next) {
			next++
		}
		used[next] = true
		return next
	}
	slots := make([]ProtoFieldSlot, 0, len(raws))
	for _, raw := range raws {
		number := raw.number
		if !raw.pinned {
			number = nextFree()
		}
		slots = append(slots, ProtoFieldSlot{Name: raw.name, Number: number, Optional: raw.optional, Value: raw.value})
	}
	return slots
}

// protoExplicitFieldNumber returns a property's pinned ProtoField<N> number when
// it carries the marker. Stubbed to (0, false) until the marker recognition
// lands; ProtobufFields' two-pass assignment is already marker-ready.
func protoExplicitFieldNumber(member *protocol.RunType) (int, bool) {
	return 0, false
}

// isReservedFieldNumber reports whether n falls in protobuf's reserved
// 19000–19999 range (or is non-positive / above the max field number).
func isReservedFieldNumber(n int) bool {
	const (
		reservedLo = 19000
		reservedHi = 19999
		maxFieldNo = 536870911 // 2^29 - 1
	)
	return n < 1 || n > maxFieldNo || (n >= reservedLo && n <= reservedHi)
}
