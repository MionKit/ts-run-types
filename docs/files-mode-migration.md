# Files-mode migration — status & pending work

> Living status doc for the "replace virtual modules with real files" rewrite.
> Status legend: ✅ done · ⚠️ partial · ⏸ deferred (tracked) · ❌ not started.

## Goal

Replace the plugin's **virtual modules** (`virtual:rt/*` served by the Vite
plugin's `resolveId`/`load`) with **real files written to disk**, so that:

1. **Cross-bundler resolution is native** — real files resolve everywhere, with
   no per-bundler virtual-module plumbing (esbuild `onResolve`/`onLoad`,
   `webpack-virtual-modules`, …). One unplugin-based plugin serves
   Vite/Rollup/webpack/Rspack/esbuild.
2. **HMR works** off a watched project folder.

The Go binary now has two jobs — **generate** cache modules to disk and
**transform** user files to import them — plus (eventually) a standalone CLI
pre-pass and build-time enrichment.

## What's an output, and its nature

| | **autogen modules** (`<outDir>/types/`) | **enriched** (`<outDir>/enriched/`) |
| --- | --- | --- |
| Author | machine | human (compiler scaffolds `@todo`, you fill) |
| Lifecycle | throwaway, rebuilt every build | durable asset |
| Committed? | no (gitignored) | yes |
| Must be on disk? | yes — bundler import targets | only the build reads them |

## Phase status

### Phase 1 — outDir resolution + config + VCS files — ✅ DONE
- `outDir` plugin option.
- tsconfig **srcDir inference** for the default (`<srcDir>/__runtypes`): rootDir
  (only when at or below cwd) → common-ancestor of the program's files →
  baseUrl → cwd. The resolved absolute path is echoed back to the
  dependency-free plugin via `Response.OutDir`. The `__` prefix keeps the
  generated tree clear of a hand-authored `runtypes/` source dir (the marker
  package itself ships one at `src/runtypes/`).
- Auto-writes `types/.gitignore` (`*`) + `enriched/.gitkeep`.
- **Collision guard** (`ensureOutDirAvailable`, internal/resolver/generate.go):
  generate refuses — hard error, no virtual fallback — to write into an output
  root that already holds non-RunTypes content (only `types/`, `enriched/`, and
  VCS markers are allowed), so a misconfigured `outDir` can never clobber real
  source. Covered by `TestGenerate_RefusesOutDirInUse`.
- The rootDir-within-cwd guard rejects `tsconfig.test.json`'s `rootDir: "../.."`
  (an emit-root signal, not a source-root one) so generated files don't land at
  the repo root.

### Phase 2 — `OpGenerate` writes `types/` to disk — ✅ DONE
- Reuses `collectEntryModules` / `entrymod.RenderGrouped`.
- Write-only-on-change (skip byte-identical files so a watcher isn't
  retriggered), live manifest (`Response.Generated`), stale-file GC (prune
  `*.js` not in the live set).

### Phase 3 — transform real-path specifier — ✅ DONE (deliberate divergence)
- The internal render format stays `virtual:rt/<key>.js`; it is rewritten to
  **relative on-disk paths at the resolver layer** (`relimports.go`) — post-render
  for inter-module imports, post-`Apply` for user code — rather than changing
  `transform.go`'s import block. This keeps the transform/entrymod golden
  corpus byte-stable.

### Phase 4 — flip the plugin to files — ✅ DONE (one sub-item intentionally skipped)
- `buildStart` generates the whole program to disk; `transform` injects relative
  imports; `resolveId`/`load`/dump machinery deleted.
- **Not done on purpose:** "drop virtual constants / regen the TS mirror" —
  `VIRTUAL_MODULE_PREFIX` etc. are retained because `virtual:rt` is still the
  internal render specifier (see Phase 3).
