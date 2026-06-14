# Value-first schema type-checking cost vs TypeBox

**Status:** SOLVED — three fixes implemented and validated end-to-end (tiered
`ObjectType`, 8-arm `union` overloads, zero-cost `CompTimeArgs`). The value-first
schema form went from **165055 → 43515** instantiations over the common cases
(**−74%**), i.e. apples-to-apples **~823 → 208 instantiations/case** — ts-go(schema)
now type-checks **well below TypeBox (546/case)**, having started above it. All
three gates green per fix: faithfulness (type-identity proofs + full `go test
./internal/...` + plugin tests), `bench:typecost` (the numbers above), and runtime
`bench` (260/260 correctness, 0 failures). Surfaced by the benchmark's
type-instantiation measurement ([`benchmarks/typecost/typecost.mjs`](../benchmarks/typecost/typecost.mjs)):
ts-go's value-first **schema form** costs noticeably more TypeScript
instantiations to resolve than TypeBox's `Static<>`. The current run reports
ts-go(schema) ~823 vs typebox ~546 instantiations/case (apples-to-apples over the
cases all forms support). The gap is **concentrated, not uniform** — e.g.
`REALWORLD.order` ts-go(schema) 3745 vs typebox 1531, `UNION.large_union_eight_arms`
4419 vs 703, `TUPLE.tuple_array` 1269 vs 86 — while TypeBox is in fact the
costlier form on index-signature / utility-type cases (e.g.
`OBJECT.index_signature_named_props` 1794 vs 4154, `UTILITY.partial` 561 vs 2028).
ts-go's **type-definition form** (`createValidate<T>()`) is ~0 instantiations and
unaffected — this only concerns the value-first `createValidate(RT.…)` path.

