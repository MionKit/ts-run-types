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
	"encoding/json"
	"os"
	"path/filepath"
	"sync"

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
	// the alias' declaration is either inside `declare module "<Module>"`
	// (ambient form, used by synthetic test fixtures) or in a file whose
	// enclosing on-disk package.json has its `"name"` field equal to
	// <Module> (real packages — workspace or installed).
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

// DeclaredInModule reports whether symbol was declared inside the given
// module. Two forms count:
//
//   - `declare module "<module>" { type ... }` (ambient form) — used by
//     synthetic test fixtures that don't have a real on-disk package.json
//     (Go fixtures under internal/testfixtures, inline-source vite-plugin
//     tests, etc).
//   - A `.d.ts` / `.ts` file whose enclosing on-disk package.json declares
//     `"name": "<module>"`. Covers both the consumer case
//     (node_modules/<module>/dist/index.d.ts) and the workspace
//     self-import case (packages/<dir>/src/index.ts where the package's
//     name happens to equal <module>). The directory name on disk is
//     irrelevant — only the `"name"` field is consulted, matching how
//     Node module resolution defines a package's identity.
//
// Earlier versions of this function compared the source-file path
// against `"/" + module + "/"`. That heuristic broke for workspace
// self-imports (the on-disk directory `packages/ts-go-run-types/` does
// not literally contain the published name `@mionjs/ts-go-run-types`),
// forcing tests to insert an ambient-module overlay file as a
// workaround. The package.json walk removes that workaround and uses
// the same identity check as the rest of the JS ecosystem.
func DeclaredInModule(symbol *ast.Symbol, module string) bool {
	if symbol == nil || module == "" {
		return false
	}
	for _, declaration := range symbol.Declarations {
		if findAmbientModuleName(declaration) == module {
			return true
		}
		sourceFile := ast.GetSourceFileOfNode(declaration)
		if sourceFile == nil {
			continue
		}
		if packageNameForFile(sourceFile.FileName()) == module {
			return true
		}
	}
	return false
}

// packageNameCache memoises directory→package-name results across the
// life of a resolver process. The on-disk package.json for any given
// directory doesn't change mid-run, so caching is safe and avoids
// repeating identical fs walks for every marker-detection call.
// Storing "" is itself a cached answer (meaning "no package.json found
// walking up from here").
var packageNameCache sync.Map // map[string]string

// packageNameForFile returns the `"name"` field of the nearest
// package.json found by walking parent directories from filePath, or ""
// when no package.json is found, the file is unreadable, or it has no
// name. The first package.json hit going up wins — Node's package
// identity rule. We do NOT keep walking past a package.json that lacks
// a `"name"` field; that file still declares a package boundary, just a
// nameless one (so the marker check fails closed for files in such a
// "package").
func packageNameForFile(filePath string) string {
	if filePath == "" {
		return ""
	}
	dir := filepath.Dir(filePath)
	if cached, ok := packageNameCache.Load(dir); ok {
		return cached.(string)
	}
	name := lookupPackageNameUpward(dir)
	packageNameCache.Store(dir, name)
	return name
}

// lookupPackageNameUpward climbs from dir toward the filesystem root,
// returning the `"name"` of the first readable package.json it finds.
// Stops at the root (when filepath.Dir is a fixed point). Returns ""
// for any of: file does not exist, JSON unparseable, name missing or
// empty.
func lookupPackageNameUpward(dir string) string {
	current := dir
	for {
		data, err := os.ReadFile(filepath.Join(current, "package.json"))
		if err == nil {
			var pkg struct {
				Name string `json:"name"`
			}
			if err := json.Unmarshal(data, &pkg); err == nil {
				return pkg.Name
			}
			return ""
		}
		parent := filepath.Dir(current)
		if parent == current {
			return ""
		}
		current = parent
	}
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
