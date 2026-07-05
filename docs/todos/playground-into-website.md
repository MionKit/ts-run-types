# Fold `runtypes-playground` into the docs website

**Status:** in progress
**Created:** 2026-07-04
**Branch:** `playground-into-website`

## Progress

- [x] **Phase 1 — relocate engine core + injection seam.** Core moved to
  `container/website/app/playground/`; `runtypesPackageSources` is now the
  injected `packageSources.ts` (getter/setter); `wasmLoader` uses explicit
  `/playground-app/*` URLs; added a self-contained `app/playground/tsconfig.json`
  (the site's own tsconfig extends the unbuilt `.nuxt` one, so oxc/editors need a
  loadable one here). Shared overlay builder at `scripts/runtypes-source-overlay.mjs`.
- [x] **Phase 3 — host prebuild + staleness gate.** `container/website/scripts/build-playground.sh`
  rewritten: two-tier WASM gate (mtime stamp → `go tool buildid` compare), gzip
  only on real byte change, source overlay gated on `packages/ts-runtypes/src`,
  staged into `public/playground-app/`. `scripts/website.sh` `ensure_playground`
  simplified to just invoke it. **Verified:** cold build 13s, no-change run 0.019s,
  spurious-mtime (buildid match) 1.1s with gzip skipped. `.cache/rt-wasm/` gitignored.
- [x] **Phase 5 — rehome tests.** 4 specs + `nodeResolver` moved to
  `packages/ts-runtypes/test/playground/` with a dedicated vitest project (source
  condition + `ts-runtypes`→src alias, no devtools plugin); marker project excludes
  `test/playground/**`; nodeResolver reads `.cache/rt-wasm/` + injects the overlay.
  **Verified: 32/32 pass** (matches pre-migration baseline).
- [x] **Phase 2 — Vue SFC rewrite.** `content/RuntypesPlayground.vue` is now a thin
  `<ClientOnly>` wrapper over `components/playground/PlaygroundStage.client.vue` (a
  faithful port of the 866-line element: 3 columns, presets, TS/Schema toggle,
  codeSeq guard, strip editors + line-number offsets, prettier lazy-load,
  escapeHtml-before-v-html). Styles are one non-scoped block under `.rt-playground`
  (v-html-safe), `--rtpg-*` remapped onto site `--ui-*` tokens, Monaco theme tracks
  `useColorMode()`. Dead `beautify()` (unused in the original) dropped.
- [x] **Phase 4 (code) — deps + nuxt.config.** `monaco-editor@0.52.2` +
  `prettier@3.8.2` added to `_deps/package.json`; `nuxt.config.ts` aliases
  `ts-runtypes`(+`/formats`)→src (RT_REPO_ROOT in-container) and excludes monaco
  from optimizeDeps.
- [x] **Phase 6 — delete package + rewire.** `packages/runtypes-playground` deleted;
  root lockfile regenerated (frozen install passes, 4 workspace projects);
  `.claude/launch.json`, `website-publish.sh`, `SETUP.md`, `markerDts.ts` comments,
  test skip message, and the project memory updated.

### Verified (all green)
- `pnpm test`: **7704 passed, 7 skipped** (incl. the 32 relocated playground tests).
- `pnpm run typecheck`: exit 0. `pnpm run lint`: exit 0. `pnpm run format`: clean
  (correctly left `container/website` to its own tooling).
- `build-playground.sh`: cold 13s, no-change 0.019s, spurious-mtime 1.1s (gzip skipped).

### Browser-verified (2026-07-05, containerized site on :3100 via playwright-cli)
- **`/playground` renders and runs end-to-end.** 3 columns live (Monaco editors,
  read-only strip editors, generated-cache + transformed-src views), WASM resolver
  loads (overlay hides), site dark-theme remap correct. `validate` → `true ✓`
  (237 ms); `Random valid` mock-gen → fresh value → `true ✓` (209 ms).
- **The lockfile regen + local image build are DONE** (`_deps/pnpm-lock.yaml` now has
  monaco/prettier, +18 lines; regen used the maintainer-sanctioned temporary
  `minimumReleaseAge` off, restored after; `localhost/tsrt-website:dev` built).

