# Cross-library validation alignment audit

**Status:** scoping note, not started. Captured as a future investigation; no
design committed, no code touched, **no behavioural fix in scope here** — this
todo is an ANALYSIS pass that produces a report, not a code-change task.

The idea: the benchmark suite already feeds every competitor the **same valid +
invalid sample sets** per case and times their `validate` /
`getValidationErrors` paths, but it only flags a competitor as `fail` when its
boolean answer disagrees with the SHARED sample's labelled truth (see
`measureMetric` / `check` in
[`container-benchmarks/shared/harness/runner.ts`](../../container-benchmarks/shared/harness/runner.ts)
and `CaseStatus` in
[`container-benchmarks/shared/harness/result.ts`](../../container-benchmarks/shared/harness/result.ts)).
What it does NOT do is **explain** the disagreement — today the suite carries
opt-in `SampleOverride` so a competitor can declare "for THIS case my accept /
reject set differs", but those overrides have accreted with one-line reasons at
the call sites and never been audited as a whole.

This todo proposes an end-to-end audit:

1. Inventory **every disagreement** between competitors on every case, for BOTH
   `validate` and `getValidationErrors`, on both the accept path and the reject
   path.
2. Fan out one investigation per misalignment to explain WHY the competitor
   disagrees: wrong type / schema authored on the competitor side, a genuine
   semantic difference in what the library validates, a sample the suite labels
   incorrectly, or something else.
3. Aggregate the per-misalignment notes into a single report.
4. Use that report to ask the project-internal question: **are WE the outlier
   anywhere?** Do any of the disagreements indicate the ts-runtypes definition
   of "valid" is the surprising one? No code change here; the output is a
   prioritised list of "things to consider fixing" that becomes its own
   follow-up todo.

## Why this is worth doing

The runtime benchmark today reports correctness (`ok` / `fail` / `errored` /
`not-supported`) per competitor per case per metric, but it conflates two very
different reasons a row can be `fail`:

- **Authoring drift** — the competitor case file ended up with a slightly
  different schema than the shared case asks for (a forgotten `min`, a
  loosened union, a missing format brand). The competitor disagrees because
  the SCHEMA the competitor file authored doesn't match the type the shared
  case describes. This is fixable in the competitor case file and should not
  be confused with a library limitation.
