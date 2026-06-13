# Docs website — containerized (podman) workflow

The docs site is a Nuxt + Docus app that pulls in hundreds of npm transitive
dependencies. To keep that supply-chain attack surface **off the host
machine**, the site only ever runs inside a [podman](https://podman.io)
container. There is intentionally no supported way to `pnpm install` or run it
directly on your laptop.

## The isolation boundary

| Lives **inside the image** (baked at build)        | Lives **on the host** (bind-mounted at run time) |
| -------------------------------------------------- | ------------------------------------------------ |
| `package.json`, `pnpm-lock.yaml`                   | `app/` (Vue components, assets, app config)      |
| `pnpm-workspace.yaml`, `.npmrc`                    | `content/` (the markdown docs)                   |
| `nuxt.config.ts`, `tsconfig.json`, `eslint.config` | `public/` (static assets)                        |
| **`node_modules/`** (installed in the image only)  | `server/`, `scripts/`, `tests/`                  |

- `node_modules` is materialized by `pnpm install` **inside** the image
  ([`Containerfile`](./Containerfile)), so no dependency install script ever
  executes on the host. The pnpm supply-chain policy (`ignoreScripts` +
  `allowBuilds` allowlist, `frozenLockfile`, `minimumReleaseAge`) is enforced
  at image-build time from [`pnpm-workspace.yaml`](./pnpm-workspace.yaml).
- The **source** directories are bind-mounted from the host, so editing docs or
  components hot-reloads without rebuilding the image.
- The repo root's `pnpm-workspace.yaml` lists only `packages/*`, so a top-level
  `pnpm install` never touches the website — its dependency graph and lockfile
  are fully separate.

## Usage

All commands run from the **repo root** (they shell out to
[`scripts/website.sh`](../scripts/website.sh)):

```bash
pnpm run website:build-image   # build the podman image (once, or after a dep/config change)
pnpm run website:dev           # dev server with hot reload  -> http://localhost:3000
pnpm run website:build         # production build            -> website/.output
pnpm run website:generate      # static prerender            -> website/.output/public
pnpm run website:shell         # debug shell inside the container
pnpm run website:clean         # remove the image + cache volumes
```

`website:dev` builds the image automatically on first run.

### Environment overrides

| Variable             | Default          | Purpose                                              |
| -------------------- | ---------------- | ---------------------------------------------------- |
| `WEBSITE_PORT`       | `3000`           | Host port for the dev server.                        |
| `WEBSITE_POLL=1`     | off              | Filesystem polling for watchers (macOS / VM mounts). |
| `WEBSITE_ENGINE`     | `podman`         | Container engine.                                    |
| `WEBSITE_IMAGE`      | `tsrt-website:dev` | Image tag.                                          |
| `WEBSITE_MOUNT_OPTS` | empty            | Extra bind-mount opts, e.g. `:z` on SELinux hosts.   |

On **macOS** (podman runs in a Linux VM), inotify events don't always cross the
VM mount boundary — run with polling:

```bash
WEBSITE_POLL=1 pnpm run website:dev
```

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
