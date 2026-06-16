package typefns

import "github.com/mionkit/ts-runtypes/internal/protocol"

// temporal_binary.go maps the Temporal types with a compact numeric binary
// layout to the dedicated pack/unpack methods on the runtime serializer /
// deserializer (packages/ts-runtypes/src/runtypes/dataView.ts). Keeping
// the byte-level layout in those classes (rather than inlining it here)
// makes it testable TypeScript and lets the methods own buffer-capacity
// growth and the ISO-calendar discriminator.
//
// ZonedDateTime (time-zone id strings), Duration (calendar-relative
// components) and PlainMonthDay (month/day, no year) have no compact numeric
// form worth the complexity — temporalToBinary / temporalFromBinary return
// "" for them so the caller keeps the lossless serString(toJSON()) path.

// temporalToBinary returns the binary-encode statement for subKind, or "".
func temporalToBinary(subKind protocol.ReflectionSubKind, value, ser string) string {
	if method := temporalSerMethod(subKind); method != "" {
		return ser + "." + method + "(" + value + ")"
	}
	return ""
}

// temporalFromBinary returns the binary-decode statement (assigning to ret)
// for subKind, or "".
func temporalFromBinary(subKind protocol.ReflectionSubKind, ret, des string) string {
	if method := temporalDesMethod(subKind); method != "" {
		return ret + " = " + des + "." + method + "()"
	}
	return ""
}

// temporalSerMethod is the serializer method name for the numeric-packed
// Temporal subKinds, or "" for the string-fallback types.
func temporalSerMethod(subKind protocol.ReflectionSubKind) string {
	switch subKind {
	case protocol.SubKindTemporalInstant:
		return "serTemporalInstant"
	case protocol.SubKindTemporalPlainTime:
		return "serTemporalPlainTime"
	case protocol.SubKindTemporalPlainDate:
		return "serTemporalPlainDate"
	case protocol.SubKindTemporalPlainDateTime:
		return "serTemporalPlainDateTime"
	case protocol.SubKindTemporalPlainYearMonth:
		return "serTemporalPlainYearMonth"
	}
	return ""
}

// temporalDesMethod is the deserializer method name, byte-symmetric with
// temporalSerMethod.
func temporalDesMethod(subKind protocol.ReflectionSubKind) string {
	switch subKind {
	case protocol.SubKindTemporalInstant:
		return "desTemporalInstant"
	case protocol.SubKindTemporalPlainTime:
		return "desTemporalPlainTime"
	case protocol.SubKindTemporalPlainDate:
		return "desTemporalPlainDate"
	case protocol.SubKindTemporalPlainDateTime:
		return "desTemporalPlainDateTime"
	case protocol.SubKindTemporalPlainYearMonth:
		return "desTemporalPlainYearMonth"
	}
	return ""
}
