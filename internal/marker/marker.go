// Package marker detects whether a TypeScript type matches one of the
// recognised marker brands. Three kinds are supported:
//
//  1. InjectRuntypeId<T> — the trailing-parameter brand that opts a
//     function into compile-time type-id injection by the
//     ts-go-run-types transformer.
//  2. CompTimeArgs<T> — brands a parameter whose corresponding argument
//     must be a literal at the call site (or via a module-scope `const`
//     whose initializer is itself entirely literal).
//  3. PureFunction<F> — brands a function-typed parameter whose argument
//     must be a literal function definition AND must pass purity rules.
//
// The detection is two-layered for every kind:
//  1. Name match — the type alias' symbol name must equal the configured
//     marker name (defaults below).
//  2. Module-of-origin match — the alias must be declared inside the
//     configured marker package (default "@mionjs/ts-go-run-types"). This
//     stops a user's own `type InjectRuntypeId<T> = ...` (or similarly
//     named local brand) from accidentally triggering rewrites.
package marker

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
)

// Kind enumerates the marker brands the scanner knows about.
type Kind int

const (
	// KindInjectRuntypeId is the trailing-id injection marker.
	KindInjectRuntypeId Kind = iota
	// KindCompTimeArgs requires the argument to be a literal at the call
	// site or via a module-scope const-of-literals chain.
	KindCompTimeArgs
	// KindPureFunction requires the argument to be an inline function
	// definition that passes the purity rules.
	KindPureFunction
)

// DefaultName is the symbol name the resolver looks for for the
// injection marker. Retained for back-compat with the older single-marker
// Options.Name field.
const DefaultName = "InjectRuntypeId"

// DefaultCompTimeArgsName is the symbol name for the CompTimeArgs brand.
const DefaultCompTimeArgsName = "CompTimeArgs"

// DefaultPureFunctionName is the symbol name for the PureFunction brand.
const DefaultPureFunctionName = "PureFunction"

// DefaultModule is the package the marker types must be declared in.
const DefaultModule = "@mionjs/ts-go-run-types"

// Spec describes a single marker the scanner should recognise.
type Spec struct {
	// Name is the symbol name of the marker type alias.
	Name string
	// Module is the package the alias is declared in. The check passes
	// when the alias' declaration is either inside `declare module
	// "<Module>"` (ambient form, used by synthetic test fixtures) or in a
	// file whose enclosing on-disk package.json has its `"name"` field
	// equal to <Module> (real packages — workspace or installed).
	Module string
	// Kind is the marker family this spec maps to.
	Kind Kind
	// BrandProperty, when non-empty, is the name of the phantom brand
	// property on the alias. Used as a fallback when alias info is lost
	// (e.g. CompTimeArgs<A | B> distributes its intersection over the
	// union — the alias name drops away but the brand property survives
	// on every member). Empty disables the fallback.
	BrandProperty string
}

// Brand property names for each marker kind. Kept in sync with the
// public TypeScript declarations in
// packages/ts-go-run-types/src/markers.ts.
const (
	BrandInjectRuntypeId = "__mionInjectRuntypeIdBrand"
	BrandCompTimeArgs    = "__mionCompTimeArgsBrand"
	BrandPureFunction    = "__mionPureFunctionBrand"
)

// DefaultSpecs returns the canonical marker set: one spec per supported
// Kind, all sourced from DefaultModule.
func DefaultSpecs() []Spec {
	return []Spec{
		{Name: DefaultName, Module: DefaultModule, Kind: KindInjectRuntypeId, BrandProperty: BrandInjectRuntypeId},
		{Name: DefaultCompTimeArgsName, Module: DefaultModule, Kind: KindCompTimeArgs, BrandProperty: BrandCompTimeArgs},
		{Name: DefaultPureFunctionName, Module: DefaultModule, Kind: KindPureFunction, BrandProperty: BrandPureFunction},
	}
}

// Options configures marker detection. Zero values fall back to the
// defaults above. The Name + Module fields govern *only* the injection
// marker (back-compat with the original single-marker shape and the
// --marker-name / --marker-module CLI flags); the CompTimeArgs and
// PureFunction markers always use their default names sourced from
// Module (or DefaultModule when unset).
type Options struct {
	// Name overrides the injection marker's symbol name. Empty → DefaultName.
	Name string
	// Module is the package every marker in the default set is declared
	// in. Empty → DefaultModule.
	Module string
	// Specs, when non-empty, replaces the entire marker set. When empty
	// the Name + Module fields (plus the CompTimeArgs / PureFunction
	// defaults sourced from Module) are used. Callers that need to add or
	// rename markers beyond the injection one should populate Specs
	// directly.
	Specs []Spec
}

