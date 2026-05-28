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
		// A regex-typed param (`val: typeof SOME_REGEX`) erases to the
		// bare `RegExp` shape in the resolved type, so we first try to
		// recover the literal source+flags from the param's DECLARATION
		// AST. Only when that fails do we fall back to the resolved type.
		if source, flags, ok := regexpLiteralFromSymbol(typeChecker, symbol); ok {
			out[symbol.Name] = RegexpParam{Source: source, Flags: flags}
			continue
		}
		out[symbol.Name] = literalValueFromType(typeChecker, typeChecker.GetTypeOfSymbol(symbol))
	}
	return out
}

// RegexpParam is the recovered literal value of a regex-typed format
// param (`pattern: {val: typeof SOME_REGEX}`). Carries the source +
// flags split out of the regex literal text so the emitter can rebuild
// `new RegExp(source, flags)` — the actual pattern, not the erased
// `RegExp` interface shape. JSON-marshals to `{source, flags}` for the
// wire.
type RegexpParam struct {
	Source string `json:"source"`
	Flags  string `json:"flags"`
}

// regexpLiteralFromSymbol recovers a regex literal's source+flags from a
// format-param symbol by walking its DECLARATION AST rather than its
// resolved type (which has erased the value to the bare `RegExp`
// shape). Mirrors the resolver's traceRegexLiteral
// (internal/resolver/scan.go) but enters from a property's type node:
//
//	val: typeof DOMAIN_PATTERN   (PropertySignature → TypeQuery)
//	  → DOMAIN_PATTERN           (Identifier → const VariableDeclaration)
//	    → /…/i                   (RegularExpressionLiteral initializer)
//
// Returns ok=false for any param that isn't traceable to a regex
// literal — callers then fall back to the resolved-type extraction.
func regexpLiteralFromSymbol(typeChecker *checker.Checker, symbol *ast.Symbol) (string, string, bool) {
	if symbol == nil {
		return "", "", false
	}
	for _, declaration := range symbol.Declarations {
		if declaration == nil {
			continue
		}
		typeNode := declaration.Type()
		if typeNode == nil {
			continue
		}
		if source, flags, ok := traceRegexpTypeNode(typeChecker, typeNode, 0); ok {
			return source, flags, true
		}
	}
	return "", "", false
}

// traceRegexpTypeNode handles the TYPE-position entry: a `typeof X`
// query. (TypeScript has no regex literal types, so a `typeof` over a
// regex const is the only way a regex reaches a type position.)
func traceRegexpTypeNode(typeChecker *checker.Checker, node *ast.Node, depth int) (string, string, bool) {
	if node == nil || depth > 16 {
		return "", "", false
	}
	if node.Kind == ast.KindTypeQuery {
		typeQuery := node.AsTypeQueryNode()
		if typeQuery == nil {
			return "", "", false
		}
		return traceRegexpExpr(typeChecker, typeQuery.ExprName, depth+1)
	}
	return "", "", false
}

// traceRegexpExpr handles the EXPRESSION-position trace: a regex
// literal directly, or a const identifier resolved to its initializer.
// Mirrors the unwrap/identifier/const logic in scan.go's
// traceRegexLiteral.
func traceRegexpExpr(typeChecker *checker.Checker, node *ast.Node, depth int) (string, string, bool) {
	if node == nil || depth > 16 {
		return "", "", false
	}
	switch node.Kind {
	case ast.KindRegularExpressionLiteral:
		literal := node.AsRegularExpressionLiteral()
		if literal == nil {
			return "", "", false
		}
		source, flags := splitRegexpLiteralText(literal.Text)
		return source, flags, true
	case ast.KindIdentifier:
		symbol := typeChecker.GetSymbolAtLocation(node)
		if symbol == nil {
			return "", "", false
		}
		for _, declaration := range symbol.Declarations {
			if declaration == nil || declaration.Kind != ast.KindVariableDeclaration {
				continue
			}
			// Only `const` bindings are traceable: let/var can be reassigned,
			// so the initializer no longer pins the value.
			parent := declaration.Parent
			if parent == nil || parent.Flags&ast.NodeFlagsConst == 0 {
				continue
			}
			variableDeclaration := declaration.AsVariableDeclaration()
			if variableDeclaration == nil || variableDeclaration.Initializer == nil {
				continue
			}
			return traceRegexpExpr(typeChecker, variableDeclaration.Initializer, depth+1)
		}
	}
	return "", "", false
}

// splitRegexpLiteralText splits "/abc/i" into source ("abc") and flags
// ("i"). Copy of scan.go's splitRegexLiteralText — kept local to avoid a
// resolver→typeid import edge for a four-line helper.
func splitRegexpLiteralText(text string) (source, flags string) {
	if !strings.HasPrefix(text, "/") {
		return text, ""
	}
	body := text[1:]
	lastSlash := strings.LastIndex(body, "/")
	if lastSlash < 0 {
		return body, ""
	}
	return body[:lastSlash], body[lastSlash+1:]
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
	case RegexpParam:
		// The recovered pattern participates in the structural id, so two
		// different regexes (or the same source with different flags) hash
		// to distinct cache entries.
		return "re:" + strconv.Quote(typed.Source) + ":" + strconv.Quote(typed.Flags)
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
