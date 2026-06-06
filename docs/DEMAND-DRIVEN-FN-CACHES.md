# Demand-driven function caches (`InjectTypeFnArgs` marker)

Status: **ready to implement** — investigation complete and confirmed; design
decisions taken. Execution tracked in the Task list at the bottom of this doc.
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
- **Migration surface:** all 11 function factories move to `InjectTypeFnArgs`
  (`createIsType`, `createGetTypeErrors`, `createHasUnknownKeys`,
  `createStripUnknownKeys`, `createUnknownKeyErrors`,
  `createUnknownKeysToUndefined`, `createFormatTransform`, `createJsonEncoder`,
  `createJsonDecoder`, `createBinaryEncoder`, `createBinaryDecoder`). The
  reflection entry points stay on `InjectRunTypeId<T>` (`getRunTypeId`,
  `reflectRunTypeId`, value-first RT builders, `createMockType`).

## Prior art — the reusable template (`IsTypeOptions` variants)

`createIsType` / `createGetTypeErrors` are the **only** functions that already
extract a compile-time arg at the call site to generate a *specific* variant
factory in the cache (distinct key + distinct body). This is the pipeline to
lift and generalise:

1. **extract** — `extractIsTypeOptions(call, lastIndex, argsCount)` reads the
   object literal in the slot before the id (`internal/resolver/scan.go:438`).
2. **record** — `Site.Options = options.Names()` (`scan.go:350`).
3. **registry** — `constants.IsTypeOptions` + `IsTypeVariantSuffix(names)` →
   `NL`/`NA`/`NLA` (`constants.go:141`); mirrored to TS as
   `buildIsTypeVariantSuffix` via `gen-ts-constants`.
4. **fan-out** — `collectIsTypeVariants(dump.Sites, supportsIsTypeVariants(emitter))`,
   gated to `IsTypeEmitter`/`TypeErrorsEmitter` (`module.go:302,72,426`).
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
  emission — **lift it**: generalise `collectIsTypeVariants` →
  `collectVariants(familyTag)` and drop the `supportsIsTypeVariants` gate.
- ❌ The **family** (`'it'`) is hardcoded in the runtime wrapper and
  over-emitted — the `Fn` type-arg promotes it to comptime (the core fix).
- ♻️ Step 7 is a **duplication** — the runtime re-derives the variant key from
  the runtime options arg. Injecting the finished `fnId` lets the runtime read
  it from the tuple, collapsing the `createRTFunctionWithOptions` vs
  `createRTFunction` split + `buildVariantKey` into one path.

So the generalisation is: `extractIsTypeOptions` → a generic
"comptime fn-args → fnId" step (reuse the `comptimeargs` validator for
const-trace robustness), and `IsTypeVariantSuffix` → one case of the shared
`(Fn, comptime-args) → fnId` registry.

**Alignment checkpoint — `createJsonEncoder`/`createJsonDecoder`.** These do NOT
use the template today (strategy is runtime-only). The test
`TestResolver_EncoderOptionsShareTypeID` (`internal/resolver/atomic_test.go:1077`)
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
- `Site.Options` becomes redundant once `it`/`te` migrate (the `fnId` encodes
  the variant). Keep it during the phased rollout for back-compat; remove it in
  Slice D once every family reads `FnId`.

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

## Rollout sequencing (slices)

The six phases ship in four reviewable slices, each green on its own. Other
families ride the back-compat all-emit path until their slice lands, so the
tree stays correct throughout.

- **Slice A — foundation + `it`/`te`.** New marker + registry (Phase 1), scanner
  `FnId` for `it`/`te` (Phase 2), tuple injection (Phase 3), demand-driven
  emission generalised but only `it`/`te` migrated off the back-compat path
  (Phase 4), runtime for `createIsType`/`createGetTypeErrors` (Phase 5). This
  proves the whole vertical on the template family.
- **Slice B — single-family fan-out.** Migrate `huk`/`suk`/`uke`/`uku`/`fmt`
  and `tb`/`fb` (no comptime variant axis — `fnId` = base tag).
- **Slice C — JSON precise strategy.** `createJsonEncoder`/`createJsonDecoder`:
  read the `strategy` literal → `fnId` → 1–2 families. Update
  `TestResolver_EncoderOptionsShareTypeID`.
- **Slice D — cleanup + docs.** Drop `Site.Options` + the
  `createRTFunctionWithOptions`/`buildVariantKey` duplication; decide the fate
  of the back-compat all-emit fallback (keep as the documented "no-demand"
  render mode for unit tests, or remove); full zero-over-emission regression
  test; refresh `docs/` + `CLAUDE.md`.

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

