# Demand-driven function caches (`InjectTypeFnArgs` marker)

Status: **planned** — investigation complete and confirmed; implementation pending.
Owner item: `docs/TODOS.md` §2 ("createIsType and other functions are not
parsing compiler options, instead they are generating all families at once").

## Problem (confirmed)

The function cache modules (`isType`, `typeErrors`, `prepareForJson`,
`toBinary`, … — every family except the `runTypes` reflection cache) are
emitted **for every interned `RunType`**, not for the types actually passed to
a `createX<T>()` call.

Root cause, two facts in the code:

1. `internal/compiled/typefns/module.go` (`RenderFnModule`) iterates
   `for _, runType := range dump.RunTypes { renderRoot(runType) }` — it emits a
   factory for every interned type the emitter `Supports`. Call sites
   (`dump.Sites`) are consulted **only** by `collectIsTypeVariants`, and only to
   add option-variant entries (`itNL_`, `itNA_`) on top of the always-emitted
   base entries, and only for `isType`/`typeErrors`.
2. `internal/protocol/protocol.go` `Site` carries `File, Pos, ID, ParamIndex,
   ArgsCount, Options` but **no record of which `createX` function produced it**.
   The scanner (`scan.go`) matches the trailing `InjectRunTypeId<T>` brand
   generically and ignores the callee, so the backend cannot know a site wants
   `it` vs `tb` vs reflection-only.

Empirically confirmed: a file whose only marker call is
`getRunTypeId<{a: string; b: number}>()` (pure reflection — zero `createX`)
still emits 6+ entries in **every** function family (isType: 10, typeErrors: 6,
prepareForJson: 6, toBinary: 6, fromBinary: 6, …). None can ever be used.

The two invariants the user asserted already hold:
- one type-id per type (idempotency) — guaranteed by the structural-id → hash
  map in `cache.AssignID`.
- each type+param combo → unique function id — done for `IsTypeOptions` via the
  variant suffix; the JSON `strategy` differentiates by family tag.

## Function → family is many-to-many

| function | family tag(s) |
|---|---|
| `getRunTypeId` / `reflectRunTypeId` / RT builders / `createMockType` | reflection (`t`) only — no function family |
| `createIsType` / `createGetTypeErrors` | `it` / `te` (+ `IsTypeOptions` variant suffix) |
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
  - `Fn` → the function/base-family key (`'it'`, `'te'`, `'huk'`, …,
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

## Phased changes

**Phase 1 — shared registry + new marker (foundation)**
- `internal/constants/constants.go`: add the compile-function registry —
  `Fn` key → base tag + which `CompTimeArgs` axis refines it; and
  `(Fn, fnId) → []cacheFamilyTag`. Add `BrandInjectTypeFnArgs`.
- `cmd/gen-ts-constants`: mirror the registry to TS. `pnpm run gen:ts-constants`.
- `internal/marker/marker.go`: add `KindInjectTypeFnArgs` spec + brand; read the
  1st (`T`) and 2nd (`Fn`) type-args of the alias.
- `packages/ts-go-run-types/src/markers.ts`: add
  `export type InjectTypeFnArgs<T, Fn extends string> = …` (phantom brand).

**Phase 2 — scanner emits demand**
- `internal/resolver/scan.go`: when the trailing slot is `InjectTypeFnArgs`,
  read `Fn` + the relevant `CompTimeArgs` literal (IsTypeOptions / strategy),
  compute the `fnId`, and record it on the Site. `protocol.Site` gains
  `FnId string` (empty ⇒ reflection-only `InjectRunTypeId` site).
- Preserve the value-first **schema overload** demand (dispatch on `rt.id`);
  add a recursive-schema regression test.

**Phase 3 — injection**
- `packages/vite-plugin-runtypes/src/protocol.ts` `Site` + `rewrite.ts`:
  function sites inject `["typeId","fnId"]`; reflection sites keep the bare
  string. Byte-offset Buffer path unchanged.

**Phase 4 — demand-driven emission (the fix)**
- `internal/compiled/typefns/module.go`: replace the
  `for _, runType := range dump.RunTypes` seed with a worklist seeded by the
  sites whose `FnId` maps to the emitter's family (+ option variants), then
  transitively pull in referenced child factories via the `RTDependencies`
  each entry already reports. Generalise `collectIsTypeVariants` →
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

## Risks / watch-items
- Public marker API change — additive (new marker; `InjectRunTypeId` keeps its
  meaning for reflection), but every `createX` signature changes.
- Recursive value-first schemas passed to `createX` (emit id must match the
  runtime `rt.id` lookup) — preserve current behaviour, add a test.
- Unsupported-kind **Error** diagnostics currently fan out for every interned
  type; after the fix they fan out only for demanded `(family, type)` pairs —
  this removes spurious build-halting diagnostics for types only reflected,
  which is a correctness improvement to call out in the changelog.
