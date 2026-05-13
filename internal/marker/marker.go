// Package marker detects whether a TypeScript type matches the sentinel
// `RuntypeId<T>` marker — the trailing-parameter type that opts a function
// into compile-time type-id injection by the ts-run-types transformer.
//
// The detection is two-layered:
//  1. Name match — the type alias' symbol name must equal Options.Name
//     (default "RuntypeId").
//  2. Module-of-origin match — the alias must be declared inside the
//     configured marker package (default "@mionjs/ts-run-types"). This is
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
const DefaultModule = "@mionjs/ts-run-types"

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

// WithDefaults fills any zero fields on o with the package defaults.
func WithDefaults(o Options) Options {
	if o.Name == "" {
		o.Name = DefaultName
	}
	if o.Module == "" {
		o.Module = DefaultModule
	}
	return o
}

// Detect inspects the *type of an optional trailing parameter* and returns
// (typeArg, true) when it matches the configured marker. The returned
// typeArg is the single type argument (`T` in `RuntypeId<T>`).
//
// The parameter type for an optional `id?: RuntypeId<T>` is typically a
// union of `RuntypeId<T>` and the undefined-flavoured slot; the alias info
// stays on the union, so we can read it directly. If for some reason the
// alias is on a constituent instead, we fall back to scanning union members.
func Detect(t *checker.Type, opts Options) (*checker.Type, bool) {
	if t == nil {
		return nil, false
	}
	opts = WithDefaults(opts)
	if arg, ok := matchAlias(t, opts); ok {
		return arg, true
	}
	// Walk union constituents in case the optional flag stripped the alias.
	if checker.Type_flags(t)&checker.TypeFlagsUnion != 0 {
		for _, m := range t.Types() {
			if arg, ok := matchAlias(m, opts); ok {
				return arg, true
			}
		}
	}
	return nil, false
}

func matchAlias(t *checker.Type, opts Options) (*checker.Type, bool) {
	alias := checker.Type_alias(t)
	if alias == nil {
		return nil, false
	}
	sym := alias.Symbol()
	if sym == nil || sym.Name != opts.Name {
		return nil, false
	}
	if !DeclaredInModule(sym, opts.Module) {
		return nil, false
	}
	args := alias.TypeArguments()
	if len(args) == 0 {
		return nil, false
	}
	return args[0], true
}

// IsFreeTypeParameter reports whether t is a still-unresolved type parameter
// (e.g. inside a generic wrapper body where the marker's `T` is the
// wrapper's own type variable). Such sites must be skipped — there's no
// id to inject when `T` isn't yet bound.
func IsFreeTypeParameter(t *checker.Type) bool {
	if t == nil {
		return false
	}
	return checker.Type_flags(t)&checker.TypeFlagsTypeParameter != 0
}

// DeclaredInModule reports whether sym was declared inside the given module.
// Two forms count:
//   - `declare module "<module>" { type ... }` (ambient module declaration)
//   - a `.d.ts` / `.ts` file whose path includes `/<module>/` (node_modules)
func DeclaredInModule(sym *ast.Symbol, module string) bool {
	if sym == nil || module == "" {
		return false
	}
	pathFrag := "/" + module + "/"
	for _, decl := range sym.Declarations {
		if findAmbientModuleName(decl) == module {
			return true
		}
		sf := ast.GetSourceFileOfNode(decl)
		if sf != nil && strings.Contains(sf.FileName(), pathFrag) {
			return true
		}
	}
	return false
}

// findAmbientModuleName walks the parent chain looking for the nearest
// `declare module "<name>" { ... }` wrapping node. Returns "" if the
// declaration isn't inside an ambient module.
func findAmbientModuleName(n *ast.Node) string {
	for n != nil {
		if n.Kind == ast.KindModuleDeclaration {
			md := n.AsModuleDeclaration()
			// Skip `namespace X { ... }` — only string-literal-named modules
			// (i.e. ambient module declarations) count.
			if md != nil && md.Keyword != ast.KindNamespaceKeyword {
				name := md.Name()
				if name != nil && ast.IsStringLiteral(name) {
					return name.Text()
				}
			}
		}
		if n.Kind == ast.KindSourceFile {
			return ""
		}
		n = n.Parent
	}
	return ""
}
