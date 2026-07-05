# Demand-driven function caches (`InjectTypeFnArgs` marker)

> _Resurfaced historical doc, kept as a record of implemented work. Project names have changed since: `ts-go-run-types` / `@mionjs/ts-go-run-types` is now `ts-runtypes`, the `vite-plugin-runtypes` plugin is now `runtypes-devtools`, and `reflectRunTypeId(value)` is now `getRunTypeId(value)`. Some paths and symbols below may since have been renamed, removed, or ported to Go._

> **Superseded (historical).** The readable family/variant-tag fnId scheme described below (`CompFns`, `MigratedFamilies`, `ResolveFnId`/`DemandsForFnId`, readable tokens like `itNL`/`stripMutate`) was later replaced by an **opaque precomputed `fnHash`** scheme: the `internal/cachegen/operations` registry as the single source of truth, structured demand on `protocol.Site.Demand`, and Go-emitted JSON-composite cache entries. See [CLAUDE.md](../CLAUDE.md) → "Two injection markers + demand-driven function caches" for the current model. The demand-driven *behaviour* this doc designed is still accurate; only the identity/naming scheme changed.

Status: **DONE** — every function family is demand-scoped (Slices A–D landed on
`claude/dreamy-cori-cT1be`: `106cfc1`, `2f971f8`, `258900d`, `7bb023f`,
`b0798ef`). A `getRunTypeId<T>()`-only file now emits zero function-cache
entries; each `createX<T>()` family cache contains only the types its call sites
request, with `val_<member>` seeded across families for union round-trips.
`go test ./internal/...` + `pnpm test` (85 files / 5856) green. Remaining polish
is in "Follow-ups" at the bottom. Execution tracked in the Task list.
Owner item: `docs/TODOS.md` §2 ("createValidate and other functions are not
parsing compiler options, instead they are generating all families at once").

## ⚠️ Critical finding (discovered during implementation)

`it` (validate) is a **shared cross-family runtime dependency**, so it CANNOT be
demand-scoped on its own:

- The JSON and binary **union decoders discriminate members at runtime via
  `val_<member>.fn(value)`** — see `unionMemberValidateCheck` in
  `internal/cachegen/typefunctions/json_prepare.go`. The call is guarded
  `(val_<member>?.fn(v) ?? true)`, so a **missing** `val_<member>` silently
  evaluates to `true` → the first union member always matches → wrong
  round-trip values (no error, just corrupt data).
- `validationErrors` (`te`) delegates child checks to `val_` too.

Consequence: if `it` is demand-scoped to only `createValidate` call sites, a file
that serializes a union via `createBinaryEncoder` / `createJsonEncoder` (but
never calls `createValidate` on it) loses the `val_<member>` entries its union
decoder needs. Verified empirically: demand-scoping `it`/`te` together turned
the serialization suite from 468→ green to 22 union/binary round-trip failures.

**Revised rule for `it` (cross-family edge following):** the `val_` references
other families emit are already in the code as closure-prologue lookups —
`registerRTLookup("val_<member>")` (`emitter.go:241`) emits
`const val_<member> = utl.getRT('val_<member>')`. The fix is to **promote those
cross-family lookups to tracked dependency edges** (a `CrossFamilyDeps` list on
the walker, kept distinct from same-family `RTDependencies` so the per-family
dangling cascade does not wrongly drop the referencing entry) and have the
demand-closure **follow those edges into the `it` family**. Then `it`'s demand
is exactly the `val_` members actually referenced while rendering the demanded
`te`/JSON/binary entries — minimal, not the coarse "it-closure of every
function-site type." Cross-family edges always use the **default** variant
(plain `val_`, no options), matching what `registerRTLookup` already emits.

This is the same dependency-driven emission we already have for same-family
`rtDependencies` (the worklist) and `pureFnDependencies` (resolver collect +
emit) — just extended across families. Prerequisite unchanged: every `createX`
must carry an `fnId` so each family is *seeded* by its own sites; the
cross-family edges then handle `it` in the final step. Until then `it` stays
all-emit (correct, just not yet minimal). The capture mechanism is specced
separately in **`docs/CROSS-FAMILY-RT-DEPS.md`** (delegated as a focused unit).

This reorders the rollout: **leaf families first, `it` last.**

## Problem (confirmed)

The function cache modules (`validate`, `validationErrors`, `prepareForJson`,
`toBinary`, … — every family except the `runTypes` reflection cache) are
emitted **for every interned `RunType`**, not for the types actually passed to
a `createX<T>()` call.

Root cause, two facts in the code:

1. `internal/cachegen/typefunctions/module.go` (`RenderFnModule`) iterates
   `for _, runType := range dump.RunTypes { renderRoot(runType) }` — it emits a
   factory for every interned type the emitter `Supports`. Call sites
   (`dump.Sites`) are consulted **only** by `collectValidateVariants`, and only to
   add option-variant entries (`itNL_`, `valNA_`) on top of the always-emitted
   base entries, and only for `validate`/`validationErrors`.
2. `internal/protocol/protocol.go` `Site` carries `File, Pos, ID, ParamIndex,
   ArgsCount, Options` but **no record of which `createX` function produced it**.
   The scanner (`scan.go`) matches the trailing `InjectRunTypeId<T>` brand
   generically and ignores the callee, so the backend cannot know a site wants
   `it` vs `tb` vs reflection-only.

Empirically confirmed: a file whose only marker call is
`getRunTypeId<{a: string; b: number}>()` (pure reflection — zero `createX`)
still emits 6+ entries in **every** function family (validate: 10, validationErrors: 6,
prepareForJson: 6, toBinary: 6, fromBinary: 6, …). None can ever be used.

The two invariants the user asserted already hold:
- one type-id per type (idempotency) — guaranteed by the structural-id → hash
  map in `cache.AssignID`.
- each type+param combo → unique function id — done for `ValidateOptions` via the
  variant suffix; the JSON `strategy` differentiates by family tag.

## Function → family is many-to-many

| function | family tag(s) |
|---|---|
| `getRunTypeId` / `reflectRunTypeId` / RT builders / `createMockType` | reflection (`t`) only — no function family |
| `createValidate` / `createGetValidationErrors` | `it` / `te` (+ `ValidateOptions` variant suffix) |
| `createHasUnknownKeys` / `createStripUnknownKeys` / `createUnknownKeyErrors` / `createUnknownKeysToUndefined` / `createFormatTransform` | `huk` / `suk` / `uke` / `uku` / `fmt` |
| `createJsonEncoder` | strategy: `direct`→`sj`, `stripClone`→`pjs`, `clone`→`pjsp`, `mutate`→`pj`, `stripMutate`→`pj`+`uku` |
| `createJsonDecoder` | strategy: `strip`→`rj`+`ukuw`, `preserve`→`rj` |
| `createBinaryEncoder` / `createBinaryDecoder` | `tb` / `fb` |

The JSON `strategy` is a `CompTimeArgs` literal — knowable at build time but
today read only at runtime (`createRTFunctions.ts`).

## Design (decisions taken)

- **New marker `InjectTypeFnArgs<T, Fn extends string>`** used by **every**
  `createX` factory's trailing slot. The transformer injects a tuple
  `["<typeId>", "<fnId>"]` instead of the bare `"<typeId>"` string.
  - `T` → the validated/serialised type (same structural-id hash as today).
  - `Fn` → the function/base-family key (`'val'`, `'verr'`, `'huk'`, …,
    `'jsonEncoder'`, `'jsonDecoder'`, `'binaryEncoder'`, `'binaryDecoder'`).
  - `fnId` → the **precise** compile-time selector computed by the transformer
    from `Fn` + the relevant `CompTimeArgs` literal: for single-family
    functions it is the cache tag incl. variant (`'itNL'`); for the two
    composite JSON functions it is the strategy token (`'stripMutate'`),
    expanded to its 1–2 cache families by a shared Go↔JS registry.
- **`InjectRunTypeId<T>` stays** for reflection-only sites (`getRunTypeId`,
  `reflectRunTypeId`, value-first builders, `createMockType`) → injects the
  bare `"<typeId>"` string → the `runTypes` reflection cache is unchanged
  (1:1 on shape, no options). **Scope of this work = function caches only.**
- The injected tuple is the complete demand: it tells the backend exactly what
  to emit AND gives the runtime the exact lookup key — removing today's
  duplicated key construction (Go derives the variant suffix into
  `Site.Options`; the JS runtime recomputes it via `buildVariantKey`).
- **Migration surface:** all 11 function factories move to `InjectTypeFnArgs`
  (`createValidate`, `createGetValidationErrors`, `createHasUnknownKeys`,
  `createStripUnknownKeys`, `createUnknownKeyErrors`,
  `createUnknownKeysToUndefined`, `createFormatTransform`, `createJsonEncoder`,
  `createJsonDecoder`, `createBinaryEncoder`, `createBinaryDecoder`). The
  reflection entry points stay on `InjectRunTypeId<T>` (`getRunTypeId`,
  `reflectRunTypeId`, value-first RT builders, `createMockType`).

## Prior art — the reusable template (`ValidateOptions` variants)

`createValidate` / `createGetValidationErrors` are the **only** functions that already
extract a compile-time arg at the call site to generate a *specific* variant
factory in the cache (distinct key + distinct body). This is the pipeline to
lift and generalise:

1. **extract** — `extractValidateOptions(call, lastIndex, argsCount)` reads the
   object literal in the slot before the id (`internal/compiler/resolver/scan.go:438`).
2. **record** — `Site.Options = options.Names()` (`scan.go:350`).
3. **registry** — `constants.ValidateOptions` + `ValidateVariantSuffix(names)` →
   `NL`/`NA`/`NLA` (`constants.go:141`); mirrored to TS as
   `buildValidateVariantSuffix` via `gen-ts-constants`.
4. **fan-out** — `collectValidateVariants(dump.Sites, supportsValidateVariants(emitter))`,
   gated to `ValidateEmitter`/`ValidationErrorsEmitter` (`module.go:302,72,426`).
5. **render per variant** — `renderEntryWithDeps(…, suffix, options)` → key
   `<tag><suffix>_<id>` (`itNL_<id>`); primes `walker.VariantOptions`
   (`module.go:330,518`).
6. **codegen branches** — `ctx.HasVariantOption("noLiterals")` changes the body
   (`emitter.go:136`; `istype.go:366,401`; `typeerrors.go:436,554`).
7. **runtime rebuilds the same key** — `createRTFunctionWithOptions` →
   `buildVariantKey(prefix, id, options)` (`rtUtils.ts:207`,
   `createRTFunctions.ts:209`).

What this template tells us:
- ✅ The **option** (variant within a family) is already comptime and drives
  emission — **lift it**: generalise `collectValidateVariants` →
  `collectVariants(familyTag)` and drop the `supportsValidateVariants` gate.
- ❌ The **family** (`'val'`) is hardcoded in the runtime wrapper and
  over-emitted — the `Fn` type-arg promotes it to comptime (the core fix).
- ♻️ Step 7 is a **duplication** — the runtime re-derives the variant key from
  the runtime options arg. Injecting the finished `fnId` lets the runtime read
  it from the tuple, collapsing the `createRTFunctionWithOptions` vs
  `createRTFunction` split + `buildVariantKey` into one path.

So the generalisation is: `extractValidateOptions` → a generic
"comptime fn-args → fnId" step (reuse the `comptimeargs` validator for
const-trace robustness), and `ValidateVariantSuffix` → one case of the shared
`(Fn, comptime-args) → fnId` registry.

**Alignment checkpoint — `createJsonEncoder`/`createJsonDecoder`.** These do NOT
use the template today (strategy is runtime-only). The test
`TestResolver_EncoderOptionsShareTypeID` (`internal/compiler/resolver/atomic_test.go:1077`)
pins "all strategy shapes share one type-id; runtime dispatches by family
prefix". Under "precise immediately" the **invariant stays** (strategy must not
fold into the type-id — it selects the family, not the id) but the dispatch
moves to comptime: update the test to keep the id-sharing assertion and add
per-site `fnId` assertions; do not delete it.

