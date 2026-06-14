# Setup

Single setup document for `ts-go-run-types`. Architecture + workflow rules live in [CLAUDE.md](CLAUDE.md); design deep-dive in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

> **Automated path:** the `ts-run-types-setup` skill ([.claude/skills/ts-run-types-setup/](.claude/skills/ts-run-types-setup/)) drives this whole document end-to-end — host deps, submodule bootstrap + patches, `pnpm install`, Go + plugin builds, podman engine, and smoke verification. Run `bash .claude/skills/ts-run-types-setup/setup.sh` and the rest of this doc is reference material.

The repository contains a **Go binary** at [cmd/ts-go-run-types/](cmd/ts-go-run-types/) and a **pnpm/Lerna workspace** of JS packages under [packages/](packages/). The monorepo setup mirrors [mion](https://github.com/MionKit/mion). Two **podman-containerized** apps ship alongside: the docs website ([website/](website/)) and the validation benchmarks ([benchmarks/](benchmarks/)).

---

## Prerequisites

| Tool   | Version  | Needed by                                     | Source of truth                      |
| ------ | -------- | --------------------------------------------- | ------------------------------------ |
| Go     | ≥ 1.26   | resolver binary + benchmarks                  | `go.mod`                             |
| Node   | ≥ 24.0.0 | tests, builds, benchmarks host prep           | root `package.json` `engines.node`   |
| pnpm   | ≥ 11.0.0 | the monorepo (workspace policies)             | `packageManager: pnpm@11.1.1`        |
| git    | recent   | submodule + `git apply` are used              | -                                    |
| podman | ≥ 4.0    | docs website + benchmarks containers          | tested 4.9.3 / 5.8.3                 |

**macOS Apple Silicon also needs Rosetta 2** — the podman-machine `vfkit` backend requires it and exits 1 without it. Install with `softwareupdate --install-rosetta --agree-to-license` (the skill does this automatically).

---

## Clone & bootstrap

```bash
git clone git@github.com:mionkit/ts-go-run-types.git
cd ts-go-run-types
git submodule update --init --recursive
(cd third_party/tsgolint/typescript-go && git apply --3way ../patches/*.patch)
pnpm install --frozen-lockfile
```

What this does:

1. Pulls `oxc-project/tsgolint` (which nests `microsoft/typescript-go`).
2. Applies the five vendored patches to the `typescript-go` working tree via `git apply --3way` — no commits needed (CI-safe, no git identity required). The patches are upstream tsgolint artifacts; never edit them.
3. Installs workspace deps from the committed lockfile.

The Go module graph resolves against the patched `typescript-go` working tree — `go build` will fail without the patches.

---

## Build

### Go binary

```bash
go build -o bin/ts-go-run-types ./cmd/ts-go-run-types
```

The Vite plugin spawns this binary at JS test time and at build time — **build it before `pnpm test`**. The root `pretest` script runs [`scripts/check-stale-builds.sh`](scripts/check-stale-builds.sh) which auto-rebuilds the Go binary, the marker package dist, and the vite plugin dist when any of them is stale or partially emitted.

### JS packages

```bash
pnpm run build                                       # all packages, lerna-orchestrated
pnpm --filter @mionjs/ts-go-run-types run build      # single package
pnpm --filter vite-plugin-runtypes run build         # the other
```

Outputs land in `packages/*/dist/`. The plugin's dist must be present for marker-package typecheck (no `source` condition in its exports map) — rebuild after every plugin src edit.

---

## Test

```bash
go test ./internal/...                          # Go suite
pnpm test                                       # all JS packages (Vitest projects)
pnpm --filter vite-plugin-runtypes test         # single package
pnpm --filter @mionjs/ts-go-run-types test      # the other
```

JS plugin tests in [packages/vite-plugin-runtypes/test/](packages/vite-plugin-runtypes/test/) spawn the Go binary — `pretest` rebuilds it.

---

## Containerized apps (docs website + benchmarks)

Both apps install their heavy node_modules **inside** a podman image (supply-chain isolation; the host never touches them). The images are **deps-only**: they bake third-party `node_modules` plus the package-manager manifests **and nothing else** — no Go binary, no benchmark code, no website source. All first-party files (source + the website's Nuxt/TS/ESLint config) are bind-mounted at run time, so an image is invalidated only when a dependency manifest changes. Drivers: [scripts/website.sh](scripts/website.sh) and [scripts/benchmarks.sh](scripts/benchmarks.sh).

The package-manager files (`package.json`, lockfile, `pnpm-workspace.yaml`, `.npmrc`) live in a per-project **`_deps/`** dir — `website/_deps/` and `benchmarks/_deps/` (mirroring `competitors/<name>/` + `typecost/`). They are deliberately kept **out of the host project roots** so you can't accidentally `pnpm install` at `website/` or a competitor dir; the Containerfiles `COPY` them into the right in-image locations at build. To bump a website dependency, edit `website/_deps/package.json`, regenerate the lockfile in-container with `pnpm run website:lock`, then `website:build-image` (+ `website:push`).

| Surface     | pnpm script              | What it does                                                                       |
| ----------- | ------------------------ | ---------------------------------------------------------------------------------- |
| Website     | `pnpm run website:dev`   | Hot-reload dev server on `:3000` (bind-mounted source).                            |
| Website     | `pnpm run website:smoke` | Build image (if stale) + boot dev server detached + curl `:3000` + tear down.      |
| Website     | `pnpm run website:build` | Production build to `website/.output`.                                             |
| Benchmarks  | `pnpm run bench:prep`    | Build the resolver binary (host + Linux cross) + JS packages on the host.          |
| Benchmarks  | `pnpm run bench`         | Build + run EVERY competitor in its own isolated container, then aggregate.         |
| Benchmarks  | `pnpm run bench:one <n>` | Build + run a SINGLE competitor + aggregate (fastest verification loop).            |
| Benchmarks  | `pnpm run bench:smoke`   | Build every competitor's dist (no run) — minutes shorter.                           |
| Benchmarks  | `pnpm run bench:typecost`| Per-competitor type-instantiation-cost benchmark.                                  |

The website only needs **podman**; the benchmarks additionally need **Node + pnpm + Go** for the host prep (resolver binary + first-party dists, bind-mounted into the container). On macOS the prep cross-compiles a `bin/ts-go-run-types-linux-<arch>` so the Linux container can execute it.

Every runtime command in [`scripts/benchmarks.sh`](scripts/benchmarks.sh) self-syncs prereqs by delegating to [`scripts/check-stale-builds.sh`](scripts/check-stale-builds.sh) (also used by `pretest`): it rebuilds the Go binary, the Linux cross-binary, the plugin dist, and the marker dist when any of them is stale or has a partial tsc emit, and rebuilds the podman image when a **dependency** input changes (the `Containerfile` or anything under `benchmarks/_deps/`). Benchmark source is bind-mounted, so editing it never triggers an image rebuild. Manual `pnpm run bench:prep` remains available for explicit refresh.

macOS-specific knobs:

- `WEBSITE_POLL=1 pnpm run website:dev` — VM file-watch needs filesystem polling.
- The skill calls `podman machine init` + `podman machine start` automatically; manually it's the same two commands.

Behind a corporate / MITM proxy: pass `WEBSITE_CA_CERT=... WEBSITE_BUILD_NETWORK=host pnpm run website:build-image` (and the `BENCH_*` equivalents). See `website/CONTAINER.md`.

### Publishing & consuming the images via GHCR

The deps-only images are published to the GitHub Container Registry so any host can **pull a ready-to-run image** instead of re-running all installs. Helpers live in [scripts/lib-ghcr.sh](scripts/lib-ghcr.sh).

| Step | Command | Notes |
| ---- | ------- | ----- |
| Authenticate (once) | `pnpm run website:login` / `pnpm run bench:login` | Reads the PAT from `GHCR_PAT` or `GHCR_PAT_FILE`, pipes via `--password-stdin`. |
| Publish | `pnpm run website:push` / `pnpm run bench:push` | Builds a **multi-arch** (`linux/amd64,linux/arm64`) manifest and pushes it. |
| Consume | `WEBSITE_USE_REMOTE=1 pnpm run website:dev` (or `bench:*`) | Pulls + tags the published image instead of building locally. |
| Pull only | `pnpm run website:pull` / `pnpm run bench:pull` | Fetch + retag without running. |

GHCR env (see [scripts/lib-ghcr.sh](scripts/lib-ghcr.sh)): `GHCR_OWNER` (default `mionkit`), `GHCR_USER` (default `M-jerez`), `GHCR_PAT` / `GHCR_PAT_FILE`, `WEBSITE_REMOTE_IMAGE` / `BENCH_REMOTE_IMAGE` (default `ghcr.io/$GHCR_OWNER/tsrt-{website,bench}:latest`).

Notes:

- **PAT scope:** push needs `write:packages` (pull of a private image needs `read:packages`). For pushing to the **org** namespace (`ghcr.io/mionkit/…`) use a **classic** PAT authorized for the MionKit org via SSO — fine-grained tokens need the org to opt in to package writes. If an org push is denied, publish under your personal namespace with `GHCR_OWNER=<you>`.
- **Multi-arch on an arm64 Mac:** the `linux/amd64` arm builds under QEMU emulation (slower). The benchmark image no longer pre-warms typia at build time — the first `BENCH_TYPIA=1` run compiles typia's native plugin (~200s) into a persisted named volume (`pnpm run bench:clean` drops it); later runs reuse it.
- **Visibility:** GHCR packages are **private by default**. Make them public (or grant the repo read access) so CI / other hosts can pull without authenticating. The images carry an `org.opencontainers.image.source` label so the package links to this repo.

---

## Lint & format

```bash
pnpm lint            # lerna run lint (eslint per package)
pnpm format          # prettier --write 'packages/**/*.{ts,md}'
pnpm check-format    # prettier --check (CI-safe)
```

ESLint config is flat (`eslint.config.js`) and TypeScript-aware via `projectService`. Prettier rules live in `.prettierrc`.

### Variable naming

Use meaningful names in both Go and JS/TS — avoid one-letter abbreviations like `p`, `c`, `t`. When a struct field has a JSON tag, reuse that name. Loop indices (`i`, `k`, `v`) and `err` are fine.

```go
// Bad
func New(p *program.Program, c *checker.Checker) { ... }

// Good
func New(program *program.Program, checker *checker.Checker) { ... }
```

---

## Pre-commit hooks

[`.husky/pre-commit`](.husky/pre-commit) runs `pnpm exec lint-staged` on staged files. The hook is activated automatically by `pnpm install` via the root `prepare` script. The `lint-staged` config in [package.json](package.json) runs ESLint + Prettier on staged `.ts` files (specs are formatted but not linted).

---

## Dev loop — running the Go binary directly

### One-shot (stdio JSON)

```bash
printf '%s\n%s\n' \
  '{"op":"scanFiles","files":["internal/testfixtures/f6_router_inference.ts"]}' \
  '{"op":"dump"}' \
  | bin/ts-go-run-types --one-shot --tsconfig internal/testfixtures/tsconfig.json \
  > cache.json
```

### Daemon (Unix socket — used for HMR scenarios)

```bash
bin/ts-go-run-types --daemon --tsconfig tsconfig.json --socket /tmp/ts-go-run-types.sock
```

### Flags reference

```
--tsconfig PATH               required: path to project tsconfig.json
--cwd PATH                    default: current working directory
--one-shot | --daemon         choose stdio one-shot or socket daemon
--socket PATH                 daemon-only socket path
--out-json PATH               also write cache JSON on dump
--out-modules DIR             also write every per-entry virtual module on dump
--hash-length N               default 7 (all type ids, literals included)
--single-threaded             one pool checker, no concurrency anywhere
--no-parallel-scan            serial marker scan
--no-parallel-render          sequential cache-family renders
```

---

## pnpm policies (workspace security posture)

All settings live in [pnpm-workspace.yaml](pnpm-workspace.yaml); `.npmrc` is auth/registry only. Putting a pnpm-specific setting in `.npmrc` is silently ignored under pnpm 11.

- `frozenLockfile: true` — install never re-resolves; CI fails loudly on drift.
- `minimumReleaseAge: 43200` (30 days) — refuses to resolve packages younger than 30 days. Enforced on `pnpm add` / `pnpm update` / fresh resolve; locked entries are not re-checked.
- `ignoreScripts: true` — blocks all preinstall/install/postinstall scripts. Per-package allowlist via `allowBuilds: { pkg: true }` (currently `esbuild`).
- `allowNonRegistryProtocols: false` — refuses git/github/file/http specifiers (`workspace:*` is exempt).
- `savePrefix: ''` — `pnpm add` writes exact versions, never `^` or `~`.
- `strictPeerDependencies: true` — peer-dep mismatches fail the install.
- `nodeLinker: hoisted` — flat hoisting (npm-like); security is the lockfile + age policy + ignoreScripts, NOT the linker layout.
- All `dependencies` and `devDependencies` are exact-pinned. Only `vite-plugin-runtypes` peerDependencies stay as ranges so consumers can dedupe Vite.

Updating deps:

- `pnpm update <pkg> --latest` bumps one package — `minimumReleaseAge` rejects versions <30 days old. Wait, pin to the latest mature version explicitly, or (last resort) add the package to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`.
- If pnpm's metadata cache is missing the `time` field and reports `[ERR_PNPM_MISSING_TIME]`, nuke `~/Library/Caches/pnpm/v11/metadata*` and retry.

---

## Patching `tsgolint`'s `typescript-go`

The `microsoft/typescript-go` checker does not expose call-site type queries out of the box; our patches in [third_party/tsgolint/patches/](third_party/tsgolint/patches/) add the minimal exports we need. **Never edit files under `third_party/` directly** — only the patch flow is supported.

To add a new patch:

```bash
cd third_party/tsgolint/typescript-go
# 1. Make changes and commit them in this nested repo.
git commit -m "ts-go-run-types: <description>"

# 2. Produce a portable patch.
git format-patch -1 -o ../patches

# 3. Verify it applies cleanly to a fresh checkout.
git reset --hard HEAD~1
git apply --3way ../patches/*.patch
```

Commit the new `.patch` file under `third_party/tsgolint/patches/` so other contributors get it on the next `git submodule update`.

---

## Publishing

Both JS packages move in lockstep (`forcePublish: true`, `exact: true` in [lerna.json](lerna.json)). Dual module output (CJS + ESM); per-package `tsc -p tsconfig.json` via `lerna run build`.

```bash
pnpm run pre-publish-test   # green-light: fresh install, all tests, lint, build
pnpm run npm-publish        # interactive: lerna version -> lerna publish
```

[`scripts/publish.sh`](scripts/publish.sh):

1. `npm whoami` check.
2. Working-tree clean check.
3. `pnpm exec lerna version` (interactive bump).
4. Prompts for npm OTP and runs `pnpm exec lerna publish from-package --no-private --ignore-scripts`.

Unpublish a bad release:

```bash
pnpm run npm-unpublish <version>
```

---

## Troubleshooting

| Symptom                                                        | Likely cause                                                                | Fix                                                                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `git apply` fails with "patch does not apply"                  | tsgolint upstream moved                                                     | Resolve manually with `git apply --3way --reject`, then resolve `.rej` files and refresh via `git format-patch`.               |
| `pnpm install` rejects a dependency with "minimum release age" | `pnpm-workspace.yaml` blocks packages <30 days old                          | Wait or add a targeted entry under `minimumReleaseAgeExclude`.                                                                 |
| `pnpm install` fails on a peer dep                             | `strictPeerDependencies: true`                                              | Add the peer to the package's `peerDependencies` or `devDependencies`.                                                         |
| JS plugin tests error spawning the resolver                    | `bin/ts-go-run-types` not built                                             | `pnpm run check:builds` or `go build -o bin/ts-go-run-types ./cmd/ts-go-run-types`.                                            |
| ESLint errors `tsconfigRootDir` cannot find project            | New package missing from root `tsconfig.json` `references`                  | Add the package path to the root `tsconfig.json`.                                                                              |
| Husky hook not firing                                          | `prepare` script did not run                                                | `pnpm install` again, or `pnpm exec husky` to force activation.                                                                |
| `podman machine start` fails with `vfkit exited unexpectedly`  | Rosetta 2 missing on Apple Silicon                                          | `softwareupdate --install-rosetta --agree-to-license`, then re-run `podman machine start`.                                     |
| `vite-plugin-runtypes` container build fails with garbled errors | Host-arch Go binary mounted into a Linux container                        | The bench script auto-cross-compiles `bin/ts-go-run-types-linux-<arch>`; force a refresh with `pnpm run bench:prep`.           |
| Marker package `tsc --build` fails with `Cannot find namespace 'Temporal'` | Missing `esnext.temporal` in the marker `tsconfig.json` `lib`           | Restore the `esnext.temporal` entry — its absence makes tsc skip declaration emit on the offending file, leaving `markers.d.ts` / `createRTFunctions.d.ts` missing and breaking call-site resolution. |
| Bench errors `createValidate(): no id injected`                | Stale or partial marker/plugin `dist/` (`.d.ts.map` without `.d.ts`)        | `pnpm run check:builds` — wipes `tsconfig.tsbuildinfo` and rebuilds the affected dist clean. CI never hits this; only fresh-checkout-then-interrupt scenarios do. |

---

## Workspace command cheatsheet

```bash
pnpm exec lerna list                         # list workspace packages
pnpm exec lerna run <script> --scope @mionjs/ts-go-run-types
pnpm --filter @mionjs/ts-go-run-types <cmd>  # equivalent
pnpm -r <cmd>                                # run in every workspace package
pnpm exec nx reset                           # clear nx build cache
```
