# Value-first schema type-checking cost vs TypeBox

**Status:** investigation notes (no fix proposed). Surfaced by the benchmark's
type-instantiation measurement ([`benchmarks/typecost/typecost.mjs`](../benchmarks/typecost/typecost.mjs)):
ts-go's value-first **schema form** costs noticeably more TypeScript
instantiations to resolve than TypeBox's `Static<>`. The current run reports
ts-go(schema) ~823 vs typebox ~546 instantiations/case (apples-to-apples over the
cases all forms support). The gap is **concentrated, not uniform** — e.g.
`REALWORLD.order` ts-go(schema) 3745 vs typebox 1531, `UNION.large_union_eight_arms`
4419 vs 703, `TUPLE.tuple_array` 1269 vs 86 — while TypeBox is in fact the
costlier form on index-signature / utility-type cases (e.g.
`OBJECT.index_signature_named_props` 1794 vs 4154, `UTILITY.partial` 561 vs 2028).
This document records _why_ ts-go is eager (from reading both implementations) and
how to attack the gap. ts-go's **type-definition form** (`createValidate<T>()`) is
~0 instantiations and unaffected — this only concerns the value-first
`createValidate(RT.…)` path.

## How TypeBox carries the type (cheap)

`@sinclair/typebox` keeps the schema's runtime type **shallow** and defers the
represented TS type to a **lazy phantom member**:

- `interface TSchema { …; params: unknown[]; static: unknown }`
  (`build/cjs/type/schema/schema.d.ts`).
- Each schema interface overrides `static`. For objects
  (`type/object/object.d.ts`):
  ```ts
  interface TObject<T extends TProperties> extends TSchema {
    static: ObjectStatic<T, this['params']>;   // ← not computed until read
    properties: T;
  }
  type ObjectStatic<T, P> = Evaluate<…Pick-groups over {[K in keyof T]: Static<T[K], P>}…>;
  ```
- `Type.Object(props)` returns `TObject<typeof props>` — parameterized by the
  **child schemas**, not by the represented type. Building the schema
  instantiates almost nothing.
- `Static<S> = (S & {params})['static']` (`type/static/static.d.ts`) — a plain
  **indexed access** that triggers `ObjectStatic` **once**, at extraction. The
  assembly is a single homomorphic mapped type + key-group filtering for
  `?`/`readonly`.

Net: building is ~free; the represented type is computed **once, lazily**, only
when `Static<>` is read.

## How ts-go carries the type (more expensive)

The value-first builders assemble the **full represented type eagerly** in the
builder's signature (`packages/ts-go-run-types/src/schema/compose.ts`):

```ts
function object<const C extends Record<string, unknown>>(
  config: CompTimeArgs<C>,
  id?: InjectRunTypeId<ObjectType<C>> // ← assembled type, reference #1
): RunType<ObjectType<C>>; // ← assembled type, reference #2
```

- `ObjectType<C>` (`src/schema/static.ts`) is the represented object type,
  assembled as a **4-way intersection** of `Pick` groups (the optional×readonly
  combinations — "TS can't apply `?`/`readonly` per-key in one homomorphic map").
- It is referenced **twice** per builder — in the return type **and** in the
  `InjectRunTypeId<…>` marker param — so TypeScript materializes it twice at
  **every** builder call, at every nesting level.
- The `config: CompTimeArgs<C>` param adds compile-time literal validation on top.
- `Static<RT> = RT extends RunType ? NonNullable<RT['__rtType']>['t'] : RT` is
  then a cheap read — the cost was already paid eagerly at the builder calls.

Net: both approaches assemble the same object type once conceptually, but ts-go
does it **eagerly, ×2 per call, plus literal validation**, while TypeBox does it
**lazily, ×1 at extraction** — which accounts for most of the gap.

## Two ways to optimize

The gap can be attacked from two independent angles. They are complementary — the
architectural path lowers the whole curve; the case-by-case path chips away at the
specific peaks. Either can be pursued without the other.

### Path A — architectural (lower the whole curve)

A single change to how every value-first builder carries its type, benefiting all
cases at once:

1. **Compute the represented type once.** `ObjectType<C>` is materialized in both
   the return type and the `InjectRunTypeId<…>` marker param; collapsing that to
   a single materialization would roughly halve the per-call cost.
2. **Adopt TypeBox's lazy-`static` shape.** Have builders return a shallow carrier
   parameterized by the child builders (à la `TObject<TProperties>`) and assemble
   the represented type once inside `Static<>` (à la `ObjectStatic`), instead of
   eagerly in every builder signature.

This is the higher-ceiling change but also the riskier one — see **The blocker**
below for why it isn't free.

### Path B — case-by-case (chip away at the peaks)

A targeted, empirical loop that needs no architectural change. The per-case data
shows the cost is concentrated in a handful of constructs (unions, tuples,
discriminated unions, deep nesting); each can be investigated and optimized in
isolation:

1. **Rank the outliers.** From a full `bench:typecost` run, list the cases where
   ts-go(schema) is _abnormally high in absolute terms_ or _multiples higher than
   TypeBox_ (e.g. `large_union_eight_arms` 4419 vs 703, `tuple_array` 1269 vs 86,
   `atomic_union` 1554 vs 120). Ignore cases where ts-go is already at/under
   TypeBox — those aren't where the budget goes.
2. **Localize the source for one case.** Use `BENCH_DUMP=<key>` to see the exact
   probe, then trace which builder / type-level helper drives the instantiations —
   typically a **bootstrap builder signature** (`compose.ts`), a **type-mapping**
   helper (`static.ts` — the `Pick`-group intersection, union distribution,
   tuple assembly), or a **comptime-args** validation (`CompTimeArgs<C>`).
3. **Optimize that one construct** — e.g. simplify a mapped/conditional type,
   avoid a redundant distribution, narrow a helper's generic surface — touching
   only what that case exercises.
4. **Re-measure that case on BOTH axes immediately** with `BENCH_CASE=<key>`
   (see below) — `pnpm bench:typecost` to confirm the instantiation count dropped,
   **and** `pnpm bench` to confirm the case's runtime throughput did not regress.
   Then move on. Commit per construct so each win is bisectable.

> **Guiding constraint — type-check cost never trumps runtime perf.** Type-checking
> cost and runtime validation throughput are independent concerns measured by
> independent harnesses, so **the runtime `bench` for the case is mandatory after
> _every_ change, not just the typecost run.** The decision rule is absolute:
>
> - typecost improves **and** runtime is flat-or-better → keep.
> - **typecost improves but runtime regresses (or correctness breaks) → discard the
>   change**, even though the instantiation count went down. A faster type-check is
>   never worth a slower or broken validator.
>
> This is why the per-case loop runs both axes ( `pnpm bench:typecost` _and_
> `pnpm bench` ) before any change is kept.

Because each iteration re-runs a single case across all libraries in seconds
rather than the full ~260-case suite, the `BENCH_CASE` flag is what makes this
loop practical (see next section).

## Per-case investigation workflow (`BENCH_CASE`)

`BENCH_CASE` is read by **both** harnesses — the typecost runner
(`benchmarks/typecost/typecost.mjs`) and the runtime runner
(`benchmarks/shared/harness/runner.ts`) — and forwarded into the container by
`scripts/benchmarks.sh`:

- **`BENCH_CASE=<substr>`** — restrict the run to cases whose dotted key contains
  the (case-insensitive) substring, measuring that case **across every library**.
  Under `bench:typecost` you see ts-go(schema) next to its TypeBox baseline; under
  `bench` you see the case's validate / validationErrors throughput per competitor.
  A filtered run prints to the console and **does not** rewrite the results JSON
  (nor aggregate or publish to `.docdata`), so it never clobbers the canonical
  full-suite results and is safe to run repeatedly mid-edit.
- **`BENCH_DUMP=<exact.key>`** — typecost-only: print the assembled, self-contained
  probe sources for one case (exactly what gets compiled) and exit; the starting
  point for localizing where a case's instantiations come from.

```bash
# the Path-B inner loop — one construct, both axes:
BENCH_CASE=large_union_eight_arms pnpm bench:typecost   # instantiation cost, every form
BENCH_CASE=large_union_eight_arms pnpm bench            # runtime throughput, every competitor

# see the exact probe TypeScript compiles for a case
BENCH_DUMP=UNION.large_union_eight_arms pnpm bench:typecost
```

`BENCH_CASE` substring-matches the dotted key, so `BENCH_CASE=union` sweeps every
union case and `BENCH_CASE=REALWORLD` re-checks the real-world DTOs after a change.
Run the **full** `pnpm bench:typecost` and `pnpm bench` (no `BENCH_CASE`) once at
the end of a change to refresh the results JSON and confirm the totals.

## The blocker (why ts-go is eager today — applies to Path A)

ts-go's value-first **convergence marker** `InjectRunTypeId<ObjectType<C>>`
deliberately materializes the concrete type at the call site so the value-first
typeId matches the type-first one (value-first and type-first must converge on
the same structural id). That materialization is exactly what forces eager — and
doubled — computation. TypeBox has no equivalent marker, which is _why_ it can
stay lazy. Any move toward laziness has to rework how the value-first marker
derives its id without forcing full type materialization at the builder call.

## Scope / priority

Low priority: the value-first form is the secondary authoring path. ts-go's
type-definition form already type-checks for ~0 instantiations (it beats every
schema library, including TypeBox), so this only narrows the gap for users who
prefer the `createValidate(RT.…)` value-first style.

Given that, **Path B (case-by-case) is the lower-risk first step**: it needs no
marker rework, each win is independently verifiable with `BENCH_CASE`, and the
outlier data above shows a handful of constructs account for most of the gap.
Path A (architectural) has the higher ceiling but is gated on the convergence
marker above — worth it only if Path B's incremental wins prove insufficient.
Implementation of either is **out of scope for this document** (investigation
notes only).