## Phased changes

**Phase 1 — shared registry + new marker (foundation)**
- `internal/constants/constants.go`: add the compile-function registry —
  `Fn` key → base tag + which `CompTimeArgs` axis refines it; and
  `(Fn, fnId) → []cacheFamilyTag`. Add `BrandInjectTypeFnArgs`.
- `cmd/gen-ts-constants`: mirror the registry to TS. `pnpm run gen:ts-constants`.
- `internal/compiler/marker/marker.go`: add `KindInjectTypeFnArgs` spec + brand; read the
  1st (`T`) and 2nd (`Fn`) type-args of the alias.
- `packages/ts-go-run-types/src/markers.ts`: add
  `export type InjectTypeFnArgs<T, Fn extends string> = …` (phantom brand).

**Phase 2 — scanner emits demand**
- `internal/compiler/resolver/scan.go`: when the trailing slot is `InjectTypeFnArgs`,
  read `Fn` + the relevant `CompTimeArgs` literal (ValidateOptions / strategy),
  compute the `fnId`, and record it on the Site. `protocol.Site` gains
  `FnId string` (empty ⇒ reflection-only `InjectRunTypeId` site).
- Preserve the value-first **schema overload** demand (dispatch on `rt.id`);
  add a recursive-schema regression test.
- `Site.Options` becomes redundant once `it`/`te` migrate (the `fnId` encodes
  the variant). Keep it during the phased rollout for back-compat; remove it in
  Slice D once every family reads `FnId`.

