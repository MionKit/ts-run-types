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
// Surface: maxLength, minLength, length, pattern, allowedChars,
// disallowedChars, allowedValues, disallowedValues — mion's full
// StringValidators set, emitted in mion's emitIsType order. The
// format-transformer arm (trim / lowercase / uppercase / capitalize)
// is applied by the separate `format` RT-fn, not by isType/typeErrors.
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

// EmitIsTypeCheck returns the AND of every active format predicate.
// Returns "" when no params constrain the value — the host emitter then
// keeps its base-kind check as the only validator.
func (stringFormatEmitter) EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string, ctx formats.EmitContext) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	if len(params) == 0 {
		return ""
	}
	return strings.Join(stringConditions(ctx, params, vλl), " && ")
}

// stringConditions returns every isType boolean expression for a
// StringFormat param map applied to `vλl`, in mion's emitIsType order:
// maxLength, minLength, length, pattern, allowedChars, disallowedChars,
// allowedValues, disallowedValues (stringFormat.runtype.ts:53-79).
// Shared by the stringFormat emitter and the domain/email decomposition
// sub-checks (each name/tld/localPart part is validated as a sub-format
// over its own variable).
func stringConditions(ctx formats.EmitContext, params map[string]any, vλl string) []string {
	conditions := lengthConditions(params, vλl)
	// `pattern` adds a regex test (and triggers build-time mockSample
	// validation). Backs FormatAlpha / FormatNumeric and any user
	// FormatString carrying a registerFormatPattern result.
	if source, flags, ok := recoverPattern(params); ok {
		validateSamples(ctx, source, flags, recoverSamples(params))
		conditions = append(conditions, emitPatternTest(ctx, source, flags, vλl))
	}
	if val, flags, ok := readCharParam(params, "allowedChars"); ok {
		conditions = append(conditions, emitPatternTest(ctx, allowedCharsSource(val), flags, vλl))
	}
	if val, flags, ok := readCharParam(params, "disallowedChars"); ok {
		conditions = append(conditions, "!"+emitPatternTest(ctx, disallowedCharsSource(val), flags, vλl))
	}
	if vals, flags, ok := readValuesParam(params, "allowedValues"); ok {
		conditions = append(conditions, emitPatternTest(ctx, valuesSource(vals), flags, vλl))
	}
	if vals, flags, ok := readValuesParam(params, "disallowedValues"); ok {
		conditions = append(conditions, "!"+emitPatternTest(ctx, valuesSource(vals), flags, vλl))
	}
	return conditions
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

// readCharParam reads a `{val: string, ignoreCase?}` param object
// (allowedChars / disallowedChars). Returns the char-set string, the
// regex flags ("i" when ignoreCase, else ""), and ok=false when the key
// is absent or malformed.
func readCharParam(params map[string]any, key string) (val, flags string, ok bool) {
	obj, isMap := params[key].(map[string]any)
	if !isMap {
		return "", "", false
	}
	val, isString := obj["val"].(string)
	if !isString || val == "" {
		return "", "", false
	}
	if ignore, _ := obj["ignoreCase"].(bool); ignore {
		flags = "i"
	}
	return val, flags, true
}

// readValuesParam reads a `{val: string[], ignoreCase?}` param object
// (allowedValues / disallowedValues). The `val` tuple arrives as a
// []any of strings (typeid lowers tuple literals that way). Returns
// ok=false when absent, malformed, or empty.
func readValuesParam(params map[string]any, key string) (vals []string, flags string, ok bool) {
	obj, isMap := params[key].(map[string]any)
	if !isMap {
		return nil, "", false
	}
	rawVals, isArray := obj["val"].([]any)
	if !isArray {
		return nil, "", false
	}
	vals = make([]string, 0, len(rawVals))
	for _, item := range rawVals {
		if str, isString := item.(string); isString {
			vals = append(vals, str)
		}
	}
	if len(vals) == 0 {
		return nil, "", false
	}
	if ignore, _ := obj["ignoreCase"].(bool); ignore {
		flags = "i"
	}
	return vals, flags, true
}

// allowedCharsSource builds mion's getAllowedCharsRegexp source —
// `^[<escaped chars>]+$` — so the value must consist entirely of the
// allowed characters.
func allowedCharsSource(val string) string {
	return "^[" + regexpEscape(val) + "]+$"
}

// disallowedCharsSource builds mion's getDisallowedCharsRegexp source —
// an unanchored `[<escaped chars>]` that matches if ANY disallowed char
// is present (the isType condition negates it).
func disallowedCharsSource(val string) string {
	return "[" + regexpEscape(val) + "]"
}

// valuesSource builds mion's getAllowed/DisallowedValuesRegexp source —
// `^(?:<esc v1>|<esc v2>…)$` — an exact-match alternation over the value
// set. Shared by allowedValues (asserted) and disallowedValues (negated).
func valuesSource(vals []string) string {
	escaped := make([]string, len(vals))
	for i, value := range vals {
		escaped[i] = regexpEscape(value)
	}
	return "^(?:" + strings.Join(escaped, "|") + ")$"
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
	return strings.Join(stringErrorStatements(ctx, params, vλl, pathExpr, errorsArr, formatName), ";")
}

// stringErrorStatements returns the `if (fail) <push error>` statements
// for every active StringFormat param, in mion's emitIsTypeErrors order
// (stringFormat.runtype.ts:80-127). Length params tag the error `val`
// with the bound; pattern + the four char/value params tag it with the
// resolved message (custom errorMessage or mion's default). fmtName tags
// the emitted format error so domain/email decomposition can reuse this
// over their own variable + sub-params.
func stringErrorStatements(ctx formats.EmitContext, params map[string]any, vλl, pathExpr, errorsArr, fmtName string) []string {
	statements := lengthErrorStatements(ctx, params, vλl, pathExpr, errorsArr, fmtName)
	if source, flags, ok := recoverPattern(params); ok {
		test := emitPatternTest(ctx, source, flags, vλl)
		statements = append(statements,
			"if (!("+test+")) "+formatErrCall(ctx, pathExpr, errorsArr, "string", fmtName, "pattern", messageLiteral(params, "pattern")))
	}
	if val, flags, ok := readCharParam(params, "allowedChars"); ok {
		test := emitPatternTest(ctx, allowedCharsSource(val), flags, vλl)
		statements = append(statements,
			"if (!("+test+")) "+formatErrCall(ctx, pathExpr, errorsArr, "string", fmtName, "allowedChars", messageLiteral(params, "allowedChars")))
	}
	if val, flags, ok := readCharParam(params, "disallowedChars"); ok {
		test := emitPatternTest(ctx, disallowedCharsSource(val), flags, vλl)
		statements = append(statements,
			"if ("+test+") "+formatErrCall(ctx, pathExpr, errorsArr, "string", fmtName, "disallowedChars", messageLiteral(params, "disallowedChars")))
	}
	if vals, flags, ok := readValuesParam(params, "allowedValues"); ok {
		test := emitPatternTest(ctx, valuesSource(vals), flags, vλl)
		statements = append(statements,
			"if (!("+test+")) "+formatErrCall(ctx, pathExpr, errorsArr, "string", fmtName, "allowedValues", messageLiteral(params, "allowedValues")))
	}
	if vals, flags, ok := readValuesParam(params, "disallowedValues"); ok {
		test := emitPatternTest(ctx, valuesSource(vals), flags, vλl)
		statements = append(statements,
			"if ("+test+") "+formatErrCall(ctx, pathExpr, errorsArr, "string", fmtName, "disallowedValues", messageLiteral(params, "disallowedValues")))
	}
	return statements
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
