package typefns

import (
	"strconv"

	"github.com/mionkit/ts-runtypes/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// protobuf_subset.go — classifies whether a RunType maps to a *pure* Protocol
// Buffers message, the gate the binary emitter uses to decide between
// protobuf-wire bytes (in-subset → foreign-readable + a generated .proto) and
// the current RunTypes binary fallback (out-of-subset → a build-time Warning
// naming the offending member).
//
// The subset is a strict NARROWING of ToBinaryEmitter.Supports: protobuf cannot
// express several shapes the current binary format handles (heterogeneous
// tuples, intersections, RegExp, raw any/unknown/object, bigint without a
// 64-bit bound, and — deferred this round — typed arrays / `bytes`). Such a
// type still round-trips through the fallback; it just isn't
// protobuf-interop-compatible, so we warn rather than error.
//
// The walk mirrors binary_size_estimate.go (ref resolution + cycle break +
// per-kind dispatch) so the two classifications cannot drift on graph shape.

// ProtobufSupport is the result of classifying a top-level type for protobuf
// emission. When OK is false, Member is a dotted path to the first
// non-protobuf-expressible member ("" for a bad root) and Reason explains why —
// both surfaced in the Warning at the createBinaryEncoder call site.
type ProtobufSupport struct {
	OK     bool
	Member string
	Reason string
}

// ProtobufExpressible reports whether rt is a pure Protocol Buffers message: the
// root must be a message (object literal / plain class) and every serializable
// member must map to a protobuf field. refTable resolves KindRef child
// sentinels (the session cache, as renderEntryWithDeps holds).
func ProtobufExpressible(rt *protocol.RunType, refTable map[string]*protocol.RunType) ProtobufSupport {
	checker := &protobufChecker{refTable: refTable, visiting: map[string]bool{}}
	root := checker.deref(rt)
	if !checker.isMessage(root) {
		return ProtobufSupport{Reason: protobufRootReason(root)}
	}
	if fault := checker.message(root, ""); fault != nil {
		return ProtobufSupport{Member: fault.member, Reason: fault.reason}
	}
	return ProtobufSupport{OK: true}
}

type protobufChecker struct {
	refTable map[string]*protocol.RunType
	visiting map[string]bool
}

// subsetFault is the first reason a member is not protobuf-expressible: a dotted
// member path plus a human-readable explanation.
type subsetFault struct {
	member string
	reason string
}

func (c *protobufChecker) deref(rt *protocol.RunType) *protocol.RunType {
	if rt != nil && rt.Kind == protocol.KindRef {
		return c.refTable[rt.ID]
	}
	return rt
}

// isMessage reports whether rt is a protobuf message shape: an object literal
// (interface / type literal) with named members, or a plain user class. The
// broad `object` keyword (KindObject, encoded as opaque JSON) and pure
// index-signature objects (which are maps, not messages) are NOT messages.
func (c *protobufChecker) isMessage(rt *protocol.RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case protocol.KindObjectLiteral:
		return !c.isPureIndexSignature(rt)
	case protocol.KindClass:
		return rt.SubKind == protocol.SubKindNone
	}
	return false
}

// message validates every serializable property of a message, returning the
// first fault or nil. Recursion is cycle-safe: a back-edge to a message already
// on the stack short-circuits to nil (the enclosing frame validates it).
func (c *protobufChecker) message(rt *protocol.RunType, path string) *subsetFault {
	if rt.ID != "" {
		if c.visiting[rt.ID] {
			return nil
		}
		c.visiting[rt.ID] = true
		defer delete(c.visiting, rt.ID)
	}
	for _, child := range rt.Children {
		member := c.deref(child)
		if member == nil || member.IsStatic {
			continue
		}
		if member.Kind == protocol.KindIndexSignature {
			// A message mixing named fields with an index signature could carry
			// both (fields + a map field) in protobuf, but v1 requires the map to
			// be the SOLE shape (a pure Record) — a mixed object is out-of-subset.
			return &subsetFault{joinPath(path, "[index]"),
				"objects mixing named properties with an index signature are not protobuf-expressible (v1)"}
		}
		if member.Kind != protocol.KindProperty && member.Kind != protocol.KindPropertySignature {
			continue
		}
		valueType := c.deref(member.Child)
		// Non-data members (methods, symbol-keyed, function-valued props) are
		// DROPPED, exactly like the data-only contract — they never block a
		// message or appear on the wire.
		if member.NotSupported || valueType == nil || valueType.NotSupported {
			continue
		}
		if fault := c.field(member.Child, joinPath(path, member.Name)); fault != nil {
			return fault
		}
	}
	return nil
}

