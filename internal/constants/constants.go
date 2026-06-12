// Package constants defines values shared across the Go internal packages —
// and, via the `cmd/gen-ts-constants` codegen tool, mirrored to the TS side.
//
// Single source of truth: any cross-cutting constant (emit module settings,
// reserved identifiers, wire markers, …) lives here and is regenerated into
// the JS workspace so the two halves never drift.
package constants

// CacheModuleSettings configures one emitted JS cache module.
type CacheModuleSettings struct {
	Name      string // function/export identifier (e.g. "runTypesModule")
	VarPrefix string // identifier prefix for emitted `export const <prefix><hash>`
	Tag       string // short family tag for emitted inner-fn name + fnID (e.g. "verr" → inner "verr_<hash>", fnID "verr")
}

// CacheModuleGroup mirrors mion's RTFunctionsGroup pattern: a map of named
// entries, each carrying its own settings. Future emit modules add an entry
// here so each can have its own variable prefix without touching the renderer.
type CacheModuleGroup map[string]CacheModuleSettings

// CacheModules is the registry of every emitted cache-module shape.
//
// `VarPrefix` is retained as the prefix the renderer uses for inner
// closure names inside the body of an validate validator (mion's
// printClosure convention — outer "get_<fnName>" wraps inner "<fnName>"
// at rtFnCompiler.ts:732). After the move to the splice-based emitter
// the prefix is NOT used to key cache entries any more: every cache is
// now `{ [rawId]: value }`, keyed by the canonical hash id directly.
var CacheModules = CacheModuleGroup{
	"runTypes": {
		Name:      "runTypesModule",
		VarPrefix: "t_",
		Tag:       "t",
	},
	"validate": {
		Name:      "validateModule",
		VarPrefix: "g_val_",
		Tag:       "val",
	},
	"validationErrors": {
		Name:      "validationErrorsModule",
		VarPrefix: "g_verr_",
		Tag:       "verr",
	},
	"prepareForJson": {
		Name:      "prepareForJsonModule",
		VarPrefix: "g_pj_",
		Tag:       "pj",
	},
	"restoreFromJson": {
		Name:      "restoreFromJsonModule",
		VarPrefix: "g_rj_",
		Tag:       "rj",
	},
	"stringifyJson": {
		Name:      "stringifyJsonModule",
		VarPrefix: "g_sj_",
		Tag:       "sj",
	},
	"prepareForJsonSafe": {
		Name:      "prepareForJsonSafeModule",
		VarPrefix: "g_pjs_",
		Tag:       "pjs",
	},
	"hasUnknownKeys": {
		Name:      "hasUnknownKeysModule",
		VarPrefix: "g_huk_",
		Tag:       "huk",
	},
	"stripUnknownKeys": {
		Name:      "stripUnknownKeysModule",
		VarPrefix: "g_suk_",
		Tag:       "suk",
	},
	"unknownKeyErrors": {
		Name:      "unknownKeyErrorsModule",
		VarPrefix: "g_uke_",
		Tag:       "uke",
	},
	"unknownKeysToUndefined": {
		Name:      "unknownKeysToUndefinedModule",
		VarPrefix: "g_uku_",
		Tag:       "uku",
	},
	"unknownKeysToUndefinedWire": {
		Name:      "unknownKeysToUndefinedWireModule",
		VarPrefix: "g_ukuw_",
		Tag:       "ukuw",
	},
	"toBinary": {
		Name:      "toBinaryModule",
		VarPrefix: "g_tb_",
		Tag:       "tb",
	},
	"fromBinary": {
		Name:      "fromBinaryModule",
		VarPrefix: "g_fb_",
		Tag:       "fb",
	},
	"formatTransform": {
		Name:      "formatTransformModule",
		VarPrefix: "g_fmt_",
		Tag:       "fmt",
	},
	"pureFns": {
		Name:      "pureFnsModule",
		VarPrefix: "",
		Tag:       "",
	},
}

