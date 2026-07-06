package comptimeargs

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
)

// IsCompTimeArgsParamNode reports whether paramSymbol's declared type annotation
// SYNTACTICALLY references the CompTimeArgs marker alias (`x: CompTimeArgs<…>`).
//
// CompTimeArgs is the zero-cost identity `type CompTimeArgs<T> = T` (markers.ts):
// the old `T & {__rtCompTimeArgsBrand?: never}` cost ~700 TS instantiations when
// T was a tuple — the `tuple` / `union` / `func` member lists (see
// docs/value-first-typecheck-cost.md). Identity removes the cost, but its
// instantiation drops the alias from the RESOLVED parameter type, so
// marker.DetectAny (resolved-type alias name / brand-property matching) can no
// longer see it. The written `CompTimeArgs<…>` annotation does survive in the
// .d.ts, so detect it here off the parameter's type node — resolving the reference
// through import aliases and confirming the marker package's symbol name +
// declaring module, the same rigor DetectAny applies. Shared by the resolver scan
// and the pure-fn extractor, the two places that recognise CompTimeArgs params.
func IsCompTimeArgsParamNode(typeChecker *checker.Checker, paramSymbol *ast.Symbol, opts marker.Options) bool {
	if typeChecker == nil || paramSymbol == nil {
		return false
	}
	spec, ok := marker.SpecForKind(opts, marker.KindCompTimeArgs)
	if !ok {
		return false
	}
	for _, declaration := range paramSymbol.Declarations {
		if declaration == nil || !ast.IsParameterDeclaration(declaration) {
			continue
		}
		typeNode := declaration.AsParameterDeclaration().Type
		if typeNode == nil || !ast.IsTypeReferenceNode(typeNode) {
			continue
		}
		typeName := typeNode.AsTypeReferenceNode().TypeName
		if typeName == nil || typeName.Kind != ast.KindIdentifier {
			continue
		}
		// Resolve the reference to its declaration (following an `import {CompTimeArgs}`
		// alias), then require the marker package's name + module — never a user's own
		// same-named local type.
		symbol := ResolveImportAlias(typeChecker, typeChecker.GetSymbolAtLocation(typeName))
		if symbol == nil || symbol.Name != spec.Name {
			continue
		}
		if marker.DeclaredInModule(symbol, spec.Module, opts.FS) {
			return true
		}
	}
	return false
}
