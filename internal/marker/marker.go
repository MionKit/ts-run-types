// Package marker detects whether a TypeScript type matches the sentinel
// `RuntypeId<T>` marker — the trailing-parameter type that opts a function
// into compile-time type-id injection by the ts-go-run-types transformer.
//
// The detection is two-layered:
//  1. Name match — the type alias' symbol name must equal Options.Name
//     (default "RuntypeId").
//  2. Module-of-origin match — the alias must be declared inside the
//     configured marker package (default "@mionjs/ts-go-run-types"). This is
//     mandatory: it stops a user's own `type RuntypeId<T> = ...` from
//     accidentally triggering rewrites.
//
// Conceptually similar to a `ReceiveType<T>` phantom parameter, but with
// strict module-of-origin gating so a user's own `type RuntypeId<T>` in
// third-party code can never accidentally trigger rewrites.
package marker

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// DefaultName is the symbol name the resolver looks for.
const DefaultName = "RuntypeId"

// DefaultModule is the package the marker type must be declared in.
const DefaultModule = "@mionjs/ts-go-run-types"

// Options configures marker detection. Zero values fall back to the defaults
// above.
type Options struct {
	// Name is the symbol name of the marker type alias.
	Name string
	// Module is the package the marker is declared in. The check passes when
	// the alias' declaration is either inside `declare module "<Module>"` or
	// in a file whose path contains "/<Module>/" (the node_modules case).
	Module string
}

// WithDefaults fills any zero fields on opts with the package defaults.
func WithDefaults(opts Options) Options {
	if opts.Name == "" {
		opts.Name = DefaultName
	}
	if opts.Module == "" {
		opts.Module = DefaultModule
	}
	return opts
}

// Detect inspects the *type of an optional trailing parameter* and returns
// (typeArgument, true) when it matches the configured marker. The returned
// typeArgument is the single type argument (`T` in `RuntypeId<T>`).
//
// The parameter type for an optional `id?: RuntypeId<T>` is typically a
// union of `RuntypeId<T>` and the undefined-flavoured slot; the alias info
// stays on the union, so we can read it directly. If for some reason the
// alias is on a constituent instead, we fall back to scanning union members.
func Detect(paramType *checker.Type, opts Options) (*checker.Type, bool) {
	if paramType == nil {
		return nil, false
	}
	opts = WithDefaults(opts)
	if typeArgument, ok := matchAlias(paramType, opts); ok {
		return typeArgument, true
	}
	// Walk union constituents in case the optional flag stripped the alias.
	if checker.Type_flags(paramType)&checker.TypeFlagsUnion != 0 {
		for _, member := range paramType.Types() {
			if typeArgument, ok := matchAlias(member, opts); ok {
				return typeArgument, true
			}
		}
	}
	return nil, false
}

func matchAlias(tsType *checker.Type, opts Options) (*checker.Type, bool) {
	alias := checker.Type_alias(tsType)
	if alias == nil {
		return nil, false
	}
	symbol := alias.Symbol()
	if symbol == nil || symbol.Name != opts.Name {
		return nil, false
	}
	if !DeclaredInModule(symbol, opts.Module) {
		return nil, false
	}
	typeArguments := alias.TypeArguments()
	if len(typeArguments) == 0 {
		return nil, false
	}
	return typeArguments[0], true
}

// IsFreeTypeParameter reports whether tsType is a still-unresolved type
// parameter (e.g. inside a generic wrapper body where the marker's `T` is the
// wrapper's own type variable). Such sites must be skipped — there's no
// id to inject when `T` isn't yet bound.
func IsFreeTypeParameter(tsType *checker.Type) bool {
	if tsType == nil {
		return false
	}
	return checker.Type_flags(tsType)&checker.TypeFlagsTypeParameter != 0
}

// DeclaredInModule reports whether symbol was declared inside the given module.
// Two forms count:
//   - `declare module "<module>" { type ... }` (ambient module declaration)
//   - a `.d.ts` / `.ts` file whose path includes `/<module>/` (node_modules)
func DeclaredInModule(symbol *ast.Symbol, module string) bool {
	if symbol == nil || module == "" {
		return false
	}
	pathFragment := "/" + module + "/"
	for _, declaration := range symbol.Declarations {
		if findAmbientModuleName(declaration) == module {
			return true
		}
		sourceFile := ast.GetSourceFileOfNode(declaration)
		if sourceFile != nil && strings.Contains(sourceFile.FileName(), pathFragment) {
			return true
		}
	}
	return false
}

// findAmbientModuleName walks the parent chain looking for the nearest
// `declare module "<name>" { ... }` wrapping node. Returns "" if the
// declaration isn't inside an ambient module.
func findAmbientModuleName(node *ast.Node) string {
	for node != nil {
		if node.Kind == ast.KindModuleDeclaration {
			moduleDecl := node.AsModuleDeclaration()
			// Skip `namespace X { ... }` — only string-literal-named modules
			// (i.e. ambient module declarations) count.
			if moduleDecl != nil && moduleDecl.Keyword != ast.KindNamespaceKeyword {
				name := moduleDecl.Name()
				if name != nil && ast.IsStringLiteral(name) {
					return name.Text()
				}
			}
		}
		if node.Kind == ast.KindSourceFile {
			return ""
		}
		node = node.Parent
	}
	return ""
}