// field reports the first reason rt cannot be a protobuf field type, or nil.
func (c *protobufChecker) field(rt *protocol.RunType, path string) *subsetFault {
	rt = c.deref(rt)
	if rt == nil {
		return &subsetFault{path, "type did not resolve"}
	}
	// A back-edge into a message currently being validated is fine (recursive
	// message field) — the enclosing frame already vouched for its shape.
	if rt.ID != "" && c.visiting[rt.ID] {
		return nil
	}
	switch rt.Kind {
	case protocol.KindNumber, protocol.KindString, protocol.KindTemplateLiteral,
		protocol.KindBoolean, protocol.KindLiteral:
		return nil
	case protocol.KindBigInt:
		if binaryFormatFixed(rt) == 8 {
			return nil // a 64-bit-bounded bigint → int64 / uint64
		}
		return &subsetFault{path, "bigint without a 64-bit (min/max) bound has no protobuf scalar"}
	case protocol.KindEnum:
		return nil
	case protocol.KindObjectLiteral:
		if c.isPureIndexSignature(rt) {
			return c.mapType(rt, path)
		}
		return c.message(rt, path)
	case protocol.KindClass:
		return c.classField(rt, path)
	case protocol.KindArray:
		return c.repeated(rt, path)
	case protocol.KindUnion:
		return c.union(rt, path)
	case protocol.KindAny, protocol.KindUnknown, protocol.KindObject:
		return &subsetFault{path, "any / unknown / object need google.protobuf.Struct or Any (not yet supported)"}
	case protocol.KindTuple:
		return &subsetFault{path, "tuple types have no Protocol Buffers equivalent"}
	case protocol.KindIntersection:
		return &subsetFault{path, "intersection types are not protobuf-expressible"}
	case protocol.KindRegexp:
		return &subsetFault{path, "RegExp has no Protocol Buffers equivalent"}
	}
	return &subsetFault{path, "type is not protobuf-expressible"}
}

// classField classifies a KindClass field by SubKind: well-known mappings for
// Date / Temporal, map / repeated for Map / Set, a nested message for a plain
// user class, out-of-subset for the rest.
func (c *protobufChecker) classField(rt *protocol.RunType, path string) *subsetFault {
	switch rt.SubKind {
	case protocol.SubKindNone:
		return c.message(rt, path)
	case protocol.SubKindDate, protocol.SubKindTemporalInstant, protocol.SubKindTemporalZonedDateTime:
		return nil // → google.protobuf.Timestamp
	case protocol.SubKindTemporalDuration:
		return nil // → google.protobuf.Duration
	case protocol.SubKindMap:
		return c.mapClass(rt, path)
	case protocol.SubKindSet:
		return c.setClass(rt, path)
	case protocol.SubKindNonSerializable:
		if isProtobufBytesClass(rt) {
			return nil // Uint8Array / Uint8ClampedArray / ArrayBuffer → protobuf bytes
		}
		return &subsetFault{path,
			"non-serializable built-in (WeakMap / Error / DataView / other typed arrays) has no protobuf mapping"}
	}
	return &subsetFault{path, "this built-in class has no Protocol Buffers mapping"}
}

// repeated validates an array → `repeated T`. protobuf has no repeated-of-
// repeated nor repeated<map>; those need an explicit wrapper message.
func (c *protobufChecker) repeated(rt *protocol.RunType, path string) *subsetFault {
	elem := c.deref(rt.Child)
	if elem == nil {
		return &subsetFault{path + "[]", "array without an element type"}
	}
	if elem.Kind == protocol.KindArray {
		return &subsetFault{path + "[]", "nested arrays (repeated of repeated) need a wrapper message"}
	}
	if c.isMapLike(elem) {
		return &subsetFault{path + "[]", "arrays of maps (repeated of map) need a wrapper message"}
	}
	return c.field(rt.Child, path+"[]")
}

