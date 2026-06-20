# Audit: overrides / value-first-define / id-integrity test suites

Reviewed groups (cwd `/home/user/ts-run-types`, REVIEW ONLY — no code changed):

| group | dir | files | cases |
|---|---|---|---|
| overrides | `packages/ts-runtypes/test/suites/overrides/` | 10 (7 fixtures + types + asserts + runner) | 7 (6 OverrideCase × 5 families + ObjectFns × 5 families) |
| value-first-define | `packages/ts-runtypes/test/suites/value-first-define/` | 2 (index + test) | 9 ValueFirstCase |
| id-integrity | `packages/ts-runtypes/test/suites/id-integrity/` | 3 test drivers (reuse validation/serialization suites) | 3 driver families, fan over the whole validation + serialization corpus |

**Verdict totals:** OK = 18, SUSPECT = 1, WRONG = 0.

> Scoping note on the marker-coverage rule. The CLAUDE.md "Marker test coverage rule" governs the `getRunTypeId` marker API. None of the three audited groups call `getRunTypeId`; the dedicated `getRunTypeId` both-shapes suites live elsewhere (`test/getRunType.test.ts`, `test/runtypes.test.ts`). The id-integrity group asserts id *equivalence* by a different, equally valid mechanism: cached-factory reference identity (`createValidate` returns the cached factory per structural id, so `.toBe` is a same-id assertion) and byte-identical encoder output. "Both shapes" here = value-first schema form vs type-first `<T>` form (validators) / value-first vs reflect (value-first-define), and those ARE both present. So the rule is satisfied in spirit; flags below are about coverage strength, not rule violations.

---

# overrides

Mechanism (verified): each fixture declares a UNIQUE branded type at module scope and registers `overrideX<BrandedT>(...)`; the case thunks call `createX<BrandedT>()`. The override genuinely REPLACES generated behavior — the asserted output is the hand-tuned override result (`'OVR'+...`, `expected:'override'`, custom predicate), never the default. Branding isolates each override so it never leaks to a plain primitive or another suite. Asserts come from `overrideAsserts.ts` (validate pass/fail, errors length-1 + `expected:'override'`, jsonEncoder === hand string, jsonDecoder round-trip, binary round-trip).

### Atomic.ts
| case key | intended type/behavior | what it asserts | faithful? | rep? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| ATOMIC_OVERRIDE | branded `number` override of all 5 families | validate (42 pass; 7/'42'/null fail), errors→override, json `OVR5`, json/binary round-trip | yes | yes | OK | — |

### Interface.ts
| case key | intended type/behavior | what it asserts | faithful? | rep? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| INTERFACE_OVERRIDE | branded object `{__brand,a,b}` override | validate (a===1), errors→override, json OVR, round-trips | yes | yes | OK | — |

### Arrays.ts
| case key | intended type/behavior | what it asserts | faithful? | rep? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| ARRAY_OVERRIDE | array of branded element override | validate (first el n===1), errors→override, json OVR, round-trips | yes | yes | OK | — |

### Tuples.ts
| case key | intended type/behavior | what it asserts | faithful? | rep? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| TUPLE_OVERRIDE | tuple `['tupleOverride',number,string]` override | validate (slot1===1), errors→override, json OVR, round-trips | yes | yes | OK | — |

### Unions.ts
| case key | intended type/behavior | what it asserts | faithful? | rep? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| UNION_OVERRIDE | discriminated union override | validate (tag==='unionOverrideA'), errors→override, json OVR, round-trips | yes | yes | OK | — |

### Circular.ts
| case key | intended type/behavior | what it asserts | faithful? | rep? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| CIRCULAR_OVERRIDE | self-referential type override (cfn replaces whole walker) | validate (label==='ok'), errors→override, json OVR, binary round-trip of nested `next` | yes | yes | OK | binary value nests `next` — good, exercises recursion through the override |

### ObjectFns.ts
| case key | intended type/behavior | what it asserts | faithful? | rep? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| huk | overrideHasUnknownKeys | `{x:1}`→true, `{x:2}`→false | yes | yes | OK | — |
| suk | overrideStripUnknownKeys | output `.stripped===true` | yes | yes | OK | — |
| uke | overrideUnknownKeyErrors | errors length-1, `expected:'override'` | yes | yes | OK | — |
| uku | overrideUnknownKeysToUndefined | `'u' in out` | yes | yes | OK | — |
| fmt | overrideFormatTransform | output `.fmt===true` | yes | yes | OK | — |