// WithDefaults fills any zero fields on opts with the package defaults.
// When Specs is empty it is populated from Name + Module + the two
// non-injection defaults so the rest of the package can iterate one
// uniform list.
func WithDefaults(opts Options) Options {
	if opts.Name == "" {
		opts.Name = DefaultName
	}
	if opts.Module == "" {
		opts.Module = DefaultModule
	}
	if len(opts.Specs) == 0 {
		opts.Specs = []Spec{
			{Name: opts.Name, Module: opts.Module, Kind: KindInjectRuntypeId, BrandProperty: BrandInjectRuntypeId},
			{Name: DefaultCompTimeArgsName, Module: opts.Module, Kind: KindCompTimeArgs, BrandProperty: BrandCompTimeArgs},
			{Name: DefaultPureFunctionName, Module: opts.Module, Kind: KindPureFunction, BrandProperty: BrandPureFunction},
		}
	}
	return opts
}

// Detect inspects the *type of an optional trailing parameter* and returns
// (typeArgument, true) when it matches the configured InjectRuntypeId
// marker. The returned typeArgument is the single type argument (`T` in
// `InjectRuntypeId<T>`).
//
// Specialised to the injection marker for back-compat — the existing
// trailing-id codepath in resolver.scanCall calls this. For multi-marker
// dispatch over arbitrary parameters use DetectAny.
//
// The parameter type for an optional `id?: InjectRuntypeId<T>` is typically a
// union of `InjectRuntypeId<T>` and the undefined-flavoured slot; the alias info
// stays on the union, so we can read it directly. If for some reason the
// alias is on a constituent instead, we fall back to scanning union members.
func Detect(paramType *checker.Type, opts Options) (*checker.Type, bool) {
	if paramType == nil {
		return nil, false
	}
	opts = WithDefaults(opts)
	spec, ok := specForKind(opts.Specs, KindInjectRuntypeId)
	if !ok {
		return nil, false
	}
	if typeArgument, ok := matchAliasSpec(paramType, spec); ok {
		return typeArgument, true
	}
	// Walk union constituents in case the optional flag stripped the alias.
	if checker.Type_flags(paramType)&checker.TypeFlagsUnion != 0 {
		for _, member := range paramType.Types() {
			if typeArgument, ok := matchAliasSpec(member, spec); ok {
				return typeArgument, true
			}
		}
	}
	return nil, false
}

// DetectAny inspects a parameter type against every configured marker
// spec and returns the matching spec's Kind plus the brand's type
// argument when one matches. Used by the resolver to dispatch
// per-parameter validation (CompTimeArgs / PureFunction) in a single walk.
//
// When typeChecker is non-nil and the alias-name match fails, the
// spec's BrandProperty is checked against the type's own properties as
// a fallback — covers CompTimeArgs<A|B> where TS distributes the
// intersection over the union and the alias name drops off, but the
// brand property survives on each member.
func DetectAny(typeChecker *checker.Checker, paramType *checker.Type, opts Options) (Kind, *checker.Type, bool) {
	if paramType == nil {
		return 0, nil, false
	}
	opts = WithDefaults(opts)
	for _, spec := range opts.Specs {
		if typeArgument, ok := matchAliasSpec(paramType, spec); ok {
			return spec.Kind, typeArgument, true
		}
		if checker.Type_flags(paramType)&checker.TypeFlagsUnion != 0 {
			for _, member := range paramType.Types() {
				if typeArgument, ok := matchAliasSpec(member, spec); ok {
					return spec.Kind, typeArgument, true
				}
			}
		}
		if typeChecker != nil && spec.BrandProperty != "" {
			if matchedByBrand(typeChecker, paramType, spec) {
				return spec.Kind, nil, true
			}
		}
	}
	return 0, nil, false
}

// matchedByBrand reports whether paramType (or any union member when it
// is a union) carries the brand property unique to spec. Used as a
// last-resort fallback when the alias name has been lost due to
// intersection-over-union distribution.
func matchedByBrand(typeChecker *checker.Checker, paramType *checker.Type, spec Spec) bool {
	if checker.Type_flags(paramType)&checker.TypeFlagsUnion != 0 {
		for _, member := range paramType.Types() {
			if hasBrandProperty(typeChecker, member, spec.BrandProperty) {
				return true
			}
		}
		return false
	}
	return hasBrandProperty(typeChecker, paramType, spec.BrandProperty)
}

func hasBrandProperty(typeChecker *checker.Checker, tsType *checker.Type, brandProperty string) bool {
	if tsType == nil {
		return false
	}
	return checker.Checker_getPropertyOfType(typeChecker, tsType, brandProperty) != nil
}

func specForKind(specs []Spec, kind Kind) (Spec, bool) {
	for _, spec := range specs {
		if spec.Kind == kind {
			return spec, true
		}
	}
	return Spec{}, false
}

func matchAliasSpec(tsType *checker.Type, spec Spec) (*checker.Type, bool) {
	alias := checker.Type_alias(tsType)
	if alias == nil {
		return nil, false
	}
	symbol := alias.Symbol()
	if symbol == nil || symbol.Name != spec.Name {
		return nil, false
	}
	if !DeclaredInModule(symbol, spec.Module) {
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