// union maps to optional T (a single member after dropping null/undefined), a
// oneof of messages (discriminated union), or a oneof of scalars; anything else
// is out-of-subset.
func (c *protobufChecker) union(rt *protocol.RunType, path string) *subsetFault {
	var present []*protocol.RunType
	for _, member := range rt.Children {
		md := c.deref(member)
		if md == nil {
			continue
		}
		switch md.Kind {
		case protocol.KindNull, protocol.KindUndefined, protocol.KindVoid:
			continue // optionality / nullability, not a wire member
		}
		present = append(present, md)
	}
	switch len(present) {
	case 0:
		return &subsetFault{path, "empty union"}
	case 1:
		return c.field(present[0], path) // T | undefined → optional T
	}
	allMessages := true
	for _, member := range present {
		if !c.isMessage(member) {
			allMessages = false
			break
		}
	}
	if !allMessages {
		for _, member := range present {
			if !c.isScalarKind(member) {
				return &subsetFault{path,
					"union mixes incompatible shapes; only discriminated message unions or scalar unions map to a oneof"}
			}
		}
	}
	for i, member := range present {
		if fault := c.field(member, path+"|"+strconv.Itoa(i)); fault != nil {
			return fault
		}
	}
	return nil
}

// mapType validates a pure index-signature object → map<K,V>.
func (c *protobufChecker) mapType(rt *protocol.RunType, path string) *subsetFault {
	for _, child := range rt.Children {
		member := c.deref(child)
		if member == nil || member.Kind != protocol.KindIndexSignature {
			continue
		}
		if fault := c.mapKeyValue(member.Index, member.Child, path); fault != nil {
			return fault
		}
	}
	return nil
}

// mapClass validates a Map<K,V> (KindClass SubKindMap) → map<K,V>.
func (c *protobufChecker) mapClass(rt *protocol.RunType, path string) *subsetFault {
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
	return c.mapKeyValue(keyType, valType, path)
}

// mapKeyValue enforces the protobuf map rules: keys are string / integral /
// bool, and values are neither repeated nor a map.
func (c *protobufChecker) mapKeyValue(keyType, valType *protocol.RunType, path string) *subsetFault {
	if !c.isProtoMapKey(c.deref(keyType)) {
		return &subsetFault{path + "{key}", "protobuf map keys must be string, an integral number, bool, or bigint"}
	}
	value := c.deref(valType)
	if value != nil {
		if value.Kind == protocol.KindArray {
			return &subsetFault{path + "{}", "protobuf map values cannot be arrays (repeated)"}
		}
		if c.isMapLike(value) {
			return &subsetFault{path + "{}", "protobuf map values cannot be maps"}
		}
	}
	return c.field(valType, path+"{}")
}

// setClass validates a Set<V> (KindClass SubKindSet) → `repeated V`.
func (c *protobufChecker) setClass(rt *protocol.RunType, path string) *subsetFault {
	var itemType *protocol.RunType
	for _, child := range rt.Children {
		member := c.deref(child)
		if member != nil && member.SubKind == protocol.SubKindSetItem {
			itemType = member
		}
	}
	if item := c.deref(itemType); item != nil && item.Kind == protocol.KindArray {
		return &subsetFault{path + "[]", "Set of arrays (repeated of repeated) needs a wrapper message"}
	}
	return c.field(itemType, path+"[]")
}

// isMapLike reports whether rt is a Map<> or a pure index-signature object.
func (c *protobufChecker) isMapLike(rt *protocol.RunType) bool {
	if rt == nil {
		return false
	}
	if rt.Kind == protocol.KindClass && rt.SubKind == protocol.SubKindMap {
		return true
	}
	return rt.Kind == protocol.KindObjectLiteral && c.isPureIndexSignature(rt)
}

