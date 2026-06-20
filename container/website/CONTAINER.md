# Docs website — containerized (podman) workflow

The docs site is a Nuxt + Docus app that pulls in hundreds of npm transitive
dependencies. To keep that supply-chain attack surface **off the host
machine**, the site only ever runs inside a [podman](https://podman.io)
container. There is intentionally no supported way to `pnpm install` or run it
directly on your laptop.

## The isolation boundary

The image is **deps-only**: it bakes the third-party `node_modules` plus the
package-manager manifests **and nothing first-party**. Everything else — the
website source *and* its Nuxt/TS/ESLint config — is bind-mounted at run time.

| Lives **inside the image** (deps only)                       | Lives **on the host** (bind-mounted at run time)                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `_deps/package.json`, `_deps/pnpm-lock.yaml`                 | `app/`, `content/`, `public/`, `server/`, `scripts/`, `tests/`   |
| `_deps/pnpm-workspace.yaml`, `_deps/.npmrc`                  | `nuxt.config.ts`, `tsconfig.json`, `eslint.config.mjs`           |
| **`node_modules/`** (installed in the image only)            | (config + source are the source-of-truth on the host)            |

- The package-manager files live in **`container/website/_deps/`**, not at the website
  root — so there is no `package.json` to accidentally `pnpm install` against on
  the host. The Containerfile `COPY`s them from `_deps/` into the image.
- `node_modules` is materialized by `pnpm install` **inside** the image
  ([`Containerfile`](./Containerfile)), so no dependency install script ever
  executes on the host. The pnpm supply-chain policy (`ignoreScripts` +
  `allowBuilds` allowlist, `frozenLockfile`, `minimumReleaseAge`) is enforced
  at image-build time from [`_deps/pnpm-workspace.yaml`](./_deps/pnpm-workspace.yaml).
- The **source + config** are bind-mounted from the host, so editing docs,
  components or config hot-reloads without rebuilding the image. Because no
  first-party file is baked, the image is invalidated only when a dependency
  manifest changes.
- The repo root's `pnpm-workspace.yaml` lists only `packages/*`, so a top-level
  `pnpm install` never touches the website — its dependency graph and lockfile
  are fully separate.

## Usage

All commands run from the **repo root**. Running the site is
[`scripts/website.sh`](../scripts/website.sh); the image lifecycle is
[`scripts/podman-website.sh`](../scripts/podman-website.sh):

```bash
# --- run the site (website.sh) ---
pnpm run website:dev           # dev server with hot reload  -> http://localhost:3000
pnpm run website:build         # production build            -> container/website/.output
pnpm run website:generate      # static prerender            -> container/website/.output/public
pnpm run website:prep          # verify the mion repo context (packages/) is built
pnpm run website:verify-docs   # check code-import + twoslash render (curl/grep)
pnpm run website:shell         # debug shell inside the container
# --- image lifecycle (podman-website.sh) ---
pnpm run podman-website:build-image   # build the image locally (maintainer)
pnpm run podman-website:lock          # regenerate _deps/pnpm-lock.yaml in-container (after a dep bump)
pnpm run podman-website:login         # log in to GHCR (needs a PAT; see SETUP.md)
pnpm run podman-website:push          # build + push the multi-arch image to GHCR
pnpm run podman-website:pull          # pull the published image and tag it locally
pnpm run podman-website:clean         # remove the image + cache volumes
```

The images are published to GHCR, so **`website:dev` (and the other run commands)
pull the latest published image first** — a cheap no-op when your local copy is
already current — then run, falling back to a local build when the registry is
unreachable. Set `WEBSITE_USE_LOCAL=1` to skip the pull and build/use a local
image (offline, or to test a dep bump before pushing).

### Environment overrides

| Variable             | Default          | Purpose                                              |
| -------------------- | ---------------- | ---------------------------------------------------- |
| `WEBSITE_PORT`       | `3000`           | Host port for the dev server.                        |
| `WEBSITE_POLL=1`     | off              | Filesystem polling for watchers (macOS / VM mounts). |
| `WEBSITE_ENGINE`     | `podman`         | Container engine.                                    |
| `WEBSITE_IMAGE`      | `tsrt-website:dev` | Image tag.                                          |
| `WEBSITE_MOUNT_OPTS` | empty            | Extra bind-mount opts, e.g. `:z` on SELinux hosts.   |
| `WEBSITE_USE_LOCAL`  | off              | Skip the GHCR pull; build/use a local image.         |
| `WEBSITE_REMOTE_IMAGE` | `ghcr.io/mionkit/tsrt-website:latest` | Published image ref to pull.        |
| `WEBSITE_REPO_CONTEXT` | sibling `../mion`, else this repo | Checkout containing `packages/`, mounted read-only for code-import/twoslash. |
| `WEBSITE_DOCDATA`    | `<repo>/.docdata` | Generated benchmark/test result JSON, mounted read-only at `/app/.docdata`. |

### Documenting mion's code (repo context)

The `<code-import>` and `::twoslash-code` mechanisms read first-party source +
built `.d.ts` from `packages/`. Those packages live in the **mion** checkout, which
`website.sh` mounts **read-only** and points the resolvers at via `RT_REPO_ROOT`
— so the website works whether mion is a sibling checkout (today) or merged in
later. Only `packages/` (+ a drizzle-orm `.d.ts` allowlist) is exposed, and every
`path=` read is confined to `packages/` (`server/utils/repo-root.ts`). Run
`pnpm run website:prep` to confirm the context is built and `pnpm run website:verify-docs`
to check both mechanisms render.

On **macOS** (podman runs in a Linux VM), inotify events don't always cross the
VM mount boundary — run with polling:

```bash
WEBSITE_POLL=1 pnpm run website:dev
```

## Behind a corporate / MITM egress proxy

If outbound traffic is intercepted by a proxy with a custom CA (common in
corporate networks and some sandboxes), the in-container `pnpm install` and any
runtime fetches will fail TLS verification. Point the build at the proxy CA and
use host networking:

```bash
# WEBSITE_CA_CERT may be a single .crt file or a directory of .crt files.
WEBSITE_CA_CERT=/usr/local/share/ca-certificates \
WEBSITE_BUILD_NETWORK=host \
  pnpm run podman-website:build-image

WEBSITE_RUN_NETWORK=host pnpm run website:dev
```

The certs are copied into `container/website/.cacerts/` (git-ignored) and trusted via
`update-ca-certificates` inside the image; `NODE_EXTRA_CA_CERTS` is set so Node
honors them too. With no proxy these vars are unset and everything uses the
default network and CA bundle.

## Why podman (not Docker Desktop)

Podman is daemonless and rootless, needs no Docker Desktop license, and runs the
same on Linux and on macOS (`podman machine`). The whole setup is plain
`podman build` + `podman run` driven by one shell script — no compose tooling or
extra framework to install.

## Notes

- The image's Node base is `node:26-bookworm`, which unflags the global
  `Temporal` API (the runtime the published library targets). Node 26 dropped the
  bundled corepack shim, so the image installs the repo-pinned pnpm globally (the
  `PNPM_VERSION` build-arg). Override the base with `WEBSITE_BASE_IMAGE`.
- This is the **single shared image**: it also bakes the benchmark dependencies
  under `/bench` (`/bench/competitors/<name>` + `/bench/typecost`), which
  `scripts/benchmarks.sh` runs against. So one image builds the whole site,
  benchmark data included. See [SETUP.md](../SETUP.md) and
  [container/benchmarks/README.md](../benchmarks/README.md).
- Nuxt's generated caches (`.nuxt`, `.data`, `node_modules/.cache`) live in
  named podman volumes, so the host source tree is never written to and restarts
  stay fast.
