# scripts/ shell -> `.mjs` migration (unify the toolchain on Node)

**Status:** proposed (investigation done; implementation deferred)
**Scope:** the shell scripts under `scripts/` (+ `container/website/scripts/build-playground.sh`), plus every consumer that invokes them (root `package.json`, the three CI workflows + composite actions, and the cross-script calls). Docs that reference the paths. **No product code, no Go, no test code.**
**Goal:** port the remaining `.sh` scripts to `.mjs` so the whole `scripts/` toolchain is one language, funnel every consumer through the single root `rt.mjs` entry point, and load `.env` once there. Delete the `registry.sh` <-> `load.mjs` duplication and the shell-sourcing glue.

---

## TL;DR

- The prior refactor ([scripts-audit-and-internal-cli-consolidation.md](scripts-audit-and-internal-cli-consolidation.md)) reorganized `scripts/` into area folders behind `rt`, but **deliberately kept the language mix** (its rule was "`rt` dispatches, the leaves stay as-is"). That left **13 `.sh` + 16 `.mjs`**, and the awkwardness is concentrated in the shell **sourcing glue**, not the leaf logic.
- Port **10 of the 13** shell scripts to `.mjs`. **3 stay shell for a real reason** (they run before the Node toolchain is guaranteed on PATH). The in-container `sh -c` snippets also stay shell (they run inside the Linux container).
- **Single entry point:** all consumers (`package.json`, CI) call `pnpm rt <area> <command>`; `rt.mjs` `loadEnv()`s once at the top and dispatches **in-process** to imported area modules. No consumer references a leaf path anymore.
- The migration is **net-simplifying**: `awk`-parsing podman JSON -> `JSON.parse`; `${arr[@]+"..."}` empty-array guards -> native arrays; BSD/GNU `stat` branches -> `fs.statSync().mtimeMs`; hand-rolled ANSI vars -> `node:util` `styleText`; `curl` poll -> native `fetch`. The **macOS bash-3.2 ASCII-only policy disappears** (it exists only because these are shell scripts).
- Risk concentrates in **three files**: `core/build.sh` (hot path of every `pnpm test`/`lint`/CI), `release/publish.sh` (real npm publishes), and `website/site.sh` (interactive TTY + signal handling). Everything else is mechanical.

---

## Why (motivation)

Three concrete pains the mix creates today:

1. **Duplication.** `.env` loading is implemented **twice**: [scripts/env/registry.sh](../../scripts/env/registry.sh) (`set -a; . .env`) for shell consumers and [scripts/env/load.mjs](../../scripts/env/load.mjs) (`process.loadEnvFile`) for JS consumers. A JS-only world collapses these to one module.
2. **Sourcing glue.** [registry.sh](../../scripts/env/registry.sh) is `source`d by 5 scripts to share both the loaded env and the `rt_env_registry()` data table; [lib.sh](../../scripts/container/lib.sh) / [ghcr.sh](../../scripts/container/ghcr.sh) are `source`d for shared vars + functions. This shared-mutable-shell-state pattern is exactly what doesn't compose with the `.mjs` half — `source x.sh` becomes a plain `import`.
3. **bash-3.2 tax.** The whole ASCII-only policy (see the note in every lib header) exists solely because macOS ships bash 3.2 and mis-parses UTF-8 in variable expansions. Gone once the scripts are Node.

Node 26 is already a hard requirement (`engines.node >= 26`), so every needed built-in is available with **zero new dependencies**, matching the existing zero-dep convention ([rt.mjs](../../scripts/rt.mjs), [scripts/lib/rmrf.mjs](../../scripts/lib/rmrf.mjs), [load.mjs](../../scripts/env/load.mjs)).

## Decisions settled (owner, this session)

1. **Always `.mjs`.** Every migrated script is a `.mjs` module.
2. **Single entry point at root `rt.mjs`.** Any consumer (package.json, CI) points at `rt`, never at a leaf. `loadEnv()` is invoked once at the `rt.mjs` entry point; in-process dispatch + inherited `process.env` carry it to everything downstream.
3. **Keep the shell files that have a genuine reason.** Where a file must run before the Node toolchain exists, it stays `.sh`.

### `.env` semantics — a deliberate, ratified behavior change