**Phase 3 — injection**
- `packages/vite-plugin-runtypes/src/protocol.ts` `Site` + `rewrite.ts`:
  function sites inject `["typeId","fnId"]`; reflection sites keep the bare
  string. Byte-offset Buffer path unchanged.

**Phase 4 — demand-driven emission (the fix)**
- `internal/cachegen/typefunctions/module.go`: replace the
  `for _, runType := range dump.RunTypes` seed with a worklist seeded by the
  sites whose `FnId` maps to the emitter's family (+ option variants), then
  transitively pull in referenced child factories via the `RTDependencies`
  each entry already reports. Generalise `collectValidateVariants` →
  `collectVariants(familyTag)`.
- **Back-compat:** empty/legacy demand (no sites carrying `FnId`) ⇒ today's
  all-RunTypes path, so the direct-`Dump{}` renderer unit tests
  (`module_test.go`, `union_flat_test.go`, `module_disk_test.go`) keep passing.

**Phase 5 — runtime dispatch**
- `createRTFunctions.ts` / `createBinary.ts`: every `createX` reads the
  `[typeId, fnId]` tuple, looks up the `fnId`-derived families directly (drop
  the `buildVariantKey` re-computation); JSON encoder/decoder expand
  `fnId`(strategy) → families via the shared registry.