// JSON composite family tags — one per (jsonEncoder|jsonDecoder, strategy).
//
// A composite entry wraps the underlying primitives (pj/pjs/sj/uku/rj/ukuw)
// with native JSON and is keyed by the strategy's composite fnHash. It does NOT
// get a CacheModules entry: composites emit no type-walking factory and ride the
// prepareForJson / restoreFromJson module bodies (already loaded into rtUtils),
// so there is no virtual module / VarPrefix to mirror. Each strategy DOES need
// its own short tag so the on-disk cache basename (`<typehash>/<tag>.json`) is
// distinct — two strategies of one type must not collide on a single `je.json`.
//
// jsonCompositeTags maps "op|strategy" → tag. JsonCompositeByTag reverses it so
// the composite emitter recovers (operation, strategy) from a demand's tag.
var jsonCompositeTags = map[string]string{
	"jsonEncoder|clone":    "jeCL",
	"jsonEncoder|mutate":   "jeMU",
	"jsonEncoder|direct":   "jeDI",
	"jsonDecoder|strip":    "jdST",
	"jsonDecoder|preserve": "jdPR",
}

// JsonComposite identifies one JSON composite family: the operation name
// (jsonEncoder / jsonDecoder) and its strategy. Recovered from a family Tag via
// JsonCompositeByTag so the composite emitter knows which fixed body to emit.
type JsonComposite struct {
	OpName   string
	Strategy string
}

var jsonCompositeByTag = func() map[string]JsonComposite {
	out := make(map[string]JsonComposite, len(jsonCompositeTags))
	for key, tag := range jsonCompositeTags {
		parts := splitPipe(key)
		out[tag] = JsonComposite{OpName: parts[0], Strategy: parts[1]}
	}
	return out
}()

// splitPipe splits "op|strategy" into its two halves. Local helper to avoid a
// strings import in this file's var initialiser.
func splitPipe(key string) [2]string {
	for i := 0; i < len(key); i++ {
		if key[i] == '|' {
			return [2]string{key[:i], key[i+1:]}
		}
	}
	return [2]string{key, ""}
}

// JsonCompositeTag returns the per-strategy family Tag for a JSON composite
// operation + strategy (used as the on-disk cache basename and the demand's
// FamilyTag).
func JsonCompositeTag(opName, strategy string) (string, bool) {
	tag, ok := jsonCompositeTags[opName+"|"+strategy]
	return tag, ok
}

// JsonCompositeByTag returns the (operation, strategy) a composite family Tag
// represents, or ok=false when the tag is not a JSON composite.
func JsonCompositeByTag(tag string) (JsonComposite, bool) {
	composite, ok := jsonCompositeByTag[tag]
	return composite, ok
}

// ValidateOption describes one entry in the `ValidateOptions` bag — the
// call-site options that parameterise the generated validate / validationErrors
// validator without affecting the structural type id. Each entry pairs
// the option's JS-side property name with a single-letter token used to
// build the variant cache-key suffix (`itNL_<id>`, `valNA_<id>`,
// `itNLA_<id>`, …). The same table drives the Go scanner's option
// extraction, the emitter's variant fan-out, and (via gen-ts-constants)
// the JS runtime's cache-key construction.
type ValidateOption struct {
	Name   string // JS property name, e.g. "noLiterals"
	Letter string // single uppercase letter appended to the variant suffix, e.g. "L"
}

// ValidateOptions is the ordered registry of supported `ValidateOptions`
// keys. Order is load-bearing: the variant suffix concatenates letters
// in this order so existing variant keys stay stable as new options
// append to the tail (declaration-order, not alphabetic).
//
// To add a new option:
//  1. Append an entry here — the scanner's extraction is table-driven
//     off this registry, so the option is read automatically.
//  2. Add the field to `ValidateOptions` in
//     packages/ts-go-run-types/src/createRTFunctions.ts.
//  3. Teach the emitters to honour it (plus any per-option scanner
//     semantics, e.g. a noop-option diagnostic in analyzeCall).
//  4. Regenerate the TS mirror (`pnpm run gen:ts-constants`).
var ValidateOptions = []ValidateOption{
	{Name: "noLiterals", Letter: "L"},
	{Name: "noIsArrayCheck", Letter: "A"},
}

