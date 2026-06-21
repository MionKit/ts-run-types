package typefns

import "github.com/mionkit/ts-runtypes/internal/protocol"

// protobuf_classify.go — the shared per-field classifier both .proto generation
// and the wire emitter consume, so they cannot disagree on a field's protobuf
// form. It is ONE level deep: a repeated/map/oneof reports its element / value /
// member RunTypes and the consumer recurses (calling ClassifyProtoField again).
// Reuses ProtobufScalarFor (scalars + bytes) and the protobufChecker helpers
// (deref, pure-index-signature) the subset predicate already defines.

// ProtoForm discriminates a field's protobuf shape.
type ProtoForm int

const (
	ProtoFormScalar    ProtoForm = iota // a scalar (incl. bytes); Scalar is set
	ProtoFormMessage                    // nested message; Value is the message RunType
	ProtoFormEnum                       // enum; Value is the enum RunType
	ProtoFormRepeated                   // repeated; Value is the element RunType
	ProtoFormMap                        // map<K,V>; MapKey is the key scalar, Value the value RunType
	ProtoFormOneof                      // oneof; Members are the (deref'd) union members
	ProtoFormWellKnown                  // a well-known type; WellKnown is its fully-qualified name
)

// ProtoFieldClass is a field's protobuf classification. Only the fields relevant
// to Form are populated.
type ProtoFieldClass struct {
	Form      ProtoForm
	Scalar    ProtoScalar         // ProtoFormScalar
	Value     *protocol.RunType   // ProtoFormMessage/Enum (the node); Repeated (element); Map (value)
	MapKey    ProtoScalar         // ProtoFormMap
	Members   []*protocol.RunType // ProtoFormOneof
	WellKnown string              // ProtoFormWellKnown: "google.protobuf.Timestamp" | "...Duration"
}

// ClassifyProtoField classifies an in-subset field value type. ok is false for a
// type that is not protobuf-expressible (the subset predicate rejects such types
// before emission, so a false here on validated input signals classifier drift).
func ClassifyProtoField(rt *protocol.RunType, refTable map[string]*protocol.RunType) (ProtoFieldClass, bool) {
	checker := &protobufChecker{refTable: refTable}
	return checker.classifyField(rt)
}

func (c *protobufChecker) classifyField(rt *protocol.RunType) (ProtoFieldClass, bool) {
	rt = c.deref(rt)
	if rt == nil {
		return ProtoFieldClass{}, false
	}
	if scalar, ok := ProtobufScalarFor(rt); ok {
		return ProtoFieldClass{Form: ProtoFormScalar, Scalar: scalar}, true
	}
	switch rt.Kind {
	case protocol.KindObjectLiteral:
		if c.isPureIndexSignature(rt) {
			return c.classifyRecordMap(rt)
		}
		return ProtoFieldClass{Form: ProtoFormMessage, Value: rt}, true
	case protocol.KindClass:
		switch rt.SubKind {
		case protocol.SubKindNone:
			return ProtoFieldClass{Form: ProtoFormMessage, Value: rt}, true
		case protocol.SubKindDate, protocol.SubKindTemporalInstant, protocol.SubKindTemporalZonedDateTime:
			return ProtoFieldClass{Form: ProtoFormWellKnown, WellKnown: "google.protobuf.Timestamp"}, true
		case protocol.SubKindTemporalDuration:
			return ProtoFieldClass{Form: ProtoFormWellKnown, WellKnown: "google.protobuf.Duration"}, true
		case protocol.SubKindMap:
			return c.classifyMapClass(rt)
		case protocol.SubKindSet:
			return ProtoFieldClass{Form: ProtoFormRepeated, Value: c.setItemType(rt)}, true
		}
		return ProtoFieldClass{}, false
	case protocol.KindArray:
		return ProtoFieldClass{Form: ProtoFormRepeated, Value: c.deref(rt.Child)}, true
	case protocol.KindEnum:
		return ProtoFieldClass{Form: ProtoFormEnum, Value: rt}, true
	case protocol.KindUnion:
		return c.classifyUnion(rt)
	}
	return ProtoFieldClass{}, false
}

