package numeric

import (
	"strings"

	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// bigintFormatEmitter implements the format with name "bigintFormat" —
// FormatBigInt<P> in `@mionjs/ts-go-run-types/formats`. Mirrors mion's
// BigIntRunTypeFormat (packages/type-formats/src/bigint/bigIntFormat.runtype.ts).
//
// Surface: min / max / lt / gt, multipleOf — emitted in mion's order with
// bigint literals (`100n`). Beyond isType / typeErrors / validateParams it
// implements formats.BinaryEncoder / BinaryDecoder: when min AND max both
// fit signed (Int64) or unsigned (UInt64) 64-bit, the value packs into 8
// bytes via setBigInt64 / setBigUint64; otherwise it falls back to the
// base string serialization (mion's emitToBinary, bigIntFormat.runtype.ts:123-153).
// There is deliberately NO float64 path and NO sub-8-byte path — mion has
// neither (verified against packages/core/src/binary).
type bigintFormatEmitter struct{}

// bigintFormatName is the canonical FormatAnnotation.name the JS-side
// FormatBigInt alias brands under (mion's BigIntRunTypeFormat.id).
const bigintFormatName = "bigintFormat"

func init() {
	formats.Register(bigintFormatEmitter{})
}

func (bigintFormatEmitter) Name() string {
	return bigintFormatName
}

func (bigintFormatEmitter) Kind() protocol.ReflectionKind {
	return protocol.KindBigInt
}

// EmitIsTypeCheck returns the AND of every active bigint predicate, in
// mion's emitIsType order (bigIntFormat.runtype.ts:46-79): max, min, lt,
// gt, multipleOf — each with a `…n` literal. Returns "" when no params
// constrain the value (host keeps its base `typeof v === 'bigint'`).
func (bigintFormatEmitter) EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	return strings.Join(bigintConditions(annotation.Params, vλl), " && ")
}

// bigintConditions returns the isType boolean expressions for a bigint
// param map applied to `vλl`.
func bigintConditions(params map[string]any, vλl string) []string {
	var conditions []string
	if literal, ok := bigIntLiteral(params, "max"); ok {
		conditions = append(conditions, vλl+" <= "+literal)
	}
	if literal, ok := bigIntLiteral(params, "min"); ok {
		conditions = append(conditions, vλl+" >= "+literal)
	}
	if literal, ok := bigIntLiteral(params, "lt"); ok {
		conditions = append(conditions, vλl+" < "+literal)
	}
	if literal, ok := bigIntLiteral(params, "gt"); ok {
		conditions = append(conditions, vλl+" > "+literal)
	}
	if literal, ok := bigIntLiteral(params, "multipleOf"); ok {
		conditions = append(conditions, "("+vλl+" % "+literal+" === 0n)")
	}
	return conditions
}

// EmitTypeErrorsCheck emits one `if (failed) <push error>` statement per
// active predicate, in mion's emitIsTypeErrors order
// (bigIntFormat.runtype.ts:81-115). The error `val` carries the bigint
// literal (`…n`).
func (bigintFormatEmitter) EmitTypeErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	var statements []string
	if literal, ok := bigIntLiteral(params, "max"); ok {
		statements = append(statements,
			"if ("+vλl+" > "+literal+") "+formatErrCall(pathExpr, errorsArr, "bigint", bigintFormatName, "max", literal))
	}
	if literal, ok := bigIntLiteral(params, "min"); ok {
		statements = append(statements,
			"if ("+vλl+" < "+literal+") "+formatErrCall(pathExpr, errorsArr, "bigint", bigintFormatName, "min", literal))
	}
	if literal, ok := bigIntLiteral(params, "lt"); ok {
		statements = append(statements,
			"if ("+vλl+" >= "+literal+") "+formatErrCall(pathExpr, errorsArr, "bigint", bigintFormatName, "lt", literal))
	}
	if literal, ok := bigIntLiteral(params, "gt"); ok {
		statements = append(statements,
			"if ("+vλl+" <= "+literal+") "+formatErrCall(pathExpr, errorsArr, "bigint", bigintFormatName, "gt", literal))
	}
	if literal, ok := bigIntLiteral(params, "multipleOf"); ok {
		statements = append(statements,
			"if (("+vλl+" % "+literal+" !== 0n)) "+formatErrCall(pathExpr, errorsArr, "bigint", bigintFormatName, "multipleOf", literal))
	}
	return strings.Join(statements, ";")
}

