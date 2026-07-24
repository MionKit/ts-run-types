---
type: feature
spec: full-plan
status: done
created: 2026-07-23
---

# Export compiled-fn data structs + fn-reconstruction API for consumers

**Status:** shipped, in two parts. The compiled-fn structs + reconstruction API (below) landed as additive `@ts-runtypes/core` exports. The "Also:" format-name-constants follow-up was **split out** to [export-format-name-runtime-constants.md](./export-format-name-runtime-constants.md), corrected (its premise was off), and has now also shipped (a Go-generated `typeFormats` table). See the split section at the bottom.

Consumers that ship compiled functions over the wire and rebuild them on the other side (mion
router → client is the concrete case) currently have to **reimplement** ts-runtypes' compiled-fn
data model and reconstruction, because the relevant types and helpers exist but are not part of
the public `@ts-runtypes/core` surface. Exporting a small, additive set lets them delete their
parallel structs and consume ts-runtypes as the single source of truth.

The full round trip a consumer needs is already implemented internally — it just wasn't reachable:

```ts
// server: serialize the closure-free data form (already CompiledFnData-shaped)
// wire:   { typeName, fnID, familyTag, rtFnHash, args, defaultParamValues, isNoop, code, rtDependencies, pureFnDependencies }
// client: restore the factory from `code`, register back into the fn cache, then look up + call
const compiled = { ...wireData, createRTFn: buildFactoryFromCode(wireData.code) }; // CompiledTypeFn
getRTUtils().addToRTCache(compiled);                 // ← already public via RTUtils
getRTUtils().getRT(wireData.rtFnHash)!.fn(value);    // materialises + calls
```

## What shipped — exported from `@ts-runtypes/core` ✅

All additive re-exports of existing internals in `packages/ts-runtypes/src/index.ts`; no behaviour,
fingerprint, or hash change.

1. **Compiled-fn types** (from `runtypes/types.ts`): `CompiledFnData` (closure-free wire form),
   `CompiledTypeFn` (restored runtime form, also the argument type of `RTUtils.addToRTCache`),
   `CompiledPureFunction`, `PureFunctionData`, and `CompiledFnArgs`. Two tightly-related companions
   were surfaced alongside for a complete surface: `InitializedTypeFn` (the materialised `getRT`
   return type) and `AnyFn` (the default `Fn` param of `CompiledTypeFn` / `InitializedTypeFn`).
   - The `types.ts` `PureFunction` / `PureFunctionFactory` (plain non-generic fn types) were
     **deliberately NOT** re-exported: those public names are already taken by the unrelated generic
     brand markers in `markers.ts`. `CompiledPureFunction` references the `types.ts` versions
     internally, so consumers still get them structurally with no name clash.

2. **Reconstruction helpers** (from `runtypes/rtUtils.ts`): `buildFactoryFromCode(code)` (the
   `new Function('utl', code)` restore step), `buildPureFnFactoryFromCode(paramNames, code)` (the
   pure-fn-lane twin), and `entryCode(entry)` (read-or-derive the factory body).

3. **Cache write-back — no new API.** `RTUtils.addToRTCache(comp: CompiledTypeFn)` /
   `.addPureFn(key, comp: CompiledPureFunction)`, and `getRTUtils` / `getRTFnCaches`, were already
   public. They only *read* awkwardly before because their argument types (#1) were unexported.

**Tests:** `packages/ts-runtypes/test/features/publicCompiledFnExports.test.ts` — imports every new
symbol from the package barrel (`@ts-runtypes/core`, so the import itself pins public reachability)
and round-trips both lanes: the type-fn lane (`buildFactoryFromCode` → `addToRTCache` →
`getRT(hash).fn(value)` and `getRTFn(hash)`), `entryCode` verbatim (code mode) + derived (functions
mode), and the pure-fn lane (`buildPureFnFactoryFromCode` → `addPureFn`). Marker-shape rule doesn't
apply: the suite hand-builds entries and never calls a marker factory or `getRunTypeId`.

**Docs:** `docs/ARCHITECTURE.md` (the public compiled-fn data model + reconstruction paragraph,
closing the descoped **C1** from [mion-adoption-descoped.md](../done/mion-adoption-descoped.md)) and
the website pure-functions guide (`container/website/content/2.guide/8.pure-functions.md`, new
"Shipping compiled functions across bundles" section). The README is an intentionally minimal
overview and was left alone.

## Split out (now shipped): runtime format-name constants → [export-format-name-runtime-constants.md](./export-format-name-runtime-constants.md)

The original "Also:" section asked to export the canonical format-name **runtime constants** (so a
consumer like mion's drizzle extension can map `prop.formatName` → a DB column and delete its own
`FormatNames` mirror) and to confirm the reflected prop surfaces `formatName` + `formatParams` at
runtime. Investigation corrected two premises, so it became its own todo:

- `LeafFormatName` is **not** the runtime format-name set. It unions only the 10 leaf-brand
  discriminators (`stringFormat`, `numberFormat`, `bigintFormat`, `nativeDate`, 6× `temporal*`) and
  is missing exactly the string sub-formats a consumer keys off (`uuid`, `email`, `date`, `time`,
  `dateTime`, `ip`, `domain`, `url`). The real target is the `FormatAnnotation.name` **superset**,
  whose only source of truth is the Go per-format `Name()` methods.
- The runtime field is `RunType.formatAnnotation.{name, params}` (already public via the exported
  `RunType` + `FormatAnnotation`), **not** `prop.formatName` / `prop.formatParams`. So "confirm the
  runtime surface" is a confirm + document, no code change.

That work shipped via the split todo (Go codegen was chosen over a hand-maintained const): a
generated `typeFormats` runtime table + the `FormatName` union, exported from `@ts-runtypes/core`.

## Notes

- The reconstruction/structs export above is **additive** (new exports of existing internals); no
  behaviour change, no fingerprint/hash impact.
- Downstream effect (mion PR #128, "Track B"): deletes `JitCompiledFn`/`JitCompiledFnData` and the
  whole parallel JIT type vocabulary in `packages/core/src/types/general.types.ts`, the
  `RtCacheEntry` mirror + `wrapRtEntry` reconstruction in `packages/core/src/runtypes/rtResolver.ts`,
  and the `MionCompiledPureFn` mirror in `mionPureFns.ts`. mion consumes `CompiledFnData` on the
  wire, `buildFactoryFromCode` + `addToRTCache` on the client. The format-name constants (and mion's
  `FormatNames`/`FormatName` in `packages/core/src/constants.ts`) depend on the split todo.
