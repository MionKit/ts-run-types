package diag

// Marker-scanner codes (MKRxxx). Issued by the resolver when a marker call
// compiles correctly but uses an anti-pattern.
const (
	CodeMarkerFunctionCallArg  = "MKR001"
	CodeMarkerNonLiteralOptions = "MKR002"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeMarkerFunctionCallArg, Family: FamilyMarker, Severity: SeverityWarning, Title: "Reflect-form marker received function-call argument"},
		{Code: CodeMarkerNonLiteralOptions, Family: FamilyMarker, Severity: SeverityWarning, Title: "Marker options not a literal object"},
	} {
		register(definition)
	}
}
