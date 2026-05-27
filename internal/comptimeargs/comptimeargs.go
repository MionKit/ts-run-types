// Package comptimeargs validates that an argument passed to a parameter
// branded with `CompTimeArgs<T>` is fully literal at build time —
// either at the call site, or via a module-scope `const` whose
// initializer is itself entirely literal.
//
// Accepted leaves:
//   - String / numeric / bigint / boolean / null literals
//   - `undefined` (the identifier reference)
//   - No-substitution template literals (backticks without ${…})
//   - Regex literals
//   - Arrow / function expressions (a function definition is itself a
//     literal value at the AST level)
//
// Accepted containers (each member must recurse to a leaf or another
// container):
//   - Object literals (`{key: value, ...}`) — spread, computed keys, and
//     non-literal shorthand bindings are rejected.
//   - Array literals (`[…]`) — spread elements are rejected.
//
// Accepted indirections (with const-chain trace, depth-capped at 16
// — same as the regex literal trace in resolver):
//   - `const x = <literal>; fn(x)` → traces the identifier to its
//     `const` initializer and re-validates that initializer.
//   - `as T` and parenthesised expressions are unwrapped transparently.
//
// Rejected constructs (any of these inside the literal produces a
// CTA003 diagnostic with the construct name in arg[0]):
//   - Spread (`...x`)
//   - Computed property names (`{[key]: 1}`)
//   - Function calls (`fn()`)
//   - Property / element access (`a.b`, `a[b]`)
//   - Ternary (`a ? b : c`)
//   - Template-literal substitution (` `${x}` `)
//   - Binary expressions other than negation of a numeric literal
//   - `let` / `var` bindings (only `const` is traceable)
package comptimeargs

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// DepthCap mirrors the resolver's traceRegexLiteral depth cap. Past 16
// recursions the validator gives up with ExceededDepth=true.
const DepthCap = 16

// FailKind describes why a CheckLiteral / CheckLiteralFunction failed.
// Each kind maps to a distinct diagnostic code at the resolver layer.
type FailKind int

const (
	// FailNone means validation succeeded.
	FailNone FailKind = iota
	// FailNonLiteral means the leaf isn't a literal and the const-trace
	// couldn't follow it to one (CTA001).
	FailNonLiteral
	// FailDepthExceeded means the literal-walk hit DepthCap (CTA002).
	FailDepthExceeded
	// FailForbiddenConstruct means a recognised non-literal construct
	// appeared inside the literal (CTA003). Reason carries the construct
	// name.
	FailForbiddenConstruct
)

// Result reports the outcome of a CheckLiteral / CheckLiteralFunction
// call. Ok=true means validation passed; otherwise Kind tells the caller
// which diagnostic to emit and FailingNode points at the AST node
// responsible (for diagnostic span). Reason carries the construct name
// for FailForbiddenConstruct, or a short human-readable explanation for
// the other failure kinds.
type Result struct {
	Ok          bool
	Kind        FailKind
	Reason      string
	FailingNode *ast.Node
}

// CheckLiteral validates that node is a literal (or const-traceable
// chain ending in one) per the package contract. Pass depth=0 from the
// resolver entry point.
func CheckLiteral(typeChecker *checker.Checker, node *ast.Node, depth int) Result {
	if depth > DepthCap {
		return Result{Ok: false, Kind: FailDepthExceeded, Reason: "depth cap exceeded", FailingNode: node}
	}
	unwrapped := unwrapWrappers(node)
	if unwrapped == nil {
		return Result{Ok: false, Kind: FailNonLiteral, Reason: "nil node", FailingNode: node}
	}
	if isLiteralLeaf(unwrapped) {
		return Result{Ok: true}
	}
	switch unwrapped.Kind {
	case ast.KindArrowFunction, ast.KindFunctionExpression:
		return Result{Ok: true}
	case ast.KindObjectLiteralExpression:
		return checkObjectLiteral(typeChecker, unwrapped, depth)
	case ast.KindArrayLiteralExpression:
		return checkArrayLiteral(typeChecker, unwrapped, depth)
	case ast.KindPrefixUnaryExpression:
		// Accept `-1`, `+1`, `-1n` — sign-prefixed numeric / bigint literal.
		// Reject anything else (`!x`, `~x`, prefix on non-literal).
		return checkPrefixUnary(typeChecker, unwrapped, depth)
	case ast.KindIdentifier:
		return traceIdentifier(typeChecker, unwrapped, depth)
	}
	return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: forbiddenConstructName(unwrapped.Kind), FailingNode: unwrapped}
}

