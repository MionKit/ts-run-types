package typefunctions

// pureFnAliases maps a pure-fn name to the short alias used in emitted
// factory bodies. The alias becomes the local variable name bound to
// utl.getPureFn('<ns>::<fnName>'); shortening it cuts bytes per occurrence
// in both the body STRING and the createRTFn closure. The getPureFn key
// itself is always fully quoted — factory bodies must stay self-contained
// (they are rebuilt via `new Function('utl', code)`), and per-entry tuple
// args evaluate in their own module scope, so there is no shared-skeleton
// const to reference (the pre-migration `k_<alias>` scheme).
var pureFnAliases = map[string]string{
	"newRunTypeErr":           "nRT",
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
