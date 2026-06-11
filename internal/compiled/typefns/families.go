package typefns

import (

	"github.com/mionkit/ts-run-types/internal/constants"
)

// FamilySpec bundles everything one type-walking cache family needs to
// render: its constants.CacheModules key (== the wire CacheKind string),
// settings, emitter and skeleton. Adding a new RT function family = one
// emitter file + one row in Families; the resolver wires renders and
// added-flags off the registry.
type FamilySpec struct {
	Key      string
	Settings constants.CacheModuleSettings
	Emitter  Emitter
}

// family builds one registry row, binding Settings to the CacheModules key.
func family(key string, emitter Emitter) FamilySpec {
	return FamilySpec{Key: key, Settings: constants.CacheModules[key], Emitter: emitter}
}

// Families lists every type-walking cache family. ORDER IS LOAD-BEARING:
// validate is LAST — the dispatcher renders families in this order so
// validate's CrossFamilyValRoots collection passes (which iterate the
// non-validate rows of this slice) hit the per-dispatch entry memo
// instead of re-compiling every foreign family.
var Families = []FamilySpec{
	family("validationErrors", ValidationErrorsEmitter{}),
	// prepareForJson / restoreFromJson: the mutating JSON round-trip pair —
	// `restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))` must
	// deep-equal v. Unions emit the flat wire shape (see union_flat.go).
	family("prepareForJson", PrepareForJsonEmitter{}),
	family("restoreFromJson", RestoreFromJsonEmitter{}),
	// stringifyJson: single-pass serialiser that builds the JSON string
	// directly from the type — never mutates v, strips extras by construction.
	family("stringifyJson", StringifyJsonEmitter{}),
	// prepareForJsonSafe: non-mutating prepareForJson sibling that strips
	// undeclared properties and returns a new value.
	family("prepareForJsonSafe", PrepareForJsonSafeEmitter{}),
	// The unknown-keys group: boolean probe, deleting/undefining mutators,
	// error accumulator, and the decoder-internal wire-aware variant.
	family("hasUnknownKeys", HasUnknownKeysEmitter{}),
	family("stripUnknownKeys", StripUnknownKeysEmitter{}),
	family("unknownKeyErrors", UnknownKeyErrorsEmitter{}),
	family("unknownKeysToUndefined", UnknownKeysToUndefinedEmitter{}),
	family("unknownKeysToUndefinedWire", UnknownKeysToUndefinedWireEmitter{}),
	// toBinary / fromBinary: DataViewSerializer (little-endian) round-trip
	// pair; unions emit the flat-prop wire shape (see union_flat_binary.go).
	family("toBinary", ToBinaryEmitter{}),
	family("fromBinary", FromBinaryEmitter{}),
	// formatTransform: the value-transform family (createFormatTransform<T>).
	family("formatTransform", FormatTransformEmitter{}),
	family("validate", ValidateEmitter{}), // LAST — see order note above
}

var familiesByKey = func() map[string]FamilySpec {
	byKey := make(map[string]FamilySpec, len(Families))
	for _, spec := range Families {
		byKey[spec.Key] = spec
	}
	return byKey
}()

// FamilyByKey returns the registered family for a CacheModules key. Panics on
// an unknown key — resolver wiring is static, so a typo dies at process init.
func FamilyByKey(key string) FamilySpec {
	spec, ok := familiesByKey[key]
	if !ok {
		panic("typefns: unknown cache family key: " + key)
	}
	return spec
}


