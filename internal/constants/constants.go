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

// JSON composite family tags — one per (jsonEncoder|jsonDecoder, strategy).
//
// A composite entry wraps the underlying primitives (pj/pjs/pjsp/sj/uku/rj/ukuw)
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
	"jsonEncoder|clone":       "jeCL",
	"jsonEncoder|stripClone":  "jeSC",
	"jsonEncoder|mutate":      "jeMU",
	"jsonEncoder|stripMutate": "jeSM",
	"jsonEncoder|direct":      "jeDI",
	"jsonDecoder|strip":       "jdST",
	"jsonDecoder|preserve":    "jdPR",
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