// CheckLiteralFunction is the strict subset of CheckLiteral used by the
// PureFunction<F> marker: only inline arrow / function expressions are
// accepted (with const-trace + wrapper unwrap). Returns the resolved
// function-literal node on success — the caller passes it to
// purefns.CheckPurity for the purity rules.
func CheckLiteralFunction(typeChecker *checker.Checker, node *ast.Node) (*ast.Node, Result) {
	fnNode, result := checkLiteralFunctionRecursive(typeChecker, node, 0)
	return fnNode, result
}

func checkLiteralFunctionRecursive(typeChecker *checker.Checker, node *ast.Node, depth int) (*ast.Node, Result) {
	if depth > DepthCap {
		return nil, Result{Ok: false, Kind: FailDepthExceeded, Reason: "depth cap exceeded", FailingNode: node}
	}
	unwrapped := unwrapWrappers(node)
	if unwrapped == nil {
		return nil, Result{Ok: false, Kind: FailNonLiteral, Reason: "nil node", FailingNode: node}
	}
	switch unwrapped.Kind {
	case ast.KindArrowFunction, ast.KindFunctionExpression:
		return unwrapped, Result{Ok: true}
	case ast.KindIdentifier:
		initializer, ok := resolveConstInitializer(typeChecker, unwrapped)
		if !ok {
			return nil, Result{Ok: false, Kind: FailNonLiteral, Reason: "identifier not a same-module `const` binding", FailingNode: unwrapped}
		}
		return checkLiteralFunctionRecursive(typeChecker, initializer, depth+1)
	}
	return nil, Result{Ok: false, Kind: FailNonLiteral, Reason: "not an inline arrow or function expression", FailingNode: unwrapped}
}

func unwrapWrappers(node *ast.Node) *ast.Node {
	for node != nil {
		switch node.Kind {
		case ast.KindAsExpression:
			asExpression := node.AsAsExpression()
			if asExpression == nil {
				return nil
			}
			node = asExpression.Expression
		case ast.KindParenthesizedExpression:
			parenExpression := node.AsParenthesizedExpression()
			if parenExpression == nil {
				return nil
			}
			node = parenExpression.Expression
		case ast.KindSatisfiesExpression:
			satisfiesExpression := node.AsSatisfiesExpression()
			if satisfiesExpression == nil {
				return nil
			}
			node = satisfiesExpression.Expression
		default:
			return node
		}
	}
	return nil
}

func isLiteralLeaf(node *ast.Node) bool {
	switch node.Kind {
	case ast.KindStringLiteral,
		ast.KindNoSubstitutionTemplateLiteral,
		ast.KindNumericLiteral,
		ast.KindBigIntLiteral,
		ast.KindTrueKeyword,
		ast.KindFalseKeyword,
		ast.KindNullKeyword,
		ast.KindRegularExpressionLiteral:
		return true
	case ast.KindIdentifier:
		// `undefined` is parsed as an identifier reference, not a
		// keyword. Accept only the exact identifier name — any user
		// binding called `undefined` is a malpractice we don't try to
		// support here.
		return node.Text() == "undefined"
	}
	return false
}

func checkObjectLiteral(typeChecker *checker.Checker, node *ast.Node, depth int) Result {
	objectLiteral := node.AsObjectLiteralExpression()
	if objectLiteral == nil || objectLiteral.Properties == nil {
		return Result{Ok: true}
	}
	for _, property := range objectLiteral.Properties.Nodes {
		if property == nil {
			continue
		}
		switch property.Kind {
		case ast.KindPropertyAssignment:
			propertyAssignment := property.AsPropertyAssignment()
			if propertyAssignment == nil {
				return Result{Ok: false, Kind: FailNonLiteral, Reason: "nil property assignment", FailingNode: property}
			}
			name := propertyAssignment.Name()
			if name != nil && name.Kind == ast.KindComputedPropertyName {
				return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: "computed property name", FailingNode: name}
			}
			if propertyAssignment.Initializer == nil {
				return Result{Ok: false, Kind: FailNonLiteral, Reason: "property has no initializer", FailingNode: property}
			}
			result := CheckLiteral(typeChecker, propertyAssignment.Initializer, depth+1)
			if !result.Ok {
				return result
			}
		case ast.KindShorthandPropertyAssignment:
			// Trace the identifier through const-chain to a literal.
			shorthand := property.AsShorthandPropertyAssignment()
			if shorthand == nil || shorthand.Name() == nil {
				return Result{Ok: false, Kind: FailNonLiteral, Reason: "nil shorthand property", FailingNode: property}
			}
			result := traceIdentifier(typeChecker, shorthand.Name(), depth+1)
			if !result.Ok {
				return result
			}
		case ast.KindSpreadAssignment:
			return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: "spread", FailingNode: property}
		default:
			return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: forbiddenConstructName(property.Kind), FailingNode: property}
		}
	}
	return Result{Ok: true}
}

