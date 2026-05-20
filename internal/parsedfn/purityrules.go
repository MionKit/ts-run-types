package parsedfn

// Source of truth for the allow/forbid sets:
// /home/user/mion/packages/devtools/src/eslint/rules/purityRules.ts
//
// Two project-specific deltas applied per user instruction:
//   - globalThis MOVED from allowedGlobals to forbiddenIdentifiers
//     (it's a backdoor to every host global)
//   - Temporal ADDED to allowedGlobals (Temporal proposal API is pure
//     and safe to reference)
//
// When syncing future tweaks from mion, the diff is intentionally small
// and easy to review.

// allowedGlobals are the identifiers a pure-function factory may
// reference without being either in its own lexical scope or considered
// a closure violation.
var allowedGlobals = map[string]bool{
	// Primitive sentinels and constructors.
	"undefined": true,
	"null":      true,
	"NaN":       true,
	"Infinity":  true,
	"true":      true,
	"false":     true,

	// Built-in object / collection constructors.
	"Object":  true,
	"Array":   true,
	"String":  true,
	"Number":  true,
	"Boolean": true,
	"Math":    true,
	"JSON":    true,
	"Date":    true,
	"RegExp":  true,
	"Map":     true,
	"Set":     true,
	"WeakMap": true,
	"WeakSet": true,
	"Symbol":  true,
	"BigInt":  true,
	"Promise": true,

	// Errors.
	"Error":      true,
	"TypeError":  true,
	"RangeError": true,

	// Coercion + introspection.
	"parseInt":           true,
	"parseFloat":         true,
	"isNaN":              true,
	"isFinite":           true,
	"encodeURIComponent": true,
	"decodeURIComponent": true,
	"encodeURI":          true,
	"decodeURI":          true,

	// Console + runtime hints.
	"console": true,
	"Bun":     true,

	// Temporal API (Stage 3 / shipping). Pure constructors + arithmetic;
	// safe inside factory bodies.
	"Temporal": true,
	// NOTE: globalThis intentionally absent — it lives in forbiddenIdentifiers.
}

// forbiddenIdentifiers are identifiers we actively reject even though
// they're globally available. Reaching for any of these from a "pure"
// function is a strong smell — they expose I/O, host state, or runtime
// metaprogramming.
var forbiddenIdentifiers = map[string]bool{
	// Code-eval escape hatches.
	"eval":     true,
	"Function": true,

	// Network / timing — side-effectful by definition.
	"fetch":          true,
	"setTimeout":     true,
	"setInterval":    true,
	"clearTimeout":   true,
	"clearInterval": true,

	// Host / environment objects.
	"process":  true,
	"window":   true,
	"document": true,
	"global":   true,
	"require":  true,

	// globalThis exposes every host global indirectly — a backdoor for
	// the entire forbidden set. User-requested addition to this map.
	"globalThis": true,

	// Network primitives.
	"XMLHttpRequest": true,
	"WebSocket":      true,

	// Persistent storage.
	"localStorage":   true,
	"sessionStorage": true,
	"indexedDB":      true,
}
