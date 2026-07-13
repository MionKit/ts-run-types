# `@ts-runtypes/*` rename — prose/comment follow-ups

**Status:** done — shipped in the PR that carries this file into `docs/done/`. The functional core rename shipped earlier in [PR #191](https://github.com/MionKit/ts-run-types/pull/191) — see [`docs/done/scope-rename-ts-runtypes-org.md`](./scope-rename-ts-runtypes-org.md).
**Created:** 2026-07-07 · **Completed:** 2026-07-13

Prose/comment/cosmetic leftovers after the core `@ts-runtypes/*` rename. All three original items are done; the pass also surfaced and fixed a handful of **functionally stale** references the earlier rename missed (broken `--filter` selectors, wrong install commands, a wrong `node_modules` path), which are called out below because they were bugs, not cosmetics.

## The disambiguation rule (applied throughout)

The bare string `ts-runtypes` means three different things, and only the first was renamed:

- **The package** → rewritten to the scoped name: `@ts-runtypes/core` (marker + runtime), `@ts-runtypes/devtools` (plugin/lint), `@ts-runtypes/bin` (launcher), plus subpaths `@ts-runtypes/core/formats`, `@ts-runtypes/core/formats/temporal`, `@ts-runtypes/core/schema`.
- **Kept identifiers** → left untouched: the tsconfig-plugin config key `plugins:[{name:"ts-runtypes"}]` (the Go binary matches it), the CLI/binary name `ts-runtypes` (e.g. `ts-runtypes gen`, `ts-runtypes --compile`, `bin/ts-runtypes`), the bin commands `ts-runtypes-bin` / `ts-runtypes-skills`, the cache dir `node_modules/.cache/ts-runtypes`, directory paths (`packages/ts-runtypes/`, `ts-go-runtypes/…`), the Go module path, and route slugs (`/introduction/about-ts-runtypes`).
- **The project/library name** → normalized to **RunTypes** in prose (peer to `zod` / `TypeBox` / `ajv` / `typia`).

## 1. Doc-prose package references — done

- [`README.md`](../../README.md) — already fully scoped; no change needed.
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — package refs → `@ts-runtypes/core` / `@ts-runtypes/devtools` (prose, the two "Tool" table cells, the process diagram box); the marker-scanner match value corrected to `"name": "@ts-runtypes/core"` (was factually stale — the package.json name and `marker.go`'s `DefaultModule` are both `@ts-runtypes/core`); the cross-library comparison paragraph → RunTypes.
- [`docs/ROADMAP.md`](../ROADMAP.md) — `ts-runtypes/formats` → `@ts-runtypes/core/formats`, `ts-runtypes/schema` → `@ts-runtypes/core/schema`, the `flattenUnionDiscriminators` import → `@ts-runtypes/core`, the future LSP subpath → `@ts-runtypes/devtools/lsp`, "ts-runtypes-owned" → "RunTypes-owned".
- [`docs/AI_ENRICHMENT.md`](../AI_ENRICHMENT.md) — the three "exported from / adds `ts-runtypes`" package refs → `@ts-runtypes/core` (CLI verbs and the plugin config key left as-is).
- [`docs/cross-library-validation-alignment-report.md`](../cross-library-validation-alignment-report.md) — the ~45 prose/table uses of the library name → RunTypes (fenced code, paths, and scoped refs left as-is).
- `docs/COMPILER-DRIVEN-TRANSFORM.md`, `docs/FUZZING.md`, `docs/WEBSITE-DOCGEN.md` — only legitimate CLI/path/benchmark-identifier refs; no change.

## 2. Website-content prose — done

Prose package mentions across [`container/website/content/**`](../../container/website/content/) rewritten to the scoped names (guide/linting, guide/configuration, guide/type-formats, introduction/about, introduction/quick-start), and the two benchmark pages' library-name prose → RunTypes. All edits are content-only: MDC components, code-fence structure, twoslash blocks, and `index.md` were left intact (per the website docs-style rules).

**Functional fixes found here (were broken, not cosmetic):**

- `1.introduction/3.quick-start.md` — the install commands said `pnpm add ts-runtypes` / `-D ts-runtypes-devtools` (npm/yarn too); those packages don't exist under the old names. Corrected to `@ts-runtypes/core` / `@ts-runtypes/devtools` (matching the README).
- `2.guide/10.linting.md` — the OXlint `jsPlugins` path pointed at `./node_modules/ts-runtypes-devtools/…`; the installed path follows the scoped name, so corrected to `./node_modules/@ts-runtypes/devtools/dist/eslint/index.js`.

## 3. Internal comment cosmetics — done

- [`packages/ts-runtypes-devtools/src/`](../../packages/ts-runtypes-devtools/src/) — the per-entry header comments (`vite.ts`, `rollup.ts`, `rspack.ts`, `rolldown.ts`, `webpack.ts`, `esbuild.ts`, `index.ts`, `eslint/index.ts`, `unplugin.ts`) now name `@ts-runtypes/devtools/<entry>`; the runtime warning/error prefixes (`[ts-runtypes-devtools]` / `ts-runtypes-devtools:`) and the generated `.gitignore` banner now read `@ts-runtypes/devtools`.
- [`packages/ts-runtypes-devtools/test/build-rollup.test.ts`](../../packages/ts-runtypes-devtools/test/build-rollup.test.ts) — header comment + `describe` title → `@ts-runtypes/devtools/rollup`.
- [`ts-go-runtypes/internal/compiler/marker/marker.go`](../../ts-go-runtypes/internal/compiler/marker/marker.go) — the "published name" comment corrected to `@ts-runtypes/core`.
- `scripts/release/publish-tarballs.mjs` — the `rank()` comment was already updated; the `ts-runtypes-binary-` / `ts-runtypes-bin-` string matches are literal `npm pack` tarball filenames and correctly stay.

**Functional fixes found here (broken `--filter` selectors — pnpm matches the package *name*, not the directory, so the old bare names now select nothing and exit 0 silently):**

- [`.claude/skills/ts-runtypes-setup/setup.sh`](../../.claude/skills/ts-runtypes-setup/setup.sh) — `pnpm --filter ts-runtypes-devtools run build` was a silent no-op, so the setup skill's devtools build step did nothing while reporting success. Fixed to `@ts-runtypes/devtools`.
- [`scripts/core/smoke.mjs`](../../scripts/core/smoke.mjs) and [`packages/ts-runtypes-devtools/src/eslint/session.ts`](../../packages/ts-runtypes-devtools/src/eslint/session.ts) — error messages instructing `pnpm --filter ts-runtypes-devtools run build` (dead) → `@ts-runtypes/devtools`.
- [`CLAUDE.md`](../../CLAUDE.md) — the "Filter a package" example (`--filter ts-runtypes` / `--filter ts-runtypes-devtools`) → `@ts-runtypes/core` / `@ts-runtypes/devtools`.

(The earlier `publish.mjs` FE-selector bug from the same class was fixed separately — see [`publish-local-core-filter-bug.md`](./publish-local-core-filter-bug.md).)

## Verification

- `pnpm --filter @ts-runtypes/devtools test` — 42 files, 364 tests green.
- `go -C ts-go-runtypes test ./internal/compiler/marker/...` — green.
- `pnpm run check-format` (oxfmt + prettier + gofmt) and `pnpm run lint` (oxlint + full typecheck incl. `packages/examples`) — both green.
- Website edits confirmed content-only (no added/removed code-fence or MDC-marker lines).