func checkArrayLiteral(typeChecker *checker.Checker, node *ast.Node, depth int) Result {
	arrayLiteral := node.AsArrayLiteralExpression()
	if arrayLiteral == nil || arrayLiteral.Elements == nil {
		return Result{Ok: true}
	}
	for _, element := range arrayLiteral.Elements.Nodes {
		if element == nil {
			continue
		}
		if element.Kind == ast.KindSpreadElement {
			return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: "spread", FailingNode: element}
		}
		result := CheckLiteral(typeChecker, element, depth+1)
		if !result.Ok {
			return result
		}
	}
	return Result{Ok: true}
}

func checkPrefixUnary(typeChecker *checker.Checker, node *ast.Node, depth int) Result {
	prefixUnary := node.AsPrefixUnaryExpression()
	if prefixUnary == nil {
		return Result{Ok: false, Kind: FailNonLiteral, Reason: "nil prefix-unary", FailingNode: node}
	}
	if prefixUnary.Operator != ast.KindPlusToken && prefixUnary.Operator != ast.KindMinusToken {
		return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: "unary operator other than + / -", FailingNode: node}
	}
	operand := unwrapWrappers(prefixUnary.Operand)
	if operand == nil {
		return Result{Ok: false, Kind: FailNonLiteral, Reason: "nil prefix-unary operand", FailingNode: node}
	}
	if operand.Kind != ast.KindNumericLiteral && operand.Kind != ast.KindBigIntLiteral {
		return Result{Ok: false, Kind: FailForbiddenConstruct, Reason: "sign prefix on non-numeric literal", FailingNode: operand}
	}
	_ = depth
	_ = typeChecker
	return Result{Ok: true}
}

func traceIdentifier(typeChecker *checker.Checker, node *ast.Node, depth int) Result {
	if depth > DepthCap {
		return Result{Ok: false, Kind: FailDepthExceeded, Reason: "depth cap exceeded", FailingNode: node}
	}
	// `undefined` is a literal leaf (see isLiteralLeaf); honour it here
	// too so shorthand-property `{undefined}` works.
	if node.Text() == "undefined" {
		return Result{Ok: true}
	}
	initializer, ok := resolveConstInitializer(typeChecker, node)
	if !ok {
		return Result{Ok: false, Kind: FailNonLiteral, Reason: "identifier not a same-module `const` binding to a literal", FailingNode: node}
	}
	return CheckLiteral(typeChecker, initializer, depth+1)
}

// resolveConstInitializer returns the initializer expression of the
// `const` variable declaration the identifier resolves to, or
// (nil, false) when the identifier doesn't resolve, isn't a
// VariableDeclaration, isn't `const`, or has no initializer.
//
// Mirrors the resolver-side resolveRegexLiteral const-chain trace:
// `let` / `var` are rejected because they can be reassigned, so the
// initializer no longer determines the value at the call site.
func resolveConstInitializer(typeChecker *checker.Checker, identifier *ast.Node) (*ast.Node, bool) {
	if typeChecker == nil || identifier == nil {
		return nil, false
	}
	symbol := typeChecker.GetSymbolAtLocation(identifier)
	if symbol == nil {
		return nil, false
	}
	for _, declaration := range symbol.Declarations {
		if declaration == nil || declaration.Kind != ast.KindVariableDeclaration {
			continue
		}
		parent := declaration.Parent
		if parent == nil || parent.Flags&ast.NodeFlagsConst == 0 {
			continue
		}
		variableDecl := declaration.AsVariableDeclaration()
		if variableDecl == nil || variableDecl.Initializer == nil {
			continue
		}
		return variableDecl.Initializer, true
	}
	return nil, false
}

// forbiddenConstructName returns the short label used in CTA003
// diagnostics for the construct at the given AST kind. Keep names short
// and user-recognisable — they appear in error messages.
func forbiddenConstructName(kind ast.Kind) string {
	switch kind {
	case ast.KindSpreadElement, ast.KindSpreadAssignment:
		return "spread"
	case ast.KindCallExpression:
		return "function call"
	case ast.KindPropertyAccessExpression:
		return "property access"
	case ast.KindElementAccessExpression:
		return "element access"
	case ast.KindConditionalExpression:
		return "ternary expression"
	case ast.KindTemplateExpression:
		return "template-string substitution"
	case ast.KindBinaryExpression:
		return "binary expression"
	case ast.KindComputedPropertyName:
		return "computed property name"
	case ast.KindNewExpression:
		return "new expression"
	case ast.KindTypeOfExpression:
		return "typeof expression"
	case ast.KindAwaitExpression:
		return "await expression"
	case ast.KindYieldExpression:
		return "yield expression"
	}
	return "non-literal expression"
}
