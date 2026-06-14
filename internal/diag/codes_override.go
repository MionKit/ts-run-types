package diag

// Custom-override codes (OVRxxx). The override pure-fn itself reuses the
// PureFunction marker layer (PFN001 inline-shape, PFE9006-9011 purity), so the
// only override-specific build-time error is a CONFLICT: two overrideX<T>
// declarations targeting the same (family, type) with DIFFERENT bodies, which
// would make the cache entry order-dependent. Same-body re-declarations dedup
// silently (content-addressed cfn key).
const (
	CodeDuplicateOverride = "OVR001"
)

func init() {
	register(Definition{
		Code:     CodeDuplicateOverride,
		Family:   FamilyMarker,
		Severity: SeverityError,
		Title:    "Duplicate overrideX<T> for the same (family, type) with a different body",
	})
}
