package diag

// Custom-override codes (OVRxxx). The override pure-fn itself reuses the
// PureFunction marker layer (PFN001 inline-shape, PFE9006-9011 purity), so the
// only override-specific build-time error is a CONFLICT: two overrideX<T>
// declarations targeting the same (family, type) with DIFFERENT bodies, which
// would make the cache entry order-dependent. Same-body re-declarations dedup
// silently (content-addressed cfn key).
const (
	CodeDuplicateOverride = "OVR001"
	// CodeOverrideMissingCfn is a build-time tripwire: a cfn redirect references
	// a `cfn::<hash>` module that did not render in the entry graph. The redirect
	// body is `utl.usePureFn('cfn::<hash>')`, which throws at runtime on a miss —
	// this surfaces the emitter bug at build time instead. Should never fire in
	// normal operation. Mirrors the JSON composite's missing-primitive assert.
	CodeOverrideMissingCfn = "OVR002"
	// CodeOverrideValidateCrossFamily warns that overriding `validate` for a type
	// also changes how JSON / binary decoders narrow unions containing it —
	// `validate` is a shared cross-family dependency, so the override reaches
	// past createValidate<T>(). Informational; the build proceeds.
	CodeOverrideValidateCrossFamily = "OVR010"
)

func init() {
	register(Definition{
		Code:     CodeDuplicateOverride,
		Family:   FamilyMarker,
		Severity: SeverityError,
		Title:    "Duplicate overrideX<T> for the same (family, type) with a different body",
	})
	register(Definition{
		Code:     CodeOverrideMissingCfn,
		Family:   FamilyMarker,
		Severity: SeverityError,
		Title:    "Override redirect references a cfn module that did not render",
	})
	register(Definition{
		Code:     CodeOverrideValidateCrossFamily,
		Family:   FamilyMarker,
		Severity: SeverityWarning,
		Title:    "validate override also affects JSON/binary union decoders for this type",
	})
}