- **Genuine semantic divergence** — the competitor's library cannot express
  (or chooses to express differently) what the shared case asks for. e.g.
  ajv treating `NaN` as a valid `number`, zod's `safeParse` accepting extra
  unknown keys by default, typia's `assert` throwing where `is` returns
  false, ts-runtypes silently dropping non-serialisable members per the
  [validate contract](../../CLAUDE.md#validate-contract--serializable-data-only).
  This is a documented difference and the `SampleOverride` mechanism exists
  for it; we want each override pinned to a one-line reason that names the
  semantic.

Both reasons are legitimate, but only the second one should ride as a sample
override forever. Authoring drift is a bug we want to fix.

### The hidden third case

There's also a case we are not measuring today: **silent agreement on the
WRONG thing**. Both the suite's shared sample set AND the competitor's schema
could be more permissive than ts-runtypes by accident. Today such a case
shows `ok` for the competitor (its answer matches the labels) but our row also
shows `ok` (we agree with the labels too), and nothing in the table tells us
the labels themselves were too loose for what the type actually says. The
audit MUST cross-check the suite's labels against each competitor's schema
shape, not just against each competitor's run output.

## What "alignment" means

For each (case, competitor, metric, path) the runner already knows whether the
boolean output matched the labelled truth. The audit needs strictly more:

- The competitor's **authored schema or type** for that case
  (read from `container-benchmarks/competitors/<name>/cases.ts` or
  `schemaCases.ts`).
- The **shared case spec** (type + samples) from
  [`container-benchmarks/shared/cases/`](../../container-benchmarks/shared/cases/).
- For each disagreement, the **first sample value** that triggered it
  (`check` already returns the index — the audit needs to surface it instead
  of stopping at "valid[3] rejected").
- The competitor's **`SampleOverride`** if present, with the call-site note.

The audit's atom is the tuple `(caseKey, competitor, metric, path, sampleIndex,
sampleValue, expected, got, overrideNote, schemaSnippet)`. Every misalignment
the runner sees today is one row. Today they're hidden inside `detail` strings
("valid[3] rejected"); the audit produces a sortable table.

## Two paths, two functions, two outputs

The user's request is explicit and easy to lose: BOTH `createValidate<T>()` and
`createGetValidationErrors<T>()` must be audited. They look like the same
metric (the runner wraps `getValidationErrors` to a boolean), but they are
DIFFERENT code paths in every library:

- **`validate`** — cheap predicate, optimised for the happy path, often
  short-circuits on the first failure.
- **`getValidationErrors`** — full traversal, returns every leaf failure, used
  for form / API error reporting.

A library can have one path right and the other wrong. ts-runtypes itself has
distinct emitted bodies for the two families (`val_` vs `pj_` / `pjs_` /
`huk_`, see [internal/operations](../../internal/operations/)), so we want
independent audit rows per metric, not a single boolean per case.

Same for the two PATHS — accept and reject:

- **`validate` on accept path** says: "this sample should pass, and the
  competitor returned true". A `fail` here is a **false negative** (the
  library is over-strict relative to ts-runtypes / the suite labels).
- **`validate` on reject path** says: "this sample should fail, and the
  competitor returned false". A `fail` here is a **false positive** (the
  library is over-loose relative to ts-runtypes / the suite labels).

False positives and false negatives almost always have different causes; the
audit groups them separately.

## Step-by-step plan

### Step 0 — surface every misalignment as data

Today the runner records `MetricResult.detail = "valid[3] rejected"` and
moves on. That's enough to flag a row red but not enough to investigate. The
audit needs a richer per-row record:

- Walk every `(caseKey, competitor, metric)` triple regardless of pass/fail.
- For each path (`accept` / `reject`), walk EVERY sample (not just the first
  bad one) and record the boolean output. Then compute the set
  `{i : output[i] !== expected[i]}`.
- Emit one **misalignment record** per disagreement:

  ```jsonc
  {
    "caseKey": "OBJECT.required_with_optional_string",
    "competitor": "ajv",
    "metric": "validate",
    "path": "reject",
    "sampleIndex": 2,
    "sampleValueRepr": "{name: 'x', age: NaN}",
    "expected": false,
    "got": true,
    "overrideNote": null,
    "schemaSnippet": "Type.Object({name: Type.String(), age: Type.Number()})"
  }
  ```

- Aggregate to `container-benchmarks/results/alignment-misalignments.json`,
  one record per disagreement. Same per-case-key column the aggregator already
  joins on.

This is a one-time investigative tool, not a new permanent bench axis — keep
it as a script under `container-benchmarks/_audit/` or similar, gated behind a
`pnpm run audit:alignment` script, and DO NOT wire it into the normal
`bench:website` regenerate cycle. The output is a report, not a docs panel.

### Step 1 — classify each misalignment

For each misalignment record from step 0, fan one agent out (one agent per
misalignment, parallelisable) with EVERYTHING it needs to decide WHY the
competitor disagreed:

- The shared case spec, including its `title` and `description`.
- The competitor's authored schema / type for that case.
- The disagreeing sample value (round-tripped through a faithful JSON repr,
  with a fallback for non-JSON values — `NaN`, `undefined`, `BigInt`,
  `Symbol`, `Date('invalid')`, cyclic refs).
- The current `SampleOverride` for the case, if any.
- The library's relevant docs page (the agent can `WebFetch` if needed).
- A clear bucket list to classify into:

  1. **`AUTHORING_DRIFT`** — competitor schema doesn't faithfully translate
     the shared case's TS type. Outcome: a one-line proposal to fix the
     competitor case file. Example: zod schema forgot a `.min(1)` that the TS
     type's `FormatString<{minLength: 1}>` brand declares.
  2. **`LIBRARY_LIMITATION`** — competitor schema is the best translation
     possible but the library cannot express the shared case's constraint.
     Outcome: `SampleOverride` with a one-line reason naming the limitation.
     Example: ajv has no equivalent for "this Date must not be `new
     Date('invalid')`".
  3. **`LIBRARY_SEMANTIC_DIFFERENCE`** — library deliberately defines "valid"
     differently. Outcome: `SampleOverride` with a one-line reason naming the
     semantic. Example: zod accepts extra keys by default, so the reject
     samples for "object with no extra keys" must be different for zod.
  4. **`SAMPLE_LABEL_WRONG`** — the SHARED sample's labelled truth is wrong;
     ts-runtypes happens to agree with the wrong label. Outcome: a proposal
     to fix the shared sample. (See "hidden third case" above — this bucket
     is why this audit matters even when ts-runtypes shows `ok`.)
  5. **`TS_RUNTYPES_DIVERGENT`** — ts-runtypes itself disagrees with the
     CONSENSUS of the other libraries on a case where TS semantics are
     unambiguous. Outcome: feed into step 3 (we may be the outlier). Don't
     auto-fix from this bucket.
  6. **`UNKNOWN`** — the agent couldn't decide. Outcome: flagged for human
     review, with the agent's findings attached.

Each agent writes one classification per misalignment to
`container-benchmarks/_audit/findings/<caseKey>__<competitor>__<metric>__<path>__<idx>.md`.
The file is short — bucket, one-paragraph reasoning, proposed action, and the
exact `SampleOverride` snippet (if applicable). Same shape every time so step
2 can mechanically aggregate.

Parallelism budget: one agent per misalignment is the right unit but the
total can easily be hundreds. Cap concurrency (16? 32?), batch by competitor
so each agent's context primer (library docs, the competitor's helper files)
is amortised across many cases.

### Step 2 — generate the aggregate report

Walk every per-misalignment file and emit
`docs/cross-library-validation-alignment-report.md` (committed):

- A one-screen **summary table** counting misalignments per (competitor,
  bucket).
- Per-competitor sections listing every `AUTHORING_DRIFT` finding with the
  proposed fix, ready for a follow-up PR that updates the competitor case
  files.
- A "documented divergences" section listing every `LIBRARY_LIMITATION` and
  `LIBRARY_SEMANTIC_DIFFERENCE`, sorted by case, with the `SampleOverride`
  snippet — this becomes the canonical reason-list for every override the
  suite carries.
- A "samples to revisit" section listing `SAMPLE_LABEL_WRONG` findings — the
  ones where the shared truth itself looks wrong.
- A "ts-runtypes outlier candidates" section listing `TS_RUNTYPES_DIVERGENT`
  findings — feed into step 3.

Voice rules apply (plain language, no em-dashes, fenced code blocks over
inline ticks — see
[CLAUDE.md → Website docs style](../../CLAUDE.md#website-docs-style-container-websitecontent)).

### Step 3 — are WE the outlier?

The whole point of the audit, per the user's request: after every misalignment
has been classified, do an honest pass over the `TS_RUNTYPES_DIVERGENT` and
`SAMPLE_LABEL_WRONG` rows asking "is ts-runtypes the surprising one here, on
TS semantics alone?". Concretely:

- Treat the other four libraries as four independent witnesses; if zod,
  typebox, ajv, AND typia all accept a value and only ts-runtypes rejects it
  (and the TS type unambiguously allows it), that's evidence we're too
  strict.
- The reverse — only ts-runtypes accepts — is evidence we're too loose.
- Cross-check against the documented exceptions in
  [CLAUDE.md → validate contract](../../CLAUDE.md#validate-contract--serializable-data-only):
  non-serialisable members SHOULD silently drop, and we should NOT flag a
  consensus-disagreement on those as "we're the outlier". Bake that exception
  into the classifier so step 3 doesn't fire spuriously.

Output: a short "**Should we change anything?**" section at the END of the
report, with each candidate finding listed alongside:

- The exact ts-runtypes behaviour today.
- The consensus of the other libraries.
- A one-paragraph judgement: **NO** (keep current behaviour, and why) or
  **MAYBE** (worth a follow-up todo, with what to investigate).
- **NO code changes from this todo.** Anything in the MAYBE bucket gets its
  own follow-up todo with a clear scope — and that follow-up is the only
  place a behavioural fix may land. This todo's deliverable is the report,
  not the fix.

## Breaking scenarios to investigate first

Before writing any audit code, the first task is to **enumerate** the failure
modes the audit needs to handle. Seed list (the agent's first job is to
harden it by reading the shared cases and competitor case files):

- **`undefined` vs. missing property.** Most libraries treat them
  identically; some don't. ts-runtypes treats `{x: undefined}` and `{}` as
  the same for an optional `x`; verify across the suite.
- **`NaN` as a number.** ajv accepts by default unless `{type: 'number',
  not: {const: NaN}}` style guarding. ts-runtypes rejects. Likely a large
  `LIBRARY_SEMANTIC_DIFFERENCE` cluster on the `ATOMIC.number` and
  `FORMAT_NUMBER.*` cases.
- **`Infinity` / `-Infinity` as a number.** Same as `NaN`. ts-runtypes
  rejects; some libraries don't.
- **`new Date('invalid')`.** ts-runtypes rejects (`getTime() === NaN` gate).
  Other libraries may not have an analogous concept.
- **Symbol-keyed properties / function-valued properties.** ts-runtypes
  silently drops per the validate contract; other libraries may reject or
  require explicit modelling. This is the canonical
  `LIBRARY_SEMANTIC_DIFFERENCE` zone.
- **Extra unknown keys on objects.** zod accepts by default
  (`.strict()` opt-in); typebox is strict by default; ajv is permissive by
  default (`additionalProperties: false` opt-in); ts-runtypes is strict.
  Whole REJECT path of every object case is affected.
- **Tuple length mismatches.** Libraries differ on whether a too-long tuple
  is OK if the leading prefix matches.
- **Discriminated union narrowing.** Discriminator key, discriminator
  semantics differ across libraries.
- **String formats.** `Email`, `UUID`, `IPv4`, `Slug`, etc. Every library
  has its own regex; the same value may be accepted by one and rejected by
  another. The shared case samples were authored against ts-runtypes'
  regexes (see [`packages/ts-runtypes/src/formats/`](../../packages/ts-runtypes/src/formats/));
  this is the largest single `LIBRARY_SEMANTIC_DIFFERENCE` cluster
  predictably.
- **Numeric format bounds.** `int8` / `uint16` / `min` / `max`. Some
  libraries don't have fixed-width brands; ajv-style `{type:'integer',
  minimum, maximum}` is the closest analogue. Verify the competitor case
  files translate the brands faithfully.
- **Recursive / circular types.** ts-runtypes' Tarjan SCC handling vs each
  library's lazy / `z.lazy(...)` approach. Likely `AUTHORING_DRIFT` on any
  case that needed a manual lazy wrapper.
- **Template-literal types.** Most libraries have nothing equivalent;
  competitor entries are `NOT_SUPPORTED`. Verify those aren't masking an
  attempt that silently degrades.

## Concrete deliverables

- One script: `container-benchmarks/_audit/run-audit.mjs` (or whatever
  matches the existing competitor-script naming). Produces
  `results/alignment-misalignments.json`. Idempotent, reads the same
  `cases.ts` / `schemaCases.ts` the runtime bench reads.
- One driver: spawns one classification agent per misalignment, writes per-
  finding markdown into `container-benchmarks/_audit/findings/`. Concurrency-
  capped, resumable (skips files that already exist).
- One aggregated report:
  `docs/cross-library-validation-alignment-report.md`. Committed; the audit
  re-runs may overwrite it but the previous git revision is the audit
  history.
- Zero code changes to any library, any rewrite path, any plugin, or any
  competitor `cases.ts`. Everything the audit RECOMMENDS lands in
  follow-up todos.

## Open questions (decide before implementing)

1. **Should the audit run in CI?** Probably not — it spawns one agent per
   misalignment, the cost is non-trivial, and the output is a markdown report
   not a regression gate. Run it ad-hoc when investigating divergence;
   document the command in the report.
2. **How do non-JSON sample values get represented in the misalignment
   record?** A `NaN` is `{ "__special": "NaN" }` in JSON; same for
   `Infinity`, `BigInt`, `Symbol`, `Date('invalid')`, cycles. Need a small
   shared serialiser so the per-finding markdown files can display the
   sample faithfully. Lift the existing safe-stringify from
   [`packages/ts-runtypes/src/`](../../packages/ts-runtypes/src/) if there
   already is one; otherwise write a tiny one.
3. **What's the granularity per metric?** Today `getValidationErrors` is
   boolean-wrapped to `(value) => getErrors(value).length === 0` for
   measurement. The audit MAY want to inspect the actual errors returned
   (path, message, code), not just the boolean — that lets it catch
   "library returns 0 errors when it should return 3" cases the boolean
   wrapper hides. Probably worth doing for `getValidationErrors` even though
   it isn't symmetrical with `validate`.
4. **How does the audit handle `NOT_SUPPORTED`?** Currently
   `NOT_SUPPORTED` is treated as "deliberately skipped" and rendered "—".
   The audit should LIST every `NOT_SUPPORTED` case per competitor in the
   report's "documented divergences" section (it's the same kind of
   evidence as a `LIBRARY_LIMITATION` override) but it should not classify
   them as misalignments. They're already declared.
5. **What about `errored` / thrown builders?** A typia / typebox / etc.
   `createX` that throws at build time today shows as `errored`. The audit
   should record those alongside misalignments but classify them under a
   sixth bucket `BUILDER_THREW` because the cause is usually different (a
   library can't translate the TS type at all, vs. it ran but disagreed).
6. **Does the audit run on the suite as-is, or also on a `pnpm run bench` in
   `BENCH_NO_TIMING=1` mode?** Timing is irrelevant for the audit; the
   correctness checks the runner already does are exactly what we want.
   Almost certainly worth threading `BENCH_NO_TIMING=1` so the audit is
   cheap to re-run on every iteration.
7. **What about realworld cases?** `realworld/` cases are bigger and use
   richer types. They're the most likely to surface
   `LIBRARY_SEMANTIC_DIFFERENCE` clusters AND the most expensive to audit
   per case. Probably worth doing them last; let the cheaper validation +
   format-validation groups inform the bucket heuristics first.

## Documentation impact (when this lands)

- The committed report
  (`docs/cross-library-validation-alignment-report.md`) IS the
  documentation; the audit work and the docs are inseparable.
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — cross-link the report from
  the "validate contract" section so anyone wondering "where do non-
  serialisable drops come from" lands on the documented-divergences part
  of the report.
- [`container-benchmarks/README.md`](../../container-benchmarks/README.md)
  — one short section pointing at the audit script and the report.
- [`README.md`](../../README.md) — likely NOT; the audit is for maintainers,
  not the project pitch, until a "Should we change anything?" finding ships
  a behavioural change. Reassess after step 3.

## Not in scope here

- **Any behavioural fix to ts-runtypes** that the report's step-3 section
  recommends. Each goes into its own follow-up todo.
- **Any change to a competitor's case file.** `AUTHORING_DRIFT` findings
  inform a separate follow-up PR; the audit only RECOMMENDS the fix.
- **Any change to the shared case samples.** `SAMPLE_LABEL_WRONG` findings
  inform a separate follow-up PR; the audit only RECOMMENDS the fix.
- **Adding new competitors or new cases.** The audit reuses the existing 263
  cases + the existing 5 competitors 1:1. Anything new is its own todo.
- **The compile-time / format-serialization / small-screen bench items**
  parked in [`missing-benchmark-features.md`](missing-benchmark-features.md)
  — they're separate axes; this todo is correctness-only.
- **Fuzzy / property-generated samples.** The audit walks the EXISTING
  hand-authored sample sets; if a separate property-test pass is wanted, it
  belongs in its own todo (probably alongside the
  [`fuzzy-testing-for-golang-reconciliation.md`](fuzzy-testing-for-golang-reconciliation.md)
  effort but for the runtime validator surface).
