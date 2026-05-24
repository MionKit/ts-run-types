package diag

// RunType RT-compiler codes. Per-family prefixes so users reading their
// build log can tell which RT family produced a diagnostic without
// reading the message: SJ010 is unambiguously "stringifyJson dropped a
// member"; IT010 is "isType dropped a member"; even if both messages are
// otherwise identical.
//
// Numeric suffix convention within each family:
//   001-009 — root-position errors (the rendered factory throws on call)
//   010+    — child-position warnings (silent skips made visible)

// isType family.
const (
	CodeISNonSerializableRoot = "IT001"
	CodeISSymbolRoot          = "IT002"
	CodeISFunctionPropDropped = "IT010"
	CodeISMethodDropped       = "IT011"
	CodeISStaticDropped       = "IT012"
	CodeISSymbolKeyedDropped  = "IT013"
	CodeISRootAnyUnknown      = "IT021"
)

// typeErrors family.
const (
	CodeTENonSerializableRoot = "TE001"
	CodeTESymbolRoot          = "TE002"
	CodeTEFunctionPropDropped = "TE010"
	CodeTEMethodDropped       = "TE011"
	CodeTEStaticDropped       = "TE012"
	CodeTESymbolKeyedDropped  = "TE013"
	CodeTERootAnyUnknown      = "TE020"
)

// prepareForJson family.
const (
	CodePJNeverRoot           = "PJ001"
	CodePJNonSerializableRoot = "PJ002"
	CodePJFunctionRoot        = "PJ003"
	CodePJArrayElement        = "PJ004"
	CodePJSymbolRoot          = "PJ005"
	CodePJFunctionPropDropped = "PJ010"
	CodePJMethodDropped       = "PJ011"
	CodePJStaticDropped       = "PJ012"
	CodePJSymbolKeyedDropped  = "PJ013"
)

// prepareForJsonSafe family.
const (
	CodePJSNeverRoot           = "PJS001"
	CodePJSNonSerializableRoot = "PJS002"
	CodePJSFunctionRoot        = "PJS003"
	CodePJSArrayElement        = "PJS004"
	CodePJSSymbolRoot          = "PJS005"
	CodePJSFunctionPropDropped = "PJS010"
	CodePJSMethodDropped       = "PJS011"
	CodePJSStaticDropped       = "PJS012"
	CodePJSSymbolKeyedDropped  = "PJS013"
)

// prepareForJsonSafePreserve family.
const (
	CodePJPNeverRoot           = "PJP001"
	CodePJPNonSerializableRoot = "PJP002"
	CodePJPFunctionRoot        = "PJP003"
	CodePJPArrayElement        = "PJP004"
	CodePJPSymbolRoot          = "PJP005"
	CodePJPFunctionPropDropped = "PJP010"
	CodePJPMethodDropped       = "PJP011"
	CodePJPStaticDropped       = "PJP012"
	CodePJPSymbolKeyedDropped  = "PJP013"
)

// restoreFromJson family.
const (
	CodeRJNeverRoot           = "RJ001"
	CodeRJNonSerializableRoot = "RJ002"
	CodeRJFunctionRoot        = "RJ003"
	CodeRJArrayElement        = "RJ004"
	CodeRJSymbolRoot          = "RJ005"
	CodeRJFunctionPropDropped = "RJ010"
	CodeRJMethodDropped       = "RJ011"
	CodeRJStaticDropped       = "RJ012"
	CodeRJSymbolKeyedDropped  = "RJ013"
)

// stringifyJson family.
const (
	CodeSJNeverRoot           = "SJ001"
	CodeSJNonSerializableRoot = "SJ002"
	CodeSJFunctionRoot        = "SJ003"
	CodeSJArrayElement        = "SJ004"
	CodeSJSymbolRoot          = "SJ005"
	CodeSJFunctionPropDropped = "SJ010"
	CodeSJMethodDropped       = "SJ011"
	CodeSJStaticDropped       = "SJ012"
	CodeSJSymbolKeyedDropped  = "SJ013"
)

// toBinary family.
const (
	CodeTBNeverRoot           = "TB001"
	CodeTBNonSerializableRoot = "TB002"
	CodeTBFunctionRoot        = "TB003"
	CodeTBNonSerializableElem = "TB005"
	CodeTBArrayElement        = "TB004"
	CodeTBSymbolRoot          = "TB006"
	CodeTBFunctionPropDropped = "TB010"
	CodeTBMethodDropped       = "TB011"
	CodeTBStaticDropped       = "TB012"
	CodeTBSymbolKeyedDropped  = "TB013"
)

// fromBinary family.
const (
	CodeFBNeverRoot           = "FB001"
	CodeFBNonSerializableRoot = "FB002"
	CodeFBFunctionRoot        = "FB003"
	CodeFBNonSerializableElem = "FB005"
	CodeFBArrayElement        = "FB004"
	CodeFBSymbolRoot          = "FB006"
	CodeFBFunctionPropDropped = "FB010"
	CodeFBMethodDropped       = "FB011"
	CodeFBStaticDropped       = "FB012"
	CodeFBSymbolKeyedDropped  = "FB013"
)

