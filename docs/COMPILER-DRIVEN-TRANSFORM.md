# Compiler-Driven Transform — Migration Spec

_Status: Draft spec (2026-06-19). Captures the target architecture agreed in design discussion. Not yet implemented; no investigation pending. Resume from here._

## Context

Today the transform pipeline is **Vite-plugin-centric**. The Go binary resolves types and renders cache-module content, but a meaningful amount of build logic lives in the JS plugin:

- [`rewrite.ts`](../packages/vite-plugin-runtypes/src/rewrite.ts) — applies byte-offset rewrites and the dedup import block; converts every resolver offset via `makeByteToChar` before indexing the JS string.
- [`edit-buffer.ts`](../packages/vite-plugin-runtypes/src/edit-buffer.ts) — the in-house `EditBuffer` that produces the real source map (ported from magic-string, `hires: 'boundary'`).
- Virtual-module emission — `virtual:rt/<key>.js` entries, the `virtual:rt/runtypes.js` data bundle, per-root facades.
- HMR — `handleHotUpdate` invalidates the data bundle when a scan reports `addedRunTypes`.

This couples RunTypes to Vite. It **cannot** run under plain `tsc`, esbuild/webpack/rollup standalone, Bun, Deno, or as a CLI pre-build step. The `makeByteToChar` conversion exists **only** because the resolver emits UTF-8 byte offsets while the plugin indexes a UTF-16 JS string — an impedance mismatch that disappears entirely if Go does its own rewriting in bytes.

**Goal:** make the Go compiler do the **entire** transform. Given a source file, Go returns `{ transformedCode, sourceMap }` and emits the shared cache modules as real files. Vite — and any other bundler — becomes a **thin wrapper**: call Go in `transform()`, return `{ code, map }`, and (dev only) trigger HMR. RunTypes then runs anywhere a build (or a pre-build pass) runs.

**Strategic driver:** the Go-compiler advantage is becoming table stakes (other type-driven tools are migrating onto tsgo too). The durable differentiation is the integrated transform plus portability, so decoupling from Vite is aligned with where the project should compete.

## Goals / Non-goals

**Goals**
- Go owns the full per-file transform: call-site rewrite + dedup import injection + entry-module bindings + source-map generation.
- Go emits the shared cache modules as **real files** in a **configurable** directory; default `node_modules/.cache/rt/`.
- The Vite plugin shrinks to a thin wrapper (transform call + dev HMR).
- Plugin-free usage works: a CLI / programmatic **TS → TS** pre-pass usable by `tsc`, Bun, Deno, esbuild, webpack, rollup.
- The user's source files on disk are **never** edited.

