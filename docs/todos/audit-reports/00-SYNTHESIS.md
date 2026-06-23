# Audit synthesis — master fix-list

> Synthesis of the case-by-case audit mandated by
> [`docs/todos/audit-case-implementations.md`](../audit-case-implementations.md).
> **Review only — no production code was changed.** This file collates the ten
> per-competitor / per-suite classification tables in this directory into a single
> fix-list, grouped by (a) competitor / suite and (b) root-cause pattern. It seeds
> the follow-up FIX task; nothing here has been actioned.

## How to read this

- Ten tables back this summary, one per competitor and per suite group:
  `competitor-{zod,ajv,typebox,typia,ts-runtypes}.md`,
  `suite-{validation,serialization,formats,overrides-valuefirst-id,enrich-mocking}.md`.
- Verdicts: **OK** (faithful + idiomatic, or a `NOT_SUPPORTED` whose claim holds) ·
  **SUSPECT** (works but questionable — weak samples, a justified workaround, an
  opt-out expressible only non-idiomatically) · **WRONG** (bypass, incorrect schema,
  wrong/missing metric builder, vacuous assertion, or a `NOT_SUPPORTED` the library
  CAN express).
- The alignment audit (`container-benchmarks/results/alignment-misalignments.json`)
  reports **0 undeclared divergences** for every competitor — so it confirms
  faithfulness but, as predicted, catches **none** of the WRONG findings below: every
  bypass / stale regex / vacuous test is tuned to pass its samples. This manual axis
  is what surfaces them.

## Scoreboard

| target | total cases | OK | SUSPECT | WRONG | mis-marked `NOT_SUPPORTED` |
| --- | --- | --- | --- | --- | --- |
| competitor · zod 4.4.3 | 266 | 215 | ~40 rows (12 patterns) | **39** | 0 (32 Temporal wording only) |
| competitor · ajv 8.20.0 | 266 | 248 | 7 | **4** | 3 firm (+1 wrong-reason) |
| competitor · typebox 0.34.49 | 266 | 257 | 5 | **4** | 2 firm + 2 likely |
| competitor · typia 13.0-dev | 266 | 266 | 0 | 0 | 0 |
| competitor · ts-runtypes 0.1.0 | 266 | 263* | 0 | 0 | 0 |
| suite · validation | 168 | 162 | 6 | 0 | — |
| suite · serialization | 152 | 114 | 36 | **2** | — |
| suite · formats | 146 | 138 | 8 | 0 | — |
| suite · overrides+value-first+id | 19 | 18 | 1 | 0 | — |
| suite · enrich+mocking | ~104 | ~100 | 4 | 0 | — |

\* ts-runtypes `cases.ts` has 263 implemented + 3 genuine `NOT_SUPPORTED`
(`ATOMIC.symbol`, `ATOMIC.literal_symbol_noLiterals`, `ARRAY.symbol_array`), all
correct `factoryThrows` positions. The spec's "5/266" was an overcount.

**Headline:** the trap the audit was built to catch is real and concentrated in
**zod** (39 WRONG, almost all `z.custom` bypasses + stale zod-3 format regexes). The
reference library (ts-runtypes) and the strongest type-driven competitor (typia) are
clean. The ts-runtypes **test suites** are correct on the contract axis (drop-vs-throw,
data-only projection, expected error/paths) but carry one real **WRONG** class — *tests
that pass vacuously* — most importantly a single comparison-helper defect that silently
neuters all 9 Map/Set serialization cases.

---

## A. Master fix-list grouped by ROOT CAUSE

### A1. `z.custom` / hand-rolled JS bypass — the trigger class (zod, 11 WRONG)

A real zod schema exists; the case hand-rolls a raw predicate that bypasses zod's
engine and is tuned to pass the samples. The benchmark number is therefore a
hand-written JS function, not zod.

