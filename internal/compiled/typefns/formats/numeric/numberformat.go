package numeric

import (
	"strings"

	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// numberFormatEmitter implements the format with name "numberFormat" —
// FormatNumber<P> in `@mionjs/ts-go-run-types/formats`. Mirrors mion's
// NumberRunTypeFormat (packages/type-formats/src/number/numberFormat.runtype.ts).
//
// Surface: integer / float, min / max / lt / gt, multipleOf — emitted in
// mion's emitIsType order. Beyond isType / typeErrors / validateParams it
// also implements formats.BinaryEncoder / BinaryDecoder: the binary
// serializer packs an integer into the narrowest of int8/16/32 (signed
// or unsigned) its min/max allows, falling back to the base float64 arm
// otherwise (mion's emitToBinary, numberFormat.runtype.ts:133-191).
type numberFormatEmitter struct{}

// numberFormatName is the canonical FormatAnnotation.name the JS-side
// FormatNumber alias brands under (mion's NumberRunTypeFormat.id).
const numberFormatName = "numberFormat"

// Safe-integer bounds — the getIntegerType defaults when min/max are
// unset (mion uses Number.MIN/MAX_SAFE_INTEGER, numberFormat.runtype.ts:288-289).
const (
	minSafeInteger = -9007199254740991
	maxSafeInteger = 9007199254740991
)

func init() {
	formats.Register(numberFormatEmitter{})
}

func (numberFormatEmitter) Name() string {
	return numberFormatName
}

func (numberFormatEmitter) Kind() protocol.ReflectionKind {
	return protocol.KindNumber
}

// EmitIsTypeCheck returns the AND of every active number predicate, in
// mion's emitIsType order (numberFormat.runtype.ts:40-81): integer/float,
// max, min, lt, gt, multipleOf. Returns "" when no params constrain the
// value — the host keeps its base Number.isFinite check.
func (numberFormatEmitter) EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	return strings.Join(numberConditions(annotation.Params, vλl), " && ")
}

// numberConditions returns the isType boolean expressions for a number
// param map applied to `vλl`.
func numberConditions(params map[string]any, vλl string) []string {
	var conditions []string
	if value, ok := boolParam(params, "integer"); ok && value {
		conditions = append(conditions, "Number.isInteger("+vλl+")")
	} else if value, ok := boolParam(params, "float"); ok && value {
		conditions = append(conditions, "!Number.isInteger("+vλl+")")
	}
	if value, ok := readNumberParam(params, "max"); ok {
		conditions = append(conditions, vλl+" <= "+formatNumber(value))
	}
	if value, ok := readNumberParam(params, "min"); ok {
		conditions = append(conditions, vλl+" >= "+formatNumber(value))
	}
	if value, ok := readNumberParam(params, "lt"); ok {
		conditions = append(conditions, vλl+" < "+formatNumber(value))
	}
	if value, ok := readNumberParam(params, "gt"); ok {
		conditions = append(conditions, vλl+" > "+formatNumber(value))
	}
	if value, ok := readNumberParam(params, "multipleOf"); ok {
		conditions = append(conditions, "("+vλl+" % "+formatNumber(value)+" === 0)")
	}
	return conditions
}

