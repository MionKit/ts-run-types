# Review & remove unnecessary dependencies

**Status:** ✅ SHIPPED (2026-07-04) — landed on `claude/review-unnecessary-deps-9dk5lz` as three
sequential, individually-green commits.
**Owner:** ma-jerez
**Last verified:** 2026-07-04 (full suite on Node 26.4.0)

## Context

The root `package.json` carried dev-tooling dependencies worth re-examining for supply-chain
surface. This change reviewed four and removed the three that didn't earn their keep, replacing
their behaviour with plain `pnpm` + two tiny zero-dependency scripts. Net lockfile reduction:
**~585 packages** (lerna/nx trees + rimraf's glob subtree + temporal-polyfill).

## Outcome (SHIPPED)

### 1. lerna + nx removed entirely — `pnpm` + one script
lerna and nx were used only for manual publishing and cross-package fan-out. lerna-lite was
considered and rejected: `@lerna-lite/cli` still pulls a comparably large tree
(`@lerna-lite/core/publish/version/listable`, `pacote`, `libnpmpublish`, …).

- **Fan-out** `lerna run <s>` → `pnpm -r run <s>` (native workspace-topological order;
  `build` / `typecheck:test` / `clean` / `fresh-start`). `nx reset` dropped from `clean`.
- **Version bump** `lerna version` → [`scripts/bump-version.mjs`](../../scripts/bump-version.mjs):
  writes the lockstep version into `version.json` + every `package.json`, then commits + tags.
- **Publish** `lerna publish from-package` → `pnpm publish` for the two FE packages. `pnpm pack`/
  `publish` rewrites `workspace:*` to concrete versions — the same mechanism CI already relied on
  ([`scripts/pack-artifacts.mjs`](../../scripts/pack-artifacts.mjs)), so the production path is unchanged.
- **Unpublish** `lerna ls --toposort` → hardcoded reverse dependency order.
- **`lerna.json` → `version.json`** (source of truth); repointed the 3 readers
  (`build-binary-packages.mjs`, `release-gate.yml`, `publish.yml`). `nx.json` deleted; dead `.nx`
  ignore entries removed; docs updated (CLAUDE.md, README.md, SETUP.md, task-reset skill).
- Prunes 425 net lockfile packages.

### 2. rimraf removed — `scripts/rmrf.mjs`
6 dev-only `clean`/`fresh-start` call sites (never in CI). Replaced by a two-line native
`fs.rmSync` helper ([`scripts/rmrf.mjs`](../../scripts/rmrf.mjs), recursive + force,
cross-platform incl. Windows, no-throw on missing). Prunes another 84 packages — rimraf's `glob@13`
subtree was shared with lerna's npm internals, so it only fully pruned once lerna was gone too.

### 3. temporal-polyfill dropped — Node baseline raised to 26
Temporal ships unflagged in Node 26 (ES2026); the polyfill only existed so host + CI tests could
run on Node < 26. The shipped library never imported it (reads `globalThis.Temporal`).

- Deleted the polyfill devDep and every Node<26 install/fallback (`test/setup.ts`, the two
  export-suite scripts, `gen-serialization-bench.mjs`, the `benchmarks.sh` bind-mount).
- Bumped every Node pin 24 → 26: CI `setup-node` (bootstrap action, release-gate e2e, publish),
  `engines.node`, the session-start hook, `setup-claude-web.sh` (`provision_node26`), the
  ts-runtypes-setup skill, SETUP.md. Containers were already `node:26-bookworm`.
- Consumers unaffected (published packages declare no `engines`).

### 4. @types/node bumped 24.12.2 → 26.1.0
Types now track the Node 26 runtime. `@types/node` is pure declaration files (no runtime, no install
script), so it was added to `minimumReleaseAgeExclude` in
[`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) — the 30-day guard defends against malicious
*runtime* releases, which `.d.ts` files can't carry. Its sole dep, `undici-types@8.3.0`, is already
>30 days old and passes the policy on its own. The stricter Node 26 event types surfaced one latent
gap (the `session.ts` worker `'error'` listener param is now `unknown`), fixed with the same
`instanceof Error` narrowing already used one branch up.

### 5. prettier — reviewed, KEPT
Removing the root `prettier@3.8.2` devDep frees **zero** packages: prettier has no transitive deps,
and the identical version is a *runtime* dep of the playground
([`packages/runtypes-playground`](../../packages/runtypes-playground)), which lazy-loads
`prettier/standalone` in-browser to beautify generated code. oxfmt cannot take over either role yet:
it has **no browser/WASM build** (oxc discussion #3311), and while oxfmt *can* now format Markdown
(Feb 2026 Beta), it carries open idempotency bugs on lists-with-fenced-code (oxc #20778) — exactly
the shape of the repo's README/SKILL files. Kept as-is.

## Follow-ups (out of scope)

- **prettier removal** becomes viable if oxfmt ships a browser/WASM formatter (unblocks the
  playground) and its Markdown idempotency bugs land.

## Verification (Node 26.4.0)

- Full JS suite: **7677 passed / 34 skipped**, incl. the Temporal adapter/serialization/wire-size
  suites green on **native** Temporal with the polyfill gone.
- `pnpm run lint` (oxlint + typecheck) ✓, `pnpm run check-format` ✓, `go test ./internal/...` ✓.
- `pnpm install --frozen-lockfile` self-consistent; `pnpm -r run build`/`typecheck:test` fan-out
  confirmed topological. `bump-version.mjs` exercised end-to-end (bumps 6 files, commits + tags);
  `pnpm pack` confirmed to rewrite `workspace:*` → concrete.
