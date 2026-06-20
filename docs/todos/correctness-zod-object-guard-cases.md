# Update the correctness/alignment test for the zod object-guard cases

> **Status: pending — needs a container run.** Spun off from the audit-fix task
> (`docs/todos/audit-case-implementations.md`). Three zod competitor cases were
> changed from a hand-rolled `z.custom` plain-object guard to the idiomatic
> `z.object(...)` that declares the **same interface as ts-runtypes**. That removes
> the engine-bypass the audit flagged, but introduces a *known, intended* pass/reject
> discrepancy that the cross-library **correctness** benchmark must now record. This
> doc exists because that benchmark **could not be run in the fix environment** (no
> GHCR access to pull the bench container), so the correctness data was not updated.

## What changed (in `container/benchmarks/competitors/zod/cases.ts`)

| case | before | after |
| --- | --- | --- |
| `OBJECT.interface_all_optional` | `z.custom` hand-rolled plain-object guard | `z.object({a: z.string().optional(), b: z.number().finite().optional()})` |
| `UTILITY.partial` | `z.custom` hand-rolled guard | `z.object({name?, age?:number.finite, createdAt?:date})` |
| `UTILITY.deep_partial_recursive_mapped` | `z.custom` hand-rolled nested guard | nested `z.object({display?:{theme?:enum, brightness?}, audio?:{volume?, muted?}})` |

Rationale (per the maintainer): the cases should declare the exact same interface as
ts-runtypes and let the **separate correctness benchmark** judge pass/reject
discrepancies, rather than encode a hand guard tuned to pass the samples (which is the
bypass the audit was created to eliminate).

## The known discrepancy these now introduce

zod's internal `isObject` is `typeof v === 'object' && v !== null && !Array.isArray(v)`
— it does **not** exclude class instances. So `z.object(...)` **accepts**
`new Date()`, `new Map()`, `new Set()`, `/regex/` (they pass the object check, then the
all-optional fields are simply absent). ts-runtypes **rejects** those for the same
type. The shared invalid samples for these cases include exactly
`[], new Date(), new Map(), new Set(), null, 'hello', 42, undefined, /regex/, true`:

- Still correctly **rejected** by the new zod schema: `[]`, `null`, `'hello'`, `42`,
  `undefined`, `true` (arrays + primitives).
- Now wrongly **accepted** (the discrepancy): `new Date()`, `new Map()`, `new Set()`,
  `/regex/`.

This was verified directly against zod 4.4.3 (`safeParse`) during the fix; it is a real
library limitation, not a schema mistake.

## Action items (run when the bench container is available)

1. Pull/build the bench container (GHCR) and run the alignment/correctness audit:
   `pnpm run audit:alignment` (→ `bash scripts/benchmarks.sh audit`). It writes
   per-competitor divergence data under the bench `results/` (e.g.
   `results/alignment-misalignments.json`, `results/zod.alignment.json`).
2. Confirm the three cases now report a zod divergence on the four instance samples
   (`Date`/`Map`/`Set`/`RegExp` accepted-but-should-reject) and on nothing else.
3. **Record it as an intended library difference**, the same way the equivalent
   TypeBox cases are already handled: TypeBox's `Type.Object` has no plain-object guard
   either, so `OBJECT.interface_all_optional` / `UTILITY.partial` /
   `deep_partial_recursive_mapped` are marked with a per-case `samples` override
   (`samplesOverridden: true`) so the divergence is declared, not flagged as a bug.
   Apply the same `samples.invalid` override (drop the four instance samples, with an
   inline reason citing this doc) to the zod cases — OR, if the correctness page is
   meant to *show* the discrepancy rather than suppress it, ensure the expected-/
   overridden-divergence bookkeeping marks these three as a known zod limitation so the
   audit's `undeclaredDivergences` stays 0.
4. Re-run the audit and confirm `builderIssues: 0` and `undeclaredDivergences: 0` for
   zod (i.e. every remaining divergence is declared/intended).
5. While the container is up, also smoke-run the full zod competitor (all 21 other
   fixed cases from wave 1) through the audit to confirm the idiomatic-builder swaps
   (`z.uuidv4`/`z.iso.*`/`z.discriminatedUnion`/`z.record`+`z.templateLiteral`/lazy
   tuples+unions) accept/reject the shared samples as reasoned — these were verified by
   standalone `safeParse` but not yet through the harness.

## Not in scope here

- `ATOMIC.object` was **left as `z.custom`**: its ts-runtypes type is the bare `object`
  primitive (accepts arrays + `Date` + `RegExp`, rejects only primitives/null), which
  has **no** idiomatic zod schema — `z.object`/`z.looseObject` can't accept arrays and
  `Date` while rejecting primitives. No interface to mirror, so the guard stays. Note it
  on the correctness page as a genuine zod limitation if it surfaces.
- `STRING_FORMAT.time_iso` stays a regex: zod 4.4.3 `z.iso.time()` takes only
  `{precision}`, no timezone/offset option, so it would reject the tz-suffixed valid
  samples. Justified, unchanged.