**Phase 6 — tests, fixtures, docs**
- Update the `runtypes.d.ts` overlays (Go fixtures + JS inline helper) to
  declare `InjectTypeFnArgs`; add **paired static/reflect** tests per the
  CLAUDE.md marker-coverage rule; add a regression test asserting a
  `getRunTypeId`-only (and a single-`createX`) file emits **zero** entries in
  the non-demanded families; refresh `docs/UNSUPPORTED-KINDS.md` +
  `docs/ARCHITECTURE.md` (the marker now carries a function id).

## Rollout sequencing (slices)

Reordered after the cross-family finding above: **leaf families migrate first,
the shared `it` family last.** Each slice is green on its own; non-migrated
families ride the back-compat all-emit path so the tree stays correct.

- **Slice A — foundation + `te` (LANDED).** New marker `InjectTypeFnArgs<T, Fn>`
  + registry, scanner `Site.FnId`, `[id, fnId]` tuple injection, generalised
  demand-driven emission, runtime tuple-read for `createValidate`/
  `createGetValidationErrors`. Only `te` (a safe leaf) is demand-scoped; `it` and the
  rest stay all-emit. `createValidate` already injects `[id,'val']` and works
  against the all-emit `it` cache, so migrating `it` later is a one-line
  `MigratedFamilies` flip once the prerequisites are met.
