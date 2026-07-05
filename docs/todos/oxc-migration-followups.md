# OXC migration follow-ups (deferred from the main migration)

**Status:** todo (deliberately deferred, not blockers)
**Parent:** [`docs/done/oxc-toolchain-migration.md`](../done/oxc-toolchain-migration.md)
**Created:** 2026-07-04

The oxc toolchain migration (oxlint + oxfmt + Vite 8/Vitest 4) shipped, but two
pieces were deferred by design. This tracks them so they survive the session.

## 1. `runtypes-devtools/rolldown` subpath export

The plugin ships `/vite`, `/rollup`, `/webpack`, `/rspack`, `/esbuild` unplugin
entries but **no `/rolldown`** — `unplugin@3.0.0` exposes no `.rolldown`
accessor, so the entry cannot be added yet.

- **When:** bump `unplugin` once it ships a Rolldown adapter (`unplugin.rolldown`).
- **Then:** add `src/rolldown.ts` (mirror `src/esbuild.ts`), the `./rolldown`
  exports map entry in [`packages/runtypes-devtools/package.json`](../../packages/runtypes-devtools/package.json),
  a build-time entry, README + the website configuration page.
- Vite 8 already runs on Rolldown internally, so the existing `/vite` entry
  covers Vite-8 users today; this is only for consumers using Rolldown directly.

## 2. Container apps → Vite 8 (website + benchmarks)

Both container apps carry their own dependency trees inside the shared podman
image and were left on their current toolchains:

- **`container/website`** (Nuxt/Docus): Vite is Nuxt-managed. Move when Nuxt
  supports Vite 8. Its own `eslint.config.mjs` (bind-mounted, see
  [`scripts/website/site.sh`](../../scripts/website/site.sh)) is independent of the repo's
  root lint migration and can move to oxlint separately if desired.
- **`container/benchmarks`**: bumping the harness Vite to 8 changes competitor
  build numbers — re-baseline the published bench data **and republish the GHCR
  bench image** (required whenever `_deps` changes, else the default path pulls a
  stale image). Vite-8 bench numbers are not comparable to the published Vite-5
  ones.

## 3. Optional hardening

- If `lightningcss` platform packages (pulled by vite@8) ever block a lockfile
  refresh under `minimumReleaseAge`, add `lightningcss-<os>-<arch>` entries to
  `minimumReleaseAgeExclude` the same way `@rolldown/binding-*` were added.
- Consider adopting `oxlint --type-aware` (runs on the vendored tsgolint) as a
  later upside; nothing type-aware runs today, so it is pure gain when adopted.
- `allowBuilds:{esbuild:true}` is now dead config (vite@8 dropped esbuild to an
  optional peer, so it is no longer installed). Left intact as a harmless no-op;
  drop it only if you are sure nothing will reintroduce esbuild.
