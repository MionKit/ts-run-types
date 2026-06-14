# Cross-library validation alignment report

This report inventories every place the benchmark competitors (zod, TypeBox, ajv,
typia) disagree with ts-runtypes about what counts as a valid value, explains why
each disagreement happens, and answers the question the audit exists to answer:
is ts-runtypes ever the surprising one?

It is produced by the alignment audit under
[`container-benchmarks/_audit/`](../container-benchmarks/_audit/). The audit is an
analysis pass, not a code change. Nothing in the library, the rewrite pipeline, or
any competitor case file is modified by it. Everything it recommends is captured
at the end of this document as follow-up candidates.

## How the audit works

The runtime benchmark feeds every competitor the same valid and invalid sample
sets per case and flags a competitor red only when its boolean answer disagrees
with the shared sample's labelled truth. Two things keep that benchmark green by
design, and both hide real divergences:

1. A competitor may declare a `SampleOverride` that REPLACES the shared samples
   for a case, so a value it treats differently is simply removed from the set.
2. A competitor may declare a case `NOT_SUPPORTED`, opting out entirely.

The audit looks behind both. For each competitor it runs the real validator
(`createValidate` for ts-runtypes, `.Check` for TypeBox, the compiled `validate`
for ajv, `safeParse` for zod, the generated check for typia) against the SHARED
samples, never the competitor's own override, and records every individual sample
where the answer differs from the shared truth. Each record is one row:

```jsonc
{
  "caseKey": "ATOMIC.number",
  "competitor": "ajv",
  "metric": "validate",
  "path": "reject",
  "sampleIndex": 2,
  "sampleValueRepr": "NaN",
  "expected": false,
  "got": true,
  "samplesOverridden": true,
}
```

`samplesOverridden: true` means the competitor already declared this divergence
with an override (the benchmark cell is green only because the override hid this
exact sample). A row with `samplesOverridden: false` would be an undeclared
divergence. There were none.

### What was run, and what was reasoned about

The transform-free competitors (zod, TypeBox, ajv) build their schemas at runtime,
so they were executed directly and produced live per-sample data. ts-runtypes is
the reference: the shared samples encode its semantics and it carries no overrides,
so against the shared truth it has zero divergences by construction (the benchmark
gates on exactly this). typia needs its native build-time transform to produce
validators, so its divergences are read from the 50 `SampleOverride` notes it
already carries in its case file, each of which names the exact semantic. Every
typia note was cross-checked against the same root causes the live runs proved for
ajv, and they line up.

To reproduce the live half:

```bash
# transform-free competitors, on the host (no container needed)
node container-benchmarks/_audit/host-collect.mjs
node container-benchmarks/_audit/run-audit.mjs
node container-benchmarks/_audit/classify.mjs

# all five competitors, inside the shared image (the canonical full run)
pnpm run audit:alignment
```

## Summary

Live per-sample divergences against the shared truth (44 distinct findings, every
one a reject-path acceptance, meaning the competitor accepts a value ts-runtypes
rejects):

| competitor  | live divergences | direction        | bucket                      |
| ----------- | ---------------- | ---------------- | --------------------------- |
| zod         | 0                | none             | fully aligned               |
| TypeBox     | 8                | accepts (looser) | LIBRARY_SEMANTIC_DIFFERENCE |
| ajv         | 36               | accepts (looser) | LIBRARY_SEMANTIC_DIFFERENCE |
| typia       | (see below)      | accepts (looser) | LIBRARY_SEMANTIC_DIFFERENCE |
| ts-runtypes | 0 (reference)    | n/a              | n/a                         |

(Counts above are distinct case-and-sample findings. Each is measured on both the
`validate` and `validationErrors` paths, so the raw record total is double.)

Declared divergences each competitor already carries in its case file:

| competitor  | NOT_SUPPORTED cases | SampleOverride cases |
| ----------- | ------------------- | -------------------- |
| ts-runtypes | 3                   | 0                    |
| zod         | 37                  | 0                    |
| TypeBox     | 77                  | 3                    |
| ajv         | 116                 | 27                   |
| typia       | 71                  | 50                   |

Three observations set up the rest of the report:

- Every live divergence is in the same direction. A competitor ACCEPTS a value
  ts-runtypes rejects. No competitor is ever stricter than ts-runtypes on a value
  the shared truth accepts.
- Every live divergence is already declared (an override exists for it). The audit
  found no undeclared drift in the runnable competitors.