// EmitTypeErrorsCheck emits one `if (failed) <push error>` statement per
// active predicate, in mion's emitIsTypeErrors order
// (numberFormat.runtype.ts:83-125). integer/float tag the error `val`
// with the literal `true`; the range/multipleOf params tag it with the
// bound.
func (numberFormatEmitter) EmitTypeErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	var statements []string
	if value, ok := boolParam(params, "integer"); ok && value {
		statements = append(statements,
			"if (!Number.isInteger("+vλl+")) "+formatErrCall(pathExpr, errorsArr, "number", numberFormatName, "integer", "true"))
	} else if value, ok := boolParam(params, "float"); ok && value {
		statements = append(statements,
			"if (Number.isInteger("+vλl+")) "+formatErrCall(pathExpr, errorsArr, "number", numberFormatName, "float", "true"))
	}
	if value, ok := readNumberParam(params, "max"); ok {
		statements = append(statements,
			"if ("+vλl+" > "+formatNumber(value)+") "+formatErrCall(pathExpr, errorsArr, "number", numberFormatName, "max", formatNumber(value)))
	}
	if value, ok := readNumberParam(params, "min"); ok {
		statements = append(statements,
			"if ("+vλl+" < "+formatNumber(value)+") "+formatErrCall(pathExpr, errorsArr, "number", numberFormatName, "min", formatNumber(value)))
	}
	if value, ok := readNumberParam(params, "lt"); ok {
		statements = append(statements,
			"if ("+vλl+" >= "+formatNumber(value)+") "+formatErrCall(pathExpr, errorsArr, "number", numberFormatName, "lt", formatNumber(value)))
	}
	if value, ok := readNumberParam(params, "gt"); ok {
		statements = append(statements,
			"if ("+vλl+" <= "+formatNumber(value)+") "+formatErrCall(pathExpr, errorsArr, "number", numberFormatName, "gt", formatNumber(value)))
	}
	if value, ok := readNumberParam(params, "multipleOf"); ok {
		statements = append(statements,
			"if (("+vλl+" % "+formatNumber(value)+" !== 0)) "+formatErrCall(pathExpr, errorsArr, "number", numberFormatName, "multipleOf", formatNumber(value)))
	}
	return strings.Join(statements, ";")
}

// EmitToBinary implements formats.BinaryEncoder — mion's emitToBinary
// (numberFormat.runtype.ts:133-161). Returns "" (→ base float64 arm) for
// floats, unconstrained integers, and integer ranges wider than int32;
// otherwise the narrowest setUint8/16/32 / setInt8/16/32 the range fits.
func (numberFormatEmitter) EmitToBinary(annotation *protocol.FormatAnnotation, vλl, ser string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	if isFloat, ok := boolParam(params, "float"); ok && isFloat {
		return "" // float → base float64 arm
	}
	if isInt, ok := boolParam(params, "integer"); !ok || !isInt {
		return "" // not an integer brand → base float64 arm
	}
	switch integerType(params) {
	case intUint8:
		return ser + ".view.setUint8(" + ser + ".index++, " + vλl + ")"
	case intUint16:
		return ser + ".view.setUint16(" + ser + ".index, " + vλl + ", 1, " + ser + ".index += 2)"
	case intUint32:
		return ser + ".view.setUint32(" + ser + ".index, " + vλl + ", 1, " + ser + ".index += 4)"
	case intInt8:
		return ser + ".view.setInt8(" + ser + ".index++, " + vλl + ")"
	case intInt16:
		return ser + ".view.setInt16(" + ser + ".index, " + vλl + ", 1, " + ser + ".index += 2)"
	case intInt32:
		return ser + ".view.setInt32(" + ser + ".index, " + vλl + ", 1, " + ser + ".index += 4)"
	default:
		return "" // wider than int32 → base float64 arm
	}
}

// EmitFromBinary implements formats.BinaryDecoder — mion's emitFromBinary
// (numberFormat.runtype.ts:163-191). Byte-symmetric with EmitToBinary;
// returns the RHS expression the host assigns to `ret`, or "" for the
// float64 fallback cases.
func (numberFormatEmitter) EmitFromBinary(annotation *protocol.FormatAnnotation, des string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	if isFloat, ok := boolParam(params, "float"); ok && isFloat {
		return ""
	}
	if isInt, ok := boolParam(params, "integer"); !ok || !isInt {
		return ""
	}
	switch integerType(params) {
	case intUint8:
		return des + ".view.getUint8(" + des + ".index++)"
	case intUint16:
		return des + ".view.getUint16(" + des + ".index, 1, " + des + ".index += 2)"
	case intUint32:
		return des + ".view.getUint32(" + des + ".index, 1, " + des + ".index += 4)"
	case intInt8:
		return des + ".view.getInt8(" + des + ".index++)"
	case intInt16:
		return des + ".view.getInt16(" + des + ".index, 1, " + des + ".index += 2)"
	case intInt32:
		return des + ".view.getInt32(" + des + ".index, 1, " + des + ".index += 4)"
	default:
		return ""
	}
}