Shell `set -a; . .env` **overrides** an already-set var; Node `process.loadEnvFile()` does **not**. Today this means `RT_WEBSITE_PORT=4000 pnpm rt website dev` is silently overridden by `.env`'s value in the shell path — a latent footgun [load.mjs](../../scripts/env/load.mjs) already avoids. **The migration adopts the Node no-override semantics everywhere** (a real inline env or CI env always wins; `.env` fills gaps only). Skip loading when `CI` is set (belt-and-suspenders, unchanged).

---

## Inventory

### Migrate (10 files, ~2,000 lines)

| # | File | Lines | Notes / hardest bits |
|---|---|---|---|
| 1 | [scripts/env/registry.sh](../../scripts/env/registry.sh) + [scripts/env/load.mjs](../../scripts/env/load.mjs) | 154+16 | Fold both into **`scripts/lib/env.mjs`**: `loadEnv()` (idempotent, no-override) + `REGISTRY` array. This is the keystone unlock. |
| 2 | [scripts/env/check.sh](../../scripts/env/check.sh) | 97 | Prints the registry status table + per-task verify. Pure logic once `REGISTRY` exists. |
| 3 | [scripts/core/build.sh](../../scripts/core/build.sh) | 314 | **HOT PATH.** `go build` + build-id compare, cross-compile, dist sentinel + orphan-`.d.ts.map` + mtime staleness. Port logic **exactly**. |
| 4 | [scripts/container/lib.sh](../../scripts/container/lib.sh) | 74 | Shared config + `require_engine` + macOS `podman machine` autostart. -> shared module. |
| 5 | [scripts/container/ghcr.sh](../../scripts/container/ghcr.sh) | 90 | GHCR login/push/pull (`--password-stdin`, multi-arch manifest). -> `engine.mjs` helpers. |
| 6 | [scripts/container/image.sh](../../scripts/container/image.sh) | 250 | Image lifecycle. `awk` manifest-digest parse -> `JSON.parse`; `stat` portability -> `statSync`. |
| 7 | [scripts/website/site.sh](../../scripts/website/site.sh) | 437 | **TTY/signals.** `exec podman run -it` -> `spawnSync(stdio:'inherit')`; smoke bg + `curl` poll + `trap` -> `fetch` poll + `process.on`. In-container `sh -c` blocks stay strings. |
| 8 | [scripts/website/build.sh](../../scripts/website/build.sh) | 169 | Orchestrator: sequential calls into image/bench/site + node data feeders. Becomes an async fn composing the migrated modules. |
| 9 | [scripts/website/bench-data/bench.sh](../../scripts/website/bench-data/bench.sh) | 546 | Container-run benchmark orchestration; structurally like image/site, no exotic idioms. |
| 10 | [scripts/release/publish.sh](../../scripts/release/publish.sh), [preflight.sh](../../scripts/release/preflight.sh), [unpublish.sh](../../scripts/release/unpublish.sh) | 88+61+73 | **Release-critical + interactive.** `read -rp` (version/OTP/confirm) -> `node:readline/promises`. Validate with `npm publish --dry-run`. |
| + | [container/website/scripts/build-playground.sh](../../container/website/scripts/build-playground.sh) | 194 | Host-side WASM/overlay build, staleness-gated; called by site.sh + build.sh. No pre-toolchain reason to stay shell -> migrate for consistency. (Keep it under `container/website/scripts/` as `.mjs`, or move under `scripts/website/` — decide during impl.) |

### Stay shell (real reason: pre-toolchain window)

- [scripts/setup-claude-web.sh](../../scripts/setup-claude-web.sh) — **installs Node 26 itself** (`provision_node26()` via nvm / nodejs.org tarball, then PATH-wires it). Can't be run under a Node that doesn't exist yet.
- [.claude/skills/ts-runtypes-setup/](../../.claude/skills/ts-runtypes-setup/) `*.sh` (setup.sh + `pm/{apt,brew,dnf,pacman,zypper}.sh` + `lib/common.sh`) — host bootstrap, package-manager-specific, runs before the toolchain.
- [.claude/hooks/session-start.sh](../../.claude/hooks/session-start.sh) — a **dependency-presence tripwire** that must detect "node absent / wrong version" ([session-start.sh:36-37](../../.claude/hooks/session-start.sh:36)). A tripwire cannot be written in the language whose presence it checks — `command: node session-start.mjs` would emit a raw `command not found` instead of the clean `MISSING node -> run setup-claude-web.sh` report, in exactly the not-yet-set-up scenario it exists for.
- **In-container `sh -c '...'` snippets** inside `podman run` (site.sh agent-watchdog + `generate` post-processing) — they execute inside the Linux container, which always has `sh`. Pass them through as strings, unchanged.

