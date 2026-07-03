package numeric

import (
	"strings"

	"github.com/mionkit/ts-runtypes/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// currencyEmitter implements the format with name "currency" — Currency<P> in
// `ts-runtypes/formats`: a number whose value is a monetary amount. Validation,
// param invariants and binary packing delegate wholesale to the numberFormat
// helpers (same NumberParams surface: integer/float, min/max/lt/gt,
// multipleOf) — the brand adds NO extra runtime constraint. Its purpose is
// semantic: the format name rides every TypeFormatError, so the friendly i18n
// renderer (createFriendlyI18n) recognises a violated bound as money and
// renders it via Intl.NumberFormat(locale, {style: 'currency', currency}).
// The currency UNIT is deliberately NOT a type param — which currency a value
// is in is runtime data (the renderer's `currency` option), never type
// metadata; a wrong hardcoded unit would silently render the wrong symbol.
type currencyEmitter struct{}

// currencyFormatName is the canonical FormatAnnotation.name the JS-side
// Currency alias brands under.
const currencyFormatName = "currency"

func init() {
	formats.Register(currencyEmitter{})
}

func (currencyEmitter) Name() string {
	return currencyFormatName
}

func (currencyEmitter) Kind() protocol.ReflectionKind {
	return protocol.KindNumber
}

// EmitValidateCheck mirrors numberFormat: the AND of every active number
// predicate; "" when no params constrain the value.
func (currencyEmitter) EmitValidateCheck(annotation *protocol.FormatAnnotation, vλl string, _ formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	return strings.Join(numberConditions(annotation.Params, vλl), " && ")
}

// EmitValidationErrorsCheck mirrors numberFormat, tagging each error with the
// `currency` format name (the discriminator the friendly renderer keys on).
func (currencyEmitter) EmitValidationErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, _ formats.EmitContext) string {
	return numberValidationErrorStatements(annotation, currencyFormatName, vλl, pathExpr, errorsArr)
}

// ValidateParams applies the shared number-family param invariants.
func (currencyEmitter) ValidateParams(annotation *protocol.FormatAnnotation) []string {
	return validateNumberParams(annotation, "CurrencyFormat")
}

// EmitToBinary / EmitFromBinary / BinarySize reuse the numberFormat integer
// ladder byte-for-byte: an integer-branded currency (minor units) packs into
// the narrowest int the range allows; everything else rides the float64 arm.
func (currencyEmitter) EmitToBinary(annotation *protocol.FormatAnnotation, vλl, ser string, ctx formats.EmitContext) string {
	return numberFormatEmitter{}.EmitToBinary(annotation, vλl, ser, ctx)
}

func (currencyEmitter) EmitFromBinary(annotation *protocol.FormatAnnotation, des string, ctx formats.EmitContext) string {
	return numberFormatEmitter{}.EmitFromBinary(annotation, des, ctx)
}

func (currencyEmitter) BinarySize(annotation *protocol.FormatAnnotation) formats.BinarySizeHint {
	return numberFormatEmitter{}.BinarySize(annotation)
}
