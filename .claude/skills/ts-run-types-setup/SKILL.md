---
name: ts-run-types-setup
description: Set up the **ts-run-types** repo's prerequisites for ITS containerized apps — checks each dependency (podman, Node, pnpm, Go) and installs the missing ones so this repo's documentation website and benchmarks containers can build and run. Use when setting up / bootstrapping ts-run-types, installing podman for it, or preparing to run its docs site or benchmarks. Supports Linux and macOS; prints a not-ready message on other OSes. Specific to ts-run-types — NOT a generic project setup (the rest of the monorepo needs only pnpm).
---

# ts-run-types setup (docs website + benchmarks containers)

This is the host-prerequisites setup for **this repo's** two **containerized**
apps driven by podman (the rest of the monorepo needs only pnpm):

- the **docs website** (`website/`, Nuxt+Docus) — `scripts/website.sh`
- the **benchmarks** (`benchmarks/`, validators + vite) — `scripts/benchmarks.sh`

Both install their heavy node_modules **inside** a podman image, never on the
host (supply-chain isolation). This skill prepares the **host prerequisites** to
build/run them. The driver is [`setup.sh`](setup.sh): it checks each dependency
and installs only the missing ones.

Paths below are relative to the repo root.

## Run (the driver)

```bash
bash .claude/skills/ts-run-types-setup/setup.sh          # check + install missing deps
bash .claude/skills/ts-run-types-setup/setup.sh --check  # report only, never install
```

It detects the OS, ensures each dependency (installing per-distro on Linux via
apt/dnf/pacman/zypper, via Homebrew on macOS), verifies the podman **engine**
actually runs (`podman info`), and prints the next-step commands. Exit codes:
`0` ok · `1` a required install failed · `3` unsupported OS.

Verified output on this Linux container (all deps present):

```
ts-run-types setup — Linux (x86_64)
Required for the docs website + benchmarks
  ✓ podman 4.9.3 (≥ 4.0)
Required for the benchmarks (host build via 'pnpm run bench:prep')
  ! node 22.22.2 present but repo targets ≥ 24 — upgrade recommended
  ✓ pnpm 11.1.1 (≥ 11)
  ✓ go 1.26.0 (≥ 1.26)
  ✓ podman engine reachable (podman info)
Setup OK.
```

## Supported versions

Single source of truth is [CLAUDE.md](../../../CLAUDE.md) → "Containerized apps".

| Tool   | Min    | Needed by               |
| ------ | ------ | ----------------------- |
| podman | ≥ 4.0  | website + benchmarks    |
| Node   | ≥ 24   | benchmarks host build   |
| pnpm   | ≥ 11   | monorepo workspace      |
| Go     | ≥ 1.26 | benchmarks resolver bin |

Only **podman** is required for the website. The benchmarks additionally need
Node + pnpm + Go for `pnpm run bench:prep` (builds the Go resolver binary + JS
packages on the host; that binary is bind-mounted into the benchmark container).

## After setup — run the apps

```bash
pnpm run website:build-image && pnpm run website:dev   # docs site → http://localhost:3000
pnpm run bench:prep && pnpm run bench                  # validation benchmark (build + run in container)
pnpm run bench:typecost                                # type-checking-cost benchmark
```

I verified this session that the website serves (`curl localhost:3000` → HTTP 200,
`<title>mion …</title>`) and that `pnpm run bench` / `bench:typecost` complete
inside the container.

## Platform support

- **Linux** — verified here (podman 4.9.3 via apt). Other distros use dnf/pacman/zypper.
- **macOS** — supported: installs via Homebrew and runs `podman machine init/start`
  (containers run in a Linux VM). For the dev server use
  `WEBSITE_POLL=1 pnpm run website:dev` (VM file-watch needs polling). _Not verified
  in this Linux container — the macOS branch is install-by-Homebrew + machine start._
- **Any other OS** — the script prints a not-ready message and exits `3`.

## Gotchas

- **`bench:prep` needs the submodule bootstrap first.** Building the Go resolver
  binary requires the tsgolint/typescript-go submodules + patches (see
  [CONTRIBUTORS.md](../../../CONTRIBUTORS.md) → submodule bootstrap). `setup.sh`
  ensures the Go _toolchain_, not the submodule checkout.
- **Behind a corporate/MITM proxy**, the in-container `pnpm install` fails TLS —
  pass the proxy CA + host network: `WEBSITE_CA_CERT=… WEBSITE_BUILD_NETWORK=host
pnpm run website:build-image` (and `BENCH_*` equivalents). See `website/CONTAINER.md`.
- **Go auto-install on Linux** drops Go in `/usr/local/go`; add `/usr/local/go/bin`
  to PATH if it wasn't already.
