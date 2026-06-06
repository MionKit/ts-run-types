// Package operations is the single source of truth for every RT "operation"
// the transformer can emit a cache entry for, and the one place the opaque
// function hash (fnHash) is computed.
//
// An operation is a named unit of work the backend can render for a given type
// (isType validation, prepareForJson transform, a per-strategy JSON encoder,
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
	// AxisIsTypeOptions — refined by the IsTypeOptions bag (isType / typeErrors).
	AxisIsTypeOptions
	// AxisJsonStrategy — refined by the JSON strategy token (jsonEncoder /
	// jsonDecoder); the operation is composite (one emitted entry per strategy).
	AxisJsonStrategy
)

// Operation describes one renderable RT operation.
type Operation struct {
	// Name is the canonical operation name and the stable hash input — e.g.
	// "isType", "prepareForJson", "jsonEncoder". NEVER change a Name without
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
	// operation (e.g. "it", "jsonEncoder"). Empty for internal primitives.
	FnKey string
	// DefaultStrategy is the strategy applied when an AxisJsonStrategy call omits
	// the options literal. Empty for non-JSON operations.
	DefaultStrategy string
	// Strategies is the full set of valid strategy tokens for an AxisJsonStrategy
	// operation. Empty otherwise. Drives the collision-guard enumeration.
	Strategies []string
}

// registry is the complete operation set: 11 public (one per createX factory)
// plus 6 internal-only primitives the JSON composites and cross-family edges
// reference. Order is not load-bearing (everything is keyed by Name / FnKey).
var registry = []Operation{
	// Public — validators (IsTypeOptions axis).
	{Name: "isType", FamilyTag: "it", Axis: AxisIsTypeOptions, Public: true, FnKey: "it"},
	{Name: "typeErrors", FamilyTag: "te", Axis: AxisIsTypeOptions, Public: true, FnKey: "te"},

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
		DefaultStrategy: "stripClone",
		Strategies:      []string{"clone", "stripClone", "mutate", "stripMutate", "direct"},
	},
	{
		Name: "jsonDecoder", Axis: AxisJsonStrategy, Public: true, FnKey: "jsonDecoder",
		DefaultStrategy: "strip",
		Strategies:      []string{"strip", "preserve"},
	},

	// Internal-only primitives — no createX marker; reachable only as JSON
	// composite dependencies (pj/pjs/pjsp/rj/sj/ukuw) or cross-family edges.
	{Name: "prepareForJson", FamilyTag: "pj", Axis: AxisNone},
	{Name: "prepareForJsonSafe", FamilyTag: "pjs", Axis: AxisNone},
	{Name: "prepareForJsonSafePreserve", FamilyTag: "pjsp", Axis: AxisNone},
	{Name: "restoreFromJson", FamilyTag: "rj", Axis: AxisNone},
	{Name: "stringifyJson", FamilyTag: "sj", Axis: AxisNone},
	{Name: "unknownKeysToUndefinedWire", FamilyTag: "ukuw", Axis: AxisNone},
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
// token names (e.g. "it", "jsonEncoder"). Used by the scanner.
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
