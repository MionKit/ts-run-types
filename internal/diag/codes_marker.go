package diag

// Marker-scanner codes (MKRxxx). Issued by the resolver when a marker call
// compiles correctly but uses an anti-pattern.
const (
	CodeMarkerFunctionCallArg         = "MKR001"
	CodeMarkerFreeTypeParameter       = "MKR003"
	CodeValidateOptionsNoLiteralsNoop = "MKR004"
	CodeValidateOptionsNoArrayNoop    = "MKR005"
)

// CompTimeArgs-marker codes (CTAxxx). Issued by the resolver when a
// CompTimeArgs<T>-branded parameter receives an argument the Go scanner
// cannot statically evaluate at build time.
const (
	CodeCompTimeArgsNonLiteral         = "CTA001"
	CodeCompTimeArgsDepthExceeded      = "CTA002"
	CodeCompTimeArgsForbiddenConstruct = "CTA003"
)

// PureFunction-marker codes (PFNxxx). Issued by the resolver when a
// PureFunction<F>-branded parameter receives something other than an
// inline arrow / function expression. Purity violations themselves are
// reported via the existing PFE9006-PFE9011 codes from the purefns
// package, reused unchanged.
const (
	CodePureFunctionNotLiteral = "PFN001"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeMarkerFunctionCallArg, Family: FamilyMarker, Severity: SeverityWarning, Title: "Marker invokes a function just to read its return type"},
		{Code: CodeMarkerFreeTypeParameter, Family: FamilyMarker, Severity: SeverityError, Title: "Marker call inside a generic function — type argument is unresolved"},
		{Code: CodeValidateOptionsNoLiteralsNoop, Family: FamilyMarker, Severity: SeverityWarning, Title: "`ValidateOptions.noLiterals` has no effect on this type — the option is a no-op"},
		{Code: CodeValidateOptionsNoArrayNoop, Family: FamilyMarker, Severity: SeverityWarning, Title: "`ValidateOptions.noIsArrayCheck` has no effect on this type — the option is a no-op"},
		{Code: CodeCompTimeArgsNonLiteral, Family: FamilyMarker, Severity: SeverityError, Title: "CompTimeArgs<T> argument must be a literal at the call site or const-bound to a literal"},
		{Code: CodeCompTimeArgsDepthExceeded, Family: FamilyMarker, Severity: SeverityError, Title: "CompTimeArgs<T> literal nesting exceeds depth cap (16) — refactor to flatten"},
		{Code: CodeCompTimeArgsForbiddenConstruct, Family: FamilyMarker, Severity: SeverityError, Title: "CompTimeArgs<T> literal contains a forbidden construct (spread, computed property, function call, ternary, template substitution)"},
		{Code: CodePureFunctionNotLiteral, Family: FamilyMarker, Severity: SeverityError, Title: "PureFunction<F> argument must be an inline arrow or function expression"},
	} {
		register(definition)
	}
}