**Non-goals (for now)**
- Replacing `tsc` or emitting JS. RunTypes stays a TS → TS pre-processor; the user's toolchain still does TS → JS.
- Moving the cache into a user-source folder (`rt/types`). Deferred; the directory is configurable so this is a later switch, not a rewrite.
- Virtual-module output mode. Kept as a **future toggle**; this migration ships **real files only** (transparent to the user, gitignored under `node_modules/`, and the closest behavior to today's virtual modules).

## Hard invariants

These are non-negotiable and constrain every phase:

1. **Never edit user source on disk.** The transform is in-memory / in-pipeline. The injected import block and the per-call-site bindings exist **only** in the transformed output. The source map maps generated → the **pristine** on-disk original (editing the file would defeat the map). This is exactly how Babel/SWC/esbuild transformers behave.
2. **Dependency direction is generated → committed, never the reverse.** Generated cache modules may import committed files (e.g. enrichment); a committed file must never import a generated one. A fresh checkout with an empty cache dir must still typecheck, because committed source never references the cache (only post-transform output does).
3. **Persistent daemon preserved.** Do not spawn the binary per file. Keep the long-lived process over [`internal/protocol`](../internal/protocol/) and add a transform request; whole-program state (the dedup'd type graph, the app-wide data bundle) lives in the daemon, and each per-file transform rides that accumulated state.

## Current architecture (snapshot)

| Stage | Owner today | Notes |
| --- | --- | --- |
| Type resolution at call sites | Go binary (tsgo checker via tsgolint) | Unchanged by this migration. |
| Cache-entry rendering (validate/json/binary/…, reflection tuples) | Go binary | Unchanged. |
| Apply rewrites + dedup imports to a file | **JS** `rewrite.ts` | Moves to Go. |
| Source-map generation | **JS** `edit-buffer.ts` | Moves to Go. |
| Serve cache modules | **JS** plugin virtual modules | Becomes real files emitted by Go. |
| HMR invalidation | **JS** `handleHotUpdate` | Stays in the thin Vite wrapper (dev only). |

## Target architecture

```
  .ts source ──▶ Go daemon ──▶ { transformedCode, sourceMap }   (per file, in-memory)
                    │
                    └────────▶ cache dir on disk  (shared modules, real files)
                                 node_modules/.cache/rt/
                                   runtypes.js        (data bundle, kind 4)
                                   <rootId>.js        (per-root facade, kind 5)
                                   <fnHash>_<id>.js   (function entries)

  consumers (all thin):
    Vite plugin   → transform() returns {code, map};  dev HMR invalidation
    CLI / pre-pass→ TS→TS over a file set; downstream tsc/bundler compiles
    any bundler   → call the same transform request; native file resolution for the cache
```

| Stage | Owner (target) | Notes |
| --- | --- | --- |
| Per-file transform (rewrite + imports + bindings + map) | **Go** | New `Transform` protocol request. Bytes in, transformed bytes + standard source map out. No `makeByteToChar`. |
| Shared cache-module emission | **Go** | Real files written to the configurable cache dir; write-only-on-content-change. |
| Import specifier injection | **Go** | Computed relative path (default) or `#rt/*` subpath import (opt-in). Appears only in transformed output. |
| Cache-module resolution | **Bundler / runtime (native)** | Real files resolve natively; no per-bundler virtual-module shim. |
| HMR / watch invalidation | **Thin Vite wrapper (dev only)** | The only irreducible bundler-specific surface. Production builds and the CLI need zero plugin. |

### 1. Per-file transform moves into Go

Add a `Transform` request to [`internal/protocol`](../internal/protocol/): input is `{ filePath, sourceBytes, options }`; output is `{ transformedCode, sourceMap, emittedModules[] }` (the list of cache specifiers this file now imports / that were (re)written). The transform:

- applies call-site rewrites (`createValidate<T>()` → `createValidate(__rt_<fnHash>_<id>)`) and the single deduped import block at offset 0, all in **UTF-8 bytes** (the byte→char conversion is deleted);
- generates a standard source map by porting the `EditBuffer` boundary algorithm from [`edit-buffer.ts`](../packages/vite-plugin-runtypes/src/edit-buffer.ts) into Go (mechanical — the algorithm was already ported once from magic-string; credit/license header carries over).

Net effect: the offset protocol seam between Go and JS is removed; rewrite + map are tested by the Go suite alongside the resolver that produced the offsets.

### 2. Shared cache modules become real files

Go writes the app-wide modules currently served virtually — the `runtypes.js` data bundle (one row per node app-wide), the per-reflection-root facades, and the per-`<fnHash>_<typeId>` function entries — as real `.js` files into the cache dir. Content-addressing already guarantees immutability for entry modules; **write-only-on-content-change** keeps the dev watcher from looping, and only the data bundle is rewritten (on `addedRunTypes`), mirroring today's invalidation. The emit assembler is [`internal/compiled/entrymod/entrymod.go`](../internal/compiled/entrymod/entrymod.go); the runtime tuple contract stays [`packages/ts-runtypes/src/runtypes/entryTuple.ts`](../packages/ts-runtypes/src/runtypes/entryTuple.ts).

### 3. Import resolution

The injected import points at the cache via one of two mechanisms, both native (no bundler required):

- **Computed relative path (default, zero config).** Go knows the importing file's path and the cache file's path, so it emits a correct relative specifier per file (e.g. `../../node_modules/.cache/rt/runtypes.js`). Depth-independent because it is computed per file. Ugly but never read (it lives only in transformed output).
- **Subpath imports `#rt/*` (opt-in, clean).** A one-time package.json field maps `"#rt/*": "<cacheDir>/*"`; injected specifiers become `#rt/runtypes.js`. Resolved natively by Node, Bun, Deno, and `tsc` (`moduleResolution: nodenext`/`bundler`).

### 4. TS → TS output (portability + map chaining)

Go emits transformed **TypeScript**, not JS. The user's existing toolchain performs TS → JS and chains its source map onto Go's, so stack traces still resolve to the pristine original. This keeps RunTypes a tool-agnostic pre-processor consumable by `tsc`/`tsx`/Bun/Deno/any bundler.

### 5. Thin Vite wrapper

`vite-plugin-runtypes` reduces to: (a) in `transform()`, send the `Transform` request and return `{ code, map }`; (b) `handleHotUpdate` invalidation for the data bundle on `addedRunTypes` (dev only). `rewrite.ts` and `edit-buffer.ts` are deleted from the package. Its only runtime dep remains `ts-runtypes-bin` (the launcher; `getExePath()`).

## File & cache layout

- **Default cache dir:** `node_modules/.cache/rt/` — transparent to the user and already covered by the existing `node_modules/` entry in [`.gitignore`](../.gitignore), so no new ignore rule is needed.
- **Configurable:** a `cacheDir` option (binary flag + plugin option). A later switch to a user-source folder (e.g. `rt/types`, gitignored) is just a config change.
- **Separate from the resolver disk cache.** The persisted resolver cache (`/runtypes-cache.json`, fingerprinted via [`internal/cache/disk/fingerprint.go`](../internal/cache/disk/fingerprint.go)) is a different artifact and is unaffected.
- **Future committed surface (out of scope here):** `rt/enriched/` holds authored enrichment (`FriendlyType`/`MockData`), committed; `rt/types/` would hold generated modules if/when the cache moves into source. Invariant 2 keeps `types → enriched` one-directional.

## Migration phases

| Phase | Deliverable |
| --- | --- |
| **0. Protocol** | Add the `Transform` request/response to [`internal/protocol`](../internal/protocol/). Keep the daemon model. |
| **1. Rewrite + map → Go** | Port `rewrite.ts` (offset application, dedup import block, call-site bindings) and `edit-buffer.ts` (boundary source map) into a Go transform package. Delete `makeByteToChar`. Golden tests for output + map. |
| **2. Cache emission → disk** | Emit data bundle / facades / function entries as real files into `cacheDir`; write-only-on-content-change; inject computed-relative specifiers. |
| **3. Standalone transform / CLI** | A `ts-runtypes` subcommand (and/or programmatic API) under [`cmd/ts-runtypes/`](../cmd/ts-runtypes/) that runs the TS → TS transform over a file set for the plugin-free path. |
| **4. Thin Vite wrapper** | Rewrite `vite-plugin-runtypes` to call the `Transform` request + dev HMR only; remove `rewrite.ts` / `edit-buffer.ts`. |
| **5. Config** | `cacheDir`, `importStyle: relative \| subpath`; preserve existing `emitMode`, `moduleMode`, `inlineMode`. Regenerate the TS constants mirror via `gen:ts-constants` if constants change. |
| **6. Cleanup** | Remove dead JS, update tests + docs ([ARCHITECTURE.md](./ARCHITECTURE.md), [SETUP.md](../SETUP.md)), preserve the marker test-coverage rule (both `getRunTypeId` call shapes). |

## Configuration options

| Option | Default | Meaning |
| --- | --- | --- |
| `cacheDir` | `node_modules/.cache/rt/` | Where generated modules are written. Configurable; later switchable to a user-source folder. |
| `importStyle` | `relative` | `relative` (computed per file, zero config) or `subpath` (`#rt/*` via package.json `imports`). |
| `moduleOutput` | `files` | `files` now. `virtual` is a **future** toggle (plugin host serves modules instead of writing them). |
| `emitMode`, `moduleMode`, `inlineMode` | unchanged | Existing semantics preserved; `emitMode` still folds into the disk fingerprint. |

## Open questions / deferred decisions

Recorded for the resume, not to be investigated now:

- **Source-map chaining fidelity** across Go-transform → downstream `tsc`/esbuild (verify stack traces land on the pristine original through two transform steps).
- **Dev watcher feedback loop** for the real-file data bundle — enforce strict write-only-on-content-change so the tool's own writes don't retrigger the watcher.
- **Whether generated modules need `.d.ts`** for downstream typecheck. Likely not, since committed source never references the cache (invariant 2) and call-site types come from the marker package's declarations — confirm during Phase 2.
- **HMR parity** with today's `handleHotUpdate` once invalidation is driven by file writes/watch rather than `invalidate()`.
- **Cross-runtime resolution** validation (Node / Bun / Deno) for the chosen `importStyle`.
- **`virtual` output mode** as a per-consumer toggle (plugin host → virtual; plugin-free → files) — design later if real files prove insufficient.

## Verification

End-to-end checks once implemented:

- **Go suite** (`go test ./internal/...`): golden tests for the ported rewrite + source map; existing resolver/entrymod tests still green.
- **Plugin tests** (`pnpm test`, after rebuilding `bin/ts-runtypes`): the thin Vite wrapper still produces identical runtime behavior.
- **CLI smoke test:** transform a fixture TS → TS, compile with plain `tsc`, run the output, assert validators/codecs behave (proves the plugin-free path).
- **Source-map fidelity:** throw inside transformed code; assert the stack frame resolves to the original `.ts` line/column.
- **Fresh-checkout test:** empty `cacheDir`, run the build, assert it regenerates and the project typechecks (proves invariants 1 and 2).
- **Marker coverage rule:** keep paired tests for both `getRunTypeId<T>()` and `getRunTypeId(value)`, with at least one hash-equivalence assertion per suite.
