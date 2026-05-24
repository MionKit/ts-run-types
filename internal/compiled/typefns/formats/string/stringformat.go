// Package string holds the Go-side emitters for the string-format
// family (StringFormat base + UUID / Date / Time / IP / Domain /
// Email / URL / DefaultStringFormats). Each format ships in its own
// file and registers via init().
package string

import (
	"fmt"
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
func (stringFormatEmitter) EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	if len(params) == 0 {
		return ""
	}
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
	return strings.Join(conditions, " && ")
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
func (stringFormatEmitter) EmitTypeErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string) string {
	if annotation == nil {
		return ""
	}
	params := annotation.Params
	if len(params) == 0 {
		return ""
	}
	var statements []string
	if value, ok := readNumberParam(params, "maxLength"); ok {
		statements = append(statements,
			"if ("+vλl+".length > "+formatNumber(value)+") "+pushFormatError(errorsArr, pathExpr, "maxLength", formatNumber(value)),
		)
	}
	if value, ok := readNumberParam(params, "minLength"); ok {
		statements = append(statements,
			"if ("+vλl+".length < "+formatNumber(value)+") "+pushFormatError(errorsArr, pathExpr, "minLength", formatNumber(value)),
		)
	}
	if value, ok := readNumberParam(params, "length"); ok {
		statements = append(statements,
			"if ("+vλl+".length !== "+formatNumber(value)+") "+pushFormatError(errorsArr, pathExpr, "length", formatNumber(value)),
		)
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

// pushFormatError emits the per-param er.push(...) call. Two
// considerations:
//   - The formatPath is `[...basePath, '<param>']`. pathExpr is
//     either a runtime variable name (`pth`) or a static JS
//     array-literal expression; both compose cleanly inside the
//     spread.
//   - The error name is the canonical format name (`stringFormat`);
//     the JS-side TypeFormatError consumer reads it for the
//     "expected <name>" message.
func pushFormatError(errorsArr, pathExpr, paramName string, paramValue string) string {
	pathSegment := strconv.Quote(paramName)
	pathLiteral := "[" + pathSegment + "]"
	if pathExpr != "" {
		pathLiteral = "[..." + pathExpr + "," + pathSegment + "]"
	}
	return fmt.Sprintf(
		"%s.push({name:'%s',formatPath:%s,val:%s});",
		errorsArr, formatName, pathLiteral, paramValue,
	)
}
