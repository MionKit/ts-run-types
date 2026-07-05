# `getValidationErrors` disagrees with `validate` on non-plain-object inputs to record types

Status: **implemented** on branch `claude/validate-errors-disagreement-748lzu` (2026-07-02).
Scope: pure validation-family work (one emitter term + tests). Does not touch JSON / binary encoding.

## What shipped

- **Root cause.** The `validate` object emitter (`emitObjectValidate`,
  [internal/cachegen/typefunctions/validate.go](../../internal/cachegen/typefunctions/validate.go))
  splices a plain-object brand guard —
  `!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]'` —
  onto the shape gate when the object is empty, all-optional, **or carries an
  index signature** (`!hasContributingChild || allOptional || hasIndexSig`). The
  `validationErrors` emitter (`emitObjectValidationErrors`,
  [internal/cachegen/typefunctions/validationerrors.go](../../internal/cachegen/typefunctions/validationerrors.go))
  tracked only `allOptional` + `hasContributingChild` and was **missing the
  `hasIndexSig` term** — it never even computed it. For a `Record<K, V>` the
  index-signature child is a contributing, non-optional child, so the guard was
  skipped: an empty array `[]` passed `typeof === 'object' && !== null`, entered
  the `for...in` loop (which enumerates no own string keys on an array / Map /
  Set / Date), and reported **zero errors** while `validate` returned **false**.

- **The fix (one term).** `emitObjectValidationErrors` now tracks `hasIndexSig`
  and includes it in the guard condition, mirroring `emitObjectValidate`
  exactly. The two object emitters now diverge on nothing, so they can't drift
  apart again.

- **Tests.**
  - Go emitter regression
    ([internal/cachegen/typefunctions/index_sig_array_reject_test.go](../../internal/cachegen/typefunctions/index_sig_array_reject_test.go)):
    renders `Record<string, number>` and `Record<string, Date>` through both
    families and asserts BOTH carry the brand guard (fails without the fix).
  - JS end-to-end regression
    ([packages/ts-runtypes/test/verr-record-array-disagreement.test.ts](../../packages/ts-runtypes/test/verr-record-array-disagreement.test.ts)):
    pins the minimal repro table for `Record<string, number>` and
    `Record<string, Date>`, plus a direct O4-invariant sweep over `[]`, arrays,
    `Date`, `Map`, `Set`, null-proto objects, and primitives.
  - Suite coverage gap closed
    ([packages/ts-runtypes/test/suites/validation/Object.ts](../../packages/ts-runtypes/test/suites/validation/Object.ts)):
    the `String index signature` case's `invalid` samples now include `[]`,
    `new Date()`, `new Map()`, `new Set()` (each expecting `objectLiteral` at the
    root), so the array case flows through the whole validate / getValidationErrors
    / reflect / deserialize / schema / standard-schema variant matrix.

- **Verification.** The type-fuzz soak at `RT_FUZZ_SEED=1` (the discovery
  vector) — reproduced deterministically as a 1300-iteration batch — now reports
  `0` O4 violations (was 3). Full Go + JS suites green.

## The invariant + the oracle that guards it

`createValidate<T>()` and `createGetValidationErrors<T>()` must **always agree**:
for every value `v`, `validate(v) === (getValidationErrors(v).length === 0)`.

That guarantee has a fuzz oracle — **O4 (`checkErrorsAgree`)** in
[packages/ts-runtypes/test/fuzz/value/fuzzOracle.ts](../../packages/ts-runtypes/test/fuzz/value/fuzzOracle.ts):131,
running in both fuzzers across the valid / invalid / junk phases. O4 is exactly
what caught the failures below; no new oracle was needed.

## Minimal repro (now fixed)

```ts
const validate = createValidate<Record<string, number>>();
const errors = createGetValidationErrors<Record<string, number>>();

validate([]); // false  — correct: an array is not a valid Record
errors([]);   // [{path: [], expected: 'objectLiteral'}]  — now agrees (was [])
```

Confirmed behaviour on both `Record<string, number>` and `Record<string, Date>`:

| input | `validate` | `getValidationErrors` | agree? |
|-------|-----------|-----------------------|--------|
| `{}` | `true` | `[]` | ✅ |
| `{k: <good>}` | `true` | `[]` | ✅ |
| `{k: <bad>}` | `false` | `[{expected, path:['k']}]` | ✅ |
| `[]` | `false` | `[{expected:'objectLiteral', path:[]}]` | ✅ (was ❌) |

## Fuzz seeds (discovery vector, now resolved)

From the type-fuzz soak with base seed `1`. Each is a record type fed a wild
junk value the snapshot flattens to `{}` / `[]` (a non-plain object: array-like
/ null-proto / boxed / native builtin). All three are gone after the fix.

| target | seed | junk snapshot | message (pre-fix) |
|--------|------|---------------|-------------------|
| `Rec<date>` (`Record<K, Date>`) | `634470631` | `{}` | validate=false but getValidationErrors returned 0 error(s) |
| `Rec<Set<(…\|…\|…)>>` | `2251443285` | `[]` | validate=false but getValidationErrors returned 0 error(s) |
| `Rec<Rec<…[]>>` | `1320769502` | `[]` | validate=false but getValidationErrors returned 0 error(s) |

Reproduce the sweep deterministically (0 violations after the fix):

```
RT_FUZZ_TYPES_SOAK_MS=60000 RT_FUZZ_SEED=1 pnpm exec vitest run typeFuzz.integration
```