// integerKind enumerates the packed integer encodings, in mion's
// switch(true) precedence (unsigned first, narrowest first).
type integerKind int

const (
	intFloat64 integerKind = iota
	intUint8
	intUint16
	intUint32
	intInt8
	intInt16
	intInt32
)

// integerType ports mion's getIntegerType (numberFormat.runtype.ts:286-297)
// + the switch(true) ordering in emitToBinary: it returns the FIRST
// matching encoding in unsigned-then-signed, narrowest-first order.
// Defaults min/max to the safe-integer bounds so an unbounded integer
// (FormatInteger / FormatPositiveInt) lands on float64.
func integerType(params map[string]any) integerKind {
	min := float64(minSafeInteger)
	if value, ok := readNumberParam(params, "min"); ok {
		min = value
	}
	max := float64(maxSafeInteger)
	if value, ok := readNumberParam(params, "max"); ok {
		max = value
	}
	switch {
	case min >= 0 && max <= 255:
		return intUint8
	case min >= 0 && max <= 65535:
		return intUint16
	case min >= 0 && max <= 4294967295:
		return intUint32
	case min >= -128 && max <= 127:
		return intInt8
	case min >= -32768 && max <= 32767:
		return intInt16
	case min >= -2147483648 && max <= 2147483647:
		return intInt32
	default:
		return intFloat64
	}
}

// ValidateParams ports mion's NumberRunTypeFormat.validateParams
// (numberFormat.runtype.ts:234-283) to the build-time AOT path, MINUS the
// {min,gt}/{max,lt} mutual exclusivity (all four bounds may coexist — see
// the note in the body). Returns one message per violation (surfaced as
// CodeFMTInvalidParams). A `0` bound is falsy in mion and so escapes the
// ordering checks — replicated here via the explicit non-zero guards.
func (numberFormatEmitter) ValidateParams(annotation *protocol.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	params := annotation.Params
	var errs []string

	integer, _ := boolParam(params, "integer")
	float, _ := boolParam(params, "float")
	if integer && float {
		errs = append(errs, "NumberFormat: cannot specify both `integer` and `float`")
	}

	// NOTE: unlike mion, `min`/`gt` (and `max`/`lt`) are NOT mutually
	// exclusive — all four bounds may coexist and simply AND at runtime,
	// matching the date-format family's "allow all combinations" rule. Only
	// inversion of a lower-vs-upper pair is rejected (below).
	min, hasMin := readNumberParam(params, "min")
	max, hasMax := readNumberParam(params, "max")
	if hasMin && min != 0 && hasMax && max != 0 && min > max {
		errs = append(errs, "NumberFormat: `min` cannot be greater than `max`")
	}
	gt, hasGt := readNumberParam(params, "gt")
	lt, hasLt := readNumberParam(params, "lt")
	if hasGt && gt != 0 && hasLt && lt != 0 && gt >= lt {
		errs = append(errs, "NumberFormat: `gt` cannot be greater than or equal to `lt`")
	}

	if multipleOf, ok := readNumberParam(params, "multipleOf"); ok {
		if multipleOf <= 0 {
			errs = append(errs, "NumberFormat: `multipleOf` must be greater than 0")
		} else if multipleOf != float64(int64(multipleOf)) {
			errs = append(errs, "NumberFormat: `multipleOf` must be an integer to avoid floating-point precision issues")
		}
		if float {
			errs = append(errs, "NumberFormat: `multipleOf` cannot be used with the `float` constraint")
		}
	}
	return errs
}
