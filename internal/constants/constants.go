// Package constants defines values shared across the Go internal packages —
// and, via the `cmd/gen-ts-constants` codegen tool, mirrored to the TS side.
//
// Single source of truth: any cross-cutting constant (emit module settings,
// reserved identifiers, wire markers, …) lives here and is regenerated into
// the JS workspace so the two halves never drift.
package constants

import "strings"

// CacheModuleSettings configures one emitted JS cache module.
type CacheModuleSettings struct {
	Name      string // function/export identifier (e.g. "runTypesModule")
	VarPrefix string // identifier prefix for emitted `export const <prefix><hash>`
	Tag       string // short family tag for emitted inner-fn name + fnID (e.g. "te" → inner "te_<hash>", fnID "te")
}

// CacheModuleGroup mirrors mion's RTFunctionsGroup pattern: a map of named
// entries, each carrying its own settings. Future emit modules add an entry
// here so each can have its own variable prefix without touching the renderer.
type CacheModuleGroup map[string]CacheModuleSettings

// CacheModules is the registry of every emitted cache-module shape.
//
// `VarPrefix` is retained as the prefix the renderer uses for inner
// closure names inside the body of an isType validator (mion's
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
	"isType": {
		Name:      "isTypeModule",
		VarPrefix: "g_it_",
		Tag:       "it",
	},
	"typeErrors": {
		Name:      "typeErrorsModule",
		VarPrefix: "g_te_",
		Tag:       "te",
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
	"prepareForJsonSafePreserve": {
		Name:      "prepareForJsonSafePreserveModule",
		VarPrefix: "g_pjsp_",
		Tag:       "pjsp",
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

// IsTypeOption describes one entry in the `IsTypeOptions` bag — the
// call-site options that parameterise the generated isType / typeErrors
// validator without affecting the structural type id. Each entry pairs
// the option's JS-side property name with a single-letter token used to
// build the variant cache-key suffix (`itNL_<id>`, `itNA_<id>`,
// `itNLA_<id>`, …). The same table drives the Go scanner's option
// extraction, the emitter's variant fan-out, and (via gen-ts-constants)
// the JS runtime's cache-key construction.
type IsTypeOption struct {
	Name   string // JS property name, e.g. "noLiterals"
	Letter string // single uppercase letter appended to the variant suffix, e.g. "L"
}

// IsTypeOptions is the ordered registry of supported `IsTypeOptions`
// keys. Order is load-bearing: the variant suffix concatenates letters
// in this order so existing variant keys stay stable as new options
// append to the tail (declaration-order, not alphabetic).
//
// To add a new option:
//  1. Append an entry here.
//  2. Add the field to `IsTypeOptions` in
//     packages/ts-go-run-types/src/createRTFunctions.ts.
//  3. Teach the Go scanner to read it and the emitters to honour it.
//  4. Regenerate the TS mirror (`pnpm run gen:ts-constants`).
var IsTypeOptions = []IsTypeOption{
	{Name: "noLiterals", Letter: "L"},
	{Name: "noIsArrayCheck", Letter: "A"},
}

// IsTypeVariantSuffix returns the canonical variant suffix for a sorted
// list of option NAMES (subset of `IsTypeOptions[*].Name`). Empty input
// → empty suffix (the plain key). Unknown names are silently skipped —
// callers (scanner / emitter) should validate ahead of time.
//
// The suffix shape is `N` + concatenated letters in `IsTypeOptions`
// declaration order. Example: `["noLiterals", "noIsArrayCheck"]` →
// `"NLA"`. The leading `N` ("No") disambiguates the variant prefix
// from a plain `<tag>_<id>` key.
func IsTypeVariantSuffix(names []string) string {
	if len(names) == 0 {
		return ""
	}
	present := make(map[string]bool, len(names))
	for _, name := range names {
		present[name] = true
	}
	suffix := "N"
	hit := false
	for _, opt := range IsTypeOptions {
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

// CompFnAxis classifies the compile-time option axis that refines a createX
// function's injected fnId beyond its base cache-family tag. The InjectTypeFnArgs
// marker scanner reads the relevant call-site literal per axis to compute the
// precise fnId it injects.
type CompFnAxis int

const (
	// CompFnAxisNone — fnId is exactly the base family tag (huk, suk, …); no
	// compile-time option refines it.
	CompFnAxisNone CompFnAxis = iota
	// CompFnAxisIsTypeOptions — fnId is baseTag + IsTypeVariantSuffix (it, te).
	CompFnAxisIsTypeOptions
	// CompFnAxisJsonStrategy — fnId is the JSON strategy token; the families it
	// demands come from JsonStrategyFamilies (jsonEncoder / jsonDecoder).
	CompFnAxisJsonStrategy
)

// CompFn describes one createX function the InjectTypeFnArgs<T, Fn> marker's Fn
// type-arg can name. Key is the literal Fn value the factory declares (e.g.
// "it", "jsonEncoder"); BaseTag is the cache family tag for the non-composite
// axes; DefaultStrategy is applied when a JSON call omits the options literal.
type CompFn struct {
	Key             string
	BaseTag         string
	Axis            CompFnAxis
	DefaultStrategy string
}

// CompFns is the registry of every createX function, keyed by its Fn token —
// the single source of truth the scanner (fnId emit), the emitter (demand), and
// the TS runtime (mirrored via gen-ts-constants) all route through.
var CompFns = map[string]CompFn{
	"it":          {Key: "it", BaseTag: "it", Axis: CompFnAxisIsTypeOptions},
	"te":          {Key: "te", BaseTag: "te", Axis: CompFnAxisIsTypeOptions},
	"huk":         {Key: "huk", BaseTag: "huk", Axis: CompFnAxisNone},
	"suk":         {Key: "suk", BaseTag: "suk", Axis: CompFnAxisNone},
	"uke":         {Key: "uke", BaseTag: "uke", Axis: CompFnAxisNone},
	"uku":         {Key: "uku", BaseTag: "uku", Axis: CompFnAxisNone},
	"fmt":         {Key: "fmt", BaseTag: "fmt", Axis: CompFnAxisNone},
	"tb":          {Key: "tb", BaseTag: "tb", Axis: CompFnAxisNone},
	"fb":          {Key: "fb", BaseTag: "fb", Axis: CompFnAxisNone},
	"jsonEncoder": {Key: "jsonEncoder", Axis: CompFnAxisJsonStrategy, DefaultStrategy: "stripClone"},
	"jsonDecoder": {Key: "jsonDecoder", Axis: CompFnAxisJsonStrategy, DefaultStrategy: "strip"},
}

// JsonStrategyFamilies maps a JSON strategy token to the cache family tags it
// composes. Shared by the scanner (emit), the emitter (demand), and mirrored to
// the TS runtime via gen-ts-constants.
var JsonStrategyFamilies = map[string][]string{
	"direct":      {"sj"},
	"stripClone":  {"pjs"},
	"clone":       {"pjsp"},
	"mutate":      {"pj"},
	"stripMutate": {"pj", "uku"},
	"strip":       {"rj", "ukuw"},
	"preserve":    {"rj"},
}

// variantFamilyBases lists the family tags whose fnId carries an IsTypeOptions
// variant suffix (e.g. `itNL`). Used by DemandsForFnId to parse a token back.
var variantFamilyBases = []string{"it", "te"}

// MigratedFamilies is the set of cache family tags rendered demand-driven (only
// the types their createX call sites request); every other family still rides
// the back-compat all-RunTypes path. EVERY function family is now migrated.
//
// CROSS-FAMILY DEPENDENCY: `it` (isType) is a SHARED dependency — the JSON and
// binary union decoders discriminate members via `it_<member>.fn(…)` (see
// unionMemberIsTypeCheck in json_prepare.go) and typeErrors delegates child
// checks to `it_`. Earlier slices kept `it` all-emit because demand-scoping it
// to only its createIsType sites dropped the `it_<member>` entries those
// foreign families need at runtime, silently corrupting union round-trips.
//
// `it` is now demand-scoped too. Its demand is the createIsType-site closure
// (the normal demand path) ∪ the `it_<member>` cross-family edges every OTHER
// demanded family references — collected by typefns.CrossFamilyItRoots (which
// renders each foreign family demand-driven and harvests their captured
// crossFamilyDeps) and seeded into the it render via RenderOpts.ExtraRoots by
// the resolver's renderIsTypeModule. So a file that only serializes a union
// (createBinaryEncoder / createJsonEncoder) still gets the per-member it_
// entries its decoder needs, while a getRunTypeId-only (reflection) file emits
// ZERO it_ entries.
//
// Only LEAF families (nothing references their cache) were safe to migrate
// incrementally. `te` was the first; `huk`/`suk`/`uke`/`fmt` and the binary
// pair `tb`/`fb` followed (all leaves with their own createX call sites). The
// JSON slice then added the prepareForJson / restoreFromJson / stringifyJson
// families (`pj`/`pjs`/`pjsp`/`sj`/`rj`) plus the decoder-wire `ukuw`, each
// seeded by its own createJsonEncoder/createJsonDecoder strategy demand. `it`
// — the shared cross-family dep — migrated last, once every other family was
// demand-scoped so their cross-family edges are minimal.
var MigratedFamilies = map[string]bool{
	"it":   true,
	"te":   true,
	"huk":  true,
	"suk":  true,
	"uke":  true,
	"fmt":  true,
	"tb":   true,
	"fb":   true,
	"pj":   true,
	"pjs":  true,
	"pjsp": true,
	"sj":   true,
	"rj":   true,
	"uku":  true,
	"ukuw": true,
}

// IsFamilyMigrated reports whether the cache family `tag` has moved to the
// demand-driven (InjectTypeFnArgs) path.
func IsFamilyMigrated(tag string) bool {
	return MigratedFamilies[tag]
}

// FnDemand is one cache entry a call-site fnId resolves to: the family tag, the
// variant suffix appended to it, and the option names that prime the walker.
// Single-family functions resolve to one demand; composite JSON strategies
// resolve to two.
type FnDemand struct {
	Tag           string
	VariantSuffix string
	Options       []string
}

// ResolveFnId computes the injected fnId token for a function key plus the
// compile-time args parsed at the call site. optionNames is the set of true
// IsTypeOptions names (CompFnAxisIsTypeOptions); strategy is the JSON strategy
// literal (CompFnAxisJsonStrategy; "" ⇒ the function's default). ok is false
// when fnKey isn't a registered createX function.
func ResolveFnId(fnKey string, optionNames []string, strategy string) (string, bool) {
	fn, ok := CompFns[fnKey]
	if !ok {
		return "", false
	}
	switch fn.Axis {
	case CompFnAxisIsTypeOptions:
		return fn.BaseTag + IsTypeVariantSuffix(optionNames), true
	case CompFnAxisJsonStrategy:
		if strategy == "" {
			strategy = fn.DefaultStrategy
		}
		return strategy, true
	default:
		return fn.BaseTag, true
	}
}

// DemandsForFnId reverses an injected fnId token into the cache-entry demands
// the emitter must render. Used by the renderer, which sees Site.FnId rather
// than the original call-site args.
func DemandsForFnId(fnId string) []FnDemand {
	if fnId == "" {
		return nil
	}
	// JSON strategy token → its composed families (plain entries, no variant).
	if families, isStrategy := JsonStrategyFamilies[fnId]; isStrategy {
		demands := make([]FnDemand, 0, len(families))
		for _, tag := range families {
			demands = append(demands, FnDemand{Tag: tag})
		}
		return demands
	}
	// Variant family: baseTag, optionally followed by an `N<letters>` suffix.
	for _, base := range variantFamilyBases {
		if fnId == base {
			return []FnDemand{{Tag: base}}
		}
		if strings.HasPrefix(fnId, base+"N") {
			suffix := fnId[len(base):]
			return []FnDemand{{Tag: base, VariantSuffix: suffix, Options: optionsForVariantSuffix(suffix)}}
		}
	}
	// Simple family: fnId is the tag.
	return []FnDemand{{Tag: fnId}}
}

// optionsForVariantSuffix reverses an `N<letters>` variant suffix back to the
// IsTypeOptions names it encodes (inverse of IsTypeVariantSuffix).
func optionsForVariantSuffix(suffix string) []string {
	if len(suffix) == 0 || suffix[0] != 'N' {
		return nil
	}
	letters := suffix[1:]
	var names []string
	for _, opt := range IsTypeOptions {
		if opt.Letter != "" && strings.Contains(letters, opt.Letter) {
			names = append(names, opt.Name)
		}
	}
	return names
}

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
