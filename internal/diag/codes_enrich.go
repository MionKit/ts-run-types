package diag

// Enrichment-health codes (FamilyEnrich). Three groups, all opt-in (the
// resolver emits them only for Request.CheckEnrich; the enrich CLI renders
// them for `check` / `gen --check`):
//
//   - ENRxxx — tag hygiene: the dirty-state tags the mirror emitters write
//     (`@todo` scaffold flags, `@rtOrphan`/`@rtOrphanChild` carcasses).
//     Detection lives in internal/enrich/mirror/hygiene.go, next to the
//     emitters, so the two can never drift.
//   - FTxxx / MDxxx — FriendlyType / MockData content validity, produced by
//     the paired checkers in internal/enrich/validate.go. The codes predate
//     this catalog (they are the `check` CLI's Finding codes); registering
//     them here puts them on the resolver wire with the same identity.
//   - GExxx — mirror breadcrumb drift (internal/enrich/mirror/drift.go).
//     GE001 (location drift) needs the project's enrich-dir config and stays
//     CLI-only in `gen --check`.
const (
	CodeEnrichTodo        = "ENR001"
	CodeEnrichOrphan      = "ENR002"
	CodeEnrichOrphanChild = "ENR003"

	CodeEnrichUnknownFriendlyField = "FT002"
	CodeEnrichUnknownConstraint    = "FT003"
	CodeEnrichBadPlaceholder       = "FT005"
	CodeEnrichPluralNoOther        = "FT006"
	CodeEnrichPluralBadArm         = "FT007"
	CodeEnrichPluralNoCount        = "FT008"
	CodeEnrichDefaultNotExclusive  = "FT009"
	CodeEnrichReservedFriendlyProp = "FT011"
	CodeEnrichUnknownMockField     = "MD001"
	CodeEnrichReservedMockProp     = "MD011"

	CodeEnrichMirrorUnreadable = "GE000"
	CodeEnrichMirrorDrift      = "GE001"
	CodeEnrichSourceMissing    = "GE002"
	CodeEnrichTypeMissing      = "GE003"
)

func init() {
	for _, definition := range []Definition{
		{Code: CodeEnrichTodo, Family: FamilyEnrich, Severity: SeverityError, Title: "Unfilled @todo scaffold placeholder in a generated enrichment file"},
		{Code: CodeEnrichOrphan, Family: FamilyEnrich, Severity: SeverityError, Title: "Stale @rtOrphan const carcass — prune it or restore the type"},
		{Code: CodeEnrichOrphanChild, Family: FamilyEnrich, Severity: SeverityError, Title: "Stale @rtOrphanChild field carcass — prune it or restore the field"},
		{Code: CodeEnrichUnknownFriendlyField, Family: FamilyEnrich, Severity: SeverityError, Title: "FriendlyType map names a field the type does not declare"},
		{Code: CodeEnrichUnknownConstraint, Family: FamilyEnrich, Severity: SeverityWarning, Title: "FriendlyType rt$errors key is not a declared constraint of the field"},
		{Code: CodeEnrichBadPlaceholder, Family: FamilyEnrich, Severity: SeverityWarning, Title: "FriendlyType error template uses an unknown $[…] placeholder"},
		{Code: CodeEnrichPluralNoOther, Family: FamilyEnrich, Severity: SeverityError, Title: "Plural error template is missing the mandatory 'other' arm"},
		{Code: CodeEnrichPluralBadArm, Family: FamilyEnrich, Severity: SeverityWarning, Title: "Plural error template arm is not a CLDR category"},
		{Code: CodeEnrichPluralNoCount, Family: FamilyEnrich, Severity: SeverityWarning, Title: "Plural error template on a constraint that carries no count"},
		{Code: CodeEnrichDefaultNotExclusive, Family: FamilyEnrich, Severity: SeverityError, Title: "rt$default is mutually exclusive with per-constraint error messages"},
		{Code: CodeEnrichReservedFriendlyProp, Family: FamilyEnrich, Severity: SeverityError, Title: "Type property collides with the reserved rt$ enrichment prefix (FriendlyType)"},
		{Code: CodeEnrichUnknownMockField, Family: FamilyEnrich, Severity: SeverityError, Title: "MockData map names a field the type does not declare"},
		{Code: CodeEnrichReservedMockProp, Family: FamilyEnrich, Severity: SeverityError, Title: "Type property collides with the reserved rt$ enrichment prefix (MockData)"},
		{Code: CodeEnrichMirrorUnreadable, Family: FamilyEnrich, Severity: SeverityError, Title: "Enrichment mirror file cannot be read"},
		{Code: CodeEnrichMirrorDrift, Family: FamilyEnrich, Severity: SeverityWarning, Title: "Enrichment mirror location no longer matches its source's mirror path"},
		{Code: CodeEnrichSourceMissing, Family: FamilyEnrich, Severity: SeverityError, Title: "Enrichment mirror breadcrumb points at a source file that no longer exists"},
		{Code: CodeEnrichTypeMissing, Family: FamilyEnrich, Severity: SeverityError, Title: "Enrichment mirror source no longer declares an imported type"},
	} {
		register(definition)
	}
}
