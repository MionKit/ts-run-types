package typeid

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Sentinel property names that mark a brand-shaped object literal as a
// TypeFormat brand. The JS-side TypeFormat<Base, Name, Params, ...> alias
// resolves (after tsgo widens intersections) to `Base &
// {readonly __rtFormatName: Name; readonly __rtFormatParams: Params}`.
// Two property names rather than one keeps the detection unambiguous
// for arbitrary user brand objects.
const (
	formatNameProp   = "__rtFormatName"
	formatParamsProp = "__rtFormatParams"
)

// FormatAnnotationFromType inspects an object-literal *checker.Type for the
// two sentinel properties (formatNameProp / formatParamsProp) and returns
// the canonical FormatAnnotation if both are present and well-formed.
// Returns nil when the input is not a format brand — callers route those
// through the normal Decorators path.
func FormatAnnotationFromType(typeChecker *checker.Checker, tsType *checker.Type) *protocol.FormatAnnotation {
	if tsType == nil || typeChecker == nil {
		return nil
	}
	properties := typeChecker.GetPropertiesOfType(tsType)
	var nameSymbol, paramsSymbol *ast.Symbol
	for _, symbol := range properties {
		switch symbol.Name {
		case formatNameProp:
			nameSymbol = symbol
		case formatParamsProp:
			paramsSymbol = symbol
		}
	}
	if nameSymbol == nil || paramsSymbol == nil {
		return nil
	}
	nameType := typeChecker.GetTypeOfSymbol(nameSymbol)
	if nameType == nil || nameType.Flags()&checker.TypeFlagsStringLiteral == 0 {
		return nil
	}
	name, ok := nameType.AsLiteralType().Value().(string)
	if !ok || name == "" {
		return nil
	}
	paramsType := typeChecker.GetTypeOfSymbol(paramsSymbol)
	params := literalParamsFromType(typeChecker, paramsType)
	return &protocol.FormatAnnotation{Name: name, Params: params}
}

// literalParamsFromType walks an object-literal type and collects its
// literal-valued properties into a map[string]any suitable for the
// FormatAnnotation.Params field. Non-literal property values fall back
// to the type's string form so the params are always JSON-serialisable.
// Returns nil when paramsType is nil or carries no properties (a format
// with zero params — {} — is represented as nil for compactness).
func literalParamsFromType(typeChecker *checker.Checker, paramsType *checker.Type) map[string]any {
	if paramsType == nil {
		return nil
	}
	properties := typeChecker.GetPropertiesOfType(paramsType)
	if len(properties) == 0 {
		return nil
	}
	out := make(map[string]any, len(properties))
	for _, symbol := range properties {
		out[symbol.Name] = literalValueFromType(typeChecker, typeChecker.GetTypeOfSymbol(symbol))
	}
	return out
}

// literalValueFromType extracts a Go value from a literal-typed *checker.Type.
// Supported: string, number, boolean, bigint literals; nested object
// literals (recursed via literalParamsFromType); union of literals
// (kept as the type's stringified form). Anything else falls back to
// the type's stringified form so callers always get JSON-serialisable data.
func literalValueFromType(typeChecker *checker.Checker, tsType *checker.Type) any {
	if tsType == nil {
		return nil
	}
	flags := tsType.Flags()
	switch {
	case flags&checker.TypeFlagsStringLiteral != 0:
		if value, ok := tsType.AsLiteralType().Value().(string); ok {
			return value
		}
	case flags&checker.TypeFlagsNumberLiteral != 0:
		// tsgo stores number literals as their string repr; promote to float64
		// when parseable for stable JSON serialisation, fall back to the raw
		// stringified form when it isn't (very large / bigint-shaped).
		raw := typeChecker.TypeToString(tsType)
		if value, err := strconv.ParseFloat(raw, 64); err == nil {
			return value
		}
		return raw
	case flags&checker.TypeFlagsBooleanLiteral != 0:
		return typeChecker.TypeToString(tsType) == "true"
	case flags&checker.TypeFlagsBigIntLiteral != 0:
		return typeChecker.TypeToString(tsType)
	case flags&checker.TypeFlagsObject != 0:
		// Nested object literal — recurse. Returns nil for empty objects so the
		// canonicalised key stays compact (`k=null` rather than `k={}`).
		return literalParamsFromType(typeChecker, tsType)
	}
	// Union of literals / template literal / anything else — keep the
	// canonical type string so callers can still differentiate cache entries.
	return typeChecker.TypeToString(tsType)
}

// FormatAnnotationStructuralKey returns a canonical, key-order-independent
// string representation of a FormatAnnotation for inclusion in a parent
// type's structural id. Sorting keys at every nesting level guarantees
// `{a:1, b:2}` and `{b:2, a:1}` produce the same key — the idempotency
// contract documented in the FormatAnnotation field on protocol.RunType.
func FormatAnnotationStructuralKey(annotation *protocol.FormatAnnotation) string {
	if annotation == nil {
		return ""
	}
	var builder strings.Builder
	builder.WriteString("|fmt:")
	builder.WriteString(annotation.Name)
	if len(annotation.Params) > 0 {
		builder.WriteByte(':')
		builder.WriteString(canonicalLiteralMap(annotation.Params))
	}
	return builder.String()
}

// canonicalLiteralMap serialises a literal-value map with sorted keys at
// every nesting depth so equivalent maps hash to the same string.
func canonicalLiteralMap(values map[string]any) string {
	if len(values) == 0 {
		return "{}"
	}
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	var builder strings.Builder
	builder.WriteByte('{')
	for i, key := range keys {
		if i > 0 {
			builder.WriteByte(',')
		}
		builder.WriteString(strconv.Quote(key))
		builder.WriteByte(':')
		builder.WriteString(canonicalLiteralValue(values[key]))
	}
	builder.WriteByte('}')
	return builder.String()
}

func canonicalLiteralValue(value any) string {
	switch typed := value.(type) {
	case nil:
		return "null"
	case string:
		return strconv.Quote(typed)
	case bool:
		if typed {
			return "true"
		}
		return "false"
	case float64:
		// json.Marshal canonicalises ints vs floats (`1` vs `1.0` both → "1") so
		// we re-use it for a stable numeric repr.
		bytes, err := json.Marshal(typed)
		if err == nil {
			return string(bytes)
		}
		return fmt.Sprintf("%v", typed)
	case map[string]any:
		return canonicalLiteralMap(typed)
	case []any:
		var builder strings.Builder
		builder.WriteByte('[')
		for i, item := range typed {
			if i > 0 {
				builder.WriteByte(',')
			}
			builder.WriteString(canonicalLiteralValue(item))
		}
		builder.WriteByte(']')
		return builder.String()
	default:
		return strconv.Quote(fmt.Sprintf("%v", value))
	}
}