- **Slice B — remaining single-family leaves.** Migrate
  `huk`/`suk`/`uke`/`uku`/`fmt` and `tb`/`fb` to `InjectTypeFnArgs` (no comptime
  variant axis — `fnId` = base tag) and add them to `MigratedFamilies`. All are
  leaves, so safe while `it` stays all-emit.
- **Slice C — JSON precise strategy.** `createJsonEncoder`/`createJsonDecoder`:
  read the `strategy` literal → `fnId` = strategy token → 1–2 families
  (`JsonStrategyFamilies`). Migrate + scope. Update
  `TestResolver_EncoderOptionsShareTypeID`.
- **Slice D — scope `it` + cleanup.** Builds on the cross-family-edge capture
  (`docs/CROSS-FAMILY-RT-DEPS.md`): compute the `it` demand as createValidate-site
  closure ∪ the `val_` edges discovered while rendering the other demanded
  families (minimal, default variant), then add `it` to `MigratedFamilies`. Then
  drop `Site.Options` + the `buildVariantKey` duplication; full
  zero-over-emission regression for `getRunTypeId`-only files; refresh `docs/` +
  `CLAUDE.md`. Canary: the serialization suite must stay green (union round-trip).

## Risks / watch-items
- Public marker API change — additive (new marker; `InjectRunTypeId` keeps its
  meaning for reflection), but every `createX` signature changes.
- Recursive value-first schemas passed to `createX` (emit id must match the
  runtime `rt.id` lookup) — preserve current behaviour, add a test.
- Unsupported-kind **Error** diagnostics currently fan out for every interned
  type; after the fix they fan out only for demanded `(family, type)` pairs —
  this removes spurious build-halting diagnostics for types only reflected,
  which is a correctness improvement to call out in the changelog.

## Task list (tracker)

Check items off as they land. Each slice ends green (`go test ./internal/...`
+ the plugin/marker JS suites) before the next begins.

### Slice A — foundation + `te` (LANDED)
- [x] A1 `internal/constants/constants.go`: `BrandInjectTypeFnArgs` (in marker.go),
  compile-function registry (`CompFns`, `JsonStrategyFamilies`, `FnDemand`,
  `ResolveFnId`, `DemandsForFnId`), `MigratedFamilies` + `IsFamilyMigrated`.
- [x] A2 `internal/compiler/marker/marker.go`: `KindInjectTypeFnArgs` spec +
  `DefaultInjectTypeFnArgsName` + brand; `FnKeyForInjectTypeFnArgs` reads the
  `Fn` type-arg (handles the optional-param `| undefined` union).
- [x] A3 `packages/ts-go-run-types/src/markers.ts`: `InjectTypeFnArgs<T, Fn>`
  (phantom brand — `string &` shape so the alias + type-args resolve).
- [ ] A4 `cmd/gen-ts-constants`: mirror the registry — **deferred to Slice C**
  (the `te`/leaf runtimes use the injected `fnId` directly; only the JSON
  strategy→families map needs mirroring).
- [x] A5 `internal/protocol/protocol.go`: `Site.FnId string`.
- [x] A6 `internal/compiler/resolver/scan.go`: detect `InjectTypeFnArgs`; `computeFnId`
  (+ `extractStrategyOption`) → `Site.FnId`; `enclosedByInjectionMarker` updated.
- [ ] A7 Preserve schema-overload demand (`rt.id`); recursive-schema test —
  **carried to Slice D** (matters once `it` is scoped).
- [x] A8 `packages/vite-plugin-runtypes/src/protocol.ts`: `Site.fnId?`.
- [x] A9 `rewrite.ts` `buildInsertion`: `[id, fnId]` tuple when `fnId` present.
- [x] A10 `internal/cachegen/typefunctions/module.go`: `collectFamilyDemand` +
  worklist-seed + transitive closure; back-compat all-emit path; gated by
  `MigratedFamilies` (currently `{te}`).
- [x] A11 `createRTFunctions.ts`: `createValidate`/`createGetValidationErrors` read the
  `[id, fnId]` tuple via `createTypeFnArgsFunction`.
