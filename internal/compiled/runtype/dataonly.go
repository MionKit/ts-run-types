package runtype

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/marker"
)

// dataOnlyAliasName is the symbol name of the DataOnly utility type alias the
// serializer special-cases. Defined in
// packages/ts-runtypes/src/runtypes/dataOnly.ts and gated by
// marker.DefaultModule so a user-defined `DataOnly` outside the marker
// package never triggers the special path.
const dataOnlyAliasName = "DataOnly"

// dataOnlyTypeName recognises a synthesized mapped type that came from
// instantiating the `DataOnly<T>` utility from `ts-runtypes`
// and composes a stable label `"DataOnly<<innerName>>"` for it.
//
// Background — the real DataOnly definition combines a conditional type
// with a key-filtering homomorphic mapped type:
//
//	type DataOnly<T> = T extends object
//	  ? { [K in keyof T as K extends symbol ? never : K]: DataOnly<T[K]> }
//	  : T;
//
// When TS resolves `DataOnly<RootCircular>`, the conditional + the `as K
// extends symbol ? never : K` filter strip the alias from the result type
// (`Type_alias` returns nil). Without intervention the serializer leaves
// TypeName empty, which makes DefaultIsRTInlined treat the root as an
// anonymous compound and inline its entire body into every consumer —
// hurting cache reuse on a type the user explicitly named.
//
// The recognition walks `MappedType.declaration` up the AST to its
// enclosing TypeAliasDeclaration and matches on (a) the alias's symbol
// name being `DataOnly` and (b) marker.DeclaredInModule placing the
// declaration inside ts-runtypes — the same module gate the
// marker scanner uses. The inner name is composed from the mapped type's
// modifiersType (the bound T): we try its alias name first (matches
// `type X = …` argument), falling back to its symbol name (matches
// `interface X` argument). Returns ok=false for any non-matching case so
// callers fall through to existing TypeName paths unchanged.
func dataOnlyTypeName(tsType *checker.Type) (string, bool) {
	if tsType == nil {
		return "", false
	}
	if checker.Type_objectFlags(tsType)&checker.ObjectFlagsMapped == 0 {
		return "", false
	}
	mapped := tsType.AsMappedType()
	if mapped == nil {
		return "", false
	}
	decl := mappedTypeDeclaration(mapped)
	if decl == nil {
		return "", false
	}
	aliasDecl := enclosingTypeAlias(decl.AsNode())
	if aliasDecl == nil {
		return "", false
	}
	aliasSymbol := aliasDecl.Symbol()
	if aliasSymbol == nil || aliasSymbol.Name != dataOnlyAliasName {
		return "", false
	}
	if !marker.DeclaredInModule(aliasSymbol, marker.DefaultModule) {
		return "", false
	}
	innerName := nameOfBoundType(mappedTypeModifiersType(mapped))
	if innerName == "" {
		return "", false
	}
	return "DataOnly<" + innerName + ">", true
}

// enclosingTypeAlias walks node's Parent chain looking for the nearest
// TypeAliasDeclaration ancestor. Returns nil if no such ancestor exists
// (the mapped type isn't part of an alias body — possible for ad-hoc
// `{[K in …]: …}` literals at type positions, which we deliberately don't
// special-case).
func enclosingTypeAlias(node *ast.Node) *ast.Node {
	for n := node; n != nil; n = n.Parent {
		if n.Kind == ast.KindTypeAliasDeclaration {
			return n
		}
	}
	return nil
}

// nameOfBoundType returns a user-recognisable name for the type DataOnly
// was instantiated over — preferring the alias name (the `X` in
// `type X = …`) and falling back to the symbol name (the `X` in
// `interface X`). Both forms cover the common cases; primitives or
// otherwise-unnamed types yield "".
func nameOfBoundType(boundType *checker.Type) string {
	if boundType == nil {
		return ""
	}
	if alias := checker.Type_alias(boundType); alias != nil && alias.Symbol() != nil {
		return alias.Symbol().Name
	}
	if symbol := checker.Type_symbol(boundType); symbol != nil && symbol.Name != "" && symbol.Name[0] != '\xfe' {
		// Skip the `\xfetype` sentinel TS uses for synthesized "__type"
		// symbols (anonymous object literals, mapped results without a
		// useful binding name); fall through to "" so the caller can
		// decide not to stamp a label.
		return symbol.Name
	}
	return ""
}
