# Setup

Single setup document for RunTypes. Architecture + workflow rules live in [CLAUDE.md](CLAUDE.md); design deep-dive in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

> **Automated path:** the `ts-runtypes-setup` skill ([.claude/skills/ts-runtypes-setup/](.claude/skills/ts-runtypes-setup/)) drives this whole document end-to-end — host deps, submodule bootstrap + patches, `pnpm install`, Go + plugin builds, podman engine, and smoke verification. Run `bash .claude/skills/ts-runtypes-setup/setup.sh` and the rest of this doc is reference material.

The repository contains a **Go binary** at [cmd/ts-runtypes/](cmd/ts-runtypes/) and a **pnpm workspace** of JS packages under [packages/](packages/). Two **podman-containerized** apps ship alongside: the docs website ([container/website/](container/website/)) and the validation benchmarks ([container/benchmarks/](container/benchmarks/)).

---

## Prerequisites

| Tool   | Version  | Needed by                                     | Source of truth                      |
| ------ | -------- | --------------------------------------------- | ------------------------------------ |
| Go     | ≥ 1.26   | resolver binary + benchmarks                  | `go.mod`                             |
| Node   | ≥ 26.0.0 | tests, builds, benchmarks host prep           | root `package.json` `engines.node`   |
| pnpm   | ≥ 11.0.0 | the monorepo (workspace policies)             | `packageManager: pnpm@11.1.1`        |
| git    | recent   | submodule + `git apply` are used              | -                                    |
| podman | ≥ 4.0    | docs website + benchmarks containers          | tested 4.9.3 / 5.8.3                 |

> **Container runtime is Node 26.** A single shared image ([`container/website/Containerfile`](container/website/Containerfile)) builds `FROM node:26-bookworm`, which unflags the global `Temporal` API, so benchmark timings and the docs build run on native Temporal (no `temporal-polyfill`), the same runtime the published library targets. The one image holds both dependency trees in separate dirs: the website at `/app`, the benchmarks at `/bench`. Node 26 ships only `npm` (the bundled `corepack` shim was removed), so the image installs the repo-pinned pnpm globally. The **host** also needs Node >= 26 now: with `temporal-polyfill` dropped, the test suite runs on the native `Temporal` global too. Override the base with `RT_WEBSITE_BASE_IMAGE` (mirror / air-gapped / offline-built base).

**macOS Apple Silicon also needs Rosetta 2** — the podman-machine `vfkit` backend requires it and exits 1 without it. Install with `softwareupdate --install-rosetta --agree-to-license` (the skill does this automatically).

---

## Clone & bootstrap

```bash
git clone git@github.com:mionkit/ts-runtypes.git
cd ts-runtypes
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
go build -o bin/ts-runtypes ./cmd/ts-runtypes
```

The Vite plugin spawns this binary at JS test time and at build time — **build it before `pnpm test`**. The root `pretest` script runs [`scripts/core/build.mjs`](scripts/core/build.mjs) which auto-rebuilds the Go binary, the marker package dist, and the vite plugin dist when any of them is stale or partially emitted.

### JS packages

```bash
pnpm run build                                       # all packages, topo-ordered via `pnpm -r`
pnpm --filter ts-runtypes run build      # single package
pnpm --filter ts-runtypes-devtools run build         # the other
```

Outputs land in `packages/*/dist/`. The plugin's dist must be present for marker-package typecheck (no `source` condition in its exports map) — rebuild after every plugin src edit.

---

## Test

```bash
go test ./internal/...                          # Go suite
pnpm test                                       # all JS packages (Vitest projects)
pnpm --filter ts-runtypes-devtools test         # single package
pnpm --filter ts-runtypes test      # the other
```

JS plugin tests in [packages/ts-runtypes-devtools/test/](packages/ts-runtypes-devtools/test/) spawn the Go binary — `pretest` rebuilds it. For the edit/see-tests loop use `pnpm rt dev` (builds if stale, then vitest watch); `pnpm rt dev --run` is the one-shot pass.

---

## Containerized apps (docs website + benchmarks)

