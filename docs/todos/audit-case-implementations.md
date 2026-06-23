# Audit every benchmark + test-suite case implementation, case by case

> **Status: AUDIT COMPLETE (review done; fixes are a separate follow-up).** The ten
> classification tables + the master fix-list live in
> [`audit-reports/`](audit-reports/) — start with
> [`audit-reports/00-SYNTHESIS.md`](audit-reports/00-SYNTHESIS.md). Headline: the
> trigger class (hand-rolled `z.custom` bypasses) is real and concentrated in **zod**
> (39 WRONG); **typia** and the reference **ts-runtypes** are clean; the ts-runtypes
> **serialization** suite has one high-value defect (a comparison helper that silently
> neuters all 9 Map/Set cases). No production code was changed by the audit.
>
> **Status (original): pending (review only, no fixes yet).** Triggered by a clearly wrong
> competitor implementation (zod `OBJECT.interface_all_optional`, below). The goal
> of THIS task is the audit, not the fixes: review every single case in the
> benchmark competitors and the ts-runtypes test suites, classify each as correct /
> suspect / wrong in a table, and surface the systemic patterns. Fixes are a
> separate follow-up driven by the tables this produces.

## The finding that triggered this

[`container/benchmarks/competitors/zod/cases.ts`](../../container/benchmarks/competitors/zod/cases.ts) `OBJECT.interface_all_optional`:

```ts
'OBJECT.interface_all_optional': {
  buildErrors: () => {
    const schema = z.custom((v) => {
      if (typeof v !== 'object' || v === null) return false;
      if (Object.prototype.toString.call(v) !== '[object Object]') return false;
      const obj = v as Record<string, unknown>;
      if ('a' in obj && obj.a !== undefined && typeof obj.a !== 'string') return false;
      if ('b' in obj && obj.b !== undefined && (typeof obj.b !== 'number' || !Number.isFinite(obj.b))) return false;
      return true;
    });
    return (value: unknown) => schema.safeParse(value).success;
  },
},
```

The intended type is `{ a?: string; b?: number }` (all-optional, with a plain-object
guard so arrays / Date / Map / Set / RegExp are rejected). The shared samples are:

- valid: `[{}, {a: 'x'}, {a: 'x', b: 1}, {a: undefined, b: undefined}]`
- invalid: `[[], new Date(), new Map(), new Set(), null, 'hello', 42, undefined, /regex/, true]`

**Why this implementation does not make sense:**

- It is `z.custom(() => { ...hand-written JS... })`. `z.custom` runs a raw predicate, so
  the benchmark measures a hand-rolled JavaScript function, NOT zod's schema engine.
  zod's number on this case is therefore meaningless (artificially fast and unrepresentative).
- It is not idiomatic. A real zod user models this as roughly
  `z.object({ a: z.string().optional(), b: z.number().finite().optional() })`
  (plus, if they want to reject Date/Map/Set, a single `.refine(isPlainObject)` or `.strict()`),
  not a from-scratch guard.
- It silently passes the cross-library alignment audit (0 divergences), because the
  hand guard happens to accept/reject exactly the shared samples. So the existing
  automated check does NOT catch this; only a human read does.

The worry is not this one case, it is **how many others are like it**: bypasses, wrong
schemas that the samples are too weak to expose, copy-paste drift, or a metric builder
that does not match the case's intended type.

## Why the alignment audit is not enough

`pnpm run audit:alignment` already runs every sample through every competitor and records
per-case divergences (see [`container/benchmarks/results/alignment-misalignments.json`](../../container/benchmarks/results/alignment-misalignments.json)).
It is a good **pre-filter** but it only checks ONE axis:

- It catches an implementation that accepts/rejects the WRONG samples (a divergence).
- It does NOT catch an implementation that gets the right answer the wrong way (a
  `z.custom` / hand-rolled-JS bypass, a non-idiomatic schema, a `build` that does not
  actually exercise the library), because those still pass the samples.
- It does NOT catch a case whose SAMPLES are too weak to distinguish a correct schema
  from a sloppy one.

This audit is the manual second axis the automated check can't cover.