---

## Target architecture

```
scripts/
  rt.mjs                     # THE entry point: loadEnv() once, then in-process dispatch
  lib/
    env.mjs                  # loadEnv() (idempotent, no-override) + REGISTRY[]   (was registry.sh + load.mjs)
    proc.mjs                 # run()/runOrThrow()/capture()/which(), CliError(die), styleText log/info/success/warn/fail
    engine.mjs               # podman: requireEngine, ensureMachineRunning, imageExists, digests, run/build, ghcr login/push/pull  (was lib.sh + ghcr.sh)
    rmrf.mjs                 # (unchanged)
  core/       build.mjs  smoke.mjs  gen-diagnostics-catalog.mjs
  website/    site.mjs  build.mjs  serve.mjs  playground-overlay.mjs  suite-data/*  bench-data/{bench.mjs, gen-*.mjs}
  container/  image.mjs
  env/        check.mjs
  release/    publish.mjs  preflight.mjs  unpublish.mjs  bump-version.mjs  build-binaries.mjs  pack.mjs  publish-tarballs.mjs
```

Contract that makes single-entry + one-`loadEnv` work:

- **Leaves export functions, never call `process.exit`.** Each area module exports e.g. `export async function main(args) { ... }`. Failures `throw` (via `proc.die()` -> a tagged `CliError{message, code}`). `rt.mjs` wraps dispatch in `try/catch`: a `CliError` prints + `process.exitCode = code`; anything else rethrows. This lets `build.mjs` compose `image.mjs`/`bench.mjs` in one process (the current `build.sh` -> `bash image.sh` chain).
- **`rt.mjs` calls `loadEnv()` once**, then `await dispatch(argv)`. External tools it spawns (`go`, `podman`, `pnpm`, `vitest`, `git`, `npm`) inherit `process.env`.
- **Direct invocation still works** (debugging): each leaf has an `if (isEntry(import.meta)) { await loadEnv(); await main(process.argv.slice(2)); }` footer calling the same idempotent `loadEnv()`. Consumers must not rely on it — the supported path is `rt`.
- **Flags** via `node:util` `parseArgs`; **prompts** via `node:readline/promises`; **colors** via `node:util` `styleText` (auto-respects `NO_COLOR`/non-TTY).

## Shell idiom -> Node built-in (the mechanical mapping)

| Shell | Node (zero-dep) |
|---|---|
| `set -a; . .env` | `process.loadEnvFile(path)` (no-override; idempotent module guard) |
| `rt_env_registry()` heredoc table | `export const REGISTRY = [{name, scope, task, desc}, ...]` |
| `RED='\033[..'` … `echo -e` | `node:util` `styleText(['red'], s)` |
| `read -rp "..." VAR` | `node:readline/promises` `createInterface().question()` |
| `exec podman run -it … nuxt dev` | `spawnSync('podman', args, {stdio:'inherit'})` (SIGINT propagates to child; `--init` reaps in-container) |
| `podman run -d …` + `curl` poll + `trap … EXIT INT TERM` | `spawnSync('podman', ['run','-d',…])` + native `fetch()` poll loop + `process.on('exit'|'SIGINT'|'SIGTERM', cleanup)` |
| `awk` over `podman manifest inspect` | `JSON.parse(capture('podman', ['manifest','inspect',ref]).stdout)` |
| `stat -c %Y \|\| stat -f %m` | `fs.statSync(p).mtimeMs` |
| `find DIR -type f -newer ANCHOR` | `fs.globSync('**/*', {cwd}).map(statSync)` vs anchor mtime |
| `mktemp` + `trap 'rm' EXIT` | `fs.mkdtempSync(join(os.tmpdir(), 'rt-'))` + `try/finally` |
| `${arr[@]+"${arr[@]}"}` guards | native JS arrays + spread |
| `go tool buildid X` compare | `capture('go', ['tool','buildid', x]).stdout.trim()` |
| `command -v x` | `which(x)` helper (probe PATH / `spawnSync` rc) |
| `source lib.sh` | `import {...} from './lib/....mjs'` |

---

## Consumers to reroute (every one — do in lockstep)

Grep basis: all live references are enumerated below. **Non-goal: change the deleted-file references in `docs/done/**` and `docs/partially/**`** (historical records).

