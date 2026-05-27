package protocol

// ReflectionSubKind is mion's second discriminator alongside ReflectionKind.
// Mirrors the numeric values in mion's
// `packages/run-types/src/constants.kind.ts` so structural ids computed on
// either side agree byte-for-byte.
//
// Wherever a SubKind is non-zero, mion's id algorithm uses `subKind || kind`
// as the numeric prefix when composing a structural id. The Go-side typeid
// computer mirrors that rule (see internal/typeid/typeid.go).
//
// Note: mion's `params` subKind (1701) is deliberately not mirrored here.
// It exists in mion only because deepkit's RT iterates a generic `children`
// collection on every node and `TypeFunction` keeps its parameters on a
// separate `parameters` property; mion synthesises a `subKind=1701` wrapper
// purely so the iterator picks parameters up. The Go side carries
// parameters directly on the function node — no wrapper, no subKind.
type ReflectionSubKind int

const (
	SubKindNone            ReflectionSubKind = 0
	SubKindMapKey          ReflectionSubKind = 1801
	SubKindMapValue        ReflectionSubKind = 1802
	SubKindSetItem         ReflectionSubKind = 1803
	SubKindDate            ReflectionSubKind = 2001
	SubKindMap             ReflectionSubKind = 2002
	SubKindSet             ReflectionSubKind = 2003
	SubKindNonSerializable ReflectionSubKind = 2004
)

// NonSerializableGlobals mirrors mion's `nonSerializableGlobals` list
// (`packages/run-types/src/constants.ts`). These are global type names whose
// runtime representation can't be serialised; mion treats them as classes
// and stamps SubKindNonSerializable so the structural id distinguishes them
// from a "normal" user class.
//
// Match is by symbol name — tsgo gives us symbols, not JS constructors, so
// the string list is the appropriate source of truth.
var NonSerializableGlobals = []string{
	"Error",
	"EvalError",
	"RangeError",
	"ReferenceError",
	"SyntaxError",
	"TypeError",
	"URIError",
	"AggregateError",
	"WeakMap",
	"WeakSet",
	"DataView",
	"ArrayBuffer",
	"SharedArrayBuffer",
	"Float32Array",
	"Float64Array",
	"Int8Array",
	"Int16Array",
	"Int32Array",
	"Uint8Array",
	"Uint8ClampedArray",
	"Uint16Array",
	"Uint32Array",
	"BigInt64Array",
	"BigUint64Array",
	"Generator",
	"GeneratorFunction",
	"AsyncGenerator",
	"Iterator",
	"AsyncGeneratorFunction",
	"AsyncIterator",
}

var nonSerializableSet = func() map[string]struct{} {
	set := make(map[string]struct{}, len(NonSerializableGlobals))
	for _, name := range NonSerializableGlobals {
		set[name] = struct{}{}
	}
	return set
}()

// IsNonSerializableSymbol reports whether name matches one of mion's
// non-serialisable globals. Used by both the typeid computer and the
// serializer so the two paths stay in lockstep.
func IsNonSerializableSymbol(name string) bool {
	_, ok := nonSerializableSet[name]
	return ok
}
