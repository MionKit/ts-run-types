package diag

// Marker-scanner codes (MKRxxx). Issued by the resolver when a marker call
// compiles correctly but uses an anti-pattern.
const (
	CodeMarkerFunctionCallArg   = "MKR001"
	CodeMarkerNonLiteralOptions = "MKR002"
	CodeMarkerFreeTypeParameter = "MKR003"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeMarkerFunctionCallArg, Family: FamilyMarker, Severity: SeverityWarning, Title: "Marker invokes a function just to read its return type"},
		{Code: CodeMarkerNonLiteralOptions, Family: FamilyMarker, Severity: SeverityError, Title: "Marker options must be a literal object — your options were silently dropped"},
		{Code: CodeMarkerFreeTypeParameter, Family: FamilyMarker, Severity: SeverityError, Title: "Marker call inside a generic function — type argument is unresolved"},
	} {
		register(definition)
	}
}
