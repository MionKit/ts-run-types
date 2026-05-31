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
// through the normal TypeMeta path.
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
		// `pattern: typeof p` where p = registerFormatPattern({...}) →
		// recover the whole bundle {source, flags, mockSamples, message}
		// as a resolved literal object (never AST) from the call site.
		if pattern, ok := formatPatternFromSymbol(typeChecker, symbol); ok {
			out[symbol.Name] = pattern
			continue
		}
		out[symbol.Name] = literalValueFromType(typeChecker, typeChecker.GetTypeOfSymbol(symbol))
	}
	return out
}

// formatPatternFromSymbol recovers a FormatPattern bundle from a param
// declared as `typeof someConst`, where someConst is initialised by a
// registerFormatPattern({regexp, mockSamples, message}) call. Returns
// the RESOLVED literal object {source, flags, mockSamples?, message?} —
// the AST is only the means of recovery, never stored (mion's
// resolveFormatParams equivalent). Returns (nil, false) when the param
// isn't a typeof pointing at such a call.
func formatPatternFromSymbol(typeChecker *checker.Checker, symbol *ast.Symbol) (map[string]any, bool) {
	if symbol == nil {
		return nil, false
	}
	declarations := symbol.Declarations
	if symbol.ValueDeclaration != nil {
		declarations = append([]*ast.Node{symbol.ValueDeclaration}, declarations...)
	}
	for _, declaration := range declarations {
		if declaration == nil {
			continue
		}
		// (a) type-first: `pattern: typeof p` — a TypeQuery type node whose
		// referenced const is a registerFormatPattern({…}) call.
		if typeNode := declaration.Type(); typeNode != nil && typeNode.Kind == ast.KindTypeQuery {
			if typeQuery := typeNode.AsTypeQueryNode(); typeQuery != nil {
				initializer := constInitializerOf(typeChecker, typeQuery.ExprName)
				if initializer != nil && initializer.Kind == ast.KindCallExpression {
					if pattern, ok := formatPatternFromCall(typeChecker, initializer); ok {
						return pattern, true
					}
				}
			}
		}
		// (b) value-first: `pattern: /…/` | `{source,flags}` |
		// `registerFormatPattern({…})` | `slug` — a value initializer the
		// preserved property declaration still points at, even though the
		// property's TYPE has erased to `RegExp`.
		if initializer := propertyInitializer(declaration); initializer != nil {
			if pattern, ok := formatPatternFromInitializer(typeChecker, initializer, 0); ok {
				return pattern, true
			}
		}
	}
	return nil, false
}

// resolveImportAlias follows import-alias symbols to the original
// declaration's symbol, so `typeof importedConst` resolves to the const
// (whose declaration carries the initializer) rather than the import
// specifier. Bounded against pathological alias chains.
func resolveImportAlias(typeChecker *checker.Checker, symbol *ast.Symbol) *ast.Symbol {
	for i := 0; i < 16 && symbol != nil && symbol.Flags&ast.SymbolFlagsAlias != 0; i++ {
		next := checker.Checker_getImmediateAliasedSymbol(typeChecker, symbol)
		if next == nil || next == symbol {
			break
		}
		symbol = next
	}
	return symbol
}

// constInitializerOf resolves an identifier to the initializer of the
// `const` it names. Returns nil for non-identifiers, non-const
// bindings, or initializer-less declarations (a `declare const` in a
// .d.ts).
func constInitializerOf(typeChecker *checker.Checker, node *ast.Node) *ast.Node {
	if node == nil || node.Kind != ast.KindIdentifier {
		return nil
	}
	symbol := typeChecker.GetSymbolAtLocation(node)
	if symbol == nil {
		return nil
	}
	// `typeof importedConst` resolves to the import-alias symbol whose
	// declaration is the import specifier, not the const — follow the
	// alias to the original (e.g. a pattern const in string-patterns.ts
	// referenced from stringFormats.ts).
	symbol = resolveImportAlias(typeChecker, symbol)
	for _, declaration := range symbol.Declarations {
		if declaration == nil || declaration.Kind != ast.KindVariableDeclaration {
			continue
		}
		parent := declaration.Parent
		if parent == nil || parent.Flags&ast.NodeFlagsConst == 0 {
			continue
		}
		variableDeclaration := declaration.AsVariableDeclaration()
		if variableDeclaration == nil {
			continue
		}
		return variableDeclaration.Initializer
	}
	return nil
}