Overrides notes (non-blocking, no verdict change):
- The getValidationErrors override always appends one error regardless of input, and `errorsValue` is a passing-ish value; the assert only checks length-1 + tag. This proves the override fires, but does not prove the override SEES the real value/path (the helper's `value`/`path` args are not asserted). Acceptable for an override-fired check.
- `jsonValue`/`validateSamples` for the override don't need to satisfy the real shape (the override ignores it) — consistent with "override replaces generated behavior". Faithful.

---

# value-first-define

Mechanism (verified): models built with `RT.object({...})` + `TF.*`/`RT.*` leaf builders; `Static<typeof Model>` recovers the concrete type fed to `createValidate<...>()` (static) and `createValidate(value)` (reflect, value cast `as unknown as Static<...>` and discarded at runtime — only its declared type drives `T`). The cast targets the CONCRETE `Static<typeof Model>`, NOT `RunType<unknown>`, so the marker resolves the concrete type — no erasure. `valueFirst.test.ts` runs `assertValidate` (which fans static + reflect + deserialize-static + deserialize-reflect + schema) and `assertGetValidationErrorsContract` (valid→[], invalid→≥1). So BOTH call shapes are exercised behaviorally per case.

### index.ts (VALUE_FIRST_SUITE)
| case key | intended type | what it asserts | faithful? | rep? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| flat_mixed | string/number/date constraints across 9 fields | validate static+reflect+deser on 2 valid/6 invalid; errors contract | yes | yes | OK | each invalid trips a distinct field — strong |
| string_features | length/minLength/maxLength/allowedValues | 2 valid/4 invalid; one per constraint | yes | yes | OK | — |
| number_features | bounds/exclusive/integer/float/multipleOf | 2 valid/5 invalid; one per constraint | yes | yes | OK | — |
| date_bounds | relative `now` + absolute window | 2 valid/3 invalid (future, before-min, after-max) | yes | yes | OK | — |
| regex_patterns | inline pattern + registerFormatPattern via value channel | 2 valid/3 invalid (one per field) | yes | yes | OK | — |
| optional_fields | RT.optional may be absent; present validates | 3 valid (both absent / both present / one) / 3 invalid (required missing, optional violates) | yes | yes | OK | — |
| scalars | boolean + bigint bounds/multipleOf | 2 valid/4 invalid (type, number-not-bigint, >max, multipleOf) | yes | yes | OK | bigint-vs-number invalid is a good discriminator |
| temporal | Instant min + optional PlainDate max | 2 valid/4 invalid (type, required-missing, before-min, optional-wrong-type) | yes | yes | OK | — |
| nested | value-first models composed in a parent object | 2 valid/2 invalid (each child field) | yes | yes | OK | only 2 invalid (one per child); thinner but adequate |

value-first notes:
- The suite does NOT assert the value-first ↔ type-first SAME-id convergence itself; that convergence is asserted in id-integrity (`validateSchema` thunks) for the validation/serialization corpus. The value-first models here, however, are NOT wired into the id-integrity `validateSchema` path (id-integrity reuses the validation/serialization suites, not VALUE_FIRST_SUITE). So same-hash convergence of THESE specific models is asserted only indirectly via behavioral agreement (static == reflect == deserialize on the same samples). Representative, not a defect — see Findings.

---

# id-integrity

Mechanism (verified, `util/idIntegrityAsserts.ts`): drivers fan over the existing validation/serialization corpus and reuse each case's existing schema/type thunks — no new per-case data.

### validators.test.ts → `assertValidatorIdIntegrity` (over VALIDATION_SUITE + FORMAT_VALIDATION_SUITE)
| case key | intended | what it asserts | faithful? | rep? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| (per case) | value-first schema form `createValidate(RT.x())` vs type-first `createValidate<T>()` collapse to ONE cached factory | `validateSchema() === validate()` and `getValidationErrorsSchema() === getValidationErrors()` by reference (`.toBe`) | yes | yes | OK | `.toBe` on cached factory is a genuine same-structural-id assertion; options folded into variant key (documented). Skips factoryThrows / idDivergent / missing-form. |

### serializers.test.ts → `assertSerializerIdIntegrity` (over SERIALIZATION_SPEC + FORMAT_SERIALIZATION_SUITE)
| case key | intended | what it asserts | faithful? | rep? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| (per case) | value-first encoder output == type-first encoder output ⇒ same resolved runtype | json strings byte-equal (`.toBe`), binary buffers byte-equal (`.toEqual` on Uint8Array) over each case's samples | yes | mostly | SUSPECT | byte-identical OUTPUT is a weaker id signal than factory identity: two distinct-but-output-equivalent runtypes would pass. Encoder is a fresh closure so `.toBe` identity can't be used (documented), but the assert could additionally compare resolved structural ids if exposed. Skips `roundTripBestEffort` + `idDivergent`. Acceptable given the constraint; flagged as weaker-than-validator coverage, not wrong. |

### dataonly.test.ts → `assertDataOnlyEquivalence` (over VALIDATION_SUITE + FORMAT_VALIDATION_SUITE)
| case key | intended | what it asserts | faithful? | rep? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| (per case) | `createValidate<DataOnly<T>>()` validates same samples as `createValidate<T>()` | DataOnly validator: valid→true, invalid→false; DataOnly errors: valid→[], invalid→expected table (or ≥1 for format cases) | yes | yes | OK | Behavioral (not `.toBe`) by design — DataOnly keeps dropped members as `notSupported` nodes so ids legitimately differ; doc is accurate. Skips factoryThrows / dataOnlyDivergent. |

id-integrity notes:
- These drivers test EQUIVALENCE (forms that SHOULD collide). There is NO distinctness driver in this group (no "two distinct types must get distinct ids"). Distinctness is implicitly covered corpus-wide (every case's own samples discriminate it), and the `idDivergent` flag is the explicit "these do NOT converge" carve-out. A dedicated distinctness assertion is absent here — see Findings.
- Coverage of "both forms" is gated: a case missing `validateSchema`/`getValidationErrorsSchema` is silently skipped (`resolveThunk` → undefined). So a validation case that omits the schema form contributes NO id-integrity assertion. That's a soft-skip, not a wrong assertion, but means the headcount of cases actually exercising both forms < total corpus.

---

## Findings summary

No WRONG findings. No id case violates the both-shapes/equivalence rule: the `getRunTypeId` marker rule does not apply to these groups (they don't call `getRunTypeId`), and the value-first/type-first equivalence the id-integrity group DOES test is asserted with genuine same-id mechanisms (cached-factory `.toBe` for validators) where identity is available.

SUSPECT (1), grouped by root cause:

- **Weaker-than-ideal id signal (byte-equal output, not id identity):** `serializers.test.ts` / `assertSerializerIdIntegrity`. Encoders are fresh closures so `.toBe` can't be used; the assert falls back to byte-identical wire output. Two output-equivalent-but-structurally-distinct runtypes would slip through. Suggested strengthening (optional): also compare resolved structural ids if the runtime exposes them, or assert the underlying cached compiled-fn entry is shared.

Coverage observations (no verdict downgrade, worth noting):

- **No distinctness driver in id-integrity.** All three drivers assert equivalence (forms that should collide); none asserts "distinct types ⇒ distinct ids." Distinctness rests on each case's sample discrimination + the `idDivergent` carve-out. A small explicit distinctness pairing (e.g. `RT.literal(2)` id ≠ `RT.number()` id) would round out the group.
- **Soft-skip of missing schema forms.** Validation/serialization cases lacking a `validateSchema`/`schemaEncoder` thunk are silently skipped by `resolveThunk`, so the effective both-forms population is a subset of the corpus. Not wrong, but the "for EVERY case" framing in the file header overstates actual coverage for option-bearing / unsupported-schema cases.
- **VALUE_FIRST_SUITE models are not in the id-integrity schema path.** id-integrity reuses the validation/serialization suites, not VALUE_FIRST_SUITE, so same-hash convergence of those specific 9 models is asserted only indirectly (static == reflect == deserialize behavioral agreement), never as a `.toBe` cached-factory identity. Adding `validateSchema` thunks for the 9 value-first models would close that gap.
- **Override getValidationErrors args not asserted.** The override always appends one fixed error; the value/path it receives are not checked. Proves the override fires, not that it sees the real call-site value.

Everything else: faithful + representative. Branded-type isolation in overrides is correct and prevents leakage; value-first reflect casts target the concrete `Static<typeof Model>` (no `RunType<unknown>` erasure); DataOnly equivalence is behavioral by correct design.

File written: `docs/todos/audit-reports/suite-overrides-valuefirst-id.md`.