Both apps share **one** podman image, so CI can pull it once and build the whole site (which renders benchmark data) end-to-end. They install their heavy node_modules **inside** that image (supply-chain isolation; the host never touches them), in two separate dirs with separate `node_modules`: the **website at `/app`**, the **benchmarks at `/bench`** (`/bench/competitors/<name>` + `/bench/typecost`, each its own isolated pnpm project). The image is **deps-only**: it bakes third-party `node_modules` plus the package-manager manifests and nothing else (no Go binary, no benchmark code, no website source). All first-party files (source + the website's Nuxt/TS/ESLint config) are bind-mounted at run time, so the image is invalidated only when a dependency manifest changes. Drivers: [scripts/container/image.sh](scripts/container/image.sh) owns the image (build/push/pull/ensure/lock/clean; shared helpers in [scripts/container/lib.sh](scripts/container/lib.sh)); [scripts/website/site.sh](scripts/website/site.sh) runs the site and [scripts/website/bench-data/bench.sh](scripts/website/bench-data/bench.sh) runs the bench half under `/bench`, both delegating image ops to image.sh.

The package-manager files (`package.json`, lockfile, `pnpm-workspace.yaml`, `.npmrc`) live in a per-project **`_deps/`** dir: `container/website/_deps/` and `container/benchmarks/_deps/` (the latter mirroring `competitors/<name>/` + `typecost/`). They are deliberately kept **out of the host project roots** so you can't accidentally `pnpm install` at `container/website/` or a competitor dir. The single [`container/website/Containerfile`](container/website/Containerfile) `COPY`s `container/website/_deps/` into `/app`; `scripts/container/image.sh` stages `container/benchmarks/_deps/` into the build context (as the git-ignored `.bench-deps/`) so the same Containerfile installs each competitor under `/bench`. To bump a **website** dependency, edit `container/website/_deps/package.json`, regenerate the lockfile in-container with `pnpm rt container lock`, then `pnpm rt container build-image` (+ `pnpm rt container push`). To bump a **benchmark** dependency, edit `container/benchmarks/_deps/competitors/<name>/package.json`, then rebuild + push the same way.

| Surface     | pnpm script              | What it does                                                                       |
| ----------- | ------------------------ | ---------------------------------------------------------------------------------- |
| Website     | `pnpm rt website dev`   | Hot-reload dev server on `:3000` (bind-mounted source).                            |
| Website     | `pnpm rt website check` | Build image (if stale) + boot dev server detached + curl `:3000` + tear down.      |
| Website     | `pnpm rt website build` | Production build to `container/website/.output`.                                             |
| Benchmarks  | `pnpm rt bench prep`    | Build the resolver binary (host + Linux cross) + JS packages on the host.          |
| Benchmarks  | `pnpm rt bench`         | Build + run EVERY competitor in its own isolated container, then aggregate.         |
| Benchmarks  | `pnpm rt bench --one <n>` | Build + run a SINGLE competitor + aggregate (fastest verification loop).            |
| Benchmarks  | `pnpm rt bench smoke`   | Build every competitor's dist (no run) — minutes shorter.                           |
| Benchmarks  | `pnpm rt bench typecost`| Per-competitor type-instantiation-cost benchmark.                                  |
| Benchmarks  | `pnpm rt bench serialization` | ts-runtypes round-trip serialization bench (+ formats), IN-CONTAINER on Node 26 (native Temporal). |
| Benchmarks  | `pnpm rt bench --website` | **One command** for ALL website benchmark data: validation + typecost + capture-env + serialization (+ formats), every measurement taken inside the Node 26 container, then the `gen-docs` host transform. |

The website only needs **podman**; the benchmarks additionally need **Node + pnpm + Go** for the host prep (resolver binary + first-party dists, bind-mounted into the container). On macOS the prep cross-compiles `bin/ts-runtypes-linux-<arch>` **and** `bin/extract-fn-bodies-linux-<arch>` (the serialization bench's source-body extractor) so the Linux container can execute them without a Go toolchain.

> **Agents:** start the website with `scripts/website/site.sh dev --isAgent` (not plain `dev`). It runs in a separate container (`tsrt-website-agent`) on the reserved port **`:3100`** and self-stops after ~5 min idle, so an agent-driven server never collides with a human's `:3000` and never lingers. Hot-reload polling auto-enables on macOS; force it anywhere with `RT_WEBSITE_POLL=1`.

### Playground (in-browser WASM, POC)

The docs site has an interactive **playground** page (`/playground`) that resolves a TypeScript type **and runs the functions RunTypes generates for it** (validate, JSON/binary encode + decode, RunType graph) entirely in the browser, with no server round-trip. It is a Nuxt Vue component — [`container/website/app/components/content/RuntypesPlayground.vue`](container/website/app/components/content/RuntypesPlayground.vue) wraps the client-only Monaco UI [`container/website/app/components/playground/PlaygroundStage.client.vue`](container/website/app/components/playground/PlaygroundStage.client.vue), driven by the framework-agnostic engine at [`container/website/app/playground/`](container/website/app/playground/). Monaco + prettier are dependencies of the website image ([`container/website/_deps/package.json`](container/website/_deps/package.json)); the component imports the `ts-runtypes` runtime factories from source (aliased in [`nuxt.config.ts`](container/website/nuxt.config.ts)).

Two inputs are **host-built** (the container is Node-only, with no Go toolchain): the resolver WASM and the ts-runtypes source overlay the resolver type-checks snippets against. `scripts/website/site.sh` builds and stages them automatically on `dev`, `build`, `generate`, and `smoke`, so `/playground` just works after a normal `scripts/website/site.sh dev`. It needs the Go toolchain + bootstrapped submodule on the host (see [Bootstrap](#bootstrap)); when those are absent or the build fails the site still runs and only `/playground` shows an error state. Skip the auto-build with `RT_WEBSITE_SKIP_PLAYGROUND=1`.

You can also build the assets directly:

```
bash container/website/scripts/build-playground.sh
```

It compiles `cmd/ts-runtypes-wasm` (`GOOS=js GOARCH=wasm`) and emits the ts-runtypes source overlay, staging `ts-runtypes.wasm.gz`, `wasm_exec.js`, and `runtypes-sources.json` into `container/website/public/playground-app/` (git-ignored, reproducible). The build is **staleness-gated**: a fast mtime pre-check plus a `go tool buildid` compare over the Go inputs means it is an instant no-op when nothing changed and only recompiles the wasm on a real input change (gzip runs only when the bytes actually change) — so editing the Vue UI never rebuilds the wasm. Because `public/` is bind-mounted into the container, the staged files ride into both the dev server and the production build. The engine tests live at [`packages/ts-runtypes/test/playground/`](packages/ts-runtypes/test/playground/) and run under `pnpm test` (project `playground`); they need the host-built assets in `.cache/rt-wasm/` and skip without them.

### Website needs the packages it documents (repo context)

The docs site documents the runtime packages: its `<code-import>` and `::twoslash-code` mechanisms read first-party source + built `.d.ts` from `packages/` at build/dev time. Those packages may live in a separate checkout. `scripts/website/site.sh` mounts that checkout **read-only** into the container and points the resolvers at it via `RT_REPO_ROOT` — so the website is **merge-agnostic** (works whether the packages sit in a sibling checkout today or get merged into this repo; only the env value changes).

- `RT_WEBSITE_REPO_CONTEXT` — host path to the checkout containing `packages/`. **Default:** sibling `../mion` if present, else this repo. Override to point anywhere.
- Only `packages/` (+ the drizzle-orm `.d.ts` allowlist) is mounted — never the repo root. The resolvers additionally **confine every `path=` read to `packages/`** (`resolveInPackages` in [`server/utils/repo-root.ts`](container/website/server/utils/repo-root.ts)); a path escaping it is rejected.
- `pnpm rt website check --docs` boots the dev server and checks code-import + twoslash + the security boundary end-to-end (curl/grep, no browser).

### Docs read benchmark/test results from `.docdata/`

`pnpm rt bench` publishes per-competitor result JSON into the canonical **`<repo>/.docdata/container/benchmarks/`** (future test results go in `.docdata/tests/`). The website mounts `.docdata` **read-only** at `/app/.docdata` (`RT_DOCDATA`), so doc-gen and content components consume results from there. (`RT_WEBSITE_DOCDATA` overrides the host dir.)

Every runtime command in [`scripts/website/bench-data/bench.sh`](scripts/website/bench-data/bench.sh) self-syncs prereqs by delegating to [`scripts/core/build.mjs`](scripts/core/build.mjs) (also used by `pretest`): it rebuilds the Go binary, the Linux cross-binary, the plugin dist, and the marker dist when any of them is stale or has a partial tsc emit. It then readies the shared image (by delegating to `scripts/container/image.sh`), which under `*_USE_LOCAL` rebuilds when a **dependency** input changes (`container/website/Containerfile` or anything under `container/website/_deps/` or `container/benchmarks/_deps/`). All first-party source is bind-mounted, so editing it never triggers an image rebuild. Manual `pnpm rt bench prep` remains available for explicit refresh.

macOS-specific knobs:

- `RT_WEBSITE_POLL=1 pnpm rt website dev` — VM file-watch needs filesystem polling.
- The skill calls `podman machine init` + `podman machine start` automatically; manually it's the same two commands.

Behind a corporate / MITM proxy: pass `RT_WEBSITE_CA_CERT=... RT_WEBSITE_BUILD_NETWORK=host pnpm rt container build-image`. See `container/website/CONTAINER.md`.

### Publishing & consuming the image via GHCR

The single deps-only image is published to the GitHub Container Registry as `ghcr.io/mionkit/tsrt-website:latest` so any host can **pull a ready-to-run image** (website at `/app`, benchmarks at `/bench`) instead of re-running all installs. Helpers live in [scripts/container/ghcr.sh](scripts/container/ghcr.sh).

**By default every run command pulls the latest published image first** (`scripts/container/ghcr.sh:ghcr_try_pull_retag` — a cheap no-op when your local copy already matches the remote digest), so a `dev` / `build` / `bench` always runs the current published deps. If the registry is unreachable (offline / not logged in / not yet published) it falls back to an existing local image, then to a local build.

| Step | Command | Notes |
| ---- | ------- | ----- |
| Authenticate (once) | `pnpm rt container login` | Reads the PAT from `GHCR_PAT`, pipes via `--password-stdin`. Only needed for a **private** package. |
| Run (consume) | `pnpm rt website dev` / `pnpm rt bench` | Pulls the latest published image, then runs. This is the default. |
| Publish | `pnpm rt container push` | Builds the **multi-arch** (`linux/amd64,linux/arm64`) shared image and pushes it to `tsrt-website:latest`. |
| Build/run locally | `RT_WEBSITE_USE_LOCAL=1 pnpm rt website dev` (or `RT_BENCH_USE_LOCAL=1`) | Skip the pull; build/use a local image. The maintainer/offline loop — also how you test a dep bump before pushing. |
| Pull only | `pnpm rt container pull` | Fetch + retag without running. |

Dep-bump loop (host stays pnpm-free): edit `container/website/_deps/package.json` → `pnpm rt container lock` (regen the lockfile in-container) → `RT_WEBSITE_USE_LOCAL=1 pnpm rt website check` (verify the new local image) → `pnpm rt container push`.

GHCR env (see [scripts/container/ghcr.sh](scripts/container/ghcr.sh)): `GHCR_OWNER` (default `mionkit`), `GHCR_USER` (default `M-jerez`), `GHCR_PAT`, `RT_WEBSITE_USE_LOCAL` / `RT_BENCH_USE_LOCAL` (opt out of the pull), `RT_WEBSITE_REMOTE_IMAGE` / `RT_BENCH_REMOTE_IMAGE` (both now default to the one shared image `ghcr.io/$GHCR_OWNER/tsrt-website:latest`).

Notes:

- **PAT scope:** push needs `write:packages` (pull of a private image needs `read:packages`). For pushing to the **org** namespace (`ghcr.io/mionkit/…`) use a **classic** PAT authorized for the MionKit org via SSO — fine-grained tokens need the org to opt in to package writes. If an org push is denied, publish under your personal namespace with `GHCR_OWNER=<you>`.
- **Multi-arch on an arm64 Mac:** the `linux/amd64` half builds under QEMU emulation (slower); a local `build-image` is always pinned to the host arch so it runs native. The image does not pre-warm typia at build time, so the first benchmark run that includes typia compiles its native plugin (~200s) into a persisted named volume (`pnpm rt bench clean` drops it); later runs reuse it.
- **Visibility:** the GHCR package is **private by default**. Make it public (or grant the repo read access) so CI / other hosts can pull without authenticating. The image carries an `org.opencontainers.image.source` label so the package links to this repo.

---

## Lint & format

```bash
pnpm lint            # oxlint (single root pass) + typecheck
pnpm format          # oxfmt (TS) + prettier (md) + gofmt
pnpm check-format    # the read-only twin (CI-safe)
```

Linting is a single root **oxlint** pass (config in [`.oxlintrc.json`](.oxlintrc.json)): the `correctness` category as errors plus the default `typescript`/`oxc`/`unicorn` plugins, which is a superset of the old `eslint:recommended` + `tseslint:recommended`. The same config hosts the enrichment `runtypes/*` rules via the built devtools lint plugin (`jsPlugins`). Type checking stays a separate `tsc`/tsgo step (`pnpm run typecheck`), which `pnpm run lint` chains after oxlint.

Formatting splits by file type: **oxfmt** formats TypeScript (`packages/**/*.ts`, config in [`.oxfmtrc.json`](.oxfmtrc.json), a 1:1 port of `.prettierrc`), **Prettier** formats markdown (`packages/**/*.md`), and `gofmt` handles Go. Prettier stays for markdown and for the playground's in-browser beautifier.

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

Two Husky hooks, both activated automatically by `pnpm install` via the root `prepare` script (run `pnpm exec husky` to force activation):

- [`.husky/pre-commit`](.husky/pre-commit) runs `pnpm exec lint-staged` on staged files. The `lint-staged` config in [package.json](package.json) runs oxlint (`--no-error-on-unmatched-pattern`, so a commit of only ignored files still passes) + oxfmt `--check` on staged `.ts` files (specs are format-checked but not lint-gated, since the general oxlint pass skips `test/**`).
- [`.husky/commit-msg`](.husky/commit-msg) runs `pnpm exec commitlint --edit` to validate the commit message against [Conventional Commits](https://www.conventionalcommits.org) (stock `@commitlint/config-conventional`, see [`commitlint.config.js`](commitlint.config.js)).

---

## Commit conventions & changelog

Commits follow **Conventional Commits** (`type(scope): summary`, e.g. `feat(resolver): …`, `fix(plugin): …`); the `commit-msg` hook rejects non-conforming messages.

```bash
pnpm run commit                # commitizen — interactive prompt for a conforming message
pnpm run changelog             # regenerate CHANGELOG.md from the full history (git-cliff)
pnpm run changelog:unreleased  # prepend just the unreleased section to CHANGELOG.md
```

`pnpm run commit` (commitizen + `cz-conventional-changelog`) is optional — you can write the message by hand. [CHANGELOG.md](CHANGELOG.md) is generated by [git-cliff](https://git-cliff.org) from the history per [`cliff.toml`](cliff.toml).

> **The `changelog` scripts need the `git-cliff` binary on `PATH`** (`cargo install git-cliff`, `brew install git-cliff`, or a prebuilt release). git-cliff is deliberately **not** an npm dependency: the workspace blocks dependency install scripts (`ignoreScripts`), so a postinstall binary downloader could not run. Cutting a release does not require a local binary — CI generates the GitHub Release notes (see [Publishing](#publishing)).

---

## Dev loop — running the Go binary directly

### One-shot (stdio JSON)

```bash
printf '%s\n%s\n' \
  '{"op":"scanFiles","files":["internal/testfixtures/f17_runtype_id.ts"]}' \
  '{"op":"dump"}' \
  | bin/ts-runtypes --one-shot --tsconfig internal/testfixtures/tsconfig.json \
  > cache.json
```

### Daemon (Unix socket — used for HMR scenarios)

```bash
bin/ts-runtypes --daemon --tsconfig tsconfig.json --socket /tmp/ts-runtypes.sock
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
- All `dependencies` and `devDependencies` are exact-pinned. Only `ts-runtypes-devtools` peerDependencies stay as ranges so consumers can dedupe Vite.

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
git commit -m "ts-runtypes: <description>"

# 2. Produce a portable patch.
git format-patch -1 -o ../patches

# 3. Verify it applies cleanly to a fresh checkout.
git reset --hard HEAD~1
git apply --3way ../patches/*.patch
```

Commit the new `.patch` file under `third_party/tsgolint/patches/` so other contributors get it on the next `git submodule update`.

---

## Publishing

All three published packages (`ts-runtypes`, `ts-runtypes-devtools`, `ts-runtypes-bin`) move in lockstep off the single version in [version.json](version.json) (bumped by [scripts/release/bump-version.mjs](scripts/release/bump-version.mjs)). The two FE packages emit dual module output (CJS + ESM) via per-package `tsc -p tsconfig.json`; `ts-runtypes-bin` ships hand-written JS + types (no build step).

The native resolver binary is distributed esbuild-style: it is cross-compiled per platform into `ts-runtypes-binary-<os>-<arch>` packages (each `os`/`cpu`-gated), declared as `optionalDependencies` of `ts-runtypes-bin`. A consumer installs only the one matching their machine, and `ts-runtypes-devtools` locates it via `getExePath()`. The publishing host needs the Go toolchain — pure Go (`CGO_ENABLED=0`), so one host cross-compiles every target with no per-platform C toolchain.

> **Versioning:** standard semver on our own release cadence. The pinned tsgo / tsgolint revision is metadata only (the binary's `--version` output + the launcher's `package.json` `tsgo` field), never encoded into the package version.

```bash
pnpm rt release preflight   # green-light: fresh install, all tests, lint, build
pnpm rt release npm         # interactive: version -> build binaries -> publish
```

[`scripts/release/publish.sh`](scripts/release/publish.sh):

1. `npm whoami` check.
2. Working-tree clean check.
3. `node scripts/release/bump-version.mjs <patch|minor|major|X.Y.Z>` (lockstep bump: writes `version.json` + every `package.json`, then commits + tags).
4. [`scripts/release/build-binaries.mjs`](scripts/release/build-binaries.mjs) — cross-compiles the 7-platform matrix and stages `ts-runtypes-binary-*` + the launcher (its `optionalDependencies` filled, pinned exact-equal) under `dist-binaries/`.
5. Prompts for npm OTP, then publishes the platform packages **first** and the launcher **last** (so the launcher never references a not-yet-published optional dep), then `pnpm publish` for the two FE packages (`ts-runtypes-bin` is already live by then). `pnpm publish` rewrites their `workspace:*` deps to concrete versions, exactly like the CI pack path.

**Changelog & GitHub Release.** Refresh [CHANGELOG.md](CHANGELOG.md) with `pnpm run changelog` when preparing a release and commit it in the release PR. When the release lands on a `release/**` branch, [`.github/workflows/publish.yml`](.github/workflows/publish.yml) publishes to npm, pushes the `v<version>` tag, then generates that tag's notes with [`orhun/git-cliff-action`](https://github.com/orhun/git-cliff-action) and creates the matching **GitHub Release**. The committed file and the Release notes are produced from the same [`cliff.toml`](cliff.toml).

Unpublish a bad release:

```bash
pnpm rt release unpublish <version>
```

---

## Troubleshooting

| Symptom                                                        | Likely cause                                                                | Fix                                                                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `git apply` fails with "patch does not apply"                  | tsgolint upstream moved                                                     | Resolve manually with `git apply --3way --reject`, then resolve `.rej` files and refresh via `git format-patch`.               |
| `pnpm install` rejects a dependency with "minimum release age" | `pnpm-workspace.yaml` blocks packages <30 days old                          | Wait or add a targeted entry under `minimumReleaseAgeExclude`.                                                                 |
| `pnpm install` fails on a peer dep                             | `strictPeerDependencies: true`                                              | Add the peer to the package's `peerDependencies` or `devDependencies`.                                                         |
| JS plugin tests error spawning the resolver                    | `bin/ts-runtypes` not built                                             | `pnpm run check:builds` or `go build -o bin/ts-runtypes ./cmd/ts-runtypes`.                                            |
| `pnpm run typecheck` errors "cannot find project" / missing reference | New package missing from root `tsconfig.json` `references`            | Add the package path to the root `tsconfig.json`.                                                                              |
| oxlint fails to load with `Plugin 'runtypes' not found`        | Stale/missing `ts-runtypes-devtools` dist (the `jsPlugins` entry)              | Rebuild it: `pnpm --filter ts-runtypes-devtools run build` (or `pnpm run check:builds`).                                          |
| Husky hook not firing                                          | `prepare` script did not run                                                | `pnpm install` again, or `pnpm exec husky` to force activation.                                                                |
| `pnpm run changelog` fails: `git-cliff: command not found`     | git-cliff binary not installed (deliberately not an npm dep)                | `cargo install git-cliff` (or `brew install git-cliff` / a prebuilt release). Not needed to cut a release — CI uses `orhun/git-cliff-action`. |
| Commit rejected by `commit-msg` hook                           | Message is not a valid Conventional Commit                                  | Re-commit with `type(scope): summary`, or run `pnpm run commit` for an interactive prompt.                                     |
| `podman machine start` fails with `vfkit exited unexpectedly`  | Rosetta 2 missing on Apple Silicon                                          | `softwareupdate --install-rosetta --agree-to-license`, then re-run `podman machine start`.                                     |
| `ts-runtypes-devtools` container build fails with garbled errors | Host-arch Go binary mounted into a Linux container                        | The bench script auto-cross-compiles `bin/ts-runtypes-linux-<arch>`; force a refresh with `pnpm rt bench prep`.           |
| Marker package `tsc --build` fails with `Cannot find namespace 'Temporal'` | Missing `esnext.temporal` in the marker `tsconfig.json` `lib`           | Restore the `esnext.temporal` entry — its absence makes tsc skip declaration emit on the offending file, leaving `markers.d.ts` / `createRTFunctions.d.ts` missing and breaking call-site resolution. |
| Bench errors `createValidate(): no id injected`                | Stale or partial marker/plugin `dist/` (`.d.ts.map` without `.d.ts`)        | `pnpm run check:builds` — wipes `tsconfig.tsbuildinfo` and rebuilds the affected dist clean. CI never hits this; only fresh-checkout-then-interrupt scenarios do. |

---

## The `rt` CLI (internal)

Day-to-day dev, website, benchmark, and publish tasks run through one internal
dispatcher, `pnpm rt <command>` ([scripts/rt.mjs](scripts/rt.mjs)). It is a thin
front door over the same `scripts/*.sh` / `*.mjs` / `vitest` the workflows call —
never a reimplementation — and it builds the resolver + dists first where needed,
so it replaces the old per-script `check:builds` pre-hooks. Run `pnpm rt --help`
for the full surface.

```bash
pnpm rt dev                     # build if stale, then vitest in watch mode
pnpm rt dev --run               # one-shot pass (== pnpm test)
pnpm rt dev fuzz <suite> [--soak]  # unit|value|types|enrich|i18n|typemod|race|all
pnpm rt dev smoke               # resolver + devtools end-to-end smoke
pnpm rt website dev [--agent]   # hot-reload docs server (:3000, or :3100 --agent)
pnpm rt website build [--no-bench] [--quick]   # build the docs site
pnpm rt bench [--one <name>|--full|--website] [--quick]   # benchmarks
pnpm rt verify                  # lint + typecheck + format check
pnpm rt fmt [--check]           # format (oxfmt + prettier + gofmt)
pnpm rt codegen all --check     # regenerate Go→TS mirrors, fail on drift
pnpm rt publish [--dry-run]     # preflight -> npm -> website (interactive)
```

## Workspace command cheatsheet

```bash
pnpm ls -r --depth -1                        # list workspace packages
pnpm --filter ts-runtypes run <script>       # run a script in one package
pnpm --filter ts-runtypes <cmd>              # equivalent
pnpm -r run <script>                         # run in every workspace package (topo order)
```
