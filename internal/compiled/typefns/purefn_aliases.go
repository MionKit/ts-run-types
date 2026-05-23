package typefns

// pureFnAliases maps a pure-fn name to the short alias used in emitted
// factory bodies. The alias becomes the local variable name bound to
// utl.getPureFn(...); shortening it cuts bytes per occurrence in both
// the body STRING and the createRTFn closure.
//
// The matching key-const name (`k_<alias>`, e.g. "k_nRT") MUST be
// declared at module scope inside every cache skeleton under
// packages/ts-go-run-types/src/caches/ that calls the aliased pure-fn
// (typeerrors / unknownkeys families today) so the emitter can
// reference it in `pureFnDependencies` and inside the createRTFn
// closure without re-quoting the full "mion::<fnName>" literal. Add a
// new entry here AND the matching `k_<alias>` const in every relevant
// skeleton when introducing a pure-fn the emitter calls.
var pureFnAliases = map[string]string{
	"newRunTypeErr":           "nRT",
	"safeIterableKey":         "sIK",
	"getUnknownKeysFromArray": "gUKFA",
	"hasUnknownKeysFromArray": "hUKFA",
}

// pureFnAlias returns the emitter-side alias for a registered pure-fn
// name, or the full name when no alias is registered (no savings, no
// break — falls back to the longer identifier without breaking the
// emitted code).
func pureFnAlias(fnName string) string {
	if alias, ok := pureFnAliases[fnName]; ok {
		return alias
	}
	return fnName
}

// pureFnKeyVar returns the module-level const name the skeleton declares
// for a pure-fn key (e.g. "k_nRT" for "newRunTypeErr"). Aliased fns get
// "k_<alias>"; unaliased ones get "k_<fnName>" — both forms expect a
// matching `const k_… = '<namespace>::<fnName>';` in the skeleton.
func pureFnKeyVar(fnName string) string {
	return "k_" + pureFnAlias(fnName)
}
