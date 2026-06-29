// Package operations is the single source of truth for every RT "operation"
// the transformer can emit a cache entry for, and the one place the opaque
// function hash (fnHash) is computed.
//
// An operation is a named unit of work the backend can render for a given type
// (validate validation, prepareForJson transform, a per-strategy JSON encoder,
// …). Each operation has a canonical Name, the emitted-entry FamilyTag, and the
// compile-time option Axis that refines it. The scanner resolves a createX call
// site to its operation (+ the call-site comptime args) and injects
// fnHash(operation, args); the emitter names cache entries and cross-family
// references with the SAME fnHash. Routing both halves through this package is
// what guarantees they agree — see fnhash.go.
//
// This replaces the hand-maintained family-tag / variant-suffix / JSON-strategy
// token scheme (constants.CompFns, DemandsForFnId, …): the readable token is
// gone, the demand rides structured on protocol.Site, and the cache key is a
// pure hash. The registry below is the superset of the old CompFns map — it
// also enumerates the internal-only primitives (prepareForJson, restoreFromJson,
// …) that have no public createX function but are reachable as JSON-composite
// dependencies or cross-family edges, because the emitter must hash THOSE too.
package operations

// Axis classifies the compile-time option axis that refines an operation's
// fnHash beyond its bare name. Mirrors the old constants.CompFnAxis.
type Axis int

const (
	// AxisNone — the operation takes no compile-time option; its canonical key
	// is exactly its Name.
	AxisNone Axis = iota
	// AxisValidateOptions — refined by the ValidateOptions bag (validate / validationErrors).
	AxisValidateOptions
	// AxisJsonStrategy — refined by the JSON strategy token (jsonEncoder /
	// jsonDecoder); the operation is composite (one emitted entry per strategy).
	AxisJsonStrategy
)

// Operation describes one renderable RT operation.
type Operation struct {
	// Name is the canonical operation name and the stable hash input — e.g.
	// "validate", "prepareForJson", "jsonEncoder". NEVER change a Name without
	// understanding that it changes every fnHash (and thus invalidates caches).
	Name string
	// FamilyTag is the emitted-entry family tag (the disk-cache basename and the
	// inner-fn family). Empty for composite operations (AxisJsonStrategy), whose
	// per-strategy family tags live in constants.CacheModules.
	FamilyTag string
	// Axis is the compile-time option axis refining this operation.
	Axis Axis
	// Public reports whether a createX factory can name this operation via the
	// InjectTypeFnArgs<T, Fn> marker. Internal-only primitives are false.
	Public bool
	// FnKey is the Fn token the InjectTypeFnArgs marker carries for a public
	// operation (e.g. "val", "jsonEncoder"). Empty for internal primitives.
	FnKey string
	// DefaultStrategy is the strategy applied when an AxisJsonStrategy call omits
	// the options literal. Empty for non-JSON operations.
	DefaultStrategy string
	// Strategies is the full set of valid strategy tokens for an AxisJsonStrategy
	// operation. Empty otherwise. Drives the collision-guard enumeration.
	Strategies []string
}