- [x] A12 Go overlay (`inline_test.go`) declares `InjectTypeFnArgs` +
  `createValidate`/`createGetValidationErrors`; emitter tests demand via `createValidate`.
- [x] A13 `go test ./internal/...` green; `pnpm test` green (85 files / 5856).
- [x] A14 Regression `internal/compiler/resolver/demand_scope_test.go`: `verr_` scoped to
  `createGetValidationErrors`; reflection/`createValidate` files emit no `verr_`; `it`
  stays all-emit (guarded by `TestDemandScope_ItStaysAllEmit`).

### Slice B — single-family fan-out (`huk`/`suk`/`uke`/`fmt`, `tb`/`fb`) — `258900d`
- [x] B1–B5 Markers migrated (createRTFunction group reads the tuple; createBinary
  reads the tuple), `huk`/`suk`/`uke`/`fmt`/`tb`/`fb` added to `MigratedFamilies`,
  overlays + emitter tests switched to the matching `createX`, all green.
  NOTE: `uku`'s marker migrated here but the family was held for Slice C (shared
  with `createJsonEncoder(stripMutate)`).

### Slice C — JSON precise strategy — `7bb023f`
- [x] C1–C6 `createJsonEncoder`/`Decoder` read `[id, strategy]` tuple and derive
  the strategy from `tuple[1]`; `pj`/`pjs`/`pjsp`/`sj`/`rj`/`uku`/`ukuw` added to
  `MigratedFamilies`; `TestResolver_EncoderOptionsShareTypeID` keeps id-sharing +
  asserts per-site `fnId`; serialization suite (all strategies) green.

### Slice D — scope `it` via cross-family edges — `2f971f8` + `b0798ef`
- [x] D0pre Cross-family RT dependency capture (`renderEntryWithDeps` →
  `crossFamilyDeps`); see `docs/CROSS-FAMILY-RT-DEPS.md`.
- [x] D0 `CrossFamilyValRoots` renders the 14 non-`it` families (Store-bypassed) to
  collect `val_<member>` edges → seeds the `it` demand via `RenderOpts.ExtraRoots`;
  `"val"` added to `MigratedFamilies`. Also fixed a latent map-iteration
  non-determinism (now sorted) and a stale JS overlay (`inline.ts` createValidate
  on the old marker). Union/serialization canary green.
- [x] D3 `demand_scope_test.go`: reflection-only → no `val_`; `createValidate` →
  `val_`; `createBinaryEncoder<{a:bigint}|{a:Date}>`-only → `val_<member>` seeded
  cross-family.
- [x] D5 `gofmt`/`pnpm run lint` clean; `go test ./internal/...` + `pnpm test` green.

## Follow-ups — all completed

- [x] D0b Recursive value-first schema passed to `createX` — already covered:
  `packages/ts-go-run-types/test/adapters/circular.test.ts` asserts
  `createValidate(circularSchema) === createValidate<RecursiveType>()` (value-first id
  converges with type-first under demand-scoping), plus `composeBuilders.test.ts`
  validates a recursive linked-list. No new test needed.
- [x] D1 Removed the dead `Site.Options` + `collectValidateVariants` /
  `variantSuffixFromOptions` machinery across Go + JS (`d6a2e4b`). `buildVariantKey`
  kept (simplified to `(prefix,id)`; still used by `lookupRTFn` for plain lookups).
- [x] D2 Back-compat all-emit branch kept as the documented "no call-site demand"
  render mode (empty `dump.Sites`) for the typefns unit tests.
- [x] D4 Docs refreshed (`21725e5`): `CLAUDE.md` (two-marker + demand-driven note),
  `docs/ARCHITECTURE.md`, `docs/UNSUPPORTED-KINDS.md`.
- [x] Disk-cache + cross-family edges (`3eb5658`): `crossFamilyDeps` now persist in
  the RT disk cache (`disk.RTEntry.CrossFamilyRefs`, FormatVersion 1→2, structural-id
  drift validation); `CrossFamilyValRoots` no longer bypasses the disk cache.