**Root `package.json`** ([package.json](../../package.json)):
- `check:builds`: `bash scripts/core/build.sh` -> `node scripts/rt.mjs core build` (or `pnpm rt core build`)
- `check:env`: `bash scripts/env/check.sh` -> `node scripts/rt.mjs env`
- `pretest` / `prelint:runtypes` reference `check:builds` (unchanged once it reroutes)
- `gen:diag-catalog` stays (`node scripts/core/gen-diagnostics-catalog.mjs`); `gen:ts-constants` / `gen:run-type-kind` stay (`go run …`)

**CI workflows:**
- [ci.yml:162](../../.github/workflows/ci.yml) `bash scripts/core/build.sh all linux-go linux-extract` -> `pnpm rt core build all linux-go linux-extract`
- [ci.yml:166](../../.github/workflows/ci.yml) `bash scripts/website/site.sh smoke` -> `pnpm rt website check`
- [ci.yml:173](../../.github/workflows/ci.yml) `bash scripts/website/bench-data/bench.sh smoke` -> `pnpm rt bench smoke`
- **[ci.yml:140-143](../../.github/workflows/ci.yml) path filter** — `scripts/core/build.sh` and `scripts/env/registry.sh` are file-specific; retarget to `scripts/core/build.mjs`, `scripts/lib/env.mjs` (+ keep `scripts/website/**`, `scripts/container/**` dir globs, which still match). **Miss this and the container-smoke gate silently stops firing.**
- [publish.yml:110](../../.github/workflows/publish.yml) `bash scripts/website/build.sh generate` -> `pnpm rt website build` (+ confirm `--ssr`/no-ssr target mapping)
- [publish.yml:59](../../.github/workflows/publish.yml) `node scripts/release/publish-tarballs.mjs` (already JS; leave or route via `rt release tarballs`)
- [release-gate.yml:183-189](../../.github/workflows/release-gate.yml) `bench.sh prep|bench|typecost` -> `pnpm rt bench prep|bench|typecost`
- [release-gate.yml:208](../../.github/workflows/release-gate.yml) `bash scripts/website/site.sh build` -> **needs a verb**: `site.sh build` (container prod build) is NOT the same as `rt website build` (full pipeline). Add/confirm a mapping (e.g. `rt website build --ssr` vs a dedicated `rt website container-build`).
- [release-gate.yml:93,95](../../.github/workflows/release-gate.yml) `node scripts/release/{build-binaries,pack}.mjs` (already JS)

**Composite actions:**
- [.github/actions/pull-shared-image/action.yml:5,19](../../.github/actions/pull-shared-image/action.yml) — reference to `scripts/container/image.sh push` is **doc/error-message text only**; update the string.
- [.github/actions/verdaccio-publish/action.yml:23](../../.github/actions/verdaccio-publish/action.yml) — `node scripts/release/publish-tarballs.mjs …` (already JS).

**Cross-script calls (become imports/in-process):**
- `build.sh` -> `image.sh ensure`, `bench.sh prep|website-bench`, `site.sh <target>`, `build-playground.sh`, and 5 `node …/suite-data/*.mjs`
- `site.sh` -> `image.sh ensure`, `build-playground.sh`
- `bench.sh` -> `ghcr.sh`/`image.sh` (via `run_manager`)
- `image.sh` -> `lib.sh`, `ghcr.sh`
- [container/website/scripts/build-playground.sh:151](../../container/website/scripts/build-playground.sh) -> `scripts/core/build.sh marker-dist`

## Docs to update

- [CLAUDE.md](../../CLAUDE.md) — the `rt_env_registry()` reference (line ~70), `registry.sh`/`load.mjs` load-path (line ~74), image-lifecycle paragraph (line ~87), `build.sh`/`pretest` (lines ~51), the transform-wire bench path (line ~140), binary-distribution `publish.sh` (line ~27).
- [SETUP.md](../../SETUP.md) — every `scripts/website/site.sh …`, `scripts/container/{image,ghcr}.sh`, `scripts/core/build.sh`, `scripts/release/publish.sh`, `container/website/scripts/build-playground.sh` mention (lines ~55, 103, 109, 114, 121, 131, 142, 144, 156, 308, 312). Prefer switching prose to the `pnpm rt …` form.
- [README.md:254](../../README.md) — `scripts/release/publish.sh` mention.
- [container/benchmarks/README.md](../../container/benchmarks/README.md), [container/website/CLAUDE.md](../../container/website/CLAUDE.md), [container/website/CONTAINER.md](../../container/website/CONTAINER.md) — `site.sh` / `image.sh` / `bench.sh` mentions.
- On completion: `git mv` this file into `docs/done/` and record what shipped.

