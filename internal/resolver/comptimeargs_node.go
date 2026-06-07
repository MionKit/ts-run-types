package resolver

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/mionkit/ts-run-types/internal/comptimeargs"
	"github.com/mionkit/ts-run-types/internal/marker"
)

// detectCompTimeArgsByNode reports whether paramSymbol's declared type annotation
// SYNTACTICALLY references the CompTimeArgs marker alias (`items: CompTimeArgs<T>`).
//
// CompTimeArgs is the zero-cost identity `type CompTimeArgs<T> = T` (markers.ts).
// The old form intersected a phantom brand onto the parameter
// (`T & {__mionCompTimeArgsBrand?: never}`); on a TUPLE parameter — the `tuple` /
// `union` / `func` member lists — that intersection cost ~700 TS instantiations
// per call (the array-literal-vs-tuple-intersection assignability check; see
// docs/value-first-typecheck-cost.md). Identity removes the cost, but its
// instantiation also drops the type alias from the RESOLVED parameter type, so
// marker.DetectAny — which matches on the resolved type's alias name or brand
// property — can no longer see it. The written annotation `CompTimeArgs<…>` does
// survive in the .d.ts, so we detect it here from the parameter's type node,
// resolving the reference through import aliases and confirming it is the marker
// package's CompTimeArgs (symbol name + declaring module) — the same rigor
// DetectAny applies, just sourced from syntax rather than the resolved type.
//
// Additive: only consulted when DetectAny misses, so a still-branded marker (any
// other kind, or a CompTimeArgs whose alias survives) keeps its existing path.
func (state scanState) detectCompTimeArgsByNode(paramSymbol *ast.Symbol) bool {
	if paramSymbol == nil {
		return false
	}
	spec, ok := marker.SpecForKind(state.resolver.marker, marker.KindCompTimeArgs)
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
		// alias), then require the marker package's name + module — never a user's
		// own same-named local type.
		symbol := comptimeargs.ResolveImportAlias(state.scanChecker, state.scanChecker.GetSymbolAtLocation(typeName))
		if symbol == nil || symbol.Name != spec.Name {
			continue
		}
		if marker.DeclaredInModule(symbol, spec.Module) {
			return true
		}
	}
	return false
}