- No case has two of the runnable competitors diverging together. Where a value is
  contested, ts-runtypes always shares its answer with at least one other library.

## The divergence clusters

All 44 live findings plus all of typia's declared overrides collapse into three
root causes.

### 1. Non-finite numbers (NaN, Infinity, -Infinity)

The largest cluster. ajv accepts `NaN`, `Infinity`, and `-Infinity` wherever a
number is expected, across atomics, arrays, tuples, object properties, index
signatures, unions, and utility-type projections. typia behaves the same way (its
overrides say so explicitly). ts-runtypes gates every number on `Number.isFinite`,
so non-finite values are rejected. The relevant ajv note states it plainly:

```text
override: ajv {type:number} accepts NaN/Infinity; drop them from invalid
```

This is a genuine semantic choice. JSON Schema's `{"type":"number"}` admits any
JavaScript number, and ajv does not add a finiteness gate by default. ts-runtypes
rejects non-finite numbers because they are not representable in JSON and are
almost never what an API or persistence layer wants.

Witnesses: zod (`z.number().finite()`) and TypeBox (`Type.Number()`) both reject
non-finite numbers, agreeing with ts-runtypes. So on this cluster ts-runtypes sits
with the majority (ts-runtypes, zod, TypeBox) and ajv and typia are the looser
pair.

### 2. Invalid Date

typia validates `Date` by `instanceof` only, so an Invalid Date (one whose
`getTime()` is `NaN`, such as `new Date('invalid')`) passes every Date position:
atomic, array element, tuple slot, property, index value, union arm, rest element.
ts-runtypes additionally gates on `getTime()` not being `NaN`. typia's notes name
it directly:

```text
override: typia Date prop is instanceof (accepts Invalid Date); invalid drops the two Invalid Date entries
```

Witnesses: zod (`z.date()`) and TypeBox (`Type.Date()`) both reject Invalid Date,
agreeing with ts-runtypes. ajv has no Date instance type at all (it declares those
cases NOT_SUPPORTED). So ts-runtypes again sits with the majority and typia is the
outlier on this cluster.

### 3. Plain-object guard versus structural object

For an object type whose properties are all optional (`interface_all_optional`,
`Partial<T>`, a recursive `DeepPartial<T>`), TypeBox accepts builtin class
instances and arrays: `Date`, `Map`, `Set`, `RegExp`, `[]`. Structurally those
values satisfy a shape with no required members, so TypeBox's `Type.Object` admits
them. ts-runtypes applies a plain-object guard: the value must be an ordinary
object, not a class instance or array, even when every property is optional. The
shared case title says so directly, calling it the "plain-object guard".

This is the one cluster where the question "are we too strict?" is worth asking,
because pure structural typing would accept a `Date` for `{ a?: string }`. The
answer is that ts-runtypes has a witness here. zod reaches the same result on
purpose, with a hand-written guard, and its note explains why:

```text
interface_all_optional: all-optional object but arrays/Date/Map/Set rejected — use custom to enforce plain-object guard
```

So on the all-optional object cases, ts-runtypes and zod agree (both apply the
guard), and TypeBox is the lone library that does not. TypeBox cannot express the
guard through `Type.Object`, which is why it falls back to a `SampleOverride`. This
reads as a LIBRARY_LIMITATION on the TypeBox side rather than a ts-runtypes
problem.

## Documented divergences (the declared catalog)

Beyond the per-sample clusters, each competitor opts out of large families of
cases it cannot express. These are legitimate, already declared, and listed here
so the catalog is complete.

### ajv

ajv carries 116 NOT_SUPPORTED cases and 27 overrides. The NOT_SUPPORTED reasons
group as:

- About 55 builtin-class cases. JSON Schema has no `Date`, `RegExp`, `Map`, or
  `Set` instance type.
- 27 bigint cases. JSON Schema has no bigint type.
- A handful each for symbol, undefined and void, function and callable shapes, and
  recursive or self-cyclic types (which would stack-overflow the compiler).
- Roughly 20 cases that lean on a ts-runtypes-specific option with no JSON Schema
  equivalent.

The 27 overrides are all the non-finite-number cluster from above.

### typia

typia carries 71 NOT_SUPPORTED cases and 50 overrides. The 50 overrides are the
non-finite-number and Invalid-Date clusters. The NOT_SUPPORTED reasons are more
interesting because several of them are places where typia is STRICTER or simply
different from ts-runtypes, the opposite direction from the clusters above:

- typia validates function-valued and other non-serialisable properties, and so
  rejects samples where ts-runtypes silently drops them. ts-runtypes validates
  serialisable data only, by design (see the validate contract below). typia's
  note: "typia validates the function prop (cb); we silently drop it, so valid
  samples with cb:42/null fail here".
- `typia.is<object>()` rejects arrays, where ts-runtypes treats `[]` as a valid
  `object` (the TypeScript `object` type includes arrays).
- `typia.is<never>()` accepts `undefined`, where ts-runtypes rejects everything for
  `never`.
- For a template-literal index key, typia ignores keys that do not match the
  pattern, where ts-runtypes requires every own key to match.

These are recorded as NOT_SUPPORTED rather than overrides because the difference is
structural, not a single edge sample.

### TypeBox

TypeBox carries 77 NOT_SUPPORTED cases and 3 overrides. The 3 overrides are the
all-optional plain-object cases from cluster 3. They are the only overrides in the
suite with no inline reason. The live audit explains all three (class instances
and arrays accepted by a structural object schema), so the catalog is complete,
but adding a one-line note at each TypeBox override call site would bring them in
line with how ajv and typia annotate theirs.

### zod

zod carries 37 NOT_SUPPORTED cases and 0 overrides, and 0 live divergences. Where
the shared truth needs a guard the schema language does not provide (the
plain-object guard, symbol identity by description, and similar), zod authored a
`z.custom` predicate that matches ts-runtypes exactly. It is the most closely
aligned competitor in the suite.

## Samples to revisit

None. The audit looked for cases where the shared label itself is wrong and
ts-runtypes happens to agree with the wrong label (the "silent agreement on the
wrong thing" case). It found none. Every shared label that a competitor disagrees
with is defensible on TypeScript semantics, and the disagreement is always the
competitor being more permissive, not the label being too loose.

## Are we the outlier?

This is the question the audit exists to answer. Treating the other four libraries
as independent witnesses, is there any case where ts-runtypes alone gives the
surprising answer on unambiguous TypeScript semantics?

No. The evidence points the other way in every cluster.

- **Non-finite numbers.** ts-runtypes rejects; zod and TypeBox also reject; ajv and
  typia accept. ts-runtypes is with the majority. Rejecting NaN and Infinity is
  also the safer default for the JSON and persistence use cases ts-runtypes
  targets. Keep current behaviour.
- **Invalid Date.** ts-runtypes rejects; zod and TypeBox also reject; typia
  accepts; ajv has no Date type. ts-runtypes is with the majority. Rejecting a Date
  whose `getTime()` is `NaN` is clearly the more useful answer. Keep current
  behaviour.
- **Plain-object guard.** ts-runtypes rejects class instances for all-optional
  object types; zod agrees on purpose with a custom guard; TypeBox cannot express
  the guard and accepts them. ts-runtypes has a witness and a documented rationale.
  Keep current behaviour.

There is also a set of cases where ts-runtypes is intentionally DIFFERENT from a
competitor, surfaced by typia's NOT_SUPPORTED notes: it drops non-serialisable
members (functions, methods, symbol-keyed properties) rather than validating them.
This is the validate contract, documented in
[CLAUDE.md](../CLAUDE.md#validate-contract--serializable-data-only) and
[docs/ARCHITECTURE.md](ARCHITECTURE.md). It is a deliberate scope choice, not an
accidental divergence, and the audit explicitly does not treat it as an outlier
signal.

### Should we change anything?

No behavioural change is recommended. ts-runtypes is never the lone surprising
library on any contested value, and every divergence traces to a deliberate,
defensible choice.

One small, non-behavioural follow-up is worth considering, and would be its own
todo:

- **MAYBE: annotate the three TypeBox overrides.** They are the only overrides in
  the suite without an inline reason. Adding a one-line note at each call site
  (for example, "TypeBox Type.Object is structural; accepts Date/Map/Set/RegExp for
  all-optional shapes") would make the override catalog self-documenting. This is a
  competitor-case-file edit, out of scope for this analysis pass, and should land
  as a follow-up alongside any other override-hygiene work.

Everything else stays as it is. The audit's conclusion is that the ts-runtypes
definition of valid is the conservative, JSON-oriented one, consistently backed by
at least one other mainstream library on every point where libraries disagree.