// EmitToBinary implements formats.BinaryEncoder — mion's emitToBinary
// (bigIntFormat.runtype.ts:123-137). UInt64 takes precedence over Int64
// when both fit (mion's ordering); "" otherwise → base string arm.
func (bigintFormatEmitter) EmitToBinary(annotation *protocol.FormatAnnotation, vλl, ser string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	isInt64, isUint64 := bigIntType(annotation.Params)
	if isUint64 {
		return ser + ".view.setBigUint64(" + ser + ".index, " + vλl + ", 1, " + ser + ".index += 8)"
	}
	if isInt64 {
		return ser + ".view.setBigInt64(" + ser + ".index, " + vλl + ", 1, " + ser + ".index += 8)"
	}
	return ""
}

// EmitFromBinary implements formats.BinaryDecoder — mion's emitFromBinary
// (bigIntFormat.runtype.ts:139-153). Byte-symmetric with EmitToBinary.
func (bigintFormatEmitter) EmitFromBinary(annotation *protocol.FormatAnnotation, des string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	isInt64, isUint64 := bigIntType(annotation.Params)
	if isUint64 {
		return des + ".view.getBigUint64(" + des + ".index, 1, " + des + ".index += 8)"
	}
	if isInt64 {
		return des + ".view.getBigInt64(" + des + ".index, 1, " + des + ".index += 8)"
	}
	return ""
}

// bigIntType ports mion's getBigIntType (bigIntFormat.runtype.ts:222-232):
// both min AND max must be set for either flag to be true. Returns
// (isBigInt64, isBigUint64).
func bigIntType(params map[string]any) (isBigInt64, isBigUint64 bool) {
	min, hasMin := readBigIntParam(params, "min")
	max, hasMax := readBigIntParam(params, "max")
	if !hasMin || !hasMax {
		return false, false
	}
	isBigInt64 = min.Cmp(bigInt64Min) >= 0 && max.Cmp(bigInt64Max) <= 0
	isBigUint64 = min.Cmp(bigUint64Min) >= 0 && max.Cmp(bigUint64Max) <= 0
	return isBigInt64, isBigUint64
}

// ValidateParams ports mion's BigIntRunTypeFormat.validateParams
// (bigIntFormat.runtype.ts:189-219): mutual-exclusivity of {min,gt} and
// {max,lt}, min>max, gt>=lt, multipleOf>0. No integer/float distinction.
// The `[x,y].filter(Boolean)` / `x && y` checks are kept mion-faithful:
// a `0n` bound is falsy in mion and so escapes these checks — replicated
// via bigTruthy + the explicit non-zero guards.
func (bigintFormatEmitter) ValidateParams(annotation *protocol.FormatAnnotation) []string {
	if annotation == nil {
		return nil
	}
	params := annotation.Params
	var errs []string

	if bigTruthy(params, "min")+bigTruthy(params, "gt") > 1 {
		errs = append(errs, "BigIntFormat: cannot specify more than one of `min` or `gt`")
	}
	if bigTruthy(params, "max")+bigTruthy(params, "lt") > 1 {
		errs = append(errs, "BigIntFormat: cannot specify more than one of `max` or `lt`")
	}

	min, hasMin := readBigIntParam(params, "min")
	max, hasMax := readBigIntParam(params, "max")
	if hasMin && min.Sign() != 0 && hasMax && max.Sign() != 0 && min.Cmp(max) > 0 {
		errs = append(errs, "BigIntFormat: `min` cannot be greater than `max`")
	}
	gt, hasGt := readBigIntParam(params, "gt")
	lt, hasLt := readBigIntParam(params, "lt")
	if hasGt && gt.Sign() != 0 && hasLt && lt.Sign() != 0 && gt.Cmp(lt) >= 0 {
		errs = append(errs, "BigIntFormat: `gt` cannot be greater than or equal to `lt`")
	}

	if multipleOf, ok := readBigIntParam(params, "multipleOf"); ok && multipleOf.Sign() <= 0 {
		errs = append(errs, "BigIntFormat: `multipleOf` must be greater than 0")
	}
	return errs
}

// bigTruthy returns 1 when the bigint param is present AND non-zero
// (mion's `[…].filter(Boolean)` drops 0n), else 0.
func bigTruthy(params map[string]any, key string) int {
	if value, ok := readBigIntParam(params, key); ok && value.Sign() != 0 {
		return 1
	}
	return 0
}
