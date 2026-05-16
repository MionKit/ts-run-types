package serialize

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Visibility values mirror deepkit's ReflectionVisibility enum so the wire
// shape matches what downstream mion consumers already understand.
const (
	visibilityPublic    = 0
	visibilityProtected = 1
	visibilityPrivate   = 2
)

// applyMemberModifiers reads the symbol's ValueDeclaration modifier flags and
// populates Readonly / Visibility / Abstract / Static on the member node.
// `asClass` gates class-only modifiers — interface PropertySignatures and
// MethodSignatures can still be readonly but never carry visibility/static/
// abstract markers.
func applyMemberModifiers(member *protocol.RunType, symbol *ast.Symbol, asClass bool) {
	declaration := symbol.ValueDeclaration
	if declaration == nil && len(symbol.Declarations) > 0 {
		declaration = symbol.Declarations[0]
	}
	if declaration == nil {
		return
	}
	flags := ast.GetCombinedModifierFlags(declaration)
	if flags&ast.ModifierFlagsReadonly != 0 {
		member.Readonly = true
	}
	if !asClass {
		return
	}
	if flags&ast.ModifierFlagsStatic != 0 {
		member.Static = true
	}
	if flags&ast.ModifierFlagsAbstract != 0 {
		member.Abstract = true
	}
	switch {
	case flags&ast.ModifierFlagsPrivate != 0:
		v := visibilityPrivate
		member.Visibility = &v
	case flags&ast.ModifierFlagsProtected != 0:
		v := visibilityProtected
		member.Visibility = &v
	case flags&ast.ModifierFlagsPublic != 0:
		v := visibilityPublic
		member.Visibility = &v
	}
}

// applyParameterDefault inspects the parameter's declaration for an
// initializer expression. Literal values land in `Default`; non-literal
// initializers (function/expression/computed) leave Default nil and append
// the "nonLiteralDefault" marker to Flags — mirrors mion's convention.
func applyParameterDefault(parameter *protocol.RunType, symbol *ast.Symbol) {
	paramNode := parameterDeclaration(symbol)
	if paramNode == nil || paramNode.Initializer == nil {
		return
	}
	initializer := paramNode.Initializer
	switch initializer.Kind {
	case ast.KindStringLiteral, ast.KindNoSubstitutionTemplateLiteral:
		parameter.Default = initializer.Text()
	case ast.KindNumericLiteral:
		parameter.Default = parseNumberLiteral(initializer.Text())
	case ast.KindTrueKeyword:
		parameter.Default = true
	case ast.KindFalseKeyword:
		parameter.Default = false
	case ast.KindNullKeyword:
		parameter.Default = nil
	default:
		parameter.Flags = append(parameter.Flags, "nonLiteralDefault")
	}
}

// isRestParameter returns true when the parameter symbol's declaration
// carries a `...` (DotDotDotToken). The signature wire shape stores rest
// as a string flag on KindParameter — mirrors the tuple-member treatment
// in projectTuple. We can't ask the Signature itself because the shim
// doesn't expose Signature.flags; the AST node carries the same info via
// the rest token, which TS only sets on a true variadic parameter.
func isRestParameter(symbol *ast.Symbol) bool {
	paramNode := parameterDeclaration(symbol)
	return paramNode != nil && paramNode.DotDotDotToken != nil
}

// isOptionalParameter returns true when the parameter symbol's declaration
// carries a `?` (QuestionToken). SymbolFlagsOptional gets set on optional
// property symbols but NOT on optional parameter symbols in tsgo —
// optionality lives on the AST node for parameters, same place rest does.
func isOptionalParameter(symbol *ast.Symbol) bool {
	paramNode := parameterDeclaration(symbol)
	return paramNode != nil && paramNode.QuestionToken != nil
}

// parameterDeclaration unwraps a parameter symbol to its
// ParameterDeclaration AST node, or nil if the symbol's declaration is
// missing or of the wrong kind.
func parameterDeclaration(symbol *ast.Symbol) *ast.ParameterDeclaration {
	declaration := symbol.ValueDeclaration
	if declaration == nil && len(symbol.Declarations) > 0 {
		declaration = symbol.Declarations[0]
	}
	if declaration == nil || declaration.Kind != ast.KindParameter {
		return nil
	}
	return declaration.AsParameterDeclaration()
}