// formatPatternFromCall extracts the resolved literal fields from a
// registerFormatPattern({regexp, mockSamples, message}) call's first
// object-literal argument. Requires at least a recoverable `regexp`
// source — otherwise it isn't a usable pattern.
func formatPatternFromCall(typeChecker *checker.Checker, call *ast.Node) (map[string]any, bool) {
	callExpression := call.AsCallExpression()
	if callExpression == nil || callExpression.Arguments == nil || len(callExpression.Arguments.Nodes) == 0 {
		return nil, false
	}
	argument := callExpression.Arguments.Nodes[0]
	if argument == nil || argument.Kind != ast.KindObjectLiteralExpression {
		return nil, false
	}
	return formatPatternFromObjectLiteral(typeChecker, argument)
}

// unwrapExpr strips `as`/parenthesised wrappers off a value expression so
// the recovery below sees the underlying literal / identifier / call.
func unwrapExpr(node *ast.Node) *ast.Node {
	for node != nil {
		switch node.Kind {
		case ast.KindAsExpression:
			node = node.AsAsExpression().Expression
		case ast.KindParenthesizedExpression:
			node = node.AsParenthesizedExpression().Expression
		default:
			return node
		}
	}
	return node
}

// propertyInitializer returns the value expression a property declaration
// binds, or nil when the declaration has no value initializer (e.g. a
// PropertySignature in a type). Lets the pattern recovery reach the value a
// value-first config wrote (`pattern: /…/`) through the symbol declaration the
// homomorphic Omit/Pick mapped type behind `ModelType` preserves.
func propertyInitializer(declaration *ast.Node) *ast.Node {
	switch declaration.Kind {
	case ast.KindPropertyAssignment:
		return declaration.AsPropertyAssignment().Initializer
	case ast.KindPropertyDeclaration:
		return declaration.AsPropertyDeclaration().Initializer
	}
	return nil
}

// formatPatternFromInitializer recovers a pattern bundle from a VALUE
// expression — the form a value-first config uses. Handles the four shapes a
// `pattern` field can carry:
//   - `/…/`                              → regex literal → {source, flags}
//   - `{source, flags, …}`               → object literal, read directly
//   - `registerFormatPattern({…})`       → call → reuse the call reader
//   - `slug` (an identifier for either)  → resolve the const, then recurse
//
// A regex's source can't ride the type channel (it erases to `RegExp`), but the
// pattern symbol's declaration is the original value AST node, so the literal
// is recoverable here even though the property's TYPE is `RegExp`.
func formatPatternFromInitializer(typeChecker *checker.Checker, initializer *ast.Node, depth int) (map[string]any, bool) {
	node := unwrapExpr(initializer)
	if node == nil || depth > 16 {
		return nil, false
	}
	switch node.Kind {
	case ast.KindRegularExpressionLiteral:
		if source, flags, ok := traceRegexpExpr(typeChecker, node, 0); ok {
			return map[string]any{"source": source, "flags": flags}, true
		}
	case ast.KindObjectLiteralExpression:
		return formatPatternFromObjectLiteral(typeChecker, node)
	case ast.KindCallExpression:
		return formatPatternFromCall(typeChecker, node)
	case ast.KindIdentifier:
		if next := constInitializerOf(typeChecker, node); next != nil {
			return formatPatternFromInitializer(typeChecker, next, depth+1)
		}
	}
	return nil, false
}