// registry is the complete operation set: 11 public (one per createX factory)
// plus 7 internal-only primitives the JSON composites and cross-family edges
// reference. Order is not load-bearing (everything is keyed by Name / FnKey).
var registry = []Operation{
	// Public — validators (ValidateOptions axis).
	{Name: "validate", FamilyTag: "val", Axis: AxisValidateOptions, Public: true, FnKey: "val"},
	{Name: "validationErrors", FamilyTag: "verr", Axis: AxisValidateOptions, Public: true, FnKey: "verr"},

	// Public — option-less leaf families.
	{Name: "hasUnknownKeys", FamilyTag: "huk", Axis: AxisNone, Public: true, FnKey: "huk"},
	{Name: "stripUnknownKeys", FamilyTag: "suk", Axis: AxisNone, Public: true, FnKey: "suk"},
	{Name: "unknownKeyErrors", FamilyTag: "uke", Axis: AxisNone, Public: true, FnKey: "uke"},
	{Name: "unknownKeysToUndefined", FamilyTag: "uku", Axis: AxisNone, Public: true, FnKey: "uku"},
	{Name: "formatTransform", FamilyTag: "fmt", Axis: AxisNone, Public: true, FnKey: "fmt"},
	{Name: "toBinary", FamilyTag: "tb", Axis: AxisNone, Public: true, FnKey: "tb"},
	{Name: "fromBinary", FamilyTag: "fb", Axis: AxisNone, Public: true, FnKey: "fb"},

	// Public — composite JSON encoder / decoder (JsonStrategy axis). FamilyTag is
	// empty; each strategy renders its own entry (per-strategy tags added to
	// constants.CacheModules in the JSON-composite slice).
	{
		Name: "jsonEncoder", Axis: AxisJsonStrategy, Public: true, FnKey: "jsonEncoder",
		// `clone` is the default and is shape-derived: it builds a NEW value from
		// the declared type shape (never `{...v}`), so undeclared keys are dropped
		// for free — a clone is stripped by construction. That makes a separate
		// "strip" variant of clone (the old `stripClone`) redundant, and the
		// mutate-with-strip variant (`stripMutate`) unnecessary; both were removed.
		// `mutate` transforms in place (preserves undeclared keys, no allocation);
		// `direct` is the single-pass stringifyJson (always strips). `compact`
		// emits declared object props as a positional array (no key names on the
		// wire) and strips extras like `clone`; it pairs with the `compact` decoder.
		DefaultStrategy: "clone",
		Strategies:      []string{"clone", "mutate", "direct", "compact"},
	},
	{
		Name: "jsonDecoder", Axis: AxisJsonStrategy, Public: true, FnKey: "jsonDecoder",
		// `compact` decodes the positional-array wire the compact ENCODER produces
		// (the key-based strip/preserve decoders can't read it), rebuilding the
		// declared object from positions.
		DefaultStrategy: "strip",
		Strategies:      []string{"strip", "preserve", "compact"},
	},

	// Internal primitives — no PUBLIC createX factory, reachable as JSON
	// composite dependencies (pj/pjs/rj/sj/ukuw) or cross-family edges. They
	// carry an FnKey equal to their family tag so the TEST-ONLY deserialize twins
	// (deserializePrepareForJson / deserializeRestoreFromJson / …) can route an
	// InjectTypeFnArgs<T, '<tag>'> marker through the SAME fnHash path as the
	// production factories — there is no runtime hashing, so a deserialize twin
	// for an internal primitive must read the plugin-injected plain fnHash rather
	// than reconstruct it. Public stays false (no user-facing factory names them).
	{Name: "prepareForJson", FamilyTag: "pj", Axis: AxisNone, FnKey: "pj"},
	{Name: "prepareForJsonSafe", FamilyTag: "pjs", Axis: AxisNone, FnKey: "pjs"},
	{Name: "restoreFromJson", FamilyTag: "rj", Axis: AxisNone, FnKey: "rj"},
	{Name: "stringifyJson", FamilyTag: "sj", Axis: AxisNone, FnKey: "sj"},
	{Name: "unknownKeysToUndefinedWire", FamilyTag: "ukuw", Axis: AxisNone, FnKey: "ukuw"},
	// compactForJson / compactFromJson: the positional-tuple JSON round-trip pair
	// the `compact` strategy composes. compactForJson builds a NEW value emitting
	// declared object props as a positional array (no key names); compactFromJson
	// rebuilds the keyed object from positions. Internal primitives (no public
	// createX names them) — reached only as compact composite dependencies.
	{Name: "compactForJson", FamilyTag: "cj", Axis: AxisNone, FnKey: "cj"},
	{Name: "compactFromJson", FamilyTag: "cjr", Axis: AxisNone, FnKey: "cjr"},
}

var (
	byName    map[string]Operation
	byFnKey   map[string]Operation
	byFamilyT map[string]Operation
)

func init() {
	byName = make(map[string]Operation, len(registry))
	byFnKey = make(map[string]Operation)
	byFamilyT = make(map[string]Operation)
	for _, op := range registry {
		byName[op.Name] = op
		if op.FnKey != "" {
			byFnKey[op.FnKey] = op
		}
		if op.FamilyTag != "" {
			byFamilyT[op.FamilyTag] = op
		}
	}
	// Fail the build loudly if any two operation/option combinations hash to the
	// same fnHash at FnHashLen — the user's "closed system" guarantee. See
	// mustBeCollisionFree in fnhash.go.
	mustBeCollisionFree()
}

// ByName returns the operation with the given canonical name.
func ByName(name string) (Operation, bool) {
	op, ok := byName[name]
	return op, ok
}

// ByFnKey returns the public operation a createX call site's InjectTypeFnArgs Fn
// token names (e.g. "val", "jsonEncoder"). Used by the scanner.
func ByFnKey(fnKey string) (Operation, bool) {
	op, ok := byFnKey[fnKey]
	return op, ok
}

// ByFamilyTag returns the operation that emits entries under the given family
// tag (e.g. "pj"). Used by the emitter to recover an operation from a
// CacheModules family. Composite operations (empty FamilyTag) are not indexed.
func ByFamilyTag(tag string) (Operation, bool) {
	op, ok := byFamilyT[tag]
	return op, ok
}
