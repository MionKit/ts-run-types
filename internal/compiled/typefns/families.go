package typefns

import (
	"io"

	"github.com/mionkit/ts-run-types/internal/cachetpl"
	"github.com/mionkit/ts-run-types/internal/constants"
	"github.com/mionkit/ts-run-types/internal/protocol"
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
	Skeleton string
}

// family builds one registry row, binding Settings to the CacheModules key.
func family(key string, emitter Emitter, skeleton string) FamilySpec {
	return FamilySpec{Key: key, Settings: constants.CacheModules[key], Emitter: emitter, Skeleton: skeleton}
}

// Families lists every type-walking cache family. ORDER IS LOAD-BEARING:
// validate is LAST — the dispatcher renders families in this order so
// validate's CrossFamilyValRoots collection passes (which iterate the
// non-validate rows of this slice) hit the per-dispatch entry memo
// instead of re-compiling every foreign family.
var Families = []FamilySpec{
	family("validationErrors", ValidationErrorsEmitter{}, cachetpl.SkeletonValidationErrors),
	// prepareForJson / restoreFromJson: the mutating JSON round-trip pair —
	// `restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))` must
	// deep-equal v. Unions emit the flat wire shape (see union_flat.go).
	family("prepareForJson", PrepareForJsonEmitter{}, cachetpl.SkeletonPrepareForJson),
	family("restoreFromJson", RestoreFromJsonEmitter{}, cachetpl.SkeletonRestoreFromJson),
	// stringifyJson: single-pass serialiser that builds the JSON string
	// directly from the type — never mutates v, strips extras by construction.
	family("stringifyJson", StringifyJsonEmitter{}, cachetpl.SkeletonStringifyJson),
	// prepareForJsonSafe: non-mutating prepareForJson sibling that strips
	// undeclared properties and returns a new value.
	family("prepareForJsonSafe", PrepareForJsonSafeEmitter{}, cachetpl.SkeletonPrepareForJsonSafe),
	// The unknown-keys group: boolean probe, deleting/undefining mutators,
	// error accumulator, and the decoder-internal wire-aware variant.
	family("hasUnknownKeys", HasUnknownKeysEmitter{}, cachetpl.SkeletonHasUnknownKeys),
	family("stripUnknownKeys", StripUnknownKeysEmitter{}, cachetpl.SkeletonStripUnknownKeys),
	family("unknownKeyErrors", UnknownKeyErrorsEmitter{}, cachetpl.SkeletonUnknownKeyErrors),
	family("unknownKeysToUndefined", UnknownKeysToUndefinedEmitter{}, cachetpl.SkeletonUnknownKeysToUndefined),
	family("unknownKeysToUndefinedWire", UnknownKeysToUndefinedWireEmitter{}, cachetpl.SkeletonUnknownKeysToUndefinedWire),
	// toBinary / fromBinary: DataViewSerializer (little-endian) round-trip
	// pair; unions emit the flat-prop wire shape (see union_flat_binary.go).
	family("toBinary", ToBinaryEmitter{}, cachetpl.SkeletonToBinary),
	family("fromBinary", FromBinaryEmitter{}, cachetpl.SkeletonFromBinary),
	// formatTransform: the value-transform family (createFormatTransform<T>).
	family("formatTransform", FormatTransformEmitter{}, cachetpl.SkeletonFormatTransform),
	family("validate", ValidateEmitter{}, cachetpl.SkeletonValidate), // LAST — see order note above
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

// Render writes the family's cache module: the hand-authored skeleton with
// the marker line replaced by one `init(…);` call per cached RunType the
// family's emitter supports. The skeleton's `init` closes over the
// surrounding `initCache(rtUtils)` parameter, so per-entry call sites
// don't repeat the argument.
func (spec FamilySpec) Render(writer io.Writer, dump protocol.Dump, opts RenderOpts) error {
	return RenderFnModule(writer, dump, spec.Settings, spec.Emitter, innerPrefix(spec.Settings), spec.Skeleton, opts)
}

// AnySupported reports whether at least one runtype in the slice has a
// supported emit arm in this family (one shallow pass per family — the
// per-dispatch profile the perf pass measured and kept).
func (spec FamilySpec) AnySupported(runTypes []*protocol.RunType) bool {
	for _, runType := range runTypes {
		if spec.Emitter.Supports(runType) {
			return true
		}
	}
	return false
}