### Design change the browser test forced — vendor the runtime DIST (not external alias)
The first plan aliased `ts-runtypes` → the external `/repo-context` mount. That
**fails in dev**: Vite's dev server only serves modules inside the Nuxt project root
(external `/@fs/repo-context/...` 404s; `fs.allow`/`fs.strict` do not help — it is a
root-boundary limit, not a permission one). Aliasing to vendored **src** then failed
on type-only re-exports (per-file dev transpile can't elide them). Fix, now shipped:
`build-playground.sh` vendors the compiled **dist** (plain ESM, no transpile) into
`container/website/app/playground/.vendor/ts-runtypes-dist/` (git-ignored, freshness-
gated via `check-stale-builds.sh marker-dist`); `nuxt.config.ts` aliases
`ts-runtypes`(+`/formats`) at that in-project path. The resolver's type OVERLAY still
comes from **src** (`runtypes-sources.json`), so type accuracy is unchanged. The old
docs site never hit this because it always loaded a pre-*bundled* playground.

### Remaining — GHCR publish only (user action, outward-facing)
- **Rebuild + push the website image to GHCR** so deploys have monaco/prettier:
  `pnpm run podman-website:build-image && pnpm run podman-website:push`. (Local dev/
  verify already works via `RT_WEBSITE_USE_LOCAL=1`.) The `website:publish` pipeline
  builds the playground assets (incl. the vendored dist) in stage 5 automatically.
- Optional: a light/dark visual pass (dark verified; tokens are mapped for both).

## Why

`packages/runtypes-playground` was originally meant to be a distributable npm
package (a framework-agnostic `<runtypes-playground>` web component). It has
since become tuned specifically for the docs website, and other ts-go
playgrounds already exist on npm, so the separate-package identity earns its
keep no more. Dissolve it into `container/website` as first-class Nuxt Vue
components.

Locked decisions (maintainer, 2026-07-04):

1. **Nuxt SFCs + host-staged assets.** The UI becomes native Vue components in
   the Nuxt app; the two host-only build inputs (the resolver WASM and the
   `ts-runtypes` source overlay) become host-prebuilt static assets the browser
   fetches at runtime. Monaco + prettier get added to the website container
   image (one rebuild + GHCR republish).
2. **Theme:** remap the playground's dark `--rtpg-*` palette onto the site's
   `--ui-*` design tokens so it follows light/dark; visual pass in both modes.
3. **Engine tests:** land under `packages/ts-runtypes/test/playground/`, so they
   inherit that package's `source` vitest condition (the convergence tests need
   `ts-runtypes` resolved to `src`, not `dist`).

## Hard constraints (discovered, do not fight)

- **The site runs in a Node-only podman container.** The Go toolchain is not in
  the image, so anything needing Go (the WASM) or the full source tree **must
  stay a host-side prestep**. `packages/` is available in-container only via the
  read-only `/repo-context/packages` mount ([scripts/website.sh](../../scripts/website.sh)),
  a *different* path than `/app` — so a relative `import.meta.glob` into
  `packages/ts-runtypes/src` **breaks in-container**. This is the real reason
  the playground is a separate host-side Vite bundle today.
- **The WASM prebuild + staleness gate already exist** in
  [scripts/website.sh](../../scripts/website.sh) (`ensure_playground` /
  `playground_stale`, fired before `dev|build|generate|smoke` at the `main()`
  dispatch). This work *tunes* that gate; it does not invent it.
- **Never widen `pnpm run format`'s scope.** The moved `.ts`/`.vue` leave the
  root `packages/**` oxfmt glob; the website subtree's own tooling owns them.
  Do not add `container/website` to the root format glob.
- The WASM is ~37 MiB raw / ~8 MiB gzipped; ship the `.gz` under the Cloudflare
  Pages 25 MiB per-file cap and inflate client-side via `DecompressionStream`
  (unchanged from today).

## Target design — the source-injection seam

The engine's package-source overlay (`runtypesPackageSources()`, today an
`import.meta.glob('../../../ts-runtypes/src/**/*.ts', {query:'?raw'})`) becomes
an **injected input** instead of a self-resolving glob, because the glob cannot
work both in-container (Nuxt build) and under vitest from the new test location:

- **Browser** → the Vue SFC does `fetch('/playground-app/runtypes-sources.json')`
  (a host-staged static asset) and passes the `{virtualPath → content}` map to
  the engine.
- **Node tests** → `nodeResolver` reads `packages/ts-runtypes/src` from disk and
  passes the same map in.

The engine core stays source-agnostic. This removes **all** build-time host
coupling from the Nuxt build: the container Nuxt build bundles only Monaco + the
small engine TS + the SFCs; the two heavy/host-bound inputs (WASM +
`runtypes-sources.json`) are runtime-fetched static assets, staleness-built on
the host. Editing a Vue file touches neither input, so it never rebuilds the WASM
— Nuxt just HMRs.

### End-state layout

```
container/website/
  app/playground/                 engine core (plain TS, no Monaco)
    engine.ts  wasmLoader.ts  operations.ts  markerDts.ts  index.ts  presets.ts
  app/components/playground/       the Vue SFC tree (client-only)
    RuntypesPlayground root + toolbar + Source/Cache/Function panes + StepBadge
  app/components/content/RuntypesPlayground.vue   MDC entry (props: type/operation/input/height)
  public/playground-app/           host-staged: ts-runtypes.wasm.gz, wasm_exec.js, runtypes-sources.json
  scripts/build-playground.sh      host prebuild: WASM + sources.json, staleness-gated
packages/ts-runtypes/test/playground/   the 4 engine specs + nodeResolver.ts
.cache/rt-wasm/                    git-ignored: raw .wasm (buildid oracle + Node test resolver) + stamp
```

`packages/runtypes-playground/` is deleted entirely.

## WASM caching design (two-tier, mirrors `check-stale-builds.sh`)

- **Tier 1 (instant, common case):** `find cmd/ts-runtypes-wasm internal go.mod
  go.sum -newer <stamp>` — nothing newer ⇒ skip. Existing `playground_stale`
  style, narrowed to true WASM inputs.
- **Tier 2 (only when Tier 1 says maybe):** build a reference `.wasm` to a temp
  path, compare `go tool buildid` against the cached raw `.wasm` (exactly how
  `check_go` works). Equal ⇒ just `touch` the stamp (a `git checkout`/`touch`
  false alarm — **no gzip**). Different ⇒ move it in, **re-gzip only here**,
  re-copy `wasm_exec.js`, re-emit `runtypes-sources.json` only when
  `packages/ts-runtypes/src` changed.
- No version ldflags (Version stays `"dev"`) so buildids actually match —
  otherwise the gate rebuilds every time. Gzip is gated on the raw `.wasm`'s
  buildid, never the `.gz` bytes (gzip embeds an mtime, so it always looks
  "changed" otherwise). Raw `.wasm` + stamp live in `.cache/rt-wasm/`.

## Plan — six phases

### Phase 1 — relocate the engine core (plain TS, minimal edits)
- Move `src/core/*` + `src/element/presets.ts` → `container/website/app/playground/`.
- `wasmLoader.ts`: drop `new URL(..., import.meta.url)` defaults for explicit
  `/playground-app/*` URLs (so Vite never bundles the 37 MiB file).
- `runtypesPackageSources.ts`: make the overlay an **injected input** (browser
  fetch of the staged JSON; Node reads disk). Engine `setSources` takes the map.

### Phase 2 — rewrite the web component as Vue SFCs
- `runtypesPlaygroundElement.ts` (866L) → client-only component tree under
  `app/components/playground/`. `styles.ts` (161L CSS string) → `<style scoped>`
  (drop the `.rt-playground` prefix + `injectStyles()`); `icons.ts` → `<UIcon>`
  (site ships vscode-icons); `presets.ts` → data module.
- **Remap `--rtpg-*` → site `--ui-*` tokens** for light/dark; visual pass both modes.
- Preserve the subtle bits: the 3-editors-as-one-file line-number offset
  (`updateLineNumberOffsets`, keep in one SFC/composable), the `codeSeq`
  stale-async guard, the read-only hatch overlays, and `escapeHtml`-before-`v-html`
  (Monaco `colorize` returns HTML — XSS discipline).