// formatPatternFromObjectLiteral reads the {regexp|source, flags, mockSamples,
// message} fields from an object-literal node into a resolved pattern bundle.
// Shared by the registerFormatPattern call reader and the value-first inline
// `pattern: {source, flags}` form. Requires a recoverable `source`.
func formatPatternFromObjectLiteral(typeChecker *checker.Checker, argument *ast.Node) (map[string]any, bool) {
	if argument == nil || argument.Kind != ast.KindObjectLiteralExpression {
		return nil, false
	}
	objectLiteral := argument.AsObjectLiteralExpression()
	if objectLiteral == nil || objectLiteral.Properties == nil {
		return nil, false
	}
	out := map[string]any{}
	for _, property := range objectLiteral.Properties.Nodes {
		if property == nil || property.Kind != ast.KindPropertyAssignment {
			continue
		}
		assignment := property.AsPropertyAssignment()
		if assignment == nil || assignment.Name() == nil || assignment.Initializer == nil {
			continue
		}
		switch assignment.Name().Text() {
		case "regexp":
			if source, flags, ok := traceRegexpExpr(typeChecker, assignment.Initializer, 0); ok {
				out["source"] = source
				out["flags"] = flags
			}
		case "source":
			// The {source, flags} overload of registerFormatPattern — both
			// passed as string literals at the call site.
			if value, ok := stringLiteralValue(assignment.Initializer); ok {
				out["source"] = value
			}
		case "flags":
			if value, ok := stringLiteralValue(assignment.Initializer); ok {
				out["flags"] = value
			}
		case "mockSamples":
			if samples := stringArrayLiteral(assignment.Initializer); len(samples) > 0 {
				out["mockSamples"] = samples
			}
		case "message":
			if message, ok := stringLiteralValue(assignment.Initializer); ok {
				out["message"] = message
			}
		}
	}
	if _, ok := out["source"]; !ok {
		return nil, false
	}
	return out, true
}

// stringArrayLiteral resolves an array-literal of string literals to a
// []any of their values. Non-string elements are skipped.
func stringArrayLiteral(node *ast.Node) []any {
	if node == nil || node.Kind != ast.KindArrayLiteralExpression {
		return nil
	}
	array := node.AsArrayLiteralExpression()
	if array == nil || array.Elements == nil {
		return nil
	}
	out := make([]any, 0, len(array.Elements.Nodes))
	for _, element := range array.Elements.Nodes {
		if value, ok := stringLiteralValue(element); ok {
			out = append(out, value)
		}
	}
	return out
}

// stringLiteralValue returns the value of a string-literal expression
// (unwrapping as/paren), or ("", false) for anything else.
func stringLiteralValue(node *ast.Node) (string, bool) {
	for node != nil {
		switch node.Kind {
		case ast.KindAsExpression:
			node = node.AsAsExpression().Expression
		case ast.KindParenthesizedExpression:
			node = node.AsParenthesizedExpression().Expression
		case ast.KindStringLiteral, ast.KindNoSubstitutionTemplateLiteral:
			return node.Text(), true
		default:
			return "", false
		}
	}
	return "", false
}

// traceRegexpExpr handles the EXPRESSION-position trace: a regex
// literal directly, or a const identifier resolved to its initializer.
// Mirrors the unwrap/identifier/const logic in scan.go's
// traceRegexLiteral. Used to recover the `regexp` literal inside a
// registerFormatPattern({regexp: /…/, …}) call.
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
		symbol = resolveImportAlias(typeChecker, symbol)
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
		// Tuple literal (e.g. mockSamples: ['a','b','c']) → []any of the
		// element values. Checked before the object-recursion branch since
		// a tuple is also flagged TypeFlagsObject.
		if checker.IsTupleType(tsType) {
			elements := typeChecker.GetTypeArguments(tsType)
			out := make([]any, 0, len(elements))
			for _, element := range elements {
				out = append(out, literalValueFromType(typeChecker, element))
			}
			return out
		}
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

// structuralKeyIgnoredParams are format-param keys excluded from the
// structural id at every nesting depth. They carry mock/diagnostic
// metadata, not validation behaviour — so two formats that validate
// identically but differ only in samples or error message must still
// dedup to one cache entry (and the surviving entry's samples are valid
// for all of them, since they share the same validation structure).
// Mirrors mion's `defaultIgnoreFormatProps`.
var structuralKeyIgnoredParams = map[string]bool{
	"mockSamples": true,
	"message":     true,
}

// canonicalLiteralMap serialises a literal-value map with sorted keys at
// every nesting depth so equivalent maps hash to the same string.
// Metadata-only keys (structuralKeyIgnoredParams) are skipped so they
// don't fragment the cache.
func canonicalLiteralMap(values map[string]any) string {
	keys := make([]string, 0, len(values))
	for key := range values {
		if structuralKeyIgnoredParams[key] {
			continue
		}
		keys = append(keys, key)
	}
	if len(keys) == 0 {
		return "{}"
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
