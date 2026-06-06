# Demand-driven factory emission

> **⚠️ SUPERSEDED / REVERTED.** This feature (the `CompTimeRunType` schema-ref
> marker, the value-ref back-tracing, the `protocol.Demand` plumbing, and the
> demand-gated `RenderFnModule` walk) was **removed**. Factory emission is back to
> the pre-`bba7451` **emit-all** behaviour: every interned RunType the emitter
> `Supports` gets a factory. Schema-form validators are now a `createValidate` /
> `createGetValidationErrors` **overload** taking a `RunType<T>` first arg — reflecting
> `T` like the type-first marker, dispatching on the schema's runtime `.id` — with
> no ref-tracing and no demand. The over-emission this doc set out to fix is a
> known, accepted trade-off (re-introducing `Site`-driven gating, without
> ref-tracing, is a possible future optimisation). The design below is retained
> for historical context only.

**Implementation note, not a feature.** Describes how the precompiler
once decided *which* RT factories to generate, why that was
over-broad, and how it was made demand-driven (since reverted). The behaviour was
**correct** — it just generated (and bundled) far more than any project
uses. Nothing here changes the public API, the cache-key scheme, or the
schema/marker convergence work.

## TL;DR

For every cache module we render, we emit a factory for **every interned
RunType** (capability-gated, never usage-gated), and the runtime eagerly
wires **every family**. So a project that declares `M` runtypes and uses
`N` families pays ≈ `N × M` generated factories, regardless of which
`(family, type)` pairs it actually calls. We should instead collect the
set of `(family, typeId)` pairs that appear at real call sites and emit
only those (plus their per-family dependency closure).

## 1. How emission works today (as-built)

There are two independent dimensions, both over-generating.

### Dimension A — types: every interned RunType, capability-gated only

[`typefns.RenderFnModule`](../internal/compiled/typefns/module.go) builds
a family's cache module by walking the **whole** interned set:

```go
for _, runType := range dump.RunTypes {            // every interned id
    if runType == nil || !emitter.Supports(runType) { continue } // capability gate ONLY
    line, deps := renderEntryWithDeps(runType, …, "", nil)        // base factory: <tag>_<id>
    …
    for _, variant := range variantsByID[runType.ID] { … }        // variants from dump.Sites
}
```

- `dump.RunTypes` is **session-wide** — it accumulates every type any
  marker touched across the whole program. Every `RT.*` builder is itself
  a marker (trailing `InjectRunTypeId<…>`), so even a never-validated
  `const s = RT.object({…})` interns and gets factories.
- The only filter is `emitter.Supports(runType)` — a **capability**
  check ("can this family handle this kind?"), **not** a usage check
  ("did anyone call this family on this id?").
- [`render.go`](../internal/resolver/render.go) says it plainly:
  *"one factory **per cached RunType** the precompiler knows how to
  handle."*
- The only thing keyed off actual call sites is the **variant** fan-out
  (`collectValidateVariants(dump.Sites)`) — i.e. `ValidateOptions` tuples like
  `itNA_<id>`. Base factories are not call-site-driven at all.

### Dimension B — families: all eagerly wired

