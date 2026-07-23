# Export compiled-fn data structs + fn-reconstruction API for consumers

**Status:** todo
**Created:** 2026-07-23

Consumers that ship compiled functions over the wire and rebuild them on the other side (mion
router → client is the concrete case) currently have to **reimplement** ts-runtypes' compiled-fn
data model and reconstruction, because the relevant types and helpers exist but are not part of
the public `@ts-runtypes/core` surface. Exporting a small, additive set lets them delete their
parallel structs and consume ts-runtypes as the single source of truth.

The full round trip a consumer needs is already implemented internally — it just isn't reachable:

```ts
// server: serialize the closure-free data form (already CompiledFnData-shaped)
// wire:   { typeName, fnID, familyTag, rtFnHash, args, defaultParamValues, isNoop, code, rtDependencies, pureFnDependencies }
// client: restore the factory from `code`, register back into the fn cache, then look up + call
const compiled = { ...wireData, createRTFn: buildFactoryFromCode(wireData.code) }; // CompiledTypeFn
getRTUtils().addToRTCache(compiled);                 // ← already public via RTUtils
getRTUtils().getRT(wireData.rtFnHash)!.fn(value);    // materialises + calls
```

## What to export from `@ts-runtypes/core`

1. **Compiled-fn types** (currently declared in `packages/ts-runtypes/src/runtypes/types.ts`, not
   re-exported from `src/index.ts`):
   - `CompiledFnData` — the serializable, **closure-free** wire form (`typeName`, `fnID`,
     `familyTag`, `rtFnHash`, `args`, `defaultParamValues`, `isNoop`, `code`, `rtDependencies`,
     `pureFnDependencies`).
   - `CompiledTypeFn` (`extends CompiledFnData`, adds `createRTFn` + `fn`) — the restored runtime
     form (also the argument type of the already-public `RTUtils.addToRTCache`).
   - `CompiledPureFunction` (+ `PureFunctionData`) and `CompiledFnArgs` — the pure-fn lane needs the
     same treatment (`getRTUtils().addPureFn` is public but takes an unexported `CompiledPureFunction`).

2. **Reconstruction helper** — `buildFactoryFromCode(code)` (and probably `entryCode(entry)`),
   currently `export function` in `runtypes/rtUtils.ts` but absent from `src/index.ts`. This is the
   `new Function('utl', code)` "restore the fn after deserialize" step; without it consumers
   hand-roll the same `new Function` call.

3. **(No new API needed for cache write-back)** — `RTUtils.addToRTCache(comp: CompiledTypeFn)`
   (rtUtils.ts:52) is already reachable via the exported `RTUtils` type (`RTUtils = typeof rtUtils`).
   It only *reads* awkwardly today because its `CompiledTypeFn` parameter type is unexported (#1).

## Also: runtime format-name constants (drizzle / consumer format mapping)

A consumer that maps a reflected property's format to something external (mion's drizzle extension
maps `prop.formatName` → a DB column) needs the **canonical format-name strings** ts-runtypes
stamps on reflected props (`uuid`, `email`, `date`, `dateTime`, `bigintFormat`, `stringFormat`, …).
Today ts-runtypes exposes `LeafFormatName` as a **type** only, so mion re-declares them as a runtime
`const FormatNames = {…}` and keys its mappers off that mirror. Export the canonical format-name
**runtime constants** (and confirm the reflected prop / `RunType` surfaces `formatName` +
`formatParams` at runtime) so consumers key off ts-runtypes directly and the mirror can be deleted.
Overlaps mion `docs/todos/formats-brandname-upstream.md`.

## Notes

- All of the above is **additive** (new exports of existing internals + one runtime constant table);
  no behaviour change, no fingerprint/hash impact.
- Downstream effect (mion PR #128, "Track B"): deletes `JitCompiledFn`/`JitCompiledFnData` and the
  whole parallel JIT type vocabulary in `packages/core/src/types/general.types.ts`, the
  `RtCacheEntry` mirror + `wrapRtEntry` reconstruction in `packages/core/src/runtypes/rtResolver.ts`,
  the `MionCompiledPureFn` mirror in `mionPureFns.ts`, and (with the format-name constants) mion's
  `FormatNames`/`FormatName` in `packages/core/src/constants.ts`. mion consumes `CompiledFnData` on
  the wire, `buildFactoryFromCode` + `addToRTCache` on the client, and the format-name constants in
  drizzle — no mion-side reimplementation.
