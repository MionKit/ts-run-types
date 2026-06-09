package diag

// RunType RT-compiler codes. Per-family prefixes so users reading their
// build log can tell which RT family produced a diagnostic without
// reading the message: SJ010 is unambiguously "stringifyJson dropped a
// member"; VL010 is "validate dropped a member"; even if both messages are
// otherwise identical.
//
// Numeric suffix convention within each family:
//   001-009 — root-position errors (the rendered factory throws on call)
//   010+    — child-position warnings (silent skips made visible)

// validate family.
const (
	CodeVLNonSerializableRoot = "VL001"
	CodeVLSymbolRoot          = "VL002"
	CodeVLFunctionPropDropped = "VL010"
	CodeVLMethodDropped       = "VL011"
	CodeVLStaticDropped       = "VL012"
	CodeVLSymbolKeyedDropped  = "VL013"
	CodeVLRootAnyUnknown      = "VL021"
)

// validationErrors family.
const (
	CodeVENonSerializableRoot = "VE001"
	CodeVESymbolRoot          = "VE002"
	CodeVEFunctionPropDropped = "VE010"
	CodeVEMethodDropped       = "VE011"
	CodeVEStaticDropped       = "VE012"
	CodeVESymbolKeyedDropped  = "VE013"
	CodeVERootAnyUnknown      = "VE020"
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

// Class-serializer family (CLS) — advisory, Warning severity. Emitted once
// per named plain user class (KindClass + SubKindNone) reached by a
// serialization family (pj / pjs / rj / sj / tb / fb) when NO custom
// serializer is registered for the class name: the class is serialized
// structurally (declared props in, prototype-less plain object out). The
// user can register a custom (de)serializer via registerClassSerializer to
// opt into round-tripping a real instance. NOT emitted for validate /
// getValidationErrors, builtins (Date/Map/Set/RegExp/nonSerializable), or
// anonymous classes. Args: [className].
const (
	CodeCLSStructuralFallback = "CLS001"
)

func init() {
	// Root-position errors — render a throwing factory.
	for _, code := range []string{
		CodeVLNonSerializableRoot, CodeVLSymbolRoot,
		CodeVENonSerializableRoot, CodeVESymbolRoot,
		CodePJNeverRoot, CodePJNonSerializableRoot, CodePJFunctionRoot, CodePJArrayElement, CodePJSymbolRoot,
		CodePJSNeverRoot, CodePJSNonSerializableRoot, CodePJSFunctionRoot, CodePJSArrayElement, CodePJSSymbolRoot,
		CodeRJNeverRoot, CodeRJNonSerializableRoot, CodeRJFunctionRoot, CodeRJArrayElement, CodeRJSymbolRoot,
		CodeSJNeverRoot, CodeSJNonSerializableRoot, CodeSJFunctionRoot, CodeSJArrayElement, CodeSJSymbolRoot,
		CodeTBNeverRoot, CodeTBNonSerializableRoot, CodeTBFunctionRoot, CodeTBArrayElement, CodeTBNonSerializableElem, CodeTBSymbolRoot,
		CodeFBNeverRoot, CodeFBNonSerializableRoot, CodeFBFunctionRoot, CodeFBArrayElement, CodeFBNonSerializableElem, CodeFBSymbolRoot,
	} {
		register(Definition{Code: code, Family: FamilyRunType, Severity: SeverityError, Title: "RunType root-position error"})
	}

	// Child-position warnings — the factory still emits, just drops the member.
	for _, code := range []string{
		CodeVLFunctionPropDropped, CodeVLMethodDropped, CodeVLStaticDropped, CodeVLSymbolKeyedDropped,
		CodeVEFunctionPropDropped, CodeVEMethodDropped, CodeVEStaticDropped, CodeVESymbolKeyedDropped,
		CodePJFunctionPropDropped, CodePJMethodDropped, CodePJStaticDropped, CodePJSymbolKeyedDropped,
		CodePJSFunctionPropDropped, CodePJSMethodDropped, CodePJSStaticDropped, CodePJSSymbolKeyedDropped,
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
	register(Definition{Code: CodeVERootAnyUnknown, Family: FamilyRunType, Severity: SeverityWarning, Title: "validationErrors root any/unknown — identity fallback"})
	register(Definition{Code: CodeVLRootAnyUnknown, Family: FamilyRunType, Severity: SeverityWarning, Title: "validate root any/unknown — identity fallback"})

	// Format-family — a mockSample that contradicts its own pattern is a
	// type-definition bug; surface it as an error.
	register(Definition{Code: CodeFMTSampleMismatch, Family: FamilyRunType, Severity: SeverityError, Title: "format mockSample does not match pattern"})
	register(Definition{Code: CodeFMTInvalidParams, Family: FamilyRunType, Severity: SeverityError, Title: "invalid type-format params"})

	// Class-serializer family — a named plain user class is serialized
	// structurally because no custom serializer is registered. Advisory,
	// not a failure: the structural fallback round-trips data fine; the
	// warning just tells the user they CAN register a serializer for full
	// instance reconstruction.
	register(Definition{Code: CodeCLSStructuralFallback, Family: FamilyRunType, Severity: SeverityWarning, Title: "user class serialized structurally — register a serializer for custom (de)serialization"})
}
