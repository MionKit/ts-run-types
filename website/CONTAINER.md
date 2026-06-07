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

- The package-manager files live in **`website/_deps/`**, not at the website
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

All commands run from the **repo root** (they shell out to
[`scripts/website.sh`](../scripts/website.sh)):

```bash
pnpm run website:dev           # dev server with hot reload  -> http://localhost:3000
pnpm run website:build         # production build            -> website/.output
pnpm run website:generate      # static prerender            -> website/.output/public
pnpm run website:shell         # debug shell inside the container
pnpm run website:clean         # remove the image + cache volumes
# --- dependency / publishing flow ---
pnpm run website:lock          # regenerate _deps/pnpm-lock.yaml in-container (after a dep bump)
pnpm run website:build-image   # build the podman image locally (maintainer)
pnpm run website:login         # log in to GHCR (needs a PAT; see SETUP.md)
pnpm run website:push          # build + push the multi-arch image to GHCR
pnpm run website:pull          # pull the published image and tag it locally
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
  pnpm run website:build-image

WEBSITE_RUN_NETWORK=host pnpm run website:dev
```

The certs are copied into `website/.cacerts/` (git-ignored) and trusted via
`update-ca-certificates` inside the image; `NODE_EXTRA_CA_CERTS` is set so Node
honors them too. With no proxy these vars are unset and everything uses the
default network and CA bundle.

## Why podman (not Docker Desktop)

Podman is daemonless and rootless, needs no Docker Desktop license, and runs the
same on Linux and on macOS (`podman machine`). The whole setup is plain
`podman build` + `podman run` driven by one shell script — no compose tooling or
extra framework to install.

## Notes

- The image's Node base is `mcr.microsoft.com/devcontainers/javascript-node:22`
  (Node 22 + pnpm via corepack). pnpm's exact version is pinned by
  `package.json#packageManager`.
- Nuxt's generated caches (`.nuxt`, `.data`, `node_modules/.cache`) live in
  named podman volumes, so the host source tree is never written to and restarts
  stay fast.
