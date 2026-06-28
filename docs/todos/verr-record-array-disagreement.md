# `getValidationErrors` disagrees with `validate` on non-plain-object inputs to record types

Status: **TODO (investigate + fix).** Surfaced by the type-fuzz soak while working on
the record-union JSON PR; **unrelated to that PR** (validation family, not JSON
encoding). Reproduced identically on the pre-change binary, so it predates that work.

## The invariant + the oracle that guards it

`createValidate<T>()` and `createGetValidationErrors<T>()` must **always agree**:
for every value `v`, `validate(v) === (getValidationErrors(v).length === 0)`.

That guarantee already has a fuzz oracle — **O4 (`checkErrorsAgree`)** in
[packages/ts-runtypes/test/fuzz/value/fuzzOracle.ts](../../packages/ts-runtypes/test/fuzz/value/fuzzOracle.ts):131.
It runs in **both** fuzzers across the valid / invalid / junk phases:

- value fuzzer — [fuzzRunner.ts](../../packages/ts-runtypes/test/fuzz/value/fuzzRunner.ts):113, 123, 130
- type fuzzer — [typeFuzzRunner.ts](../../packages/ts-runtypes/test/fuzz/type/typeFuzzRunner.ts):320, 330, 337, 449

So we do **not** need a new fuzz test for this scenario — O4 already covers it, and O4
is exactly what caught the failures below. No new oracle; the fix should add a
deterministic regression pinning the minimal repro (and, once green, the seeds below).

## Minimal repro (deterministic, no fuzz needed)

```ts
const validate = createValidate<Record<string, number>>();
const errors = createGetValidationErrors<Record<string, number>>();

validate([]); // false  — correct: an array is not a valid Record
errors([]);   // []     — BUG: reports NO error, i.e. treats [] as valid
```

`getValidationErrors` **under-reports**: it does not flag a non-plain-object input
(an array) against a record / index-signature type, while `validate` correctly
rejects it. The two therefore disagree (`validate=false` but `errors=[]`).

Confirmed behaviour on both `Record<string, number>` and `Record<string, Date>`:

| input | `validate` | `getValidationErrors` | agree? |
|-------|-----------|-----------------------|--------|
| `{}` | `true` | `[]` | ✅ |
| `{k: <good>}` | `true` | `[]` | ✅ |
| `{k: <bad>}` | `false` | `[{expected, path:['k']}]` | ✅ |
| `[]` | **`false`** | **`[]`** | ❌ **disagree** |

The `validate` side looks correct (an array should not satisfy a `Record<string, T>`);
the fix is most likely in the **`verr` (getValidationErrors) family** — it is missing
the "is a plain object, not an array" guard that `validate` applies before walking an
index signature. Confirm the direction before fixing (it is possible the intended
semantics are "arrays are acceptable records", in which case `validate` is the side to
change — but the empty-array-as-record reading is almost certainly wrong).

## Fuzz seeds (discovery vector)

From the type-fuzz soak with base seed `1` (`RT_FUZZ_SEED` default). Each is a record
type fed a wild junk value; the snapshot flattens the junk to `{}` / `[]`:

| target | seed | junk snapshot | message |
|--------|------|---------------|---------|
| `Rec<date>` (`Record<K, Date>`) | `634470631` | `{}` | validate=false but getValidationErrors returned 0 error(s) |
| `Rec<Set<(…\|…\|…)>>` | `2251443285` | `[]` | validate=false but getValidationErrors returned 0 error(s) |
| `Rec<Rec<…[]>>` | `1320769502` | `[]` | validate=false but getValidationErrors returned 0 error(s) |

Note: the `Rec<date>` snapshot renders as `{}` yet `validate` rejects it, while a
literal `{}` is accepted by both (see the table above) — so that junk value is a
non-plain-object the snapshot flattens (array-like / null-proto / boxed). Nail down its
exact shape during the fix; the clean `[]`-vs-record case above is the actionable core.

### Reproduce deterministically

The soak is time-based, but the same base seed generates the same type sequence, so an
iteration-bounded batch reproduces all three exactly:

```ts
// runTypeFuzz({seed: 1, iterations: 1300}) surfaces all 3 O4 violations at the
// seeds above (the default batch seed 0xc0ffee / 100 iterations does NOT hit them,
// which is why `pnpm run fuzz` is green while the soak is not).
```

Or run the soak directly:

```
RT_FUZZ_TYPES_SOAK_MS=60000 RT_FUZZ_SEED=1 pnpm exec vitest run typeFuzz.integration
```

## Where to look

- `verr` family emitter for `KindIndexSignature` / record projection — compare its
  top-level input guard against the `val` family's (which returns false for arrays).
- The `val` vs `verr` split for index signatures likely diverges on the
  `Array.isArray` / plain-object precondition; align them.

## Scope

Investigation + fix + a deterministic regression test (assert the O4 invariant on
`Record<string, number>` with `[]` and the three seeds). Pure validation-family work;
does not touch JSON / binary encoding.
