# Playground cache column blank — overlay package name missed the `@ts-runtypes/*` rename

**Status:** DONE (fixed 2026-07-08). Discovered while validating garble/WASM obfuscation;
NOT caused by garble.

## Symptom

In the browser playground the **generated caches** column rendered nothing ("no cache
generated"), while transform and generate-random-values worked. The node playground
engine tests failed **27 of 32** (e.g. `formats.test.ts` TF.email → `undefined`,
`optionalUnionConvergence.test.ts` → entryModules `''`). Both are the same symptom:
**empty `entryModules`** from the resolver `scanFiles` op.

## Root cause

The `@ts-runtypes/*` scope rename ([PR #191]) moved the marker package to
`@ts-runtypes/core`, and the Go marker scanner matches injection markers by the nearest
`package.json` `"name"` (`marker.DefaultModule = "@ts-runtypes/core"`,
[`marker.go`](../../ts-go-runtypes/internal/compiler/marker/marker.go)). But the playground
**source overlay builder** — [`scripts/website/playground-overlay.mjs`](../../scripts/website/playground-overlay.mjs)
— still staged the sources at `node_modules/ts-runtypes/` with `"name": "ts-runtypes"`.

So when the resolver scanned a snippet importing `@ts-runtypes/core`, the marker types
resolved into a package whose `package.json` name was the *old* `ts-runtypes` → the scanner
did not recognize `InjectRunTypeId` / `InjectTypeFnArgs` → no injection → empty
`entryModules` → the cache column had nothing to render.

The overlay builder is the single source of truth for **both** the browser overlay
(`runtypes-sources.json`) and the node test harness
([`nodeResolver.ts`](../../packages/ts-runtypes/test/playground/nodeResolver.ts)), which is
why the browser column and the node tests broke identically. The rename updated the tsconfig
paths and the engine but missed this builder.

## Fix

[`scripts/website/playground-overlay.mjs`](../../scripts/website/playground-overlay.mjs):
stage the overlay at `node_modules/@ts-runtypes/core/` with `"name": "@ts-runtypes/core"`.
The scoped name now (a) lets `@ts-runtypes/core` resolve by natural node resolution and
(b) matches `marker.DefaultModule`, so the markers are recognized. The `exports` map
(relative `./src/...`) was already correct.

## Verification

- `pnpm exec vitest run --project playground`: **27 failed → 32 passed** (all 4 files).
- The run executed against the **garbled** `.cache` wasm, so it also confirms the
  obfuscated wasm resolves correctly under Node.
- Browser overlay force-rebuilt + re-staged (the staleness gate watches `src`, not the
  builder, so the JSON was removed to force a rebuild).

## Follow-up (optional)

These tests skip in CI (they need a populated `.cache/rt-wasm/`), which is why the rename
regression went unnoticed. Consider populating `.cache/rt-wasm/` in a CI job so the wasm
engine gets functional coverage.