// ValidateVariantSuffix returns the canonical variant suffix for a sorted
// list of option NAMES (subset of `ValidateOptions[*].Name`). Empty input
// → empty suffix (the plain key). Unknown names are silently skipped —
// callers (scanner / emitter) should validate ahead of time.
//
// The suffix shape is `N` + concatenated letters in `ValidateOptions`
// declaration order. Example: `["noLiterals", "noIsArrayCheck"]` →
// `"NLA"`. The leading `N` ("No") disambiguates the variant prefix
// from a plain `<tag>_<id>` key.
func ValidateVariantSuffix(names []string) string {
	if len(names) == 0 {
		return ""
	}
	present := make(map[string]bool, len(names))
	for _, name := range names {
		present[name] = true
	}
	suffix := "N"
	hit := false
	for _, opt := range ValidateOptions {
		if present[opt.Name] {
			suffix += opt.Letter
			hit = true
		}
	}
	if !hit {
		return ""
	}
	return suffix
}

// JsonStrategyFamilies maps a JSON strategy token to the cache family tags it
// composes. Shared by the scanner (emit), the emitter (demand), and mirrored to
// the TS runtime via gen-ts-constants.
var JsonStrategyFamilies = map[string][]string{
	"direct": {"sj"},
	// `clone` is shape-derived (prepareForJsonSafe builds a new value from the
	// declared shape), so it strips undeclared keys by construction — no separate
	// strip pass / strip variant is needed. (Was {"pjsp"} when `clone` preserved
	// extras; the preserve variant and the `stripClone`/`stripMutate` strategies
	// were removed.)
	"clone":    {"pjs"},
	"mutate":   {"pj"},
	"strip":    {"rj", "ukuw"},
	"preserve": {"rj"},
}

// Per-entry virtual module settings (mirrored to TS via gen-ts-constants).
// Every cache entry — runtype node, type-fn factory, JSON composite, pure fn —
// is served as its own ES module `<VirtualModulePrefix><basename><EntryModuleSuffix>`
// exporting one tuple under its binding name (entrymod.ExportName —
// `<EntryBindingPrefix><identifier-escaped basename>`). The SAME name binds
// the entry everywhere: the export, every import clause, and the call-site
// binding the rewrite injects. See internal/compiled/entrymod.
const (
	// VirtualModulePrefix is the Vite virtual-module namespace every entry
	// module lives under.
	VirtualModulePrefix = "virtual:rt/"
	// EntryModuleSuffix terminates every entry-module specifier; the .js
	// extension keeps downstream tooling (and import-analysis fast paths)
	// treating the virtual id as plain JS.
	EntryModuleSuffix = ".js"
	// EntryBindingPrefix prefixes every entry's binding name — the module's
	// export AND the import binding the rewrite injects into user files
	// (`<prefix><sanitized basename>`); the leading double-underscore keeps
	// collisions with user identifiers implausible.
	EntryBindingPrefix = "__rt_"
	// PureFnModuleDir is the basename directory prefix for pure-fn entry
	// modules (`pf/<ns>/<fn>`), keeping them visually distinct from the hash-
	// keyed runtype / type-fn modules.
	PureFnModuleDir = "pf"
	// RunTypesBundleBasename names the SINGLE runtype data module
	// (`virtual:rt/runtypes.js`): every reflection-demanded node lives there
	// as one tuple row, deduplicated app-wide, with per-root facade modules
	// aliasing into it. Unlike every other entry module it is NOT
	// content-addressed — the Vite plugin invalidates it when a scan reports
	// addedRunTypes. The name can't collide with hash-keyed basenames (hash
	// ids are short) or pure-fn basenames (always under PureFnModuleDir).
	RunTypesBundleBasename = "runtypes"
	// FnsBundleDir is the basename directory prefix for per-family fn-entry
	// bundle modules in allSingle module mode (`fns/<familyTag>`): every
	// entry of one family rides the family's bundle as a NAMED export
	// (`export const <BindingName(key)>=[…]`) instead of its own module.
	FnsBundleDir = "fns"
)

