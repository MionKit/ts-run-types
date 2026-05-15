# DEVS

Contributor guide for `ts-go-run-types`. For the project overview, see [README.md](README.md). For the design deep-dive, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

The repository contains a **Go binary** (`cmd/ts-go-run-types`) and a **pnpm/Lerna workspace** of JS packages under [packages/](packages/). The monorepo setup mirrors [mion](https://github.com/MionKit/mion).

---

## Prerequisites

| Tool | Version  | Notes                                                  |
| ---- | -------- | ------------------------------------------------------ |
| Go   | ≥ 1.26   | Required by `go.mod`.                                  |
| Node | ≥ 24.0.0 | Enforced by root `engines.node`.                       |
| pnpm | ≥ 11.0.0 | Strictly pinned to `pnpm@11.1.1` via `packageManager`. |
| git  | recent   | Submodule + `git am` are used.                         |

---

## Clone & bootstrap

```bash
git clone git@github.com:mionkit/ts-go-run-types.git
cd ts-go-run-types
git submodule update --init --recursive
(cd third_party/tsgolint/typescript-go && git am --3way --no-gpg-sign ../patches/*.patch)
pnpm install --frozen-lockfile
```

The bootstrap does three things:

1. Pulls the `oxc-project/tsgolint` submodule (which itself nests `microsoft/typescript-go`).
2. Applies our local patches to `typescript-go` via `git am` — these patch the checker shim to expose call-site type resolution.
3. Installs JS workspace dependencies. `--frozen-lockfile` forces use of the committed lockfile.

---

## Build

### Go binary

```bash
go build -o bin/ts-go-run-types ./cmd/ts-go-run-types
```

The binary is consumed by the Vite plugin at JS test time and at build time. **Build the binary before running JS tests** — the plugin tests spawn it.

### JS packages

```bash
pnpm run build                              # all packages, lerna-orchestrated
pnpm --filter @mionjs/ts-go-run-types run build   # single package
```

`pnpm run build` runs `lerna run build`, which respects topological order. Outputs land in `packages/*/dist/`.

---

## Test

```bash
go test ./internal/...                          # Go suite
pnpm test                                       # all JS packages (Vitest projects)
pnpm --filter vite-plugin-runtypes test         # one package
pnpm --filter @mionjs/ts-go-run-types test            # the other
```

Go fixtures live in [internal/testfixtures](internal/testfixtures/) (F1–F17) and cover atomic reflection kinds (string, number, BigInt, Symbol, Date, RegExp, enums, literals), primitive/object/union annotations, inferred function signatures, generic inference, and `RuntypeId<T>` marker variants (direct calls, explicit type args, user wrappers, free type params, collision detection).

The JS plugin tests in [packages/vite-plugin-runtypes/test](packages/vite-plugin-runtypes/test/) **spawn the Go binary** — make sure it has been built first.

---

## Lint & format

```bash
pnpm lint            # lerna run lint (eslint per package)
pnpm format          # prettier --write 'packages/**/*.{ts,md}'
pnpm check-format    # prettier --check (CI-safe)
```

ESLint config is flat (`eslint.config.js`) and TypeScript-aware via `projectService`. Prettier rules live in `.prettierrc`.

### Variable naming

Use meaningful variable names in both Go and JS/TS — avoid one-letter abbreviations like `p`, `c`, `t`. When a struct field has a JSON tag, reuse that name for the local variable. Loop indices (`i`, `k`, `v`) and `err` are fine.

```go
// ❌ Bad
func New(p *program.Program, c *checker.Checker) { ... }

// ✅ Good
func New(program *program.Program, checker *checker.Checker) { ... }
```

---

## Pre-commit hooks

[`.husky/pre-commit`](.husky/pre-commit) runs `pnpm exec lint-staged` on staged files. The hook is activated automatically by `pnpm install` via the root `prepare` script. The `lint-staged` config in [package.json](package.json) runs ESLint + Prettier on staged `.ts` files (specs are formatted but not linted).

---

## Dev loop — running the Go binary directly

### One-shot (stdio JSON)

Feed line-delimited operations and read the JSON dump back:

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

Then send the same JSON ops to `/tmp/ts-go-run-types.sock` from another process.

### Flags reference

```
--tsconfig PATH               required: path to project tsconfig.json
--cwd PATH                    default: current working directory
--one-shot | --daemon         choose stdio one-shot or socket daemon
--socket PATH                 daemon-only socket path
--out-json PATH               also write cache JSON on dump
--out-ts PATH                 also write self-wired TS module on dump
--hash-length N               default 6 (types)
--literal-hash-length N       default 5 (literals)
--marker-name NAME            default RuntypeId
--marker-module MODULE        default @mionjs/ts-go-run-types
--single-threaded             disable parallel walk (debugging)
```

---

## Patching `tsgolint`'s `typescript-go`

The `microsoft/typescript-go` checker does not expose call-site type queries out of the box. Our patches in [third_party/tsgolint/patches](third_party/tsgolint/patches/) add the minimal exports we need.

To add a new patch:

```bash
cd third_party/tsgolint/typescript-go
# 1. Make changes and commit them in this nested repo.
git commit -m "ts-go-run-types: <description>"

# 2. Produce a portable patch.
git format-patch -1 -o ../patches

# 3. Verify it applies cleanly to a fresh checkout.
git reset --hard HEAD~1
git am --3way --no-gpg-sign ../patches/*.patch
```

Commit the new `.patch` file under `third_party/tsgolint/patches/` so other contributors get it on the next `git submodule update`.

---

## Publishing

Both JS packages move in lockstep (`forcePublish: true`, `exact: true` in [lerna.json](lerna.json)).

```bash
pnpm run pre-publish-test   # green-light: fresh install, all tests, lint, build
pnpm run npm-publish        # interactive: lerna version → lerna publish
```

`scripts/publish.sh`:

1. `npm whoami` check.
2. Working-tree clean check.
3. `pnpm exec lerna version` (interactive bump).
4. Prompts for npm OTP and runs `pnpm exec lerna publish from-package --no-private --ignore-scripts`.

To unpublish a bad release:

```bash
pnpm run npm-unpublish <version>
```

---

## Troubleshooting

| Symptom                                                        | Likely cause                                                                | Fix                                                                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `git am` fails with `Patch does not apply`                     | tsgolint upstream moved                                                     | Resolve manually with `git am --show-current-patch=diff`, then `git am --continue`. Refresh the patch with `git format-patch`. |
| `pnpm install` rejects a dependency with "minimum release age" | `pnpm-workspace.yaml` blocks packages <30 days old (supply-chain hardening) | Wait or add a targeted entry under `minimumReleaseAgeExclude`.                                                                 |
| `pnpm install` fails on a peer dep                             | `strictPeerDependencies: true`                                              | Add the peer to the package's `peerDependencies` or `devDependencies`.                                                         |
| JS plugin tests error spawning the resolver                    | `bin/ts-go-run-types` not built                                             | `go build -o bin/ts-go-run-types ./cmd/ts-go-run-types`.                                                                       |
| ESLint errors `tsconfigRootDir` cannot find project            | New package missing from root `tsconfig.json` `references`                  | Add the package path to the root `tsconfig.json`.                                                                              |
| Husky hook not firing                                          | `prepare` script did not run                                                | `pnpm install` again, or `pnpm exec husky` to force activation.                                                                |

---

## Workspace command cheatsheet

```bash
pnpm exec lerna list                    # list workspace packages
pnpm exec lerna run <script> --scope @mionjs/ts-go-run-types
pnpm --filter @mionjs/ts-go-run-types <cmd>   # equivalent
pnpm -r <cmd>                           # run in every workspace package
pnpm exec nx reset                      # clear nx build cache
```
