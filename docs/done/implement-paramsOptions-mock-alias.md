---
type: chore
spec: full-plan
status: done
created: 2026-07-23
---

# Wire up `paramsOptions` as an alias of `tupleOptions`

**Status:** shipped (in the seeded-mock-data PR). Reversed from the original
"remove the dead field" direction on owner review: enforce it, don't delete it.

## Problem

`MockOptions.paramsOptions?: MockOptions[]` was declared but never read. The
original plan was to delete it. The owner instead wants it **enforced** as the
per-parameter analog of `tupleOptions` (per-tuple-element options): mocking a
function's parameters (`Parameters<typeof myFn>`) should pass each option down to
each parameter, just as `tupleOptions` does for a tuple's elements.

## Key finding

`Parameters<typeof myFn>` (and the value-first `parameters(...)` builder)
**reflect as a plain tuple** (`KindTuple` with `tupleMember` children), so a
function's argument tuple already flows through the mock walker's tuple arm and
already honors `tupleOptions`. The walker cannot distinguish a `Parameters<F>`
tuple from a hand-written tuple, and a raw function *value* mocks to `undefined`
(functions are non-data, and an args array would not be a type-correct mock of a
function type). So the type-correct, non-redundant home for `paramsOptions` is to
make it an **alias** of `tupleOptions` in the tuple arm.

## What shipped

- **Alias in the tuple arm**
  ([mockType.ts](../../packages/ts-runtypes/src/mocking/mockType.ts)):
  `const perElemOptions = mOps.tupleOptions ?? mOps.paramsOptions;` so either name
  steers each tuple slot / function parameter identically; `tupleOptions` wins
  when both are set.
- **Seed-safety fix** in `mergeChildOptions`: per-element options replace the
  mock bag, so the seeded `MockRandom` is now carried over. A `{seed}` mock with
  `tupleOptions`/`paramsOptions` stays deterministic for the overridden slots
  (without this, those slots silently fell back to native randomness).
- **Test**
  ([test/suites/mocking/perElementOptions.test.ts](../../packages/ts-runtypes/test/suites/mocking/perElementOptions.test.ts)):
  tupleOptions pins each slot, paramsOptions aliases it, precedence when both are
  set, and the seeded-determinism case (pins the mergeChildOptions fix).
- **Docs**: a `tupleOptions` / `paramsOptions` row in the mocking options
  reference
  ([6.mocking.md](../../container/website/content/2.guide/6.mocking.md)).

## Done when

- `paramsOptions` is read (aliased to `tupleOptions`), so
  `createMockData<Parameters<typeof fn>>(_, {mock: {paramsOptions: [...]}})` steers
  each parameter. ✓
- Mock suites green; the option is documented. ✓
