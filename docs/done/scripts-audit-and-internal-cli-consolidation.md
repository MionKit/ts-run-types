# scripts/ refactor + a single internal `rt` CLI

**Status:** implemented (this PR)
**Scope:** everything under `scripts/`, the root + per-package `package.json` scripts, the CI workflows, and the docs that reference them. No product code.
**Goal:** reorganize the flat 30-file `scripts/` pile into **area folders that mirror the repo's components**, front them with one internal CLI (`rt`), delete dead code, and collapse the ~100 package.json scripts down to the load-bearing set.

---

## TL;DR

- `scripts/` was 30 flat files whose names didn't map to areas (`benchmarks.sh` but `gen-bench-docs.mjs`; `podman-website.sh` was really *container image lifecycle*; `gen-*` mixed website-data, bench-data, and Go→TS mirrors; `lib-*` helpers sat next to entrypoints). "bench" meant three unrelated things.
- **Fix:** one folder per area — `core/ website/ container/ env/ release/ lib/` (with website/suite-data and website/bench-data) — each holding the scripts for that area, plus a single **`scripts/rt.mjs`** dispatcher (`pnpm rt <area> <command>`) over them. The folders mirror the `rt` verbs.
- **Root `package.json`: 103 → 23 scripts.** The `bench:*` / `website:*` / `podman-website:*` / `fuzz:*` / `dump:*` / suite-data `gen:*` aliases are gone; their behavior lives behind `rt` (or is inlined into the one script that used it). The load-bearing fundamentals (`test`, `check:builds`, `lint`, `check-format`, `format`, `build`, `typecheck`, the 3 Go→TS `gen:*`, `commit`, `changelog`, …) stay.
- **CI + the composite actions were repointed** to the new script paths in the same change; the full local gate (`go test`, `pnpm test` → 7677 passed, `lint`, `check-format`) is green, and the two coverage gates added earlier (codegen-drift + race-fuzz) ride along.
- **Dead code removed:** `bench-compile.mjs` + `bench-compare.mjs` (525 lines, zero callers), `pack-packages.sh` (orphan), and `website.sh`'s dead `cmd_prep` (checked `core`/`run-types` packages that don't exist here).

---

## The area structure

```
scripts/
  rt.mjs                     # the whole CLI: one dispatcher over the areas below
  setup-claude-web.sh        # standalone Claude-web bootstrap template (unchanged, must stay self-contained)

  lib/    rmrf.mjs           # generic helpers only

  core/                      # the engine: Go resolver + TS marker/plugin
    build.sh                 # freshness build (was check-stale-builds.sh)
    smoke.mjs
    gen-diagnostics-catalog.mjs  # Go→TS diagnostic-catalog mirror (+ cmd/gen-ts-constants, cmd/gen-run-type-kind)

  website/
    site.sh                  # dev/generate/smoke/verify-docs (was website.sh; cmd_prep dropped)
    build.sh                 # full production build w/ data (was website-publish.sh — it builds, ≠ deploy)
    serve.mjs   playground-overlay.mjs   # (overlay pair merged)
    suite-data/  export-validation.mjs  export-serialization.mjs  website-data.mjs
    bench-data/  bench.sh  gen-docs.mjs  gen-serialization.mjs   # benchmark runner + result->docs feeders

  container/  image.sh (was podman-website.sh)  lib.sh  ghcr.sh
  env/    check.sh  registry.sh (the RT_* contract)  load.mjs
  release/  publish.sh  preflight.sh  unpublish.sh  bump-version.mjs
            build-binaries.mjs  pack.mjs  publish-tarballs.mjs
```

**Design rule:** one `rt.mjs` is the command surface; the area folders are the work. Every leaf `spawn`s the same underlying script — `rt` never reimplements.

## The `rt` command surface

```
rt core     build | smoke | fuzz <suite> [--soak] | codegen [all|constants|kind|diag] [--check]
rt website  dev [--agent] | build [--no-bench|--quick|--ssr|--skip-playground] | preview | check [--docs]
rt bench    [--one <n>|--full|--website|--build-only] [--quick] | <audit|typecost|compiletime|serialization|smoke|…>
rt release  [--preflight-only|--no-website|--dry-run] | <preflight|npm|website|bump <v>|dists|binaries|pack|tarballs|unpublish>
rt container <build-image|ensure|login|push|pull|lock|clean>
rt env      [push-image|publish-npm|deploy-website|--create-env]
rt verify | rt fmt [--check] | rt clean [--deep]
```

- **No dev/watch loop** (dropped by choice): the core engine is tested with `pnpm test`; `rt core` is build/smoke/fuzz/codegen. (The old `dump-test-modules.mjs` debug tool was dropped — it imported a long-removed devtools export.)
- **`release` ⊃ `publish`:** a release is npm publish → then the site build → then deploy (deploy stays CI-only via wrangler). `rt release` orchestrates `rt website build` after the npm step, matching `publish.yml`'s job order. The site *build* stays a website capability (used standalone too); `release` only calls it.
- **codegen is core:** the Go→TS mirrors keep the TS packages in sync with the Go source, so they live in `core/` (e.g. `gen-diagnostics-catalog.mjs`, plus the `cmd/gen-*` Go generators). The website suite-data + bench-doc generators are *data feeders*, not codegen — they live in `website/suite-data/` and `website/bench-data/`.

## Design decisions (settled with the maintainer)

1. **Single `rt.mjs`**, not a `rt/<area>.mjs` module per area — the dispatch is thin; the area folders provide the separation.
2. **Area name `core`** for the engine (Go resolver + TS marker/plugin).
3. **Full CI repoint:** CI + the composite actions call the new script paths directly; the intermediate `bench:*`/`website:*`/`podman-website:*` aliases were dropped rather than repointed. `rt` is the human interface and is intentionally NOT in any workflow, so a CLI regression can never break the pipeline.
4. **Deleted** `bench-compile.mjs`/`bench-compare.mjs` (orphaned compile-cost harness) and **dropped** `website.sh cmd_prep`.

## Coverage gates carried in (from the original audit's bug list)

- **Codegen drift gate** — the 3 committed Go→TS mirrors are regenerated + formatted + `git diff --exit-code`'d in `ci.yml` (js-lint) and `release-gate.yml` (build). `pnpm rt core codegen all --check` is the local equivalent.
- **Race-fuzz gate** — `enrichRace` self-skips unless `RT_FUZZ_RACE=1`; a dedicated CI step (`RT_FUZZ_RACE=1 vitest run enrichRace`) now runs it in both gates. `pnpm rt core fuzz race` is the local equivalent.
- **Orphan/dead removed** — `pack-packages.sh`, `bench-compile.mjs`, `bench-compare.mjs`, `website.sh cmd_prep`.

## Verification

Local gate all green after the move: `go test ./internal/...`, `pnpm run lint` (oxlint over the new `scripts/*.mjs` + typecheck), `pnpm run check-format`, `pnpm test` (172 files / 7677 tests passed, 2 playground files skip without WASM assets), `pnpm rt core smoke`, `pnpm rt core codegen all --check`, and every moved `.sh` sources + dispatches correctly. Container-only flows (website/bench smoke) can't run without the prebuilt image locally; they are path-verified and the CI `smoke` job — now gated on `scripts/website/**`, `scripts/website/bench-data/**`, `scripts/container/**` — exercises them on this PR.
