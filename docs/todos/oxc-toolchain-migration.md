# OXC toolchain migration — oxlint + oxfmt + Vite 8 (Rolldown)

**Status:** spec / investigation (not started)
**Owner:** TBD
**Related:** [`eslint.config.js`](../../eslint.config.js), [`.prettierrc`](../../.prettierrc), root [`package.json`](../../package.json) scripts (`lint`, `format`, `check-format`, `lint-pre-committ`, lint-staged block), [`.husky/pre-commit`](../../.husky/pre-commit), [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`packages/runtypes-devtools/package.json`](../../packages/runtypes-devtools/package.json) (Vite peer/devDep), [`docs/todos/oxlint-diagnostics-plugin.md`](oxlint-diagnostics-plugin.md)

## 1. Goal

Migrate the JS half of the toolchain to the oxc suite end-to-end:

1. **oxlint** replaces ESLint + typescript-eslint as the repo's linter.
2. **oxfmt** (the oxc formatter) replaces Prettier for TypeScript, where it can reproduce our style.
3. **Vite 8+** (Rolldown-powered, oxc-based by default) replaces Vite 5 everywhere the workspace builds or tests with Vite — `runtypes-devtools` (devDep + peer range + its bundler test matrix), Vitest, the playground, and eventually the two container apps.
4. Every command that fronts these tools — `pnpm run lint`, `pnpm run format`, `pnpm run check-format`, the lint-staged / husky pre-commit entries, CI — is rewired and stays green.

Strategic fit: oxlint's type-aware backend is **tsgolint — the same `oxc-project/tsgolint` shim this repo already vendors at [`third_party/tsgolint/`](../../third_party/tsgolint) and builds the resolver on**. Converging the toolchain onto oxc aligns the repo with the stack the product itself is built on, and the planned [OXlint diagnostics plugin](oxlint-diagnostics-plugin.md) (which ships oxlint rules to *consumers*) gets an in-repo dogfooding host for free.

## 2. Current state (verified)

### 2.1 Lint

- **ESLint 9.39.4 + typescript-eslint 8.58.1** (root devDeps, exact-pinned), flat config at [`eslint.config.js`](../../eslint.config.js):
  - `eslint.configs.recommended` + `tseslint.configs.recommended` (note: the **non**-type-checked preset).
  - `parserOptions.projectService: true` is set globally — but since `recommended` contains no type-checked rules, **no type-aware rule actually runs today**. The projectService mostly costs startup time.
  - Ignores: `node_modules`, `dist`/`.dist`, coverage dirs, `.nx`, `third_party/**`, `bin/**`, `scripts/**`, `**/vite.config.ts`, `**/vitest.config.ts`, `eslint.config.js`, `packages/ts-runtypes/src/caches/**` (hand-authored cache skeletons), `.claude/**`.
  - Rule tweaks: `no-empty-function` / `@typescript-eslint/no-empty-function` / `@typescript-eslint/no-explicit-any` off.
  - Test-file override (`**/*.spec.ts`, `**/*.test.ts`, `**/test/**/*.ts`): `projectService: false`, `no-unused-vars` + `@typescript-eslint/no-unused-vars` relaxed to `['warn', {args: 'none'}]`.
- **Scripts:** root `lint` = `lerna run lint && pnpm run typecheck`; each package's `lint` = `eslint src`; `lint-pre-committ` (typo, see §5.6) = `eslint --quiet`, invoked by lint-staged on staged non-test package TS.
- Type checking is a **separate** step (`pnpm run typecheck` → tsc/tsgo projects) and stays untouched by this migration.

### 2.2 Format

- **Prettier 3.8.2**, [`.prettierrc`](../../.prettierrc): `bracketSpacing: false`, `singleQuote: true`, `printWidth: 130`, `trailingComma: "es5"`.
- `format` = `prettier --write 'packages/**/*.{ts,md}' && gofmt -w cmd internal`; `check-format` is the read-only twin; `check-format-pre-commit` = `prettier --check` via lint-staged.
- **CLAUDE.md hard rule:** "format means running `pnpm run format`" — one command, deliberately narrow scope (packages TS+MD, Go under cmd/internal; website/docs/scripts/`.claude`/third_party/testdata all excluded on purpose). The migration must preserve that contract: same command, same scope, new engine.
- `gofmt` is unaffected — oxc is JS-only.

### 2.3 Vite / Vitest surfaces

- `runtypes-devtools`: devDep `vite@5.4.10`, peer `vite >= 5.0.0` (optional), dep `unplugin@3.0.0`. Bundler entries: `/vite`, `/rollup`, `/webpack`, `/rspack`, `/esbuild` (no `/rolldown` entry yet).
- Root devDep `vitest@2.1.9` (bundles its own Vite 5.x) drives the whole JS suite.
- `runtypes-playground` has a `demo: vite` script (resolves Vite from the hoisted workspace install).
- Containers (own dependency trees inside the shared podman image, NOT workspace members): `container/website` (Nuxt/Docus — Vite version is Nuxt-managed), `container/benchmarks` (Vite-driven bench harness + competitor deps under `_deps`).

