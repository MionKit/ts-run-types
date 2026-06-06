# Slice 4 — atomic hashed-naming flip + JSON-composite-in-Go

Parent plan: `/root/.claude/plans/inherited-cuddling-nova.md` (§4–§5, "the atomic
flip"). Slices 1–3 are DONE and on the branch. This is the riskiest slice and
must land atomically (a half-flip mismatches scanner/emitter/runtime).

## Current state (after Slices 1–3 — do not redo)

- `internal/operations`: the registry + hashing. Use these, do NOT reintroduce
  tag-based keys:
  - `operations.FnHashFor(op, optionNames, strategy) string` — the entry's fhash.
  - `operations.PlainHash(name string) string` — default-variant fhash by op
    name (e.g. `PlainHash("isType")`, `PlainHash("prepareForJson")`).
  - `operations.ByFamilyTag(tag) (Operation, bool)` / `ByFnKey` / `ByName`.
  - `operations.DemandFor(fnKey, optionNames, strategy) []Demand{FamilyTag,
    VariantSuffix, Options, FnHash}` — currently returns ONLY primitive families
    for a JSON strategy; this slice ADDS the composite entry to it (see §3).
  - `FnHashLen = 4`; `init()` collision guard.
- `protocol.Site.Demand []SiteDemand{FamilyTag, VariantSuffix, Options, FnHash}`
  is populated by the scanner (`scan.go computeFnDemand`). Each entry's `FnHash`
  is the exact key prefix that entry must use after this flip.
- Emitter `collectFamilyDemand` already reads `Site.Demand`. Naming is STILL
  tag-based (`module.go` `innerPrefix`/`variantKey`/`variantFactoryName` =
  `settings.Tag (+suffix) + "_" + id`).
- Scanner `computeFnId` still returns the readable token via
  `constants.ResolveFnId`; the tuple injects that token.
- TS `createJsonEncoder`/`createJsonDecoder` (createRTFunctions.ts) still compose
  primitives at runtime via `lookupRTFn('pjs'|'pj'|'uku'|'sj'|'rj'|'ukuw', id)`.

## The flip (all of this lands together)

### 1. Emitter naming → fhash (internal/compiled/typefns)
- `innerPrefix`/`variantKey`/`variantFactoryName` (module.go ~81-103) must emit
  `<fhash>_<id>` (and `g_<fhash>_<id>` for the factory name), with the fhash from
  the registry, NEVER from `settings.Tag`. Recover the family's `Operation` via
  `operations.ByFamilyTag(settings.Tag)`.
  - Plain entry / family prefix: `operations.PlainHash(op.Name) + "_"`.
  - Variant entry (it/te): `operations.FnHashFor(op, demand.Options, "") + "_" + id`.
    The variant's option NAMES come from the `SiteDemand.Options` already carried
    in the demand — thread the demand's `FnHash` (preferred) or its `Options`
    into `renderEntry` so the ROOT entry is keyed by the variant fhash while
    child deps stay plain.
- `walker.InnerPrefix` (walker.go) = `operations.PlainHash(op.Name) + "_"` so
  same-family child dep calls (`walker.dispatch` `childID := InnerPrefix+rt.ID`)
  resolve to plain `<fhash>_<childid>`. This ALSO drives the cross-family gate in
  `recordCrossFamilyDep` (`HasPrefix(childID, InnerPrefix)`) — it stays correct
  by construction (an it-walker's own union edges start with its own fhash;
  foreign families' it-edges don't).

### 2. Cross-family `it_` references
- `json_prepare.go` `unionMemberIsTypeCheck` and `typeerrors.go` build the
  union-discriminator / child isType lookup name. Replace the literal `it_`
  (`constants.CacheModules["isType"].Tag + "_"`) with
  `operations.PlainHash("isType") + "_"`.
- `module.go` `CrossFamilyItRoots` strips `"it_"` to recover bare member ids;
  replace with stripping `operations.PlainHash("isType") + "_"`.

### 3. JSON composite codegen in Go (the new piece)
Today there is NO jsonEncoder/jsonDecoder cache entry. Add composite entries so
`createJsonEncoder`/`Decoder` become pure lookups:
- New emitters `JsonEncoderEmitter`/`JsonDecoderEmitter` (parameterized by
  strategy) + `typefns.JsonEncoderModule`/`JsonDecoderModule` + render.go
  wrappers + wire into the dump/scanFiles cache-source assembly (find where the
  other `renderXModule` are called and add these).
- Unlike the type-walking emitters, the composite emits a FIXED body per
  demanded `(id, strategy)` that looks up primitives by THEIR fhash
  (`operations.PlainHash(primOp)+"_"+id`) and wraps with native JSON. Bodies
  (faithful copies of createRTFunctions.ts:362-389,421-429):
  - `direct` → `return <sj>.fn(v)`
  - `stripClone` → `return JSON.stringify(<pjs>.fn(v))`
  - `clone` → `return JSON.stringify(<pjsp>.fn(v))`
  - `mutate` → `return JSON.stringify(<pj>.fn(v))`
  - `stripMutate` → `<uku>.fn(v); return JSON.stringify(<pj>.fn(v))`
  - decoder `preserve` → `return <rj>.fn(JSON.parse(s))`
  - decoder `strip` → `return <rj>.fn(<ukuw>.fn(JSON.parse(s)))`
  where `<pjs>` = `utl.getRT('<PlainHash("prepareForJsonSafe")>_<id>')` etc.,
  registered via the existing `registerRTLookup`.
- The composite entry is keyed `<FnHashFor(jsonEncoder|Decoder op, nil,
  strategy)>_<id>`. Its primitive deps are pulled into demand by the SCANNER
  (next item), so the composite body only references entries that already exist.
- `operations.DemandFor` for `AxisJsonStrategy` must now return the composite
  entry demand IN ADDITION TO the primitive families. The composite needs a
  `FamilyTag` that (a) routes to the composite emitter and (b) gives a distinct
  disk basename per strategy (two strategies of one type must not collide on
  `<id>/<tag>.json`). Simplest: per-strategy composite tags in
  `constants.CacheModules` (e.g. `jeSC/jeCL/jeMU/jeSM/jeDI`, `jdST/jdPR`) and map
  each to its emitter+strategy. Composites do NOT walk types, emit no `it_`
  edges, and must NOT be added to the cross-family it-source list.

### 4. Scanner → inject fhash (scan.go)
- `computeFnId` returns the injected fhash: for JSON the COMPOSITE fhash
  (`FnHashFor(jsonEncoder op, nil, strategy)`); for it/te the variant fhash; for
  leaf/binary the plain fhash. Replace `constants.ResolveFnId` usage with
  `operations.FnHashFor`. After this, `constants.ResolveFnId`/`CompFns`/
  `CompFnAxis` are unused → delete them.
- `rewrite.ts` is unchanged (injects `[id, fnId]`; fnId is now the fhash).

### 5. TS runtime (createRTFunctions.ts, createBinary.ts)
- `createJsonEncoder`/`createJsonDecoder` collapse to a single `resolveTupleEntry`
  lookup (the tuple's fnId is the composite fhash) — delete the strategy
  branching + all `lookupRTFn('pjs'|...)` primitive composition. Encoder fallback
  stays `jsonStringifyFallback`; decoder fallback `(s) => JSON.parse(s)`.
- Leaf/binary already do `(fnId ?? fallback) + '_' + id`; fnId is now an fhash so
  this works. Drop the dead static tag fallbacks (`?? 'tb'`, `?? 'fb'`, etc.).

### 6. Disk cache
- `internal/cache/disk/format.go` `FormatVersion` 2 → 3 (every cached key now
  embeds fhash; v2 is incompatible). Struct shapes unchanged.

## Gating & process (CRITICAL — order matters)
1. Build binary (`go build -o bin/ts-go-run-types ./cmd/ts-go-run-types`) and
   rebuild the plugin (`pnpm --filter vite-plugin-runtypes run build`) after src
   edits.
2. The JS serialization/validation suites (`pnpm test`) are the CORRECTNESS gate
   — they round-trip discriminated unions, recursive schemas, binary, and every
   JSON strategy through the REAL pipeline. Make these PASS FIRST. A missed
   cross-family concat surfaces as union round-trip failures here, NOT in a Go
   snapshot.
3. ONLY after `pnpm test` is green, regenerate the Go golden assertions in
   `internal/compiled/typefns/*_test.go` (module_test, module_disk_test,
   module_disk_crossfamily_test, cross_family_deps_test, walker_test, union
   tests) and `internal/resolver/atomic_test.go` (assert equality to
   `operations.FnHashFor(...)`, NOT a hardcoded hash string) to the new fhash
   keys, and update `packages/vite-plugin-runtypes/test/cache-disk.test.ts`
   (version 2→3; cache filenames are now per-strategy/fhash tags).
4. `go test ./internal/...` green; `pnpm test` green; `gofmt` + `pnpm run lint`
   clean; `pnpm exec prettier --check` only on changed TS files.

## Constraints
- No runtime hashing — Go computes every fhash; TS treats fnId as opaque.
- Do NOT commit — report the change set + test results for review.
