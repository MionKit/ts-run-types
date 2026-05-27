package diag

// Pure-function extractor codes (PFE9xxx). Private namespace avoids
// collision with TypeScript's own diagnostic ranges (TS2xxx / TS6xxx).
const (
	CodeNamespaceNotLiteral  = "PFE9001"
	CodeFunctionIDNotLiteral = "PFE9002"
	CodeFactoryNotInline     = "PFE9003"
	CodeBodyHashCollision    = "PFE9004"
	CodeDestructuredParam    = "PFE9005"

	CodePurityThis          = "PFE9006"
	CodePurityAwait         = "PFE9007"
	CodePurityYield         = "PFE9008"
	CodePurityDynamicImport = "PFE9009"
	CodePurityForbidden     = "PFE9010"
	CodePurityClosure       = "PFE9011"

	CodeMissingPureFnDep    = "PFE9012"
	CodePurityDepNotLiteral = "PFE9013"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeNamespaceNotLiteral, Family: FamilyPureFn, Severity: SeverityError, Title: "Pure-fn namespace not a literal"},
		{Code: CodeFunctionIDNotLiteral, Family: FamilyPureFn, Severity: SeverityError, Title: "Pure-fn id not a literal"},
		{Code: CodeFactoryNotInline, Family: FamilyPureFn, Severity: SeverityError, Title: "Pure-fn factory not inline"},
		{Code: CodeBodyHashCollision, Family: FamilyPureFn, Severity: SeverityError, Title: "Duplicate registration with mismatched bodyHash"},
		{Code: CodeDestructuredParam, Family: FamilyPureFn, Severity: SeverityError, Title: "Pure-fn factory uses destructured parameter"},

		{Code: CodePurityThis, Family: FamilyPureFn, Severity: SeverityError, Title: "Pure-fn body references this"},
		{Code: CodePurityAwait, Family: FamilyPureFn, Severity: SeverityError, Title: "Pure-fn body contains await"},
		{Code: CodePurityYield, Family: FamilyPureFn, Severity: SeverityError, Title: "Pure-fn body contains yield"},
		{Code: CodePurityDynamicImport, Family: FamilyPureFn, Severity: SeverityError, Title: "Pure-fn body uses dynamic import"},
		{Code: CodePurityForbidden, Family: FamilyPureFn, Severity: SeverityError, Title: "Pure-fn body uses a forbidden global"},
		{Code: CodePurityClosure, Family: FamilyPureFn, Severity: SeverityError, Title: "Pure-fn body closes over outer binding"},

		{Code: CodeMissingPureFnDep, Family: FamilyPureFn, Severity: SeverityError, Title: "JIT depends on missing pure-fn"},
		{Code: CodePurityDepNotLiteral, Family: FamilyPureFn, Severity: SeverityError, Title: "Pure-fn dep arg not a literal"},
	} {
		register(definition)
	}
}
