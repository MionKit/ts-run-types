package typefns

import (
	"strings"

	"github.com/mionkit/ts-runtypes/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// protobuf_scalar.go — selects the narrowest correct Protocol Buffers scalar for
// a leaf type from its format + min/max, the SAME constraint data
// binary_size_estimate.go reads for sizing (single source of truth, so the
// wire, the generated .proto, and the byte-size estimate cannot disagree). The
// chosen scalar drives both the wire encoding and the .proto field type.

// ProtoScalar is a protobuf scalar type. The string value is the .proto type
// name verbatim, so .proto generation prints it directly; the emitter keys on
// it to pick the wire type (varint / zigzag / fixed32 / fixed64).
type ProtoScalar string

const (
	ProtoDouble   ProtoScalar = "double"
	ProtoFloat    ProtoScalar = "float"
	ProtoInt32    ProtoScalar = "int32"
	ProtoInt64    ProtoScalar = "int64"
	ProtoUint32   ProtoScalar = "uint32"
	ProtoUint64   ProtoScalar = "uint64"
	ProtoSint32   ProtoScalar = "sint32"
	ProtoSint64   ProtoScalar = "sint64"
	ProtoFixed32  ProtoScalar = "fixed32"
	ProtoFixed64  ProtoScalar = "fixed64"
	ProtoSfixed32 ProtoScalar = "sfixed32"
	ProtoSfixed64 ProtoScalar = "sfixed64"
	ProtoBool     ProtoScalar = "bool"
	ProtoString   ProtoScalar = "string"
	ProtoBytes    ProtoScalar = "bytes"
)

// Numeric range boundaries used for 32-bit width selection. All are exactly
// representable in float64, so the float64 comparisons below are exact.
const (
	protoMaxUint32 = 4294967295  // 2^32 - 1
	protoMaxInt32  = 2147483647  // 2^31 - 1
	protoMinInt32  = -2147483648 // -2^31
	minSafeInteger = -9007199254740991
	maxSafeInteger = 9007199254740991
)

// ProtobufScalarFor returns the protobuf scalar a leaf RunType maps to. ok is
// false when rt is not a scalar leaf (object / array / union / etc., handled
// elsewhere) or a bigint with no 64-bit bound (out-of-subset).
//
// Selection heuristics (deterministic; no usage stats available at build time):
//   - min >= 0           → unsigned (uint32 / uint64)
//   - signed 32-bit range → sint32 (zigzag — efficient for negatives)
//   - 64-bit bigint, signed → sint64
//   - float / unconstrained / wider-than-32-bit number → double (lossless)
//
// The fixed*/plain int* variants are distribution-specific optimisations that
// need a hint we don't have yet, so they are reserved for a follow-up.
func ProtobufScalarFor(rt *protocol.RunType) (ProtoScalar, bool) {
	if rt == nil {
		return "", false
	}
	switch rt.Kind {
	case protocol.KindBoolean:
		return ProtoBool, true
	case protocol.KindString, protocol.KindTemplateLiteral:
		return ProtoString, true
	case protocol.KindLiteral:
		return protobufLiteralScalar(rt), true
	case protocol.KindNumber:
		return protobufNumberScalar(rt), true
	case protocol.KindBigInt:
		return protobufBigintScalar(rt)
	case protocol.KindClass:
		if isProtobufBytesClass(rt) {
			return ProtoBytes, true // Uint8Array / ArrayBuffer → bytes
		}
		return "", false
	}
	return "", false
}

// protobufNumberScalar picks the scalar for a `number`. Narrowing happens only
// for an explicitly-integer format (mirroring the BinarySizer): a float or
// unconstrained number stays the lossless `double`. A 64-bit-wide integer range
// also falls back to `double` — a JS number cannot losslessly hold a true
// int64, so true 64-bit values must be typed as `bigint`.
func protobufNumberScalar(rt *protocol.RunType) ProtoScalar {
	if rt.FormatAnnotation == nil {
		return ProtoDouble
	}
	params := rt.FormatAnnotation.Params
	if isFloat, ok := formats.ReadBoolParam(params, "float"); ok && isFloat {
		return ProtoDouble
	}
	if isInt, ok := formats.ReadBoolParam(params, "integer"); !ok || !isInt {
		return ProtoDouble
	}
	min, max := numericBounds(params)
	switch {
	case min >= 0 && max <= protoMaxUint32:
		return ProtoUint32
	case min >= protoMinInt32 && max <= protoMaxInt32:
		return ProtoSint32
	default:
		return ProtoDouble
	}
}

// protobufBigintScalar maps a 64-bit-bounded bigint to int64/uint64 (as zigzag
// sint64 when signed). An unbounded bigint has no protobuf scalar (ok = false);
// the subset predicate already rejects it.
func protobufBigintScalar(rt *protocol.RunType) (ProtoScalar, bool) {
	if binaryFormatFixed(rt) != 8 {
		return "", false
	}
	if bigintMinIsNegative(rt) {
		return ProtoSint64, true
	}
	return ProtoUint64, true
}

// protobufLiteralScalar maps a literal to its base scalar (literals are usually
// union discriminants; a standalone literal field encodes as its base type).
func protobufLiteralScalar(rt *protocol.RunType) ProtoScalar {
	switch rt.Literal.(type) {
	case bool:
		return ProtoBool
	case float64:
		return ProtoDouble
	case string:
		return ProtoString
	}
	return ProtoString
}

// numericBounds reads the [min,max] anchors, treating exclusive gt/lt as the
// inclusive anchor for width selection (conservative — it only ever narrows),
// and defaulting to the safe-integer range so an unbounded integer lands on
// double.
func numericBounds(params map[string]any) (float64, float64) {
	min := float64(minSafeInteger)
	if v, ok := formats.ReadNumberParam(params, "min"); ok {
		min = v
	} else if v, ok := formats.ReadNumberParam(params, "gt"); ok {
		min = v
	}
	max := float64(maxSafeInteger)
	if v, ok := formats.ReadNumberParam(params, "max"); ok {
		max = v
	} else if v, ok := formats.ReadNumberParam(params, "lt"); ok {
		max = v
	}
	return min, max
}

// bigintMinIsNegative reports whether a bigint format's min bound is negative
// (a leading '-' on the stored bigint literal). A 64-bit-bounded bigint always
// carries a min, so absence means non-negative.
func bigintMinIsNegative(rt *protocol.RunType) bool {
	if rt.FormatAnnotation == nil {
		return false
	}
	raw, ok := rt.FormatAnnotation.Params["min"]
	if !ok {
		return false
	}
	text, ok := raw.(string)
	if !ok {
		return false
	}
	return strings.HasPrefix(strings.TrimSpace(text), "-")
}