// isProtobufBytesClass reports whether rt is a binary buffer that maps to
// protobuf `bytes`: Uint8Array, Uint8ClampedArray, or ArrayBuffer. These are
// KindClass + SubKindNonSerializable with ClassRef.Builtin carrying the global
// symbol name (serialize.go promotes non-serializable globals that way). Other
// typed arrays (Int32Array, …) map to a packed `repeated` scalar (a follow-up);
// DataView / SharedArrayBuffer stay out-of-subset.
func isProtobufBytesClass(rt *protocol.RunType) bool {
	if rt == nil || rt.Kind != protocol.KindClass || rt.SubKind != protocol.SubKindNonSerializable || rt.ClassRef == nil {
		return false
	}
	switch rt.ClassRef.Builtin {
	case "Uint8Array", "Uint8ClampedArray", "ArrayBuffer":
		return true
	}
	return false
}

// isPureIndexSignature reports whether an object literal has at least one index
// signature and no named properties (a Record, i.e. a map rather than a
// message).
func (c *protobufChecker) isPureIndexSignature(rt *protocol.RunType) bool {
	if rt == nil || rt.Kind != protocol.KindObjectLiteral {
		return false
	}
	hasIndex := false
	for _, child := range rt.Children {
		member := c.deref(child)
		if member == nil || member.IsStatic {
			continue
		}
		switch member.Kind {
		case protocol.KindIndexSignature:
			hasIndex = true
		case protocol.KindProperty, protocol.KindPropertySignature:
			return false // a named property → it's a message, not a pure map
		}
	}
	return hasIndex
}

// isProtoMapKey reports whether rt is a valid protobuf map key: string, bool,
// bigint (int64/uint64), or an integral number.
func (c *protobufChecker) isProtoMapKey(rt *protocol.RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case protocol.KindString, protocol.KindTemplateLiteral, protocol.KindBoolean, protocol.KindBigInt:
		return true
	case protocol.KindNumber:
		return isIntegerNumber(rt)
	}
	return false
}

// isScalarKind reports whether rt is a protobuf scalar field kind.
func (c *protobufChecker) isScalarKind(rt *protocol.RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case protocol.KindNumber, protocol.KindString, protocol.KindTemplateLiteral,
		protocol.KindBoolean, protocol.KindBigInt, protocol.KindEnum, protocol.KindLiteral:
		return true
	}
	return false
}

// isIntegerNumber reports whether a KindNumber carries an `integer` format flag.
func isIntegerNumber(rt *protocol.RunType) bool {
	if rt == nil || rt.FormatAnnotation == nil {
		return false
	}
	isInt, ok := formats.ReadBoolParam(rt.FormatAnnotation.Params, "integer")
	return ok && isInt
}

// binaryFormatFixed returns a numeric/bigint format's fixed wire width via
// formats.BinarySizer (0 when there is no format or no fixed width). Mirrors
// sizeEstimator.formatFixed; reused here so the protobuf 64-bit-bigint test and
// the sizer agree.
func binaryFormatFixed(rt *protocol.RunType) int {
	if rt == nil || rt.FormatAnnotation == nil {
		return 0
	}
	emitter, ok := formats.LookupForRunType(rt)
	if !ok {
		return 0
	}
	sizer, ok := emitter.(formats.BinarySizer)
	if !ok {
		return 0
	}
	return sizer.BinarySize(rt.FormatAnnotation).Fixed
}

// protobufRootReason explains why a non-message root cannot be emitted as
// protobuf (the top level must always be a message).
func protobufRootReason(rt *protocol.RunType) string {
	if rt == nil {
		return "type did not resolve to a Protocol Buffers message"
	}
	switch rt.Kind {
	case protocol.KindUnion:
		return "a root union has no protobuf message form; wrap it in an object (a oneof must live inside a message)"
	case protocol.KindArray:
		return "a root array has no protobuf message form; wrap it in an object with a repeated field"
	case protocol.KindNumber, protocol.KindString, protocol.KindBoolean,
		protocol.KindBigInt, protocol.KindEnum, protocol.KindLiteral:
		return "a root scalar has no protobuf message form; wrap it in an object"
	}
	return "the root type is not a Protocol Buffers message (must be an object / interface / class)"
}

// joinPath appends a member name to a dotted diagnostic path.
func joinPath(parent, name string) string {
	if parent == "" {
		return name
	}
	return parent + "." + name
}
