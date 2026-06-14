---
name: ts-run-types-setup
description: End-to-end autonomous setup for **ts-run-types**. Installs host deps (podman, Node, pnpm, Go), starts the podman engine, bootstraps the tsgolint + typescript-go submodules + patches, installs workspace deps, builds the Go resolver binary + vite-plugin-runtypes, then smoke-tests the docs website container (curl :3000) and the benchmarks container (vite build inside). Use when setting up / bootstrapping ts-run-types, installing podman for it, or verifying the containerized apps are runnable. Supports Linux and macOS; prints a not-ready message on other OSes. Specific to ts-run-types - NOT a generic project setup (the rest of the monorepo needs only pnpm).
---

# ts-run-types setup (docs website + benchmarks containers)

This skill is the automated path through the project's setup document. The full
human-readable reference lives in [SETUP.md](../../../SETUP.md) - prereqs,
bootstrap, build, test, lint, dev loop, containerized apps, publishing,
troubleshooting. This skill drives the install + bootstrap + verification
steps end-to-end so the user does not have to follow SETUP.md by hand.

## How the skill runs (autonomous flow)

Run these four commands from the repo root, in order. Stop and surface errors
to the user the first time any step exits non-zero.

```bash
bash .claude/skills/ts-run-types-setup/setup.sh   # 1. host deps + project bootstrap
pnpm run ts-run-types:smoke                       # 2. Go binary + vite plugin wiring smoke
pnpm run website:smoke                            # 3. docs website smoke
pnpm run bench:smoke                              # 4. benchmarks smoke
```

After all four pass, the repo is ready: `pnpm run website:dev`,
`pnpm run bench`, and `pnpm test` will all work.

### What each step does

**1. `setup.sh`** ([setup.sh](setup.sh)) - the heavy lifter. Each sub-step is
idempotent and skips when already satisfied:

- Checks + installs missing host deps (podman, Node, pnpm, Go) via the detected
  package manager (Homebrew on macOS; apt/dnf/pacman/zypper on Linux). Version
  minimums are defined in [SETUP.md](../../../SETUP.md#prerequisites).
- **macOS Apple Silicon only:** installs Rosetta 2 via `softwareupdate
  --install-rosetta --agree-to-license` when missing - the podman-machine
  `vfkit` backend needs it and silently exits 1 without it.
- **macOS only:** if the podman engine is unreachable, runs `podman machine
  init` (when no machine exists) + `podman machine start`.
- Initializes the `third_party/tsgolint` submodule + its nested
  `typescript-go` submodule via `git submodule update --init --recursive`.
- Applies the `third_party/tsgolint/patches/*.patch` set to the
  `typescript-go` working tree with `git apply --3way`. For each patch it
  first tries `git apply --reverse --check` to detect "already applied" and
  skip - the step is safe to re-run.
- Runs `pnpm install --frozen-lockfile` if workspace `node_modules` is missing.
- Builds the Go resolver binary at `bin/ts-go-run-types` (skips if newer than
  every file under `cmd/` + `internal/`).
- Builds `packages/vite-plugin-runtypes/dist` (the marker package's typecheck
  consumes it; required for `pnpm test` and both smokes).

Pass `--check` to report status only, never install or build anything.

Exit codes: `0` ok / `1` a required install or bootstrap step failed / `3`
unsupported OS or no supported package manager.

**2. `pnpm run ts-run-types:smoke`** - end-to-end smoke for the Go resolver
binary + vite plugin wiring ([scripts/ts-run-types-smoke.mjs](../../../scripts/ts-run-types-smoke.mjs)).
Spawns `bin/ts-go-run-types` in `--inline-server` mode, installs three tiny
in-memory fixtures (`getRunTypeId<T>()` static, `reflectRunTypeId(v)` reflect,
`createValidate<T>()` to exercise the `InjectTypeFnArgs` createX path), runs
the plugin's `rewrite()` over each, then calls `scanFiles` with
`includeEntryModules: true` and asserts the resolver returned a Site per
fixture and at least one rendered entry module. Pre-hook
(`prets-run-types:smoke`) re-runs `check:builds`, which auto-rebuilds the Go
binary, the marker dist, and the vite plugin dist when any is stale or
partially emitted, so the smoke is usable standalone.
Runs in ~1s when healthy. Exits 0/1.

**3. `pnpm run website:smoke`** - readies the website podman image then runs the
dev server. The images are **deps-only** and published to GHCR, so by default
`scripts/website.sh:ensure_image` PULLS the latest `ghcr.io/mionkit/tsrt-website:latest`
(`ghcr_try_pull_retag`; cheap no-op when already current), falling back to a
local image / local build when the registry is unreachable. It then runs the dev
server detached in a `tsrt-website-smoke` container, polls `http://localhost:3000`
for HTTP 200 + a `<title>...</title>` response (90s timeout, override with
`WEBSITE_SMOKE_TIMEOUT`), then stops + removes the container. Exits 0/1.
(`WEBSITE_USE_LOCAL=1` builds/uses a local image instead of pulling - for offline
or maintainer runs.)

**4. `pnpm run bench:smoke`** - via `scripts/benchmarks.sh:ensure_prereqs`,
self-syncs the host Go binary, the Linux cross-binary (`bin/ts-go-run-types-linux-<arch>`),
the marker dist and the plugin dist (rebuilds whichever is stale), and readies
the bench image (PULLS `ghcr.io/mionkit/tsrt-bench:latest` by default;
`BENCH_USE_LOCAL=1` to build locally). The benchmark source is bind-mounted at
run time, so the container build (`pnpm run build`) exercises both the resolver
binary (via the vite plugin) and the benchmark sources end-to-end. Exits 0/1.
Skips the full bench loop (which takes minutes); for that, run `pnpm run bench`
afterwards.

## Layout

```
.claude/skills/ts-run-types-setup/
  setup.sh             # orchestrates deps + bootstrap + build
  lib/common.sh        # bold/ok/warn/err, version_ge, check_dep, fallbacks
  pm/brew.sh           # macOS Homebrew installers
  pm/apt.sh            # Debian/Ubuntu installers
  pm/dnf.sh            # Fedora/RHEL/CentOS Stream installers
  pm/pacman.sh         # Arch installers
  pm/zypper.sh         # openSUSE installers
```

Each `pm/<pm>.sh` defines `install_podman` / `install_node` / `install_pnpm` /
`install_go` and sets `PM_NAME`. Version minimums for each tool are defined in
[SETUP.md](../../../SETUP.md#prerequisites) - keep `setup.sh`'s
version constants in sync.

## Platform support

- **Linux** - verified (podman 4.9.3 via apt; other distros use dnf/pacman/zypper).
- **macOS** - supported: installs via Homebrew, manages the `podman machine` VM
  (`init` if missing, `start` if down). For long dev sessions use
  `WEBSITE_POLL=1 pnpm run website:dev` (VM file-watch needs polling).
- **Any other OS** - the script prints a not-ready message and exits `3`.

## Notes

- Behind a corporate / MITM proxy: pass the proxy CA + host network as documented
  in [SETUP.md](../../../SETUP.md#containerized-apps-docs-website--benchmarks).
- Go auto-install on Linux drops Go in `/usr/local/go`; add `/usr/local/go/bin`
  to PATH if it wasn't already.
- macOS first-time `podman machine init` downloads a Linux VM image (~1 min);
  the skill prints "Initializing podman machine" so the wait is explicit.
- Submodule re-bootstrap is safe: the patch step detects already-applied
  patches via `git apply --reverse --check` and skips them.
- Troubleshooting table (Rosetta, podman machine, patch failures, marker
  Temporal typecheck) lives in [SETUP.md](../../../SETUP.md#troubleshooting).