---

## Risks + mitigations

1. **`core/build.mjs` regression (hot path).** Wrong staleness detection -> needless rebuilds (slow) or stale binary (wrong test results). *Mitigation:* port the build-id compare + orphan-`.d.ts.map` + mtime logic line-for-line; add a small unit test; A/B the "up to date" vs "rebuilt" verdicts against `build.sh` on the same tree before deleting the `.sh`.
2. **Release correctness.** *Mitigation:* migrate `publish.mjs` last; dry-run every publish path (`npm publish --dry-run`, `pnpm publish --dry-run`); lean on the already-JS `pack.mjs`/`build-binaries.mjs`; keep the platform-first/launcher-last ordering exactly.
3. **Interactive TTY / signal handling (`site.mjs dev`).** *Mitigation:* verify Ctrl-C cleanly stops + `--rm`s the container on macOS podman; keep the pre-run `podman rm -f <stale>` guard; register cleanup on `SIGINT`/`SIGTERM`/`exit`.
4. **Container flows are hard to fully verify locally** (need podman + the GHCR image). *Mitigation:* faithful literal port of the exact `podman` arg vectors; assert the constructed argv in a dry-run mode; rely on the CI `smoke` job (path-gated, will run since these files change) as the real gate; add an adversarial review pass diffing `.sh` vs `.mjs` behavior.
5. **`.env` no-override behavior change** (see above) — intended, but call it out in the PR description so it isn't a surprise.
6. **Big diff / review load** (~2,000 lines, 10 files). *Mitigation:* stage by tier (below), not one mega-commit.

## Verification / acceptance gate

Local (must pass before the `.sh` is deleted for each tier):
- `go test ./internal/...` (unaffected, sanity)
- `pnpm test` (proves `core/build.mjs` produced a working binary)
- `pnpm run lint` (oxlint over the new `scripts/**/*.mjs` + typecheck)
- `pnpm run check-format`
- `pnpm rt core smoke`, `pnpm rt core codegen all --check`
- `pnpm rt env` (proves `check.mjs` + `REGISTRY`), `pnpm rt env push-image`
- `pnpm rt release --dry-run`; `publish` paths via `--dry-run`
- Where podman is available: `pnpm rt container ensure`, `pnpm rt website check`

CI (the real gate for container flows): the `smoke` job in [ci.yml](../../.github/workflows/ci.yml) is path-gated on `scripts/website/**`, `scripts/container/**`, `scripts/env/*` — it fires on this change and exercises `rt website check` + `rt bench smoke` against the pulled image.

## Suggested staging (separate commits/PRs)

1. **Foundation** — `lib/env.mjs` (+ delete `registry.sh`/`load.mjs`), `lib/proc.mjs`, `lib/engine.mjs`; `env/check.mjs`. Wire `rt.mjs` `loadEnv()` + in-process dispatch skeleton. Reroute `check:env`.
2. **Core** — `core/build.mjs` (careful; A/B). Reroute `check:builds` + `ci.yml` build step + path filter.
3. **Container** — `container/image.mjs` (+ `ghcr`/`lib` fold into `engine.mjs`).
4. **Website** — `website/site.mjs`, `website/build.mjs`, `build-playground.mjs`. Reroute `publish.yml` + `release-gate.yml` site steps.
5. **Bench** — `website/bench-data/bench.mjs`. Reroute the `release-gate.yml` bench steps + `ci.yml` bench smoke.
6. **Release** — `release/{publish,preflight,unpublish}.mjs`. Dry-run everything.
7. **Docs sweep** + `git mv` this todo to `docs/done/`.

## Open questions (resolve during impl, not blockers)

- **`site.sh build` vs `rt website build`** — add a distinct `rt` verb for the container-only prod build ([release-gate.yml:208](../../.github/workflows/release-gate.yml)) so it doesn't collide with the full pipeline verb.
- **`build-playground` location** — keep under `container/website/scripts/` (co-located with the site it serves) or relocate under `scripts/website/`? Lean co-located; it's referenced from CONTAINER.md/SETUP.md.
- **In-process vs spawn-node for leaves** — spec prefers in-process import (truest single-entry + one `loadEnv`); fall back to spawning `node leaf.mjs` children only if a leaf proves hard to compose (children still inherit the loaded env).