// classifyUnion folds null/undefined to optionality (handled by the consumer),
// a homogeneous scalar/literal union to a single scalar field, and a
// heterogeneous union of messages/scalars to a oneof.
func (c *protobufChecker) classifyUnion(rt *protocol.RunType) (ProtoFieldClass, bool) {
	members := c.presentMembers(rt)
	switch len(members) {
	case 0:
		return ProtoFieldClass{}, false
	case 1:
		return c.classifyField(members[0]) // optional T — the consumer marks it optional
	}
	if scalar, ok := c.unionScalarBase(members); ok {
		return ProtoFieldClass{Form: ProtoFormScalar, Scalar: scalar}, true
	}
	return ProtoFieldClass{Form: ProtoFormOneof, Members: members}, true
}

// classifyMapClass classifies a Map<K,V> (KindClass SubKindMap).
func (c *protobufChecker) classifyMapClass(rt *protocol.RunType) (ProtoFieldClass, bool) {
	var keyType, valType *protocol.RunType
	for _, child := range rt.Children {
		member := c.deref(child)
		if member == nil {
			continue
		}
		switch member.SubKind {
		case protocol.SubKindMapKey:
			keyType = member
		case protocol.SubKindMapValue:
			valType = member
		}
	}
	return c.mapFieldClass(keyType, valType)
}

// classifyRecordMap classifies a pure index-signature object (Record) as a map.
func (c *protobufChecker) classifyRecordMap(rt *protocol.RunType) (ProtoFieldClass, bool) {
	for _, child := range rt.Children {
		member := c.deref(child)
		if member == nil || member.Kind != protocol.KindIndexSignature {
			continue
		}
		return c.mapFieldClass(member.Index, member.Child)
	}
	return ProtoFieldClass{}, false
}

// mapClass builds a ProtoFormMap from a key + value type, requiring a valid
// (string / integral / bool / bigint) key scalar.
func (c *protobufChecker) mapFieldClass(keyType, valType *protocol.RunType) (ProtoFieldClass, bool) {
	key := c.deref(keyType)
	if !c.isProtoMapKey(key) {
		return ProtoFieldClass{}, false
	}
	keyScalar, ok := ProtobufScalarFor(key)
	if !ok {
		return ProtoFieldClass{}, false
	}
	return ProtoFieldClass{Form: ProtoFormMap, MapKey: keyScalar, Value: c.deref(valType)}, true
}

// setItemType resolves a Set's element type (the SubKindSetItem child).
func (c *protobufChecker) setItemType(rt *protocol.RunType) *protocol.RunType {
	for _, child := range rt.Children {
		member := c.deref(child)
		if member != nil && member.SubKind == protocol.SubKindSetItem {
			return member
		}
	}
	return nil
}

// presentMembers returns a union's members with null/undefined/void dropped.
func (c *protobufChecker) presentMembers(rt *protocol.RunType) []*protocol.RunType {
	var present []*protocol.RunType
	for _, member := range rt.Children {
		md := c.deref(member)
		if md == nil {
			continue
		}
		switch md.Kind {
		case protocol.KindNull, protocol.KindUndefined, protocol.KindVoid:
			continue
		}
		present = append(present, md)
	}
	return present
}

// unionScalarBase returns the shared scalar when every union member maps to the
// SAME protobuf scalar (e.g. a string-literal union → string), else ok = false.
func (c *protobufChecker) unionScalarBase(members []*protocol.RunType) (ProtoScalar, bool) {
	var base ProtoScalar
	for i, member := range members {
		scalar, ok := ProtobufScalarFor(member)
		if !ok {
			return "", false
		}
		if i == 0 {
			base = scalar
		} else if scalar != base {
			return "", false
		}
	}
	return base, true
}