## Scope

### A. Benchmark competitor implementations

`container/benchmarks/competitors/<lib>/cases.ts` — **266 cases each**, one entry per
`'<GROUP>.<name>'` key, each a `build` (cheap is-valid) and/or `buildErrors`
(validation-errors report) thunk that constructs that library's validator/schema:

| competitor | file | cases | NOT_SUPPORTED | installed version |
| --- | --- | --- | --- | --- |
| ajv | `ajv/cases.ts` | 266 | 118 | 8.20.0 |
| ts-runtypes | `ts-runtypes/cases.ts` (+ `schemaCases.ts`, 263) | 266 | 5 | 0.1.0 |
| typebox | `typebox/cases.ts` | 266 | 79 | 0.34.49 |
| typia | `typia/cases.ts` | 266 | 73 | 13.0.0-dev.20260511 |
| zod | `zod/cases.ts` | 266 | 39 | 4.4.3 |

A case opts out by mapping its key to the `NOT_SUPPORTED` sentinel (from
[`container/benchmarks/shared/harness/types.ts`](../../container/benchmarks/shared/harness/types.ts))
with an inline reason, e.g. `'ATOMIC.literal_1n': NOT_SUPPORTED, // TypeBox has no bigint literal type`.
[`container/benchmarks/_audit/classify.mjs`](../../container/benchmarks/_audit/classify.mjs)
already tallies the `NOT_SUPPORTED` + override sets per competitor — a useful starting inventory.

The **reference** for each case is the shared sample data + intended type in
[`container/benchmarks/shared/cases/**`](../../container/benchmarks/shared/cases) (the
`getSamples()` valid/invalid arrays + the case `title`/`description`), and the
ts-runtypes competitor entry, which mirrors the real ts-runtypes type.

Note the metric convention: a competitor implements `build` (boolean is-valid) and/or
`buildErrors` (errors-then-`.length === 0`). Some libraries (zod) ship only `buildErrors`
because they have no cheap boolean path. The review must confirm the RIGHT builder(s)
exist and each exercises the library's real validation path.

### B. ts-runtypes test-suite implementations

`packages/ts-runtypes/test/suites/<group>/<File>.ts` — these define ts-runtypes' OWN
types and the expected valid/invalid + error/path assertions, so they ARE the reference.
Reviewing them catches bugs in the reference itself (a wrong type, a wrong expected
assertion, samples that don't cover the edge the title claims).

Groups: `validation`, `serialization`, `format-validation`, `format-serialization`,
`format-transform`, `overrides`, `enrich`, `mocking`, `id-integrity`, `value-first-define`.

## What "correct" means (the three axes)

For **every** case, judge:

1. **Faithful** — accepts every `valid` sample and rejects every `invalid` sample for the
   case's intended type. (The alignment audit already scores this for competitors; use it,
   but re-confirm by reading.)
2. **Representative / idiomatic** (the axis the audit misses):
   - Competitors: the schema expresses the type with the library's real, public, idiomatic
     API. NO hand-rolled JS guards, `z.custom(() => …raw…)`, or `(v) => typeof v === …`
     predicates that bypass the engine. A `custom` / `refine` / `superRefine` is acceptable
     ONLY when the library genuinely cannot express the constraint AND a real user would
     write it that way — each such use must be flagged and justified in the table.
   - ts-runtypes suites: the type definition matches the intended semantics; the expected
     valid/invalid, error messages and paths are right; the samples meaningfully cover the
     edge the `title`/`description` claims; no copy-paste drift between sibling cases.
3. **Genuinely unsupported** (the `NOT_SUPPORTED` marker, competitors only) — every case
   mapped to `NOT_SUPPORTED` is a CLAIM that the library cannot express that type, and the
   claim must be verified, not trusted. Re-derive each one against the pinned version's
   actual API: if the type CAN be modelled idiomatically (the author skipped it, the inline
   reason is stale, or a newer version added the feature), the marker is wrong and the case
   should be implemented. This is a large surface (ajv opts out of 118/266, typebox 79,
   typia 73, zod 39), and a wrong opt-out understates the library AND drops the row from its
   aggregate (it renders `n-a`), so it skews the comparison just as much as a wrong schema.