### 2.4 CI / hooks

- [`ci.yml`](../../.github/workflows/ci.yml) and [`release-gate.yml`](../../.github/workflows/release-gate.yml) invoke `pnpm run lint` and `pnpm run check-format` **by script name** — if the script names stay stable, CI needs zero changes.
- [`.husky/pre-commit`](../../.husky/pre-commit) = `pnpm exec lint-staged`; the lint-staged block in root `package.json` routes staged package TS through `lint-pre-committ` + `check-format-pre-commit`.

## 3. Target state

**Principle: keep every entry-point name stable (`lint`, `format`, `check-format`, the lint-staged keys), swap the engines underneath.** CI, husky, CLAUDE.md, and muscle memory all keep working.

### 3.1 oxlint

- Add `oxlint` (exact-pinned root devDep) + a root `.oxlintrc.json` porting the current config:
  - Base: oxlint's default categories (`correctness` on) + enable `suspicious`/`pedantic` selectively to approximate `eslint:recommended` + `tseslint:recommended`. Build an explicit mapping table during implementation — oxlint implements the large majority of both sets natively; list any rule we lose and decide keep/drop per rule.
  - Port the ignores list (`ignorePatterns`), the three rule-offs, and the test-file relaxations (`overrides` on the same globs).
- Per-package `lint` script: `eslint src` → `oxlint src` (or a single root-level `oxlint packages/*/src` — decide; lerna topo order buys nothing for linting, a single root invocation is one process instead of N).
- Root `lint` stays `… && pnpm run typecheck` — the type gate remains tsc/tsgo's job.
- **Type-aware mode is optional and deferred:** nothing type-aware runs today (§2.1), so the swap loses nothing. Adopting `oxlint --type-aware` later is upside — and it runs on the very tsgolint we vendor. If adopted, revisit the projectService-era ignores (vite configs etc. were excluded to appease the project service, not because we don't want them linted).
- Remove `eslint`, `@eslint/js`, `typescript-eslint` from devDeps once green; delete `eslint.config.js`. **Exception:** the [`runtypes-devtools/eslint`](../../packages/runtypes-devtools/src/eslint/index.ts) subpath export (the consumer-facing plugin from the [diagnostics-plugin spec](oxlint-diagnostics-plugin.md)) is unaffected — it targets consumers' linters, needs no eslint devDep here, and this repo's new `.oxlintrc.json` becomes its dogfooding host (`jsPlugins`) when it lands.
- Editor: recommend `oxc.oxc-vscode` in `.vscode/extensions.json` if we keep one.

### 3.2 oxfmt

- Add `oxfmt` (exact-pinned) for the TypeScript half of `format`. **Gate: oxfmt must reproduce our four `.prettierrc` options** (`printWidth: 130`, `singleQuote`, `bracketSpacing: false`, `trailingComma: es5`) — verify against its config surface before committing; oxfmt targets Prettier compatibility but is the youngest piece of the suite (§6).
- **Markdown stays on Prettier.** oxfmt formats JS/TS, not `.md`; the `format` script becomes:
  `oxfmt <packages ts globs> && prettier --write 'packages/**/*.md' && gofmt -w cmd internal`
  — still ONE command, same scope, same CLAUDE.md contract. Prettier remains a devDep for md only (revisit if oxfmt grows md support).
- `check-format` mirrors with the check/list modes of each tool; `check-format-pre-commit` swaps `prettier --check` → `oxfmt --check` for staged `.ts` (md staged files keep prettier).
- **One-time reformat commit:** run the new pipeline over `packages/` and land any byte diffs as an isolated `style:` commit (no logic changes mixed in). If the diff is unreasonably large or mangles constructs, that's a no-go signal for oxfmt at this time — ship the lint half alone (§3.4).
- Update CLAUDE.md's "Format means…" wording (it names Prettier explicitly) in the same PR.

### 3.3 Vite 8 (Rolldown) + Vitest

- `runtypes-devtools`: bump devDep `vite` → 8.x; peer range `>=5.0.0` already spans 8 — keep it, but the test matrix must actually exercise 8 (the devDep is what the tests run against).
- Bump root `vitest` to the line that pairs with Vite 8 (Vitest 4.x+ — confirm the exact pairing at implementation time; Vitest pins its own internal Vite).
- **Load-bearing invariant to re-verify under Rolldown:** the plugin declares `enforce: 'pre'` because the resolver returns **byte offsets into the ORIGINAL `.ts` source** — the transform must run before any TS-strip ([`unplugin.ts`](../../packages/runtypes-devtools/src/unplugin.ts) header comment). Under Vite 8 the TS transform is oxc-transform inside Rolldown, not esbuild. Add an explicit regression test: a multibyte + type-heavy fixture transformed under Vite 8 whose rewrite offsets land correctly (garbage output = ordering broke).
- Verify the Vite-specific hooks (`configResolved`, `handleHotUpdate`) and the files-mode watcher behaviour under the Rolldown dev server; unplugin 3.x claims Rolldown support — bump if needed and consider adding a **`runtypes-devtools/rolldown` subpath export** (unplugin exposes `.rolldown`), since Rolldown standalone becomes a first-class bundler target. New export ⇒ README + website configuration-page updates.
- Playground `demo` script rides the workspace Vite bump; smoke it (`pnpm --filter runtypes-playground run demo`).
- **Containers are follow-up milestones, not blockers:** `container/website` moves when Nuxt supports Vite 8 (Nuxt-managed); `container/benchmarks` bumping its harness Vite changes competitor build numbers — re-baseline the published bench data and **republish the GHCR bench image** (required whenever `_deps` changes, else the default path pulls a stale image).

### 3.4 Sequencing / independence

The three tracks are independently landable, in rising risk order: **oxlint (lowest risk, land first) → Vite 8 + Vitest (medium; blast radius = the whole test suite) → oxfmt (youngest tool; can trail or be dropped without blocking the others)**. Do not couple them in one PR.

## 4. pnpm policy interactions

- All new deps (`oxlint`, `oxfmt`, `vite@8`, `vitest@4`) are **exact-pinned root devDeps** per policy; `pnpm-workspace.yaml`'s `minimumReleaseAge` gate may delay very fresh oxc releases — pick versions old enough to clear it or wait, never bypass.
- Check whether oxlint/oxfmt/rolldown ship postinstall scripts (native-binary packages usually use optionalDependencies like esbuild instead) — if any need scripts, they must be added to `allowBuilds` in `pnpm-workspace.yaml` explicitly (only `esbuild` is allowed today); prefer versions that don't need it.

## 5. Work items (milestones)

1. **oxlint swap.** `.oxlintrc.json` porting §2.1 (build the rule-mapping table); swap package `lint` scripts + `lint-pre-committ` lint-staged entry; run over the repo, triage new findings (fix or configure — no blanket disables); remove eslint deps + config; CI stays untouched (script names stable).
2. **Vite 8 / Rolldown.** devtools devDep bump + full plugin test suite under 8; the `enforce: 'pre'` byte-offset regression test; Vitest bump (whole-suite run); playground smoke; optional `/rolldown` export (+ docs).
3. **oxfmt swap (gated).** Option-parity check; rewire `format` / `check-format` / `check-format-pre-commit` keeping md on Prettier; one-time isolated reformat commit; CLAUDE.md + SETUP.md wording updates.
4. **Containers (follow-up).** Website when Nuxt allows; benchmarks harness bump + bench re-baseline + image republish.
5. **Typo fix rides milestone 1:** `lint-pre-committ` → `lint-pre-commit` (script key + lint-staged references).

## 6. Risks / open questions

- **oxfmt maturity** — the youngest oxc tool. If it can't reproduce `printWidth: 130` / `trailingComma: es5` / `bracketSpacing: false` exactly, defer milestone 3; the value is real but not urgent.
- **Rule-parity gaps** — a handful of typescript-eslint rules may have no oxlint equivalent. The mapping table makes the loss explicit; accept consciously per rule.
- **Rolldown transform ordering** (§3.3) — the one genuinely dangerous unknown: if `enforce: 'pre'` semantics differ, every byte offset breaks. The regression test is the gate; if broken, escalate before proceeding (the fix may belong in rolldown/unplugin, not here).
- **Vitest/Vite-8 pairing maturity** — the entire JS suite (incl. the fuzz harnesses and the marker package's `source`-condition resolution, which relies on `resolve.conditions` in vitest configs) must behave identically. Run the full suite + fuzz smoke before landing.
- **Bench comparability** — Vite-8 bench numbers are not comparable to the published Vite-5 ones; re-baseline in the same PR that bumps the harness, and republish website bench data (`pnpm run website:publish`).
- **Two formatters under one command** (oxfmt for TS, Prettier for md) — acceptable as long as `pnpm run format` remains the single entry point; document inside the script, not in prose people won't read.

## 7. Testing (PR-readiness gate)

- Milestone 1: `pnpm run lint` green repo-wide; a seeded lint error in a scratch file fails both the script and the pre-commit hook; CI lint job green with zero workflow edits.
- Milestone 2: full `pnpm test` (Go binary prebuilt per SETUP.md) green under Vite 8 / new Vitest; the byte-offset regression fixture; playground demo boots; devtools e2e vite-build test (composite source map) still passes.
- Milestone 3: `pnpm run check-format` green after the reformat commit; pre-commit gate exercises both oxfmt (ts) and prettier (md) paths.
- Docs: SETUP.md (lint/format sections), CLAUDE.md (format wording, dev-workflow), README if the `/rolldown` export ships; website configuration page only if plugin surface changed.
- On implementation, `git mv` this file into [`docs/done/`](../done) (or [`docs/partially/`](../partially)) updated to match what shipped.