- **`OBJECT.interface_all_optional`** — THE trigger bug. → `z.object({a: z.string().optional(), b: z.number().finite().optional()})` (zod's object already rejects arrays/Date/Map/Set).
- **`ATOMIC.object`** — `z.custom(typeof===object && !==null)` → `z.looseObject({})` / `z.object`.
- **`UTILITY.partial`** — hand guard → `z.object({…}).partial()`.
- **`UTILITY.deep_partial_recursive_mapped`** — hand deep guard → nested optional `z.object`.
- **`TUPLE.tuple_with_optional`** — hand array guard → `z.tuple([…, x.optional()])` (sibling `tuple_multiple_trailing_optionals` proves it works).
- **`TUPLE.tuple_circular`** — `z.custom` recursive guard → `z.lazy` tuple.
- **`UNION.circular_union`** — `z.custom` recursive check → `z.lazy` union (sibling `CIRCULAR.array_of_union_with_self_ref` proves it).
- **`TEMPLATE_LITERAL.template_literal_index_key`** — hand key-pattern loop → `z.record(z.templateLiteral([…]), value)`.
- *(plus `CIRCULAR.object_deeply_nested` — partial bypass at a recursion seam, listed SUSPECT.)*

Self-refuting in several places: a sibling case implements the same shape idiomatically.

### A2. Stale library-version API — feature exists in the pinned version (zod ~10, typebox 2–4, ajv 3)

The implementer reasoned against an older API (zod 3, or a stale belief about
TypeBox/ajv limits). Re-derive against the pinned version.

- **zod 4 first-class builders** (hand-rolled regex/refine where v4 ships a builder):
  `STRING_FORMAT.uuidv4`→`z.uuidv4()`, `uuidv7`→`z.uuidv7()`, `email`→`z.email()`,
  `date_iso`→`z.iso.date()`, `dateTime_default`→`z.iso.datetime()`, `time_iso`→`z.iso.time()`.
- **typebox `Type.BigInt` with bigint-literal bounds** (opt-out premise "BigInt(number) rounds in float64" is false — bounds are `…n` literals, same path as the implemented `bigint_max`):
  `BIGINT_FORMAT.bigint_int64`, `BIGINT_FORMAT.bigint_uint64`.
- **typebox regex it already uses elsewhere:** `STRING_FORMAT.string_disallowedValues`
  (negative-lookahead `^(?!(admin|root)$).*$` — it already uses lookahead for `disallowedChars`/`slug`);
  `TEMPLATE_LITERAL.template_literal_index_key` (`Type.Record(Type.TemplateLiteral(...), …)` likely emits `additionalProperties:false`). Both need a runtime confirm.
- **ajv plain JSON Schema** (mapped-type opt-outs that resolve to ordinary object shapes):
  `TYPE_MAPPINGS.key_prefix_rename`, `TYPE_MAPPINGS.key_filter_via_never`,
  `TEMPLATE_LITERAL.template_literal_index_key` (`patternProperties` + `additionalProperties:false`).

These are not just stylistic: a mis-marked `NOT_SUPPORTED` drops the row from the
library's aggregate (renders `n-a`), understating the library as much as a wrong schema
overstates it. See A3.

### A3. Mis-marked `NOT_SUPPORTED` (the axis-3 finding)

Every opt-out was re-derived against the pinned version. Verdict per library:

- **ajv** — 3 firm mis-marks (the A2 mapped-type / template-key rows). 1 with a *wrong
  reason but defensible opt-out* (`TYPE_MAPPINGS.key_conditional_rename` — real blocker
  is a `createdAt: Date` prop, not "no rename analogue"; fix the comment). The other 114
  (bigint, symbol, Date/Map/Set/RegExp/Promise/Temporal instances, cyclic values,
  case-insensitive regex/enum) are genuinely JSON-Schema-inexpressible — **legit**.
- **typebox** — 2 firm (`bigint_int64`/`bigint_uint64`) + 2 likely
  (`string_disallowedValues`, `template_literal_index_key`, pending a lookahead/Record
  runtime check). Re-deriving recovers up to 4 rows. Rest legit.
- **zod** — 0 flat-out wrong. The 3 `CIRCULAR_REFS.*` (no cyclic-value detection) and the
  32 Temporal `DATETIME.*` (no Temporal type in zod + no polyfill in the container) are
  correct claims; only the Temporal *justification wording* conflates "container lacks
  Temporal" with "zod can't express it" — both are true, so the marker stands.
- **typia** — 0 mis-marked. All 71 re-derived and hold (bigint literals, symbol, structural
  runtime-semantics divergences, float32 `Type<'float'>`, 64-bit bigint bounds, Temporal,
  thenable/cyclic transform limits).
- **ts-runtypes** — 0 mis-marked. 3 genuine `factoryThrows` symbol positions.

### A4. Vacuous / non-exercising tests in the ts-runtypes suites (serialization — 2 WRONG + the dominant SUSPECT cluster)

Tests that pass regardless of the behaviour they claim to check. This is the suite-side
analogue of the `z.custom` trap and the most actionable suite fix.

- **`util/equalsHelpers.ts` `normalizeForComparison` has no Map/Set branch — 9 cases (all of `serialization/Iterables`).** The decoder restores real `Map`/`Set` instances (zero
  enumerable own keys), so both sides collapse to `{}` and `toEqual` passes for ANY
  contents. Entry data, key encoding (string/number/bigint/object), Set dedup, insertion
  order, and per-element transforms are all unverified. **One helper fix** (add a Map/Set
  branch normalizing to a sorted tagged `[key,value]` / element array, recurse) un-blinds
  all nine: `set_string`, `set_small_object`, `objects_with_nested_sets`,
  `map_string_number`, `map_string_small_object`, `map_small_object_number`,
  `objects_with_nested_maps`, `map_with_bigint_keys`, `map_with_date_values`.
- **`Unions.union_mixed_with_discriminator` (WRONG)** — only 2 of 6 union members ever
  sampled; the bigint-`{c}` transform arm + number[]/boolean[]/`{b}` can never fail.
- **`Records.multiple_index_props` (WRONG)** — declares `[key: number]` but no numeric-key
  sample exists, so the number-key→string-on-wire claim (the case's headline) is never run.

### A5. Declared-but-unsampled members / arities (serialization 5, validation 2 — SUSPECT)

A type declares a member / arm / arity the samples never reach. Faithful for what runs,
but the untested path is exactly where drift hides.

- serialization: `Unions.union_object_with_discriminator` (skips `{b}`),
  `Unions.union_index_property_with_discriminator` (3/5 arms),
  `LargeObjects.object_union_5` (1/5), `LargeObjects.mixed_union_atomic_and_large_objects`
  (atomic short-circuit never hit), `LargeObjects.large_class_union` (1/3 class arms).
- validation: `Tuple.tuple_named_labels` (no too-long-arity invalid sample — the canonical
  tuple weak spot; add `['Alice',30,'extra']`→`[] tuple`), `Array.date_array` (no bare
  non-array reject; add `'2024'`→`[] array`).
- Fix: one sample per unsampled arm/arity (+ matching `deserializedValues` for class unions).

### A6. Samples too weak / missing boundary + byte-width locks (formats 8, serialization 12, validation 2, ajv/zod a few — SUSPECT)

Correct assertions, but the sample set can't distinguish a correct impl from a sloppy
one — the core thing this audit hunts. None flips a verdict alone; together they're the
long tail.

- **format-validation under-sampled:** `uuidv7` (only invalid is a v4 UUID), `date_MD` (no
  day-overflow), `emailPunycode` (no punycode-specific reject).
- **format-serialization single-value, no boundary:** `uuidv4`, `object_with_formats`,
  `email_array` (no empty-array length-prefix edge), `DateTime.date` (no ms/range edge).
- **serialization missing byte-width locks:** `Atomic.number` (no `getBinaryByteSizes` to
  pin int8/16/32/float64 width), `Atomic.date` / `DateTime.date` (no 8-byte lock),
  `bigint`/`boolean` single-value; `Records.index_property_*` single-entry no-empty;
  `Tuples.tuple_with_optional` (optional bigint slot `undefined` in every sample → its
  transform never runs); several Temporal cases single whole-second / no leap-day.
- **validation copy-paste-thin:** `Object.object_via_array_access` (verbatim clone of the
  property-access sibling — vary one sample so an array-access-path regression can surface).
- **zod faithfulness gap that only passes on weak samples:** all 6 `REALWORLD.*` use bare
  `z.number()` not `.finite()`; passes only because no Infinity sample probes it.

### A7. Emitter-token assertions that can't be confirmed by reading (validation 4 — SUSPECT)

Plausible tokens that would flip to WRONG if the Go emitter disagrees — confirm against
the emitter (the suite presumably passes CI, so likely correct-as-authored, but they are
the least self-evident rows): `Atomic.object` (`expected:'objectLiteral'`),
`TemplateLiteral.template_literal_index_key` (`expected:'never'`),
`Tuple.full_mion_tuple` (`[5] bigint` not root `tuple`),
`Tuple.tuple_multiple_trailing_optionals` (`bigint?`→`bigint` vs `boolean?`→`union`).

### A8. Non-idiomatic-but-faithful (zod SUSPECT) — representativeness, not correctness

Works and passes, but not the API a real user would reach for. Lower priority than A1–A5.

- Date bounds via `.refine` where `z.date().min()/.max()` applies: `DATETIME.date_minmax`,
  `date_gtlt`, `date_min_lt`, `date_max_now`, `date_rel_window`, `date_rel_datetime_components`.
- Plain `z.union` where `z.discriminatedUnion` is representative: `UNION.discriminated_union`,
  `UNION.union_same_prop_different_types`.
- Bare regex where `z.iso.*` + refine would compose: `STRING_FORMAT.date_minMax_absolute`,
  `dateTime_minMax_absolute`, `time_HHmmss`, `time_HHmmss_ms`.

### A9. Weaker-than-ideal assertion signal / coverage gaps (overrides+id, enrich+mocking, serialization — SUSPECT, low priority)

- **id-integrity** `serializers.test.ts` asserts byte-identical wire output as the id
  signal (encoders are fresh closures, no `.toBe`); two output-equal-but-structurally-distinct
  runtypes would slip. Also: **no explicit distinctness driver** (all three test equivalence;
  add `RT.literal(2)` id ≠ `RT.number()` id), and the 9 VALUE_FIRST_SUITE models aren't on the
  id-integrity schema path.
- **mocking** suite never round-trips mock→its-own-validator (that lives in the validation
  suite via `runMockPass`); a header note would prevent a false assumption.
- **override** `getValidationErrors` path proves the override fires but doesn't assert the
  value/path it receives.
- **serialization** claims asserted only in prose: `Objects.non_serializable_class`
  (deserialize-fn reconstruction path never sampled), `Unions.union_with_non_serializable`
  (function-arm dropped-vs-throw never fed a function value).

### A10. Cosmetic / drift (not counted against verdicts)

- **Misleading `*_with_discriminator` naming** on structural unions with no literal
  discriminant on the wire (serialization `Unions.ts`: `with_discriminator`,
  `union_object_with_discriminator`, `union_mixed_with_discriminator`,
  `union_index_property_with_discriminator`, `circular_union_with_discriminator`).
- **Near-duplicate cases:** Functions `function_with_date_parameters` ≈ `optional_params`;
  Iterables `objects_with_nested_sets` b≡c / `objects_with_nested_maps` key1≡key2;
  validation `Tuple.tuple_with_optional` ≈ `tuple_multiple_trailing_optionals`.
- **Benign option drift:** `Atomic.literal_symbol_noLiterals` schema thunk drops
  `{noLiterals}`; `Array.string_array_noIsArrayCheck` mockType thunk drops `{noIsArrayCheck}`.
- **enrich** `Circular.circularArray` emits `$items: {}` (the cycle-break leaf) where
  siblings emit `$items: {pool: []}` — faithful but reads like drift; add a comment.

---

## B. Fix-list grouped by TARGET (quick per-owner view)

### zod 4.4.3 — the big remediation (39 WRONG + ~40 SUSPECT rows)
1. Replace all 11 `z.custom`/hand-rolled bypasses with real schemas (A1) — start with the
   trigger `interface_all_optional`.
2. Swap ~10 stale zod-3 regexes for zod-4 builders (A2): `z.uuidv4/uuidv7/email`, `z.iso.date/datetime/time`.
3. SUSPECT cleanups (A8): Date `.min/.max`, `discriminatedUnion`, `z.iso` composition;
   add `.finite()` to the 6 REALWORLD number fields (A6).
4. Temporal `NOT_SUPPORTED`: tighten the 32 justification comments (claim stands).

### ajv 8.20.0 — small, targeted
1. Implement 3 mis-marked `NOT_SUPPORTED` (A2/A3): `TYPE_MAPPINGS.key_prefix_rename`,
   `key_filter_via_never`, `TEMPLATE_LITERAL.template_literal_index_key`.
2. Fix the `key_conditional_rename` comment (defensible opt-out, wrong stated reason).
3. SUSPECT: tighten opt-out reasons for `interface_all_optional`/`deep_partial_recursive_mapped`
   (real blocker = plain-object guard vs ajv `{type:object}` accepting Date/Map); consider a
   pattern for `STRING_FORMAT.date_DMY`.

### typebox 0.34.49 — small
1. Implement `bigint_int64`/`bigint_uint64` via `Type.BigInt({minimum:…n, maximum:…n})` (A2).
2. Runtime-confirm then likely implement `string_disallowedValues` (lookahead) and
   `template_literal_index_key` (`Type.Record` + template key).
3. SUSPECT: note `function_top_level` fragility (TFunction extended type).

### typia 13-dev & ts-runtypes 0.1.0 — no action
Both clean on all three axes. ts-runtypes is the reference and is internally consistent with
its own samples; spot-checks of the load-bearing reference cases (REALWORLD.user `createdAt:string`,
the serializable-data drops, `union_with_any/unknown` collapse, `record_union_keys`) all hold.

### suite · serialization — the highest-value suite fix
1. **Fix `util/equalsHelpers.ts normalizeForComparison`** to handle Map/Set (A4) — un-blinds
   all 9 Iterables cases at once.
2. Add the missing union-member / numeric-key samples to the 2 WRONG + 5 SUSPECT cases (A5).
3. Add byte-width / boundary / base-case samples (A6); resolve the 2 prose-only claims (A9).
4. Cosmetic: rename the structural `*_with_discriminator` cases (A10).

### suite · validation / formats / overrides+id / enrich+mocking — low-risk polish
No WRONG. Confirm the 4 validation emitter tokens (A7); strengthen weak format/validation
samples (A6); add an id-integrity distinctness driver + strengthen the serializer id signal
(A9); add the noted clarifying comments (A10).

---

## C. Acceptance check (against the spec)

- ✅ One classification table per competitor (5) and per suite group (5), each covering every
  case incl. every `NOT_SUPPORTED` opt-out — in this directory.
- ✅ Master fix-list of WRONG + SUSPECT with root-cause grouping — section A above.
- ✅ Every `NOT_SUPPORTED` opt-out judged — section A3 (firm mis-marks: ajv 3, typebox 2 + 2 likely; zod/typia/ts-runtypes 0).
- ✅ The known-wrong `zod OBJECT.interface_all_optional` is classified **WRONG** with the
  idiomatic replacement noted (A1) — the method caught its sanity-check target.
- ✅ No production code changed — review + tables only.

**Follow-up (separate task, not started here):** action sections B in priority order —
zod bypasses/regexes first (largest correctness impact + benchmark-credibility), then the
serialization `normalizeForComparison` helper (un-blinds 9 vacuous tests), then the ajv/typebox
`NOT_SUPPORTED` recoveries, then the weak-sample long tail.