### Slice A — foundation + `it`/`te`
- [ ] A1 `internal/constants/constants.go`: add `BrandInjectTypeFnArgs` + the
  compile-function registry (`Fn` → base tag + comptime axis; `(Fn, fnId) →
  []familyTag`) + a `ResolveFnId(fn, comptimeArgs) (fnId string, families
  []string)` helper.
- [ ] A2 `internal/marker/marker.go`: add `KindInjectTypeFnArgs` spec +
  `DefaultInjectTypeFnArgsName` + brand; surface both `T` and `Fn` type-args.
- [ ] A3 `packages/ts-go-run-types/src/markers.ts`: add
  `export type InjectTypeFnArgs<T, Fn extends string>` (phantom brand).
- [ ] A4 `cmd/gen-ts-constants`: mirror the registry; `pnpm run gen:ts-constants`.
- [ ] A5 `internal/protocol/protocol.go`: add `Site.FnId string`.
- [ ] A6 `internal/resolver/scan.go`: detect `InjectTypeFnArgs` trailing slot;
  read `Fn` + IsTypeOptions literal → `fnId` (`it`/`itNL`/…); set `Site.FnId`.
  Generalise `extractIsTypeOptions` into the shared comptime-args reader.
- [ ] A7 Preserve schema-overload demand (`rt.id`); add recursive-schema test.
- [ ] A8 `packages/vite-plugin-runtypes/src/protocol.ts`: add `Site.fnId?`.
- [ ] A9 `rewrite.ts` `buildInsertion`: emit `["typeId","fnId"]` when `fnId` is
  present; bare `"typeId"` string otherwise.
- [ ] A10 `internal/compiled/typefns/module.go`: generalise
  `collectIsTypeVariants` → `collectVariants(familyTag)` keyed on `Site.FnId`;
  worklist-seed from demanded roots + transitive `RTDependencies` closure;
  keep the no-`FnId` ⇒ all-RunTypes back-compat path; migrate only `it`/`te`.
- [ ] A11 `createRTFunctions.ts`: `createIsType`/`createGetTypeErrors` read the
  `[typeId, fnId]` tuple and look up `fnId + '_' + typeId` directly.
- [ ] A12 Update Go overlays (`inline_test.go`, `internal/testfixtures/*`) +
  JS inline helper to declare `InjectTypeFnArgs` for `it`/`te`.
- [ ] A13 Build binary; `go test ./internal/...` green; rebuild vite plugin;
  `pnpm --filter vite-plugin-runtypes test` + marker pkg tests green.
- [ ] A14 Regression: a `getRunTypeId`-only file emits **zero** `it_`/`te_`
  entries; paired static/reflect `createIsType` tests still pass.

### Slice B — single-family fan-out (`huk`/`suk`/`uke`/`uku`/`fmt`, `tb`/`fb`)
- [ ] B1 Migrate these factory signatures to `InjectTypeFnArgs<T, Fn>` (`markers`
  + `createRTFunctions.ts` / `createBinary.ts`).
- [ ] B2 Scanner: no comptime axis → `fnId` = base tag.
- [ ] B3 Emission: drop these families from the back-compat path (now demand-driven).
- [ ] B4 Runtime: these `createX` read the tuple (`createRTFunction` no-options path).
- [ ] B5 Overlays/tests/build green.

### Slice C — JSON precise strategy
- [ ] C1 Registry: `jsonEncoder`/`jsonDecoder` strategy → families (Go + TS mirror).
- [ ] C2 Scanner: read `strategy` CompTimeArgs literal → `fnId` = strategy token.
- [ ] C3 Emission: expand strategy `fnId` → 1–2 families for these two.
- [ ] C4 Runtime: `createJsonEncoder`/`Decoder` read `fnId`(strategy) → compose.
- [ ] C5 Update `TestResolver_EncoderOptionsShareTypeID` (keep id-sharing; add
  per-site `fnId` assertions).
- [ ] C6 Tests/build green.

### Slice D — cleanup + docs
- [ ] D1 Remove `Site.Options` + the `createRTFunctionWithOptions` /
  `buildVariantKey` duplication now subsumed by `fnId`.
- [ ] D2 Decide the back-compat all-emit fallback's fate (keep as documented
  no-demand render mode for unit tests, or remove + migrate those tests).
- [ ] D3 Full regression: `getRunTypeId`-only AND single-`createX` files emit
  zero entries in every non-demanded family.
- [ ] D4 Refresh `docs/UNSUPPORTED-KINDS.md`, `docs/ARCHITECTURE.md`, the
  CLAUDE.md marker section; flip this doc's status to `done`.
- [ ] D5 `pnpm run lint && pnpm run format`; final `go test ./internal/...`
  + `pnpm test` green.