- Fixed the root-cause build-test failure: two plugin instances (the marker
  package's own vitest + a nested `build()`) defaulted to the **same** output
  dir with **different programs**, so one pruned the other's modules. Nested
  builds now use an isolated `outDir`. `build-rollup` rewritten for files-mode.

### Phase 5 — enrich-at-build + two-way dev sync — ⏸ DEFERRED (tracked)
- `packages/runtypes-devtools/docs/dev-sync-todo.md` holds the full design + test
  matrix.
- The `enriched/` dir + `.gitkeep` are scaffolded at build, but **no enrich
  generation/reconcile runs at build** — enrichment is still **CLI-driven**
  (`ts-runtypes gen`).
- ✅ **Reconcile core extracted to `internal/enrich/mirror`** — Phase 5's
  prerequisite is done. The cluster (reconcile/merge/orphan/splice/index/
  literalview, formerly ~15 tightly-coupled `package main` files) is now a pure,
  error-returning package: `Reconcile` / `Scaffold` / `PruneOrphanBlocks` /
  `ParseMirror` + the exported emission/path helpers. Every `fatal()` in the
  moved code became a returned error; the CLI keeps all disk I/O, stderr/stdout
  print, and `os.Exit`, feeding `mirror` via a `MirrorPathFor` closure (replacing
  the `enrichConfig` coupling) + an injected `readSource` callback (replacing the
  one mid-algorithm `os.ReadFile` in orphan judgement). The moved test suites
  pass unchanged.
- Still unstarted: `OpEnrichSync`, the type→enriched additive sync, and the
  enriched→HMR direction. Deferred per the locked "ship straightforward, harden
  later" decision.

### Phase 6 — incremental HMR + GC — ⚠️ PARTIAL
- ✅ Incremental **materialization** — write-only-on-change + content-addressed
  module names + stale GC. (This is what the plan defined "incremental from
  minute 1" to mean; tsgo has no incremental rebind, so the Program rebuild is
  always full.)
- ❌ Regenerate-changed-only on HMR — `handleHotUpdate` still does a
  **full-program** generate (re-renders all entry modules, writes only changed
  files). The render is not scoped; the write is.
- ❌ Batching HMR writes via `scan-batcher`.

### Phase 7 — cross-bundler real-build tests + cleanup + docs — ⚠️ PARTIAL
- ✅ Build tests on real files: `build-split` + `build-sourcemap` (real
  `vite build`), `build-rollup` (drives the `/rollup` entry hooks against real
  on-disk modules).
- ❌ Real `esbuild.build()` / `webpack` / `rspack` fixtures (the last two need
  heavy, release-age-gated devDeps).
- ⚠️ Docs: README how-it-works + components table updated to files-mode;
  ARCHITECTURE got a files-mode preamble on the rewrite-mechanics section. The
  exhaustive line-by-line ARCHITECTURE/SETUP pass is not done.

### Extra (a plan Risk, not a phase) — ✅ DONE
- Clear, actionable error when the output dir is unwritable (read-only FS /
  permission) — files-mode has no virtual fallback, so this is fatal and the
  user needs to know how to fix it.
- The marker package's own `__runtypes/` test-output tree is gitignored
  wholesale (and the cross-bundler build fixtures under `test/tmp-build-*/`).

## Architectural decisions & deviations (for the design discussion)

1. **Virtual modules are gone at the disk/plugin boundary, but `virtual:rt`
   survives as the internal render format**, relativized at the resolver layer.
2. **Default layout is `<srcDir>/__runtypes/{types,enriched}`** — a single
   `outDir` couples the throwaway `types/` and the committed `enriched/` (kept
   coupled by the settled-architecture decision below).
3. **Enrich is still entirely CLI-driven** — the "at every build start" part is
   not wired.
4. **HMR re-renders the whole program** each edit (writes are incremental, the
   render is not).

## Output layout — decided (keep current architecture)

The layout was discussed and **settled: keep the current design.** Autogen and
enriched stay co-located under a single in-source-tree output root,
`<srcDir>/__runtypes/{types,enriched}`. The single `outDir` option is retained
(not split into `typesDir` + `enrichedDir`); autogen stays gitignored, enriched
stays committed. The `runtypes` → `__runtypes` rename — the `__` prefix plus the
collision guard — is what makes the in-source-tree layout safe (no clash with a
hand-authored `runtypes/`, no risk of clobbering real files). The thousands of
ignored autogen files living in-tree is accepted as the cost of native,
no-virtual cross-bundler resolution.

The only remaining work is **Phase 7** (cross-bundler real-build coverage +
cleanup + the exhaustive docs pass).

## Health

- Branch is linear (no merge commits), all work pushed.
- Green: full Go suite (`go test ./internal/...`), 268 `runtypes-devtools`
  tests, 6755 marker tests (2 skipped). No repo-root leak from inference.

## Related docs

- `packages/runtypes-devtools/docs/dev-sync-todo.md` — deferred enrich-at-build +
  two-way dev sync backlog.
- `docs/ARCHITECTURE.md` → "Rewrite mechanics" — files-mode preamble + the
  internal render mechanics.