## Methodology — produce one table per competitor / suite group

Do NOT fix anything in this pass. For each case, read the implementation against the
reference and record a row:

| case key | intended type | implementation (one line) | faithful? | idiomatic? | verdict | issue / suggested fix |
| --- | --- | --- | --- | --- | --- | --- |

- **verdict**: `OK` (faithful + idiomatic, or a `NOT_SUPPORTED` whose claim holds) ·
  `SUSPECT` (works but questionable — a justified `refine`, weak samples, unusual but valid
  construction, or a `NOT_SUPPORTED` expressible only via a non-idiomatic workaround) ·
  `WRONG` (bypass, incorrect schema, wrong/missing metric builder, or a `NOT_SUPPORTED` the
  library CAN actually express).
- **`NOT_SUPPORTED` cases are rows too** — put `NOT_SUPPORTED (inline reason)` in the
  implementation column, mark faithful/idiomatic n/a, and let the verdict judge the CLAIM:
  does the pinned version genuinely lack the feature? Verify against the real API; do not
  trust the inline reason (it may be stale, copied, or a version behind).
- Pull the case's `getSamples()` (or the suite case's samples) and confirm accept/reject by
  reading, not by trusting the audit.
- For competitors, cross-check the divergence count in `alignment-misalignments.json`: a
  non-zero count is either an intended library difference (note it) or a bug; a zero count
  does NOT imply `OK` (this is exactly the `interface_all_optional` trap).
- Keep rows terse; the value is the verdict + the issue, not prose.

## How to split the work across agents

**Each agent first loads the exact installed library version into context** before reading
any case, so it reasons against the right API surface (zod 4 is not zod 3; typia dev build;
typebox 0.34; ajv 8). Version sources: `container/benchmarks/_deps/competitors/<lib>/package.json`
and `container/benchmarks/results/env.json`. The agent should fetch that version's docs /
changelog / type signatures (WebFetch/WebSearch) so its "is this idiomatic?" judgment is grounded.

**Benchmark competitors — one agent per competitor (5 agents, parallel):**

- `ajv` (8.20.0) · `ts-runtypes` (0.1.0, both `cases.ts` + `schemaCases.ts`) ·
  `typebox` (0.34.49) · `typia` (13.0.0-dev) · `zod` (4.4.3).
- Each: fetch its version's API, then walk all 266 cases against the shared samples +
  reference type, emit one table. 266 is large — an agent may chunk by `GROUP` (ATOMIC,
  ARRAY, OBJECT, TUPLE, UNION, …) but must cover every case, **including re-deriving every
  `NOT_SUPPORTED` opt-out** (axis 3) rather than skipping the ones with no implementation.

**ts-runtypes test suites — split by group (≈4-5 agents, parallel with the above):**

- e.g. (1) `validation`; (2) `serialization`; (3) `format-validation` + `format-serialization`
  + `format-transform`; (4) `overrides` + `value-first-define` + `id-integrity`;
  (5) `enrich` + `mocking`. Rebalance by case count. Each emits one table per group.

**Synthesis (final, sequential):** collate every table into a master fix-list, grouped by
(a) competitor/suite and (b) root-cause pattern (e.g. "z.custom/hand-rolled bypass",
"missing `Number.isFinite` on a number", "wrong metric builder", "samples too weak to
distinguish", "expected error/path wrong"). That list seeds the follow-up fix task.

## Acceptance

- One classification table per competitor (5) and per suite group (≈5), each covering
  every case, checked in under `docs/todos/` (or a sibling `docs/done/` report when complete).
- A master fix-list of `WRONG` + `SUSPECT` cases with the root-cause grouping.
- Every `NOT_SUPPORTED` opt-out judged (claim verified or flagged as mis-marked), with the
  mis-marked ones listed as cases to implement.
- The known-wrong `zod OBJECT.interface_all_optional` appears as `WRONG` with the idiomatic
  replacement noted, as a sanity check that the method catches the class.
- No production code changed by this task — it is review + tables only.
