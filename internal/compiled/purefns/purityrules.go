package purefns

// Source of truth for the allow/forbid sets:
// (ref: packages/devtools/src/eslint/rules/purityRules.ts)
//
// Three project-specific deltas applied per user instruction:
//   - globalThis MOVED from allowedGlobals to forbiddenIdentifiers
//     (it's a backdoor to every host global)
//   - Temporal ADDED to allowedGlobals (Temporal proposal API is pure
//     and safe to reference)
//   - Binary + text-encoding constructors ADDED to allowedGlobals
//     (ArrayBuffer / DataView / the typed arrays / TextEncoder|Decoder /
//     btoa|atob) so hashing, binary-codec, and encoding algorithms can be
//     ported inline into a factory; crypto and SharedArrayBuffer stay out
//     (non-deterministic / threading — see the notes in the map below).
//
// When syncing future tweaks from the reference rules, the diff is
// intentionally small and easy to review.

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

	// Binary data — ArrayBuffer, DataView, and the typed-array views.
	// These are pure value transforms over bytes: the building blocks for
	// porting a hashing / binary-codec / text-encoding algorithm INLINE into
	// a factory body (the purity rules forbid importing one, so the algorithm
	// must be reimplemented in place). A typed array is only ever a local
	// inside the factory — it never reaches the validated data type — so this
	// is fully decoupled from the DataOnly projection on the JS side.
	"ArrayBuffer":       true,
	"DataView":          true,
	"Int8Array":         true,
	"Uint8Array":        true,
	"Uint8ClampedArray": true,
	"Int16Array":        true,
	"Uint16Array":       true,
	"Int32Array":        true,
	"Uint32Array":       true,
	"Float32Array":      true,
	"Float64Array":      true,
	"BigInt64Array":     true,
	"BigUint64Array":    true,

	// Text <-> bytes and base64. Deterministic, no I/O, no host state.
	"TextEncoder": true,
	"TextDecoder": true,
	"btoa":        true,
	"atob":        true,
	// NOTE: `crypto` (Web Crypto) is deliberately ABSENT — getRandomValues /
	// randomUUID are NON-deterministic and subtle.digest is async (a pure-fn
	// can't await), so it would break purity; a pure hash is ported inline
	// over the typed arrays above. `SharedArrayBuffer` is also absent: a
	// cross-thread shared-memory primitive, irrelevant to pure byte work.

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
	"fetch":         true,
	"setTimeout":    true,
	"setInterval":   true,
	"clearTimeout":  true,
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
