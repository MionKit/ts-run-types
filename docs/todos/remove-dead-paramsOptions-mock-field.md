---
type: chore
spec: full-plan
status: ready
created: 2026-07-23
---

# Remove the dead `paramsOptions` field from `MockOptions`

**Status:** todo. Trivial dead-code removal. No behavior change.

## Problem

`MockOptions.paramsOptions?: MockOptions[]`
([packages/ts-runtypes/src/mocking/mockTypes.ts](../../packages/ts-runtypes/src/mocking/mockTypes.ts), the field sits next to `tupleOptions`)
is **declared but never read** anywhere in `src/`. A repo-wide grep finds zero
reads:

```
grep -rn "paramsOptions" packages/ts-runtypes/src   # only the type declaration
```

Its sibling `tupleOptions` IS read (the tuple arm of `mockSwitch` in
[mockType.ts](../../packages/ts-runtypes/src/mocking/mockType.ts) applies per-element
options), but `paramsOptions` has no consumer. It looks like a leftover from the
reference implementation's function-parameter mocking that was never wired up.

Found while implementing seeded mock data
([docs/done/seeded-mock-data.md](../done/seeded-mock-data.md)) — surfaced there,
kept out of that PR's scope.

## Plan

- Delete the `paramsOptions?: MockOptions[]` line from `MockOptions` in
  `mockTypes.ts`.
- Grep once more to confirm nothing references it (tests, examples, docs).
- If a real need for per-parameter mock options surfaces later, re-add it
  **with** its consumer in `mockSwitch` (mirroring how `tupleOptions` is read).

## Tests

- None required (removing an unread optional field is behavior-neutral). The
  existing mock suites (`test/suites/mocking/`) staying green is the check.

## Done when

- `paramsOptions` no longer appears in `mockTypes.ts`.
- `grep -rn paramsOptions packages/` returns nothing.
- `pnpm test` mock suites green.