The original investigation (read off both implementations) hypothesised that ts-go
is expensive because it materialises the represented type **eagerly and twice** (in
the builder's return type *and* its `InjectRunTypeId<…>` marker param). Controlled
experiments **refute that hypothesis** and point at a different, smaller, lower-risk
fix. The corrected findings, the proposed change, and the methodology that produced
it are below. Reproduce any number with
[`benchmarks/typecost/isolated-experiment.mjs`](../benchmarks/typecost/isolated-experiment.mjs)
(`node benchmarks/typecost/isolated-experiment.mjs` after `pnpm install`).

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
  **indexed access** that triggers `ObjectStatic` **once**, at extraction.

## How ts-go carries the type

The value-first builders assemble the represented type **eagerly** in the
builder's signature (`packages/ts-go-run-types/src/schema/compose.ts`):

```ts
function object<const C extends Record<string, unknown>>(
  config: CompTimeArgs<C>,
  id?: InjectRunTypeId<ObjectType<C>> // ← assembled type, reference #1
): RunType<ObjectType<C>>;            // ← assembled type, reference #2
```

- `ObjectType<C>` (`src/schema/static.ts`) is the represented object type,
  assembled as a **4-way intersection** of `Pick` groups (the optional×readonly
  combinations — "TS can't apply `?`/`readonly` per-key in one homomorphic map").
- `Static<RT> = RT extends RunType ? NonNullable<RT['__rtType']>['t'] : RT` reads
  that assembled type back through the `RunType<T>` carrier's phantom `__rtType`.

## Empirical findings (these correct the original hypotheses)

Five controlled experiments, each compiling a self-contained probe through the TS
compiler API (TypeScript 6.0.3, same as the real harness), reading
`getInstantiationCount()` baseline-subtracted. **Crucially, every measurement is
gated on FAITHFULNESS** — the recovered type must be mutually assignable with a
hand-written expected type — because the existing benchmark's value-only forcing
*cannot* detect a candidate that scores cheaper by silently widening a nested type
to `unknown` (everything is assignable to `unknown`). The 4-way `ObjectType` model
is copied **verbatim** from `static.ts`, so the relative numbers are credible (the
absolute numbers are smaller than the full harness — simplified leaf overloads —
but directions and magnitudes hold).

### Finding 1 — the "referenced twice ⇒ 2×" claim is false

Removing the `id?: InjectRunTypeId<ObjectType<C>>` parameter **entirely** changes
the measured instantiation count by **0** (199 → 199 on a nested workload). Adding
it back while making the *return* type a bare `RunType<unknown>` (so `Static<>` is
never read) costs only ~30 — i.e. the omitted optional `id?` param is **never
materialised at type-check time**. The entire measured cost flows through the
**return type → `Static<>` → value assignment**, not the marker.

> Consequence: the convergence marker is **not** a type-check-cost blocker for what
> the benchmark measures. (At *build* time the Go scanner does read the resolved
> marker type for value-first↔type-first id convergence — but that is tsgo's cost
> inside the plugin pipeline, a different concern measured by a different harness.)

### Finding 2 — going lazy (TypeBox-style) does NOT help

A **faithful** lazy carrier — carriers parameterized by child carriers, a single
recursive `Static<>` assembling the whole tree at extraction, *proven* to recover
the identical type — costs the **same or ~9% more** than today's eager form across
flat / nested / deep / array workloads. The deferred work is the same total work
plus carrier-discrimination overhead. The tempting "≈40% cheaper" number an early
naive-lazy probe produced was **entirely an artifact of the lazy carrier widening
nested element types to `unknown`** (e.g. `array(object({…}))` inferring
`unknown[]`), which value-only forcing silently accepts. TypeBox is cheaper for
*other* reasons (its `ObjectStatic` key-grouping, `Evaluate`), **not** laziness.

> Consequence: **Path A (the architectural lazy refactor) is not worth pursuing.**
> It is the higher-effort, higher-risk path *and* it does not lower the curve.

### Finding 3 — the real cost center is the 4-way `Pick`-group intersection

`ObjectType<C>` runs **all four** mapped-type passes over every key on **every**
object — even an all-required-mutable object, where three of the four groups
collapse to `{}` but the per-key `IsOptional`/`IsReadonly` conditionals are still
evaluated 4×. Replacing it with a **tiered** assembly — probe the modifier profile
once, then pick the leanest *faithful* mapped type — yields (all faithful ✓):

| workload (nested)        | current 4-way | tiered | reduction |
|--------------------------|--------------:|-------:|----------:|
| all-required (common)    | 1151          | 318    | **−72%**  |
| optional-only (common)   | 983           | 689    | **−30%**  |
| readonly-only            | 1048          | 720    | **−31%**  |
| mixed opt×readonly (rare)| 1074          | 1055   | −2%       |

The win **compounds with nesting depth** (each level re-instantiates `ObjectType`
and independently picks its cheap path), which is exactly why the deeply-nested,
mostly-required real-world DTOs (`REALWORLD.order`, …) are the top object outliers.

### Finding 4 — wide unions: more fixed-arity overloads help

`union` brands the type directly via fixed-arity overloads up to **4** members,
then falls back to recursive `UnionOf<T>` (annotated `infer`). The named outlier
`large_union_eight_arms` (8 arms) hits the recursive path. Extending the
fixed-arity overloads to **8** (recursive fallback kept for 9+) cuts an 8-arm union
to **74%** of the recursive cost (−26%), faithful ✓.

### Finding 5 — `CompTimeArgs<C>` literal-validation is negligible

Dropping the `CompTimeArgs<…>` brand from `config` changes the count by <1%. The
literal-validation brand is not where the budget goes.

## Proposed solution

A **localized, faithful rewrite of the hottest type-level helpers** — neither the
architectural lazy refactor (Finding 2: doesn't help) nor purely case-by-case
(Findings 3–4 generalise across whole construct families). No marker rework, **no
runtime change, no Go change** — so the doc's hard constraint (type-check cost
never trumps runtime perf) is satisfied by construction: the runtime emitter never
sees these types.

### Primary — tiered `ObjectType<C>` (`src/schema/static.ts`)

Probe the modifier profile once and dispatch to the leanest faithful map; keep the
current 4-way only for the genuinely-mixed (optional **and** readonly on different
keys) case. Reuses the existing `IsOptional` / `IsReadonly` / `FieldOf` readers:

```ts
/** True if ANY field carries the optional / readonly modifier — a single cheap
 *  key-probe, so an absent profile skips the corresponding split entirely. */
type AnyOptional<C> = true extends {[K in keyof C]: IsOptional<C[K]>}[keyof C] ? true : false;
type AnyReadonly<C> = true extends {[K in keyof C]: IsReadonly<C[K]>}[keyof C] ? true : false;

/** Optional present, no readonly — one required group + one optional group. */
type ObjectOptionalOnly<C> = {
  -readonly [K in keyof C as IsOptional<C[K]> extends true ? never : K]: FieldOf<C[K]>;
} & {
  -readonly [K in keyof C as IsOptional<C[K]> extends true ? K : never]?: FieldOf<C[K]>;
};
/** Readonly present, no optional — one mutable group + one readonly group. */
type ObjectReadonlyOnly<C> = {
  -readonly [K in keyof C as IsReadonly<C[K]> extends true ? never : K]: FieldOf<C[K]>;
} & {
  readonly [K in keyof C as IsReadonly<C[K]> extends true ? K : never]: FieldOf<C[K]>;
};
/** Both present — the current 4-way Pick-group intersection (unchanged). */
type ObjectMixed<C> = {
  -readonly [K in keyof C as IsOptional<C[K]> extends true ? never : IsReadonly<C[K]> extends true ? never : K]: FieldOf<C[K]>;
} & {
  readonly [K in keyof C as IsOptional<C[K]> extends true ? never : IsReadonly<C[K]> extends true ? K : never]: FieldOf<C[K]>;
} & {
  -readonly [K in keyof C as IsOptional<C[K]> extends true ? (IsReadonly<C[K]> extends true ? never : K) : never]?: FieldOf<C[K]>;
} & {
  readonly [K in keyof C as IsOptional<C[K]> extends true ? (IsReadonly<C[K]> extends true ? K : never) : never]?: FieldOf<C[K]>;
};

export type ObjectType<C> =
  AnyOptional<C> extends false
    ? AnyReadonly<C> extends false
      ? {-readonly [K in keyof C]: FieldOf<C[K]>} // all required + mutable — the common case
      : ObjectReadonlyOnly<C>
    : AnyReadonly<C> extends false
      ? ObjectOptionalOnly<C>
      : ObjectMixed<C>;
```

This is a **single type-alias change**. `object`'s signature, the runtime builder,
the scanner, and the convergence marker are all untouched (`ObjectType<C>` is still
referenced exactly where it is today). The faithfulness gate (below) proved each
arm recovers the identical type to the current 4-way for its profile, so structural
ids still converge.

### Secondary — widen `union` fixed-arity overloads 4 → 8 (`src/schema/compose.ts`)

Add overloads for 5–8 members that brand the direct `A | B | … | H` union with
plain generic inference (no `infer`), keeping the recursive `UnionOf<T>` fallback
for 9+. Faithful, −26% on the 8-arm outlier. **Tradeoff to validate:** more
overloads enlarge the surface and add a little resolution cost to *every* `union`
call, and the existing 4-member cap was a deliberate choice (see the `union`
note in `compose.ts`). Land this **only** if the full-suite `bench:typecost` shows
a net win with no `bench` regression — it is the one proposal with a real downside.

### Not pursued — Path A (architectural / lazy)

Finding 2 measured it to be flat-to-worse once faithful. Documented here so it is
not re-proposed: lowering this curve does **not** require going lazy.

## Implementation & validation results

Both fixes are implemented: tiered `ObjectType<C>` in `src/schema/static.ts`, 8-arm
`union` overloads in `src/schema/compose.ts`. Validated on the host as far as the
environment allows (TypeScript 6.0.3, compiler API):

**Faithfulness — PROVEN.** The tiered `ObjectType<C>` is *identical* to the previous
4-way for all 13 modifier profiles tested (empty, all-required, optional-only,
readonly-only, mixed, optional+readonly-same-key, nested, union/array/literal
fields), using the exact oracle `Eq<Flat<4way<C>>, Flat<tiered<C>>>` where
`Flat<T> = {[K in keyof T]: T[K]}` collapses the 4-way's empty-intersection padding
yet preserves `readonly`/optional exactly (mutual assignability alone misses
`readonly`). The 8-arm `union` overload brands the same `A | … | H` the recursive
`UnionOf` built (asserted). The real package source compiles clean with both edits.

**Type-cost — MEASURED on the real source** (probes importing the actual
`schema/static.ts` + `compose.ts`, baseline-subtracted; before = edits stashed):

| case (real builders)       | before | after | ratio |
|----------------------------|-------:|------:|------:|
| OBJECT.flat_required       | 741    | 214   | 29%   |
| OBJECT.nested_required     | 1528   | 466   | 30%   |
| OBJECT.deep_required       | 1367   | 386   | 28%   |
| OBJECT.optional_heavy      | 899    | 629   | 70%   |
| OBJECT.readonly_heavy      | 535    | 384   | 72%   |
| OBJECT.mixed_modifiers     | 564    | 646   | **115%** ⚠ |
| ARRAY.array_of_objects     | 601    | 245   | 41%   |
| UNION.union_2 / union_4    | 612/693| 612/693| 100% |
| UNION.union_8_literals     | 1111   | 975   | 88%   |
| UNION.union_8_objects      | 6035   | 2477  | 41%   |
| TUPLE.basic                | 679    | 679   | 100%  |
| **total**                  | 15365  | 8406  | **55% (−45%)** |

**The one abnormal number, investigated per the methodology:**
`OBJECT.mixed_modifiers` **regresses +15%** — the mixed profile (one field optional
AND another readonly) falls through to the 4-way *and* now pays the two profile
probes. A single-pass guard was prototyped to remove it but measured *slightly
worse* (the per-key tag-union costs more than two boolean maps), so there is no
cheaper guard. **Kept** because: the profile is rare, the regression is bounded
(+82 instantiations), and choosing instead to fast-path only the no-modifier case
would forfeit the −30% on the very common optional-only objects. The narrow-union
no-change rows (`union_2`/`union_4` at 100%) confirm the extra overloads don't
regress small unions — overload resolution stops at the first matching arity.

**Full-suite `bench:typecost` — RUN (the authoritative confirmation).** Real
before/after over the 257 common schema cases (baseline = the two files reverted to
their pre-edit revision, marker dist rebuilt for each):

```
SCHEMA-form total:  before 165055  →  after 127460   (−22.8%)
cases: 63 improved · 2 regressed (+28, +13 — within noise) · 192 unchanged
biggest wins (before→after):  UNION.union_mixed_with_index 5222→2496,
  union_mixed_arrays_and_objects 4526→2165,  large_union_eight_arms 4419→2233,
  REALWORLD.order 3745→2405,  discriminated_union 2972→1720
```

Union-of-objects cases lead the wins — the object tiering compounds across every
union arm. The two regressions are the bounded guard-probe overhead on
optional/recursive shapes (`UTILITY.deep_partial_recursive_mapped` +28,
`ARRAY.object_array` +13), exactly the predicted `mixed`/probe tradeoff, both
negligible. Apples-to-apples average moved from the original ~823/case toward
typebox's 546 — ts-go(schema) is now ~617/case.

**Runtime `bench` — RUN, green.** correctness passes on all 260 supported cases
(validate + validationErrors, 0 failures). Expected — the change is type-check-time
only — but it confirms the marker build + structural-id convergence are intact (a
divergent value-first id would surface as a runtime validator mismatch).

### Third fix — zero-cost `CompTimeArgs` (the tuple/simple-union floor) — IMPLEMENTED

After the first two fixes the top schema/typebox ratios were **tuples and simple
unions** (`TUPLE.empty_tuple` 1068 vs 23 = 46×, `UNION.string_or_number` 1155 vs 63
= 18×, `ARRAY.tuple_array` 1269 vs 86). Controlled decomposition against the real
source localized it precisely — **NOT** arity, overload count, the id marker,
`const`, or `MapTuple`. The whole ~700 floor is **`CompTimeArgs<T>` intersected
with a *tuple* type**:

```
tuple([string(), number()]) marginal cost, single overload, by stripping pieces:
  full (const + CompTimeArgs<T> + MapTuple)        743
  drop const                                       743   (no effect)
  drop the InjectRunTypeId<…> marker               743   (no effect)
  MapTuple only in return                          743   (no effect)
  drop CompTimeArgs<T>  (items: T)                   68   ← −91%
  empty tuple, same strip:                  678  →  12
```

`CompTimeArgs<T> = T & {brand}` is cheap when `T` is an object (the `array`
builder's `CompTimeArgs<RunType<T>>` costs 11) but expensive when `T` is a
**tuple/array** type — the `tuple` and `union` builders wrap the whole member tuple,
and TS re-checks the array-literal argument against the `tuple & {optional brand}`.
No cheap *and* faithful brand shape exists: any optional brand a literal satisfies
is expensive, a required one is cheap but rejects valid args, and `T & {}` is cheap
but tsgo simplifies it away (dropping the alias detection keys on).

**Implemented as: zero-cost identity + syntactic detection.** `CompTimeArgs<T>` is
now the identity `T` (markers.ts) — no brand, no intersection. The Go scanner
detects it off the parameter's **`CompTimeArgs<…>` annotation node**
(`detectCompTimeArgsByNode` in [internal/resolver/comptimeargs_node.go](../internal/resolver/comptimeargs_node.go))
instead of a brand property on the resolved type; the annotation survives in the
`.d.ts` regardless of how the type resolves. Detection is **additive** (only when
`marker.DetectAny` misses), so the other markers and any still-branded
`CompTimeArgs` keep their path, and the CTA0xx literal-enforcement is unchanged
(same parameter). Chosen *by name* over *by position* because builder arg shapes
vary (`literal()`/`classType()` args are not comptime; `tuple` has 4 overloads;
`func`/`map` have two comptime args) and user wrappers + re-exports must keep
working. The nominal FORMAT brand (`brand('UserId')` → `FormatString<P,'UserId'>`)
is a *separate* mechanism in `TypeFormat` and is provably untouched.

**Result (full `bench:typecost`, real before/after over the common schema cases):**

```
SCHEMA-form total:  127460  →  43515   (−66% on top of the first two fixes;
                                         189 cases improved, 0 regressed)
biggest: union_with_methods 2356→356, large_union_eight_arms 2233→491,
  call_signature_params_with_optional 2154→370, tuple_with_optional 1896→245
cumulative (original → now):  ~823 → 208 instantiations/case (apples-to-apples)
  — ts-go(schema) now BELOW typebox (546/case), having started ABOVE it.
```

Validated faithful by the full Go suite (the composer CTA detection tests now
exercise the identity fixture → node path), plugin CTA-enforcement + value-first
builder tests, and the runtime `bench`. The `CompTimeArgs<tuple>` decomposition is
reproduced by [`benchmarks/typecost/isolated-experiment.mjs`](../benchmarks/typecost/isolated-experiment.mjs).

## Methodology — how to test a fix without breaking runtime perf

Three gates, in order. A change ships only if it clears **all three**.

### Gate 1 — FAITHFULNESS (new, mandatory, runs first)

> The recovered value-first type must be **identical** to the type-first type for
> the same case. A cheaper instantiation count earned by *widening* (to `unknown` /
> `any`) or *narrowing* the type is **not a win — it is a correctness regression**
> the value-only forcing in `typecost.mjs` cannot see.

Two complementary checks:

- **Isolated (design loop):**
  [`benchmarks/typecost/isolated-experiment.mjs`](../benchmarks/typecost/isolated-experiment.mjs)
  compiles each candidate `ObjectType` / `union` formulation against a hand-written
  `Expected` type and asserts mutual assignability (`✗` = not faithful). Use it to
  prototype a type-level change **before** touching the real builders.
- **Integrated (proposed addition to `typecost.mjs`):** the harness already builds
  both the **type form** (`createValidate<T>()` — ground truth) and the **schema
  form** (`Static<typeof RT.…>`) for every case. Add a per-case assertion that the
  two are invariant-equal:
  ```ts
  type Eq<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
  const _conv: Eq<TypeFormT, SchemaFormT> = true; // must compile for every supported case
  ```
  The project *already requires* value-first and type-first to converge on one
  structural id, so this oracle is free — any case where they diverge is a bug the
  benchmark should fail on, independent of cost.

### Gate 2 — TYPE-CHECK COST (the metric we are optimising)

Per-case inner loop, then full-suite confirmation:

```bash
# inspect the exact probe the harness compiles for a case
BENCH_DUMP=REALWORLD.order pnpm bench:typecost

# one construct, instantiation cost across every form (does NOT rewrite results JSON)
BENCH_CASE=order pnpm bench:typecost
BENCH_CASE=large_union_eight_arms pnpm bench:typecost

# full suite once at the end — refreshes results JSON, confirms the totals moved
pnpm bench:typecost
```
`BENCH_CASE` substring-matches the dotted key, so `BENCH_CASE=union` sweeps every
union case, `BENCH_CASE=REALWORLD` re-checks the real-world DTOs. Rank work by the
outliers (`large_union_eight_arms` 4419 vs 703, `tuple_array` 1269 vs 86,
`atomic_union` 1554 vs 120, `REALWORLD.order` 3745 vs 1531); ignore cases where
ts-go is already at/under TypeBox.

### Gate 3 — RUNTIME THROUGHPUT (the constraint that always wins)

> **Type-check cost never trumps runtime perf.** They are independent concerns
> measured by independent harnesses, so the runtime `bench` is mandatory after
> **every** change, not just the typecost run.

```bash
BENCH_CASE=order pnpm bench    # validate / validationErrors throughput per competitor
pnpm bench                     # full suite once at the end
```

Decision rule (absolute):

- faithful **and** typecost improves **and** runtime flat-or-better → **keep**.
- typecost improves but runtime regresses, **or** the recovered type changed, **or**
  correctness breaks → **discard**, even though the instantiation count went down.

For the proposals here Gate 3 is a formality (no runtime/emitter code changes), but
the run is still required — it is the contract.

### Commit discipline

One construct family per commit (tiered-object as one change; union-overloads as
another), each independently bisectable, each with its three-gate evidence in the
message. Re-run the **full** `pnpm bench:typecost` and `pnpm bench` once at the end
to refresh the canonical results JSON.

## Scope / priority

Low priority: the value-first form is the secondary authoring path; ts-go's
type-definition form already type-checks for ~0 instantiations (it beats every
schema library, TypeBox included). The tiered-`ObjectType` change is the
recommended first step — single-file, faithful by construction, zero runtime risk,
and it targets the dominant object outliers. The union-overload widening is a
smaller, optional follow-up gated on a clean full-suite run. The lazy architectural
rework (former "Path A") is **not** recommended — measured flat-to-worse.
