// Package string holds the Go-side emitters for the string-format
// family (StringFormat base + UUID / Date / Time / IP / Domain /
// Email / URL / DefaultStringFormats). Each format ships in its own
// file and registers via init().
package string

import (
	"strconv"
	"strings"

	"github.com/mionkit/ts-run-types/internal/compiled/typefns/formats"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// stringFormatEmitter implements the format with name "stringFormat" —
// FormatString<P> in `@mionjs/ts-go-type-formats`. Mirrors mion's
// StringRunTypeFormat (packages/type-formats/src/string/stringFormat.runtype.ts)
// but extracts literal params from the wire-format FormatAnnotation
// instead of mion's deepkit-decoded `{val, mockSamples, …}` wrapper
// shape.
//
// Phase 2 surface: maxLength, minLength, length. These cover the
// common case of bounded user-input strings without requiring any
// type-level regex / array-literal plumbing. Pattern / allowedChars
// / allowedValues plus the format-transformer arm (trim / lowercase
// / uppercase / capitalize) land in follow-ups; the wire is already
// permissive enough to carry their params, so adding them is purely
// an emitter-side change.
type stringFormatEmitter struct{}

// formatName is the canonical FormatAnnotation.name the JS-side
// StringRunTypeFormat registers under. Kept as a package-level
// constant so the test suite can reference it without hardcoding the
// string.
const formatName = "stringFormat"

func init() {
	formats.Register(stringFormatEmitter{})
}

func (stringFormatEmitter) Name() string {
	return formatName
}

func (stringFormatEmitter) Kind() protocol.ReflectionKind {
	return protocol.KindString
}

// EmitIsTypeCheck returns the AND of every active length predicate.
// Returns "" when no length params are set — the host emitter then
// keeps its base-kind check as the only validator. Order matches
// mion's emitIsType conditional list so future maintainers can
// cross-reference without confusion.
func (stringFormatEmitter) EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	if len(params) == 0 {
		return ""
	}
	conditions := lengthConditions(params, vλl)
	// A `pattern` param adds a regex test (and triggers build-time
	// mockSample validation). Backs FormatAlpha / FormatNumeric and any
	// user FormatString carrying a pattern.
	if source, flags, ok := recoverPattern(params); ok {
		validateSamples(ctx, source, flags, recoverSamples(params))
		conditions = append(conditions, emitPatternTest(ctx, source, flags, vλl))
	}
	return strings.Join(conditions, " && ")
}

// lengthConditions returns the JS boolean expressions for whichever of
// maxLength / minLength / length are set. Shared by the stringFormat
// emitter and the named-pattern (domain/email/url) emitters.
func lengthConditions(params map[string]any, vλl string) []string {
	var conditions []string
	if value, ok := readNumberParam(params, "maxLength"); ok {
		conditions = append(conditions, vλl+".length <= "+formatNumber(value))
	}
	if value, ok := readNumberParam(params, "minLength"); ok {
		conditions = append(conditions, vλl+".length >= "+formatNumber(value))
	}
	if value, ok := readNumberParam(params, "length"); ok {
		conditions = append(conditions, vλl+".length === "+formatNumber(value))
	}
	return conditions
}

// lengthErrorStatements returns the `if (fail) cpf_formatErr(...)`
// statements for whichever length bounds are set. fmtName tags the
// emitted format error (stringFormat / domain / email / url …).
func lengthErrorStatements(ctx formats.EmitContext, params map[string]any, vλl, pathExpr, errorsArr, fmtName string) []string {
	var statements []string
	if value, ok := readNumberParam(params, "maxLength"); ok {
		statements = append(statements,
			"if ("+vλl+".length > "+formatNumber(value)+") "+formatErrCall(ctx, pathExpr, errorsArr, "string", fmtName, "maxLength", formatNumber(value)))
	}
	if value, ok := readNumberParam(params, "minLength"); ok {
		statements = append(statements,
			"if ("+vλl+".length < "+formatNumber(value)+") "+formatErrCall(ctx, pathExpr, errorsArr, "string", fmtName, "minLength", formatNumber(value)))
	}
	if value, ok := readNumberParam(params, "length"); ok {
		statements = append(statements,
			"if ("+vλl+".length !== "+formatNumber(value)+") "+formatErrCall(ctx, pathExpr, errorsArr, "string", fmtName, "length", formatNumber(value)))
	}
	return statements
}

// EmitTypeErrorsCheck emits one `if (failed) er.push(…)` statement
// per active length predicate. Each pushes a TypeFormatError with
// the canonical mion shape:
//
//	{name: 'stringFormat', formatPath: [...pth, '<param>'], val: <bound>}
//
// Matches mion's emitIsTypeErrors output (modulo the wrapper-shape
// param unwrap) so the JS-side runtime sees the same diagnostics
// regardless of which compiler produced the validator.
func (stringFormatEmitter) EmitTypeErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	if len(params) == 0 {
		return ""
	}
	statements := lengthErrorStatements(ctx, params, vλl, pathExpr, errorsArr, formatName)
	if source, flags, ok := recoverPattern(params); ok {
		test := emitPatternTest(ctx, source, flags, vλl)
		statements = append(statements,
			"if (!("+test+")) "+formatErrCall(ctx, pathExpr, errorsArr, "string", formatName, "pattern", "'pattern'"))
	}
	return strings.Join(statements, ";")
}

// readNumberParam extracts a numeric param value. Returns (0, false)
// when the key is absent or carries a non-numeric value. Accepts
// float64 (the canonical JSON-decoded representation), int variants,
// and stringified numbers (the typeid scanner emits the literal as a
// stringified type when the value is too large for float64).
func readNumberParam(params map[string]any, key string) (float64, bool) {
	raw, ok := params[key]
	if !ok {
		return 0, false
	}
	switch typed := raw.(type) {
	case float64:
		return typed, true
	case float32:
		return float64(typed), true
	case int:
		return float64(typed), true
	case int32:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case string:
		if value, err := strconv.ParseFloat(typed, 64); err == nil {
			return value, true
		}
	}
	return 0, false
}

// formatNumber stringifies a float64 in the same way JSON does
// (`1` vs `1.0` both → "1"). Used in the emitted JS source so the
// validator's bound matches what tsgo saw at type-resolution time.
func formatNumber(value float64) string {
	if value == float64(int64(value)) {
		return strconv.FormatInt(int64(value), 10)
	}
	return strconv.FormatFloat(value, 'g', -1, 64)
}
