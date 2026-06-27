# Value-first schema type-checking cost

**Status: solved.** The value-first `createValidate(RT.…)` schema form used to
type-check more expensively than TypeBox (≈823 vs 546 TS instantiations/case,
apples-to-apples). Three fixes brought it to **≈208/case — below TypeBox** (full
suite: 165055 → 43515, **−74%**). The type-definition form `createValidate<T>()`
was always ≈0 and is unaffected. This doc keeps only what stays useful: the
guardrails protecting those fixes, and the methodology for any future type-cost
work. Reproduce the guardrail measurements with
`node benchmarks/typecost/isolated-experiment.mjs`.

## Guardrails — deliberate shapes, do NOT "simplify" them

Each looks more complex than necessary; each is shaped to avoid a specific,
measured instantiation cost. Re-simplifying silently reintroduces it.

1. **`ObjectType<C>` is tiered** ([src/schema/static.ts](../packages/ts-runtypes/src/schema/static.ts)).
   It probes the modifier profile and emits the leanest *exact* mapped type — a
   single homomorphic map for the common all-required object — falling to the 4-way
   `Pick`-group intersection ONLY when one field is optional AND another readonly.
   The flat 4-way runs all four passes on every object and compounds with nesting
   (collapsing it back is ~+70%). Every tier must recover the IDENTICAL type to the
   4-way — proven across modifier profiles in `isolated-experiment.mjs`.

2. **`CompTimeArgs<T>` is the identity `T`** ([src/markers.ts](../packages/ts-runtypes/src/markers.ts)),
   detected off the parameter's `CompTimeArgs<…>` annotation node, NOT a brand
   property (`comptimeargs.IsCompTimeArgsParamNode`, shared by the resolver scan and
   the pure-fn extractor). **Do not re-add `& {__mionCompTimeArgsBrand?: never}`** —
   intersecting that phantom brand onto a TUPLE parameter (the `tuple`/`union`/`func`
   member lists) costs ~700 instantiations per call. No cheap + faithful +
   resolved-type-detectable brand shape exists; identity + node detection is the
   resolution. (The nominal FORMAT brand `brand('UserId')` in `TypeFormat` is a
   separate mechanism and is untouched.)

3. **`union` fixed-arity overloads go to 8** ([src/schema/compose.ts](../packages/ts-runtypes/src/schema/compose.ts)).
   Direct `A | … | H` brands (no `infer`); 9+ fall back to recursive `UnionOf<T>`.
   The recursive build is ~25% costlier on the 8-arm case; overload resolution stops
   at the first matching arity, so narrower unions pay nothing for the wider ones.

When touching any of these, re-run the methodology below before keeping the change.

## Methodology — investigating / improving type-instantiation cost

Three gates, in order; a change ships only if all three pass.

**1. Faithfulness — runs first, mandatory.** The recovered value-first type must be
IDENTICAL to the type-first type (same keys, value types, optionality, readonly). A
cheaper instantiation count earned by WIDENING (to `unknown`/`any`) or narrowing is
a correctness regression, NOT a win — and `typecost.mjs`'s value-only forcing CANNOT
see it (any value is assignable to `unknown`). Gate it:
- Isolated design loop: [`benchmarks/typecost/isolated-experiment.mjs`](../benchmarks/typecost/isolated-experiment.mjs)
  asserts each candidate is mutually assignable with a hand-written expected type
  (`✗` = not faithful). Compare object forms with `Eq<Flat<A>, Flat<B>>`
  (`Flat<T> = {[K in keyof T]: T[K]}`) — it collapses the 4-way's empty-intersection
  padding while preserving readonly/optional exactly; plain mutual assignability
  misses readonly.
- Integrated oracle (recommended addition to `typecost.mjs`): assert the per-case
  type-form ≡ schema-form — the project already requires both to converge on one
  structural id, so divergence is a bug regardless of cost.

**2. Type-cost.** Per-case inner loop, then full suite:
```bash
RT_BENCH_DUMP=REALWORLD.order pnpm bench:typecost   # print the exact probe compiled
RT_BENCH_CASE=order           pnpm bench:typecost   # one construct, every form (no results rewrite)
pnpm bench:typecost                              # full suite, refresh results JSON
```
Rank by outliers (schema abnormally high in absolute terms, or a high multiple of
TypeBox); ignore cases already at/under TypeBox.

**3. Runtime throughput — always wins.** Type-check cost never trumps runtime perf;
they are independent concerns. Run the runtime bench after EVERY change:
```bash
RT_BENCH_CASE=order pnpm bench    # then full: pnpm bench
```
Decision rule: faithful AND typecost-improves AND runtime-flat-or-better → keep;
otherwise discard, even if the instantiation count dropped.

> **Blast radius.** A type-level change can reach further than expected — making
> `CompTimeArgs` identity broke pure-fn extraction at two marker-detection sites the
> resolver scan didn't cover. Run the full `pnpm test` (FE) **and**
> `go test ./internal/...`, not just the targeted tests, before considering a
> marker/scanner change done.
