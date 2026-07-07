# Rename published packages to the `@ts-runtypes/*` npm scope

**Status:** DONE — shipped in [PR #191](https://github.com/MionKit/ts-run-types/pull/191) (2026-07-07). The core rename (published packages, Go marker/enrichment, ~500 import sites, binary pipeline, CI, config) is complete and verified: `pnpm test` (7736 passed), `go test`, `pnpm run lint`, and `pnpm run format` all pass. The `@ts-runtypes/bin` peer-dep move, the `/rolldown` entry, and the `allowBuilds: esbuild` drop landed with it. **Remaining non-functional follow-ups moved to → [`docs/todos/scope-rename-followups.md`](../todos/scope-rename-followups.md).**
**Created:** 2026-07-07

## Goal

The project is feature-complete and getting ready for its first npm publish.
Before publishing, move the three public packages (and the per-platform binary
packages) from flat `ts-runtypes*` names onto a single owned npm scope,
`@ts-runtypes/*`, so the set reads as one product and the namespace is ours.

Decision context (settled in discussion):

- **Not `@runtypes`.** `runtypes` (unscoped) is an active, unrelated library
  ("Runtime validation for static types", ~1.2M downloads/mo). Taking
  `@runtypes` would be brand-squatting and disputable. `@ts-runtypes` is
  ownable and keeps our identity while disambiguating.
- **Independent of `@mionjs`.** RunTypes is the platform/foundation; mion (RPC
  framework) is one *consumer* of it. The foundation gets its own scope; mion
  depends on it, not the reverse.
- **No backward-compat aliases.** Nothing is published under any `ts-runtypes*`
  name yet (all 404 on npm), so there are zero existing users to strand. Clean
  rename, no deprecated alias packages.

## Name mapping

| Current | New | Role |
|---|---|---|
| `ts-runtypes` | `@ts-runtypes/core` | runtime marker + helpers (what apps import) |
| `ts-runtypes-devtools` | `@ts-runtypes/devtools` | cross-bundler transform (unplugin) + lint plugin |
| `ts-runtypes-bin` | `@ts-runtypes/bin` | platform binary launcher (`getExePath()`) |
| `ts-runtypes-binary-<os>-<arch>` | `@ts-runtypes/binary-<os>-<arch>` | per-platform binaries (assembled at publish) |

Subpath entries on devtools are unchanged in shape, just re-scoped:
`@ts-runtypes/devtools`, `/vite`, `/rollup`, `/webpack`, `/rspack`, `/esbuild`,
`/unplugin`, `/eslint`.

## Directory names — DECIDED: keep as-is

Directories stay `packages/ts-runtypes`, `.../ts-runtypes-devtools`,
`.../ts-runtypes-bin`; only the package.json `name` changes to `@ts-runtypes/*`.
Lowest blast radius on top of an already ~500-file rename. The dir basename no
longer matches the scoped suffix — accepted; a cosmetic dir rename can be a
separate change later if wanted. This means NO `repository.directory`,
`.oxlintrc.json` jsPlugins-path, tsconfig-`paths`, or build-script path changes
for the dir move itself.

## Binary resolution architecture — the launcher becomes a peer dependency

**Principle:** the transform and the lint plugin are ordinary bundler/oxlint
plugins that shell out to the ts-runtypes resolver binary; that binary is
resolved from **what the consumer has installed**, never a hardcoded path.

**Already true in code (no change):** both entry points default to
`getExePath()` from the launcher — [`src/unplugin.ts`](../../packages/ts-runtypes-devtools/src/unplugin.ts)
(`binary` option optional; omitted → `getExePath()`) and
[`src/eslint/lint-worker.ts`](../../packages/ts-runtypes-devtools/src/eslint/lint-worker.ts)
(`options.binary ?? getExePath()`). `getExePath()` resolves the host's installed
`@ts-runtypes/binary-<os>-<arch>` — i.e. the user's installed binary. An explicit
`binary` path (plugin option / `settings.runtypes.binary`) is only an override
for tests + power users. The repo's own `.oxlintrc.json`
`settings.runtypes.binary: "./bin/ts-runtypes"` is workspace dogfooding of the
in-tree build, not a shipped default.

**The actual change:** reclassify the launcher from a regular dependency to a
**peerDependency** of `@ts-runtypes/devtools`, so the consumer owns the binary
install and version:

- Move `@ts-runtypes/bin` from `dependencies` → `peerDependencies` in
  [`packages/ts-runtypes-devtools/package.json`](../../packages/ts-runtypes-devtools/package.json).
- **Pin it EXACT and bump in lockstep** (not a caret range). Rationale: the
  binary emits the tuple layout that `@ts-runtypes/core` reads (constants mirror,
  `gen:ts-constants`) and folds `constants.Version` into typeID hashes. A
  consumer resolving a `@ts-runtypes/bin` whose version drifts from
  `@ts-runtypes/core` would mis-read cache tuples. Exact-equal lockstep (the
  same rule the per-platform `binary-*` packages already follow) preserves
  coherence. So: `"@ts-runtypes/bin": "<exact current version>"`, required (not
  `peerDependenciesMeta.optional`) — the plugin cannot run without a binary.
- Consumer install becomes the explicit trio: `@ts-runtypes/core` (runtime) +
  `@ts-runtypes/devtools` (build/lint plugin) + `@ts-runtypes/bin` (binary
  launcher). Document this in README + the website install page.
- `@ts-runtypes/core` does NOT depend on the binary (pure runtime); the peer is
  devtools-only.

## Touchpoint inventory

**Correctness-critical (Go side) — must not miss:**

- `ts-go-runtypes/internal/compiler/marker/marker.go` — `DefaultModule = "ts-runtypes"`
  → `"@ts-runtypes/core"`. This is the string the scanner matches against each
  file's enclosing `package.json` `"name"` to recognise `InjectRunTypeId<T>` /
  the other markers. Also the doc comments referencing `"ts-runtypes"` /
  `packages/ts-runtypes`.
- `ts-go-runtypes/internal/testfixtures/runtypes.d.ts` — ambient
  `declare module "ts-runtypes"` → `"@ts-runtypes/core"` (the fixtures have no
  on-disk package.json, so they rely on the ambient module name). Keep in sync
  with the marker package's public API per CLAUDE.md.

**Package manifests:**

- Three `package.json` `name` fields (mapping above).
- Add `publishConfig.access: "public"` to `@ts-runtypes/core` and
  `@ts-runtypes/bin` (devtools already has it — scoped packages default private).
- `repository.directory` fields (only if decision B renames dirs).
- Workspace deps: `ts-runtypes-devtools` depends on `ts-runtypes-bin`
  (`workspace:*`) → `@ts-runtypes/bin`. Sweep every `workspace:*` reference.

**Self-import resolution (marker package, per CLAUDE.md section):**

- `packages/ts-runtypes/package.json` `exports[".source"]` — condition name
  (`source`) stays; the package `name` changes to `@ts-runtypes/core`.
- `packages/ts-runtypes/vitest.config.ts` `resolve.conditions: ['source']` —
  unchanged (condition name), but any self-import specifier `ts-runtypes` in the
  marker package's own tests → `@ts-runtypes/core`.
- `packages/ts-runtypes/tsconfig.test.json` `customConditions: ["source"]` —
  unchanged.

**Import sites (~500 files, mechanical):**

- `from 'ts-runtypes'` → `from '@ts-runtypes/core'` (~369 files: packages, tests,
  `packages/examples/src`, website `<code-import>` sources, playground).
- `ts-runtypes-devtools[/subpath]` → `@ts-runtypes/devtools[/subpath]` (~154).
- `ts-runtypes-bin` → `@ts-runtypes/bin` (~27).

**Build / publish scripts:**

- `scripts/release/build-binaries.mjs`, `scripts/release/publish.mjs` —
  `ts-runtypes-binary-<os>-<arch>` naming → `@ts-runtypes/binary-<os>-<arch>`;
  publish-order note (binary packages before the launcher) unchanged.

**Config referencing package paths (only affected by decision B):**

- `.oxlintrc.json` `jsPlugins: ["./packages/ts-runtypes-devtools/dist/eslint/index.js"]`.
- tsconfig `paths`, vitest workspace globs, CI path filters.

**Docs (required for PR-readiness):**

- `README.md`, `docs/ARCHITECTURE.md`, `SETUP.md`, `CLAUDE.md`, `docs/*`,
  `container/website/content/**` — update every published-name reference and the
  install/import snippets. Website prose follows the docs style rules (leave MDC
  structure + counts intact; API-truth updates to code examples are required).

**Explicitly NOT renamed (decoupled from the npm package name):**

- The built binary filename `bin/ts-runtypes` and the `ts-runtypes` CLI command
  (enrich `describe`/`gen`/…). These are separate from the npm package name;
  revisit as its own decision if ever wanted. `.oxlintrc.json`
  `settings.runtypes.binary: "./bin/ts-runtypes"` and the eslint plugin's
  `runtypes/*` rule namespace stay as-is.

## Execution order

1. Confirm decision A/B (dirs) and reserve the `@ts-runtypes` npm org.
2. (If B) `git mv` the three package dirs; fix path references.
3. Rewrite the three `package.json` names + add `publishConfig.access`.
4. Change Go `DefaultModule` + testfixtures ambient module; update comments.
5. Mechanical import sweep across TS/JS (scoped find-replace, reviewed).
6. Build/publish script binary-package names.
7. Docs + website code examples.
8. Bootstrap + verify (below).

## Verification (needs a bootstrapped host)

This worktree is unbuilt — run the `ts-runtypes-setup` skill first (submodules +
patches, Go resolver `bin/ts-runtypes`, `@ts-runtypes/devtools` dist).

- `go -C ts-go-runtypes test ./internal/...` — **marker + resolver suites are the
  gate**: they prove `InjectRunTypeId<T>` still resolves under the new
  `DefaultModule`, both call shapes (static `getRunTypeId<T>()` and
  `getRunTypeId(value)`) per the marker coverage rule.
- Rebuild `bin/ts-runtypes`, then `pnpm test` — devtools marker tests +
  the marker package's own self-import tests (source condition) must pass.
- `pnpm run lint` + `pnpm run check-format`.
- `pnpm -r --dry-run` publish sanity (names resolve, `workspace:*` rewrites,
  `access: public` present).

## Out of scope / follow-ups

- CLI command / binary filename rename (separate decision).
- Optional unscoped `ts-runtypes` re-export of `@ts-runtypes/core` (Vue-style
  hero alias) — only if a one-word entry point is wanted later.