// Format family — TypeFormat (pattern / mockSample) build-time checks.
const (
	// CodeFMTSampleMismatch — a declared mockSample does not match the
	// format's own pattern. Error severity: the sample is supposed to be
	// a canonical valid value, so a mismatch is always a type-definition
	// bug. Args: [sample, pattern-source].
	CodeFMTSampleMismatch = "FMT001"

	// CodeFMTInvalidParams — a format's params violate an invariant
	// (mutually-exclusive options, out-of-range bound, missing required
	// mockSamples, unknown enum value, …). Error severity: the type
	// definition is malformed and the emitted validator would be
	// unreachable or wrong. Args: [violation message]. Replaces mion's
	// build-time `validateParams` throw (run JS-side at JIT compile; we
	// run it AOT in Go and surface it as a diagnostic).
	CodeFMTInvalidParams = "FMT002"
)

// Unknown-keys family — no root throws today; only child drops.
const (
	CodeHUKFunctionPropDropped = "HUK010"
	CodeSUKFunctionPropDropped = "SUK010"
	CodeUKEFunctionPropDropped = "UKE010"
	CodeUKUFunctionPropDropped = "UKU010"
	CodeUKWFunctionPropDropped = "UKW010"
)

func init() {
	// Root-position errors — render a throwing factory.
	for _, code := range []string{
		CodeISNonSerializableRoot, CodeISSymbolRoot,
		CodeTENonSerializableRoot, CodeTESymbolRoot,
		CodePJNeverRoot, CodePJNonSerializableRoot, CodePJFunctionRoot, CodePJArrayElement, CodePJSymbolRoot,
		CodePJSNeverRoot, CodePJSNonSerializableRoot, CodePJSFunctionRoot, CodePJSArrayElement, CodePJSSymbolRoot,
		CodePJPNeverRoot, CodePJPNonSerializableRoot, CodePJPFunctionRoot, CodePJPArrayElement, CodePJPSymbolRoot,
		CodeRJNeverRoot, CodeRJNonSerializableRoot, CodeRJFunctionRoot, CodeRJArrayElement, CodeRJSymbolRoot,
		CodeSJNeverRoot, CodeSJNonSerializableRoot, CodeSJFunctionRoot, CodeSJArrayElement, CodeSJSymbolRoot,
		CodeTBNeverRoot, CodeTBNonSerializableRoot, CodeTBFunctionRoot, CodeTBArrayElement, CodeTBNonSerializableElem, CodeTBSymbolRoot,
		CodeFBNeverRoot, CodeFBNonSerializableRoot, CodeFBFunctionRoot, CodeFBArrayElement, CodeFBNonSerializableElem, CodeFBSymbolRoot,
	} {
		register(Definition{Code: code, Family: FamilyRunType, Severity: SeverityError, Title: "RunType root-position error"})
	}

	// Child-position warnings — the factory still emits, just drops the member.
	for _, code := range []string{
		CodeISFunctionPropDropped, CodeISMethodDropped, CodeISStaticDropped, CodeISSymbolKeyedDropped,
		CodeTEFunctionPropDropped, CodeTEMethodDropped, CodeTEStaticDropped, CodeTESymbolKeyedDropped,
		CodePJFunctionPropDropped, CodePJMethodDropped, CodePJStaticDropped, CodePJSymbolKeyedDropped,
		CodePJSFunctionPropDropped, CodePJSMethodDropped, CodePJSStaticDropped, CodePJSSymbolKeyedDropped,
		CodePJPFunctionPropDropped, CodePJPMethodDropped, CodePJPStaticDropped, CodePJPSymbolKeyedDropped,
		CodeRJFunctionPropDropped, CodeRJMethodDropped, CodeRJStaticDropped, CodeRJSymbolKeyedDropped,
		CodeSJFunctionPropDropped, CodeSJMethodDropped, CodeSJStaticDropped, CodeSJSymbolKeyedDropped,
		CodeTBFunctionPropDropped, CodeTBMethodDropped, CodeTBStaticDropped, CodeTBSymbolKeyedDropped,
		CodeFBFunctionPropDropped, CodeFBMethodDropped, CodeFBStaticDropped, CodeFBSymbolKeyedDropped,
		CodeHUKFunctionPropDropped, CodeSUKFunctionPropDropped, CodeUKEFunctionPropDropped, CodeUKUFunctionPropDropped, CodeUKWFunctionPropDropped,
	} {
		register(Definition{Code: code, Family: FamilyRunType, Severity: SeverityWarning, Title: "RunType child-position member dropped"})
	}

	// Root any/unknown — noop validators that accept every value. Warning
	// severity (not Info): the user opted into a permissive type, often
	// without realising the runtime is no longer enforcing the schema.
	register(Definition{Code: CodeTERootAnyUnknown, Family: FamilyRunType, Severity: SeverityWarning, Title: "typeErrors root any/unknown — identity fallback"})
	register(Definition{Code: CodeISRootAnyUnknown, Family: FamilyRunType, Severity: SeverityWarning, Title: "isType root any/unknown — identity fallback"})

	// Format-family — a mockSample that contradicts its own pattern is a
	// type-definition bug; surface it as an error.
	register(Definition{Code: CodeFMTSampleMismatch, Family: FamilyRunType, Severity: SeverityError, Title: "format mockSample does not match pattern"})
	register(Definition{Code: CodeFMTInvalidParams, Family: FamilyRunType, Severity: SeverityError, Title: "invalid type-format params"})
}