[`createRTFunctions.ts`](../packages/ts-go-run-types/src/createRTFunctions.ts)
initialises every family at module-eval with side-effecting calls (so a
bundler can't tree-shake them):

```ts
const _utils = getRTUtils();
initValidateCache(_utils);
initGetValidationErrorsCache(_utils);
initHasUnknownKeysCache(_utils);
// … 13 families …
initFormatTransformCache(_utils);
// Binary cache init lives in ./createBinary.ts so binary cache modules
// don't get pulled into bundles that never reference the binary enc/dec.
```

Each `initXCache` lives in a cache file (`./caches/validateCache.ts`, …)
whose body the Vite plugin replaces at build time with the fully-rendered
module via `dump({includeCacheSources: [kind]})`
([`index.ts`](../packages/vite-plugin-runtypes/src/index.ts),
`CACHE_KIND_BY_FILE`). Importing the marker package therefore pulls
**all** wired families, each rendered over **all** interned runtypes.

The split of the binary family into
[`createBinary.ts`](../packages/ts-go-run-types/src/createBinary.ts) is
the **one** existing concession to this problem: a manual, coarse,
family-level opt-out. It is the template for going finer-grained.

### Not a mitigation: lazy materialisation

`createRTFunctions.ts` notes factory closures are *"built lazily by
`materializeRTFn` on first `getRT()` lookup."* That defers building the
runtime **closure**, not generating the factory. The factory **code is
fully generated and bundled** either way; lazy materialisation only saves
a little startup CPU. It does not reduce generation work or bundle size.

## 2. Why it ended up this way

- **Schema forms weren't observable.** `createValidateFor` / `createValidationErrorsFor`
  are not markers (no `InjectRunTypeId` slot), so historically the scanner
  had no `(family, id)` signal for them — emitting per-interned-id sidesteps
  needing one. (As of the convergence work, the scanner *does* recognise
  these calls — see §3.1.)
- **The builder is family-agnostic.** A given `RT.object({…})` interns one
  type but carries no family; the same schema can feed validate, validationErrors,
  or json. So the type→factory mapping can't come from the builder alone.
- **Simplicity.** "Emit everything the checker interned" needs no demand
  graph and can't under-emit (which would throw at runtime). The cost is
  invisible until a project has many types and/or many families.

## 3. Proposed approach — collect `(family, typeId)` demand

Emit a base factory only for `(family, typeId)` pairs that appear at a
real call site, plus the per-family dependency closure of those types.

### 3.1 Collect the demand set (compile time)

A `(family, id)` is demanded wherever a `createX` is called. The signal
already exists at both call shapes:

- **Marker forms** (`createValidate<T>()`, `createGetValidationErrors<T>()`,
  `createJsonEncoder<T>()`, …): the scanner already resolves family + id
  directly — each is a marker with a Site.
- **Schema forms** (`createValidateFor(schema)`, `createValidationErrorsFor(schema)`,
  …): already recognised by
  [`isSchemaFormFactory`](../internal/resolver/scan.go) — the same
  parent-walk that
  [`schemaFormOptions`](../internal/resolver/scan.go) uses to fold
  options. The builder owns the id, so `(family, builderId)` is knowable
  at that site. (Family is read from the enclosing factory's name:
  `createValidateFor → it`, `createValidationErrorsFor → te`, etc.)

Output: a `map[family]set[typeId]` (or a `set[(family, typeId)]`) carried
on the `Dump`.

### 3.2 Close over dependencies (per family)

A validator references its children's factories by id — `it_<string[]>`
calls `it_<string>`. So a demanded `(it, string[])` requires `(it, string)`
too. `renderEntryWithDeps` already returns each entry's `deps`; seed the
worklist from the demand set and transitively pull in referenced child
ids **within the same family**. The closure is still vastly smaller than
`all-types × all-families`.

### 3.3 Emit from the closure, not from `dump.RunTypes`

`RenderFnModule` iterates `demandClosure[family]` instead of
`dump.RunTypes`. The `emitter.Supports` capability gate and the
`collectValidateVariants(dump.Sites)` variant fan-out stay exactly as they
are — they layer cleanly on top of the smaller base set.

### 3.4 Make the runtime wiring demand-driven too

Dimension B needs the same treatment or the bundle still pulls every
family. Options, roughly in order of effort:

1. Keep per-family cache modules but only wire the families a project
   uses — generalise the `createBinary.ts` split so each family's
   `initXCache` is reachable only through the `createX` entry point that
   needs it (so unused families tree-shake).
2. Have the plugin emit a single manifest of used families and gate the
   eager-init block on it.

The cache-key scheme (`it_<id>`, `itNA_<id>`, …) and `getRT(key)` lookups
are unchanged — we stop *emitting* unreferenced keys, not rename them.

## 4. Design points & edge cases

- **Under-emission must be impossible.** `resolveRTEntry`
  ([`createRTFunctions.ts`](../packages/ts-go-run-types/src/createRTFunctions.ts))
  throws when a key is missing and falls back to identity when a runtype
  is registered but its factory collapsed to a noop. Demand collection
  must be **complete** — every `createX`/`createXFor` site contributes —
  or a legitimate call will throw at runtime. The marker model is
  static-only (no reflective/dynamic id construction), so completeness is
  achievable, but this is the invariant to protect with tests.
- **Session-wide vs per-file.** `dump` is session-wide; the demand set
  must accumulate across **all** scanned files, and HMR invalidation
  (`handleHotUpdate`) must refresh it. A type used in file A but only
  validated in file B must still be demanded.
- **Capability gate still applies.** Demand says "wanted"; `Supports`
  still says "emittable for this kind." An unsupported demanded kind keeps
  its existing unsupported/`alwaysThrow` behaviour (see
  [UNSUPPORTED-KINDS.md](UNSUPPORTED-KINDS.md)).
- **Variants are already demand-driven.** `collectValidateVariants` reads
  `dump.Sites`, so option variants are *already* call-site-scoped — this
  change just makes **base** factories match that model.
- **Diagnostics provenance.** `buildProvenanceSites` maps id → marker
  sites for per-call-site diagnostics; it already has the call-site data
  the demand set needs, so the two can likely share a pass.

## 5. Non-goals

- No change to the cache-key naming or the `getRT` registry contract.
- No change to schema/marker id convergence
  ([SCHEMA-FORM-TYPEID-CONVERGENCE.md](SCHEMA-FORM-TYPEID-CONVERGENCE.md)).
- Not a new validator/serialiser family — purely *which* of the existing
  factories get generated and bundled.

## 6. How to verify when implemented

- A fixture that declares many runtypes but calls `createValidate` on a few:
  assert the rendered validate module contains factories only for the
  demanded ids + their dependency closure (not every interned id).
- A project that never imports a given family: assert that family's cache
  module is absent from the bundle (Dimension B).
- Round-trip: every existing JS suite must still pass — completeness of
  demand collection means no call site loses its factory.