- Replace `content/RuntypesPlayground.vue`'s manifest-fetch + script-injection
  body with a `<ClientOnly>` mount of the new tree; keep props
  `type/operation/input/height`. **Security invariant:** props only ever come
  from hard-coded docs content, never route/query.

### Phase 3 — host prebuild + tuned staleness gate
- Rewrite `container/website/scripts/build-playground.sh`: drop the
  `pnpm --filter runtypes-playground run build:all` / dist-site / manifest path.
  It now (a) staleness-gates the WASM on Go inputs, (b) staleness-gates
  `runtypes-sources.json` on `packages/ts-runtypes/src`, (c) stages all three
  into `public/playground-app/`. Fold in `build-wasm.sh`'s compile+gzip; keep it
  host-side (needs Go + submodules).
- `scripts/website.sh`: retarget `playground_stale()`'s input paths (drop the
  now-gone playground `src`/`scripts`; keep `cmd/ts-runtypes-wasm`, `internal`,
  `go.mod`/`go.sum`, `packages/ts-runtypes/src`); keep `ensure_playground`,
  `RT_WEBSITE_SKIP_PLAYGROUND`, and the Go-missing warn-and-continue behavior;
  keep it wired before `dev|build|generate|smoke|verify-docs`.

### Phase 4 — deps + container image
- Add `monaco-editor@0.52.2` + `prettier@3.8.2` (exact-pinned) to
  `container/website/_deps/package.json`; regenerate its lockfile **in-container**
  (`pnpm run podman-website:lock`); rebuild + push the image (per the
  `_deps`-changed republish rule — else the default path pulls a stale image).
- `nuxt.config.ts` `vite`: `optimizeDeps.exclude:['monaco-editor']` + the Monaco
  worker stub (mirror the current element's no-op `getWorker`). The Monaco-owning
  component MUST be strictly client-only or `nuxt generate` crashes.

### Phase 5 — rehome tests
- Move the 4 specs + `nodeResolver.ts` → `packages/ts-runtypes/test/playground/`.
  They import the engine core cross-tree from `container/website/app/playground/`
  and read the raw `.wasm` from `.cache/rt-wasm/`. Confirm the ts-runtypes vitest
  project's globs pick them up and the `assetsBuilt()` skip keeps `pnpm test`
  green on an unbuilt host. Core pulls in no Monaco, so the suite stays Node-clean.

### Phase 6 — delete package + rewire
- `rm -rf packages/runtypes-playground`; `pnpm install --no-frozen-lockfile` to
  drop it from the lockfile (frozen-lockfile CI fails otherwise); re-commit the lock.
- `.claude/launch.json`: remove/repoint the `playground-demo` config.
- Update `scripts/website-publish.sh` stage-5 comment, `SETUP.md`, `CLAUDE.md`,
  `container/website/.gitignore` (`/public/playground-app/`), `.gitignore`
  (add `.cache/rt-wasm/`), and the "Playground architecture" project memory.
  `docs/done/*.md` are historical records — leave them.

## Risks
- Vite may try to bundle the 37 MiB `.wasm` if any code references it via
  `import`/`new URL(import.meta.url)`; use an absolute public URL string so it is
  fetched at runtime (generate already runs near its heap cap).
- Monaco under SSR: a stray non-guarded top-level `import 'monaco-editor'` breaks
  `nuxt generate`. Keep the Monaco subtree strictly client-only.
- `source` resolution of `ts-runtypes` is load-bearing (the convergence tests
  exist because a stale/approximate types overlay produced wrong codegen). Verify
  the tests still resolve to `src`.
- Format ownership: moved files leave root oxfmt scope — do not widen the glob.

## Done criteria
- `pnpm test` runs the 4 engine specs (skips cleanly without a built WASM).
- `pnpm run typecheck` / `build` / `clean` no longer reference the deleted package.
- `scripts/website.sh dev` stages WASM only on real Go input change; editing a
  Vue file triggers HMR with no WASM rebuild.
- `pnpm run website:publish` completes; the `/playground` page loads the WASM +
  source overlay from `/playground-app/` and runs.
- Playground renders correctly in both light and dark site themes.
