package typeid

import (
	"encoding/json"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-run-types/internal/comptimeargs"
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
	// formatBrandProp marks the OPTIONAL nominal-brand member of a TypeFormat
	// (mion's `BrandName` convention): `Base & {sentinels} & {__rtFormatBrand: B}`.
	// It is a PURE TS-level discriminator — the scanner reads only the two
	// sentinels above for the FormatAnnotation and ignores the brand — so a
	// branded format and its unbranded twin must resolve ONE structural id.
	formatBrandProp = "__rtFormatBrand"
)

// IsFormatBrandMember reports whether tsType is a pure TypeFormat nominal-brand
// member — an object whose ONLY property is `__rtFormatBrand`. tsgo keeps the
// `Base & {sentinels} & {__rtFormatBrand}` intersection as distinct object
// members; the sentinel member is lifted into the FormatAnnotation, but this
// brand-only member carries no validation semantics, so both intersection-collapse
// passes (serialize side + structural-id side) must SKIP it. Leaving it in would
// decorate the node with a TypeMeta entry / fold a brand id into the structural
// key — fragmenting the cache so a branded format no longer dedups with its
// unbranded twin, and shifting the id of every predefined `Format*` whose alias
// carries a brand name.
func IsFormatBrandMember(typeChecker *checker.Checker, tsType *checker.Type) bool {
	if tsType == nil || typeChecker == nil {
		return false
	}
	properties := typeChecker.GetPropertiesOfType(tsType)
	if len(properties) != 1 {
		return false
	}
	return properties[0].Name == formatBrandProp
}

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
	// The sentinel props are declared OPTIONAL on TypeFormat (so an unbranded
	// format stays assignable from its base primitive — `FormatString<P>` ≡
	// `string`). tsgo therefore types the symbols as `Name | undefined` /
	// `Params | undefined`; strip the `undefined` before reading the literal
	// name and walking the params. GetNonNullableType is a no-op on the
	// already-non-nullable (required-prop) shape, so this stays correct either
	// way.
	nameType := typeChecker.GetNonNullableType(typeChecker.GetTypeOfSymbol(nameSymbol))
	if nameType == nil || nameType.Flags()&checker.TypeFlagsStringLiteral == 0 {
		return nil
	}
	name, ok := nameType.AsLiteralType().Value().(string)
	if !ok || name == "" {
		return nil
	}
	paramsType := typeChecker.GetNonNullableType(typeChecker.GetTypeOfSymbol(paramsSymbol))
	params := literalParamsFromType(typeChecker, paramsType)
	return &protocol.FormatAnnotation{Name: name, Params: params}
}

// literalParamsFromType walks an object-literal type into the
// FormatAnnotation.Params map via the generic comptimeargs type-literal
// walk, bound to the format-domain policy: the registerFormatPattern
// escape hatch (pattern params ride `typeof p` / value initializers —
// a regex source can't live at the type level) and the TypeToString
// fallback (non-literal property values keep the canonical type string
// so params always stay JSON-serialisable and cache-differentiating).
func literalParamsFromType(typeChecker *checker.Checker, paramsType *checker.Type) map[string]any {
	return comptimeargs.TypeLiteralObject(typeChecker, paramsType, formatTypeValueOptions(typeChecker))
}

// formatTypeValueOptions binds the format-domain knobs into the generic walk.
func formatTypeValueOptions(typeChecker *checker.Checker) comptimeargs.TypeValueOptions {
	return comptimeargs.TypeValueOptions{
		PropertyOverride: func(symbol *ast.Symbol) (any, bool) {
			return formatPatternFromSymbol(typeChecker, symbol)
		},
		NonLiteralFallback: func(tsType *checker.Type) any {
			return typeChecker.TypeToString(tsType)
		},
	}
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
	// referenced from stringFormats.ts), then run the shared const walk.
	symbol = comptimeargs.ResolveImportAlias(typeChecker, symbol)
	var initializer *ast.Node
	comptimeargs.EachConstVariableDeclaration(symbol, func(variableDeclaration *ast.VariableDeclaration) bool {
		initializer = variableDeclaration.Initializer
		return false
	})
	return initializer
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

// propertyInitializer returns the value expression a property declaration
// binds, or nil when the declaration has no value initializer (e.g. a
// PropertySignature in a type). Lets the pattern recovery reach the value a
// value-first config wrote (`pattern: /…/`) through the symbol declaration a
// homomorphic Omit/Pick mapped type preserves.
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
	// comptimeargs' wrapper set (`as` / parens / `satisfies`) — recovery must
	// accept exactly what the CompTimeArgs validation accepted upstream.
	node := comptimeargs.UnwrapWrappers(initializer)
	if node == nil || depth > 16 {
		return nil, false
	}
	switch node.Kind {
	case ast.KindRegularExpressionLiteral:
		if source, flags, ok := comptimeargs.TraceRegexpLiteral(typeChecker, node); ok {
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
			if source, flags, ok := comptimeargs.TraceRegexpLiteral(typeChecker, assignment.Initializer); ok {
				out["source"] = source
				out["flags"] = flags
			}
		case "source":
			// The {source, flags} overload of registerFormatPattern — both
			// passed as string literals at the call site.
			if value, ok := comptimeargs.StringLiteralValue(assignment.Initializer); ok {
				out["source"] = value
			}
		case "flags":
			if value, ok := comptimeargs.StringLiteralValue(assignment.Initializer); ok {
				out["flags"] = value
			}
		case "mockSamples":
			if samples := comptimeargs.StringArrayLiteralValue(assignment.Initializer); len(samples) > 0 {
				out["mockSamples"] = samples
			}
		case "message":
			if message, ok := comptimeargs.StringLiteralValue(assignment.Initializer); ok {
				out["message"] = message
			}
		}
	}
	if _, ok := out["source"]; !ok {
		return nil, false
	}
	return out, true
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