// ModuleMode selects how cache entries are grouped into virtual modules.
// Mirrored to TS so the Vite plugin option validates against the same set.
const (
	// ModuleModeDefault — runtype nodes ride THE single data bundle (+ per-root
	// facade modules); every fn-family / composite / pure-fn entry is its own
	// per-entry module. Today's behavior.
	ModuleModeDefault = "default"
	// ModuleModeAllSingle — bundle EVERYTHING: fn families render one bundle
	// module per family tag (`fns/<tag>`), pure fns one `pf` bundle, and the
	// reflection facades fold into the runtypes bundle as named exports.
	// Fewest modules; family bundles are mutable (invalidate on Added* flags).
	ModuleModeAllSingle = "allSingle"
	// ModuleModeAllModules — split EVERYTHING: fn entries per-entry (as
	// default) AND runtype nodes as individual per-node modules (the
	// pre-bundle layout). Escape hatch; measured slower on dense reflection
	// graphs — see docs/ROADMAP.md.
	ModuleModeAllModules = "allModules"
)

// EmitMode selects what each compiled fn entry ships in its code/factory
// slots — the --emit-mode CLI flag and the Vite plugin's `emitMode` option
// validate against this set. NOT mirrored to TS (the plugin hard-codes the
// three string literals on its option type); the runtime only reads what the
// slots carry, never the mode itself.
type EmitMode string

const (
	// EmitCode (the default) ships only the body `code` string in the code
	// slot; the createRTFn slot is the `u` placeholder and the runtime rebuilds
	// the factory via `new Function('utl', code)` on first lookup.
	EmitCode EmitMode = "code"
	// EmitFunctions ships only the live `function g_<hash>(utl){…}` factory; the
	// code slot is `undefined`. The runtime uses the factory directly and
	// derives the code string lazily (from `createRTFn.toString()`) only if a
	// consumer ever reads it. Smallest factory-bearing output (no body twice).
	EmitFunctions EmitMode = "functions"
	// EmitBoth ships the code string AND the live factory (the body twice) —
	// for runtimes that disallow `new Function` (CSP) yet still read `.code`.
	EmitBoth EmitMode = "both"
)

// EmitsCode reports whether the code-string slot is populated. The zero value
// ("") behaves as EmitCode so a RenderOpts{} default emits the code string.
func (mode EmitMode) EmitsCode() bool {
	return mode == EmitCode || mode == EmitBoth || mode == ""
}

// EmitsFactory reports whether the live createRTFn factory slot is populated.
func (mode EmitMode) EmitsFactory() bool {
	return mode == EmitFunctions || mode == EmitBoth
}

// Valid reports whether mode is one of the three known values (used to
// validate the --emit-mode flag).
func (mode EmitMode) Valid() bool {
	return mode == EmitCode || mode == EmitFunctions || mode == EmitBoth
}

// Tuple slot-0 kind discriminators for entry-module tuples. Type-fn entries
// carry their QUOTED family tag in slot 0 instead of a number, so the runtime
// discriminates with `typeof t[0] === 'string'`.
const (
	TupleKindRunType       = 0
	TupleKindPureFn        = 2
	TupleKindMissing       = 3
	TupleKindRunTypeBundle = 4
	TupleKindRunTypeFacade = 5
)

// JsonCompositeHostTags maps each JSON-composite family tag to the family
// whose runtime entry metadata (fnID / args / defaultParamValues) the
// composite borrows: encoder strategies registered through the prepareForJson
// consumer pre-migration, decoder strategies through restoreFromJson. The
// TS-side familyMeta table mirrors this mapping by hand (see rtUtils.ts).
var JsonCompositeHostTags = func() map[string]string {
	out := make(map[string]string, len(jsonCompositeTags))
	for key, tag := range jsonCompositeTags {
		parts := splitPipe(key)
		if parts[0] == "jsonEncoder" {
			out[tag] = "pj"
		} else {
			out[tag] = "rj"
		}
	}
	return out
}()

// Version is the binary version, injected at build time via
//
//	-ldflags "-X github.com/mionkit/ts-run-types/internal/constants.Version=<v>"
//
// Embedded into the typeID hashing input (see internal/compiled/runtype.assignID)
// so the same structural type gets a different short hash across binary versions —
// any on-disk cache keyed by typeID is automatically version-isolated, no per-
// version directory needed.
//
// Defaults to "dev" for local builds; the publish script overrides it from the
// root package.json version.
var Version = "dev"
