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
	declaration := symbol.ValueDeclaration
	if declaration == nil && len(symbol.Declarations) > 0 {
		declaration = symbol.Declarations[0]
	}
	if declaration == nil || declaration.Kind != ast.KindParameter {
		return
	}
	paramNode := declaration.AsParameterDeclaration()
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
