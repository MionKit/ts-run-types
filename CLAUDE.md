# ts-go-run-types Architectural Guidelines

## Dual-language repo: Go binary + JS workspace

This repo is **two halves that ship together**, not a pure Node project:

- **Go binary** at [cmd/ts-go-run-types](cmd/ts-go-run-types/) backed by [internal/](internal/) — reaches into tsgo's type checker via the `oxc-project/tsgolint` shim layer and answers call-site type queries.
- **JS workspace** at [packages/](packages/) — `@mionjs/ts-go-run-types` (marker + runtime helpers) and `vite-plugin-runtypes` (Vite plugin that spawns the binary, rewrites calls, emits the cache module).
- **External Go dependencies** at [third_party/](third_party/) — pulled via **git submodules**, treated as read-only vendored sources. See "External Go dependencies" below.
- The Go binary is the side-channel; the JS packages are the only public surface users see.
- The Vite plugin's tests **spawn `bin/ts-go-run-types`** — the Go binary MUST be built before running `pnpm test`, or plugin tests will fail at spawn.

## Submodule bootstrap (one-time)

- Clone with `git submodule update --init --recursive` to pull `oxc-project/tsgolint` (which nests `microsoft/typescript-go`).
- Then `(cd third_party/tsgolint/typescript-go && git am --3way --no-gpg-sign ../patches/*.patch)` to apply tsgolint's vendored patches to its nested `typescript-go` checkout — these patches are part of the upstream tsgolint submodule, NOT files we author.
- Then `pnpm install --frozen-lockfile`.
- After this, the Go module graph resolves against the patched `typescript-go` checkout — running `go build` before this step will fail.

## Package Manager: pnpm

This repo uses **pnpm 11+** (not npm). Do **not** run `npm install` — it ignores `pnpm-workspace.yaml` and the security policies.

**pnpm 11 split**: only auth/registry settings are read from `.npmrc`; all pnpm-specific settings live in `pnpm-workspace.yaml`. Putting a pnpm setting in `.npmrc` is silently ignored.

Security posture (see [pnpm-workspace.yaml](pnpm-workspace.yaml)):

- `frozenLockfile: true` — strict mode, install never re-resolves the lockfile; CI fails loudly on drift
- `minimumReleaseAge: 43200` (30 days) — refuses to _resolve_ package versions younger than 30 days. Only enforced on `pnpm add` / `pnpm update` / fresh resolve; locked entries are not re-checked
- `ignoreScripts: true` — blocks all preinstall/install/postinstall scripts from dependencies. Per-package allowlist via `allowBuilds: { pkg: true }` (currently just `esbuild`)
- `allowNonRegistryProtocols: false` — refuses git/github/file/http specifiers (workspace:\* is exempt)
- `savePrefix: ''` — `pnpm add` writes exact versions, never `^` or `~`
- `strictPeerDependencies: true` — peer-dep mismatches fail the install instead of warning
- `nodeLinker: hoisted` — flat hoisting (npm-like); security is enforced by the lockfile + age policy + ignoreScripts, NOT by the linker layout
- All `dependencies` and `devDependencies` are exact-pinned. `peerDependencies` of `vite-plugin-runtypes` stay as ranges so consumers can dedupe Vite.

Updating dependencies:

- `pnpm update <pkg> --latest` to bump a single package — `minimumReleaseAge` will reject versions <30 days old. Either wait, pin to the latest mature version explicitly, or (last resort) add the package to `minimumReleaseAgeExclude` in `pnpm-workspace.yaml`.
- If pnpm's metadata cache is missing the `time` field and reports `[ERR_PNPM_MISSING_TIME]`, nuke `~/Library/Caches/pnpm/v11/metadata*` and retry.

## Monorepo Structure

- Uses **pnpm workspaces** for monorepo management (see [pnpm-workspace.yaml](pnpm-workspace.yaml)) + **Lerna** for lockstep versioning and topo-ordered scripts (see [lerna.json](lerna.json))
- Both JS packages move in lockstep (`forcePublish: true`, `exact: true`)
- Packages located under [packages/](packages/):
  - `ts-go-run-types`: `@mionjs/ts-go-run-types` — `RuntypeId<T>` marker type, `getRuntypeId` (static), `reflectRuntypeId` (reflection), `getMeta`, runtime helpers
  - `vite-plugin-runtypes`: Vite plugin — spawns the Go binary, applies byte-offset rewrites, emits `virtual:runtypes-cache`
- Run commands in a specific package: `pnpm --filter @mionjs/ts-go-run-types run <cmd>` or `pnpm --filter vite-plugin-runtypes run <cmd>`
- Or navigate to package directory and run commands locally
- All devDependencies should be installed root-level, not in the packages
- Cross-package deps use the `workspace:*` protocol — pnpm rewrites it to concrete versions on publish

## Go side

- Go version: **≥ 1.26** (enforced by `go.mod`)
- Build the binary with `go build -o bin/ts-go-run-types ./cmd/ts-go-run-types`
- Run Go tests with `go test ./internal/...`
- Go fixtures live in [internal/testfixtures](internal/testfixtures/) (F1–F17) covering atomic reflection kinds, primitives/objects/unions, inferred generics, and `RuntypeId<T>` marker variants
- The Go pipeline is split into single-purpose packages under [internal/](internal/) (program, walker, marker, resolver, typeid, hashid, serialize, emit, protocol) — keep each one focused; do not introduce cross-package state
- Our Go code lives ONLY in [cmd/](cmd/) and [internal/](internal/). Anything under [third_party/](third_party/) is an external dependency (see next section) — never edit it

## ⚠️ External Go dependencies — [third_party/](third_party/) is OFF-LIMITS

- [third_party/](third_party/) is **external Go source vendored via git submodules**, not project code. Currently only [third_party/tsgolint/](third_party/tsgolint/) → `oxc-project/tsgolint` (which itself nests `microsoft/typescript-go` as a submodule).
- **Never edit any file under [third_party/](third_party/) directly** — not the tsgolint source, not the nested `typescript-go` source, not the [third_party/tsgolint/patches/](third_party/tsgolint/patches/) files. These are upstream artifacts; local edits are discarded by `git submodule update` and never reach contributors.
- `.gitmodules` declares `ignore = dirty` for `third_party/tsgolint`, so accidental edits there are invisible to `git status` — easy to lose work.
- Bumping the pinned submodule revision is an intentional, separate operation — done by updating the submodule pointer in the parent repo, not by editing files inside.
- If you believe a change to a `third_party/` file is genuinely required (eg the tsgo checker needs a new exported symbol), STOP and surface the case to the user. The patch-authoring workflow is documented in [CONTRIBUTORS.md](CONTRIBUTORS.md) — do not improvise.

## Testing

- JS side uses **Vitest** as testing framework with root [vitest.config.ts](vitest.config.ts)
- Test files use `.spec.ts` (and `.test.ts`) suffix
- Run all JS tests from root: `pnpm test` (which runs `vitest run`)
- Run a single JS test file: `pnpm exec vitest run <file-path-or-pattern>`
- Run a single JS package's tests: `pnpm --filter vite-plugin-runtypes test` or `pnpm --filter @mionjs/ts-go-run-types test`
- Run Go tests: `go test ./internal/...`
- **Always `go build` the binary before `pnpm test`** — plugin tests spawn `bin/ts-go-run-types` and will fail at spawn otherwise. A `pnpm run check:go-binary` script ([scripts/check-go-binary.sh](scripts/check-go-binary.sh)) is available to verify.
- Never run `pnpm run build` during development (only for publishing)

### ⚠️ Marker test coverage rule

Any test that exercises the marker API — in either Go under [internal/](internal/) or the JS plugin under [packages/vite-plugin-runtypes/test/](packages/vite-plugin-runtypes/test/) — MUST cover both forms:

- the **static** form `getRuntypeId<T>()` — caller supplies `T` explicitly, no value;
- the **reflection** form `reflectRuntypeId(value)` — `T` inferred from a runtime value.

Write paired tests (not parameterized): each scenario is two distinct tests, each using the natural call shape for its intent — e.g. `getRuntypeId<string>()` vs `const s: string = 'hello'; reflectRuntypeId(s);`. Both forms should resolve to the same cache entry for equivalent `T`, and at least one paired test per suite should assert that hash equivalence (see `TestAtomic_FormEquivalence` in [internal/resolver/atomic_test.go](internal/resolver/atomic_test.go)).

## Publishing Modules

- Dual module output: CommonJS and ESM (see each package's `exports` block)
- Output directory: `./dist/` per package — `tsc -p tsconfig.json` per package via `lerna run build`
- **Before publishing, always run the pre-publish verification script:** `pnpm run pre-publish-test` (wraps [scripts/pre-publish-test.sh](scripts/pre-publish-test.sh))
- Publish via `pnpm run npm-publish` ([scripts/publish.sh](scripts/publish.sh)) — interactive: `npm whoami` → clean-tree check → `lerna version` → OTP prompt → `lerna publish from-package`
- Unpublish a bad release: `pnpm run npm-unpublish <version>` ([scripts/unpublish.sh](scripts/unpublish.sh))

## Code Style

- No 'I' prefix for interfaces or 'T' prefix for type parameters
- Use 'RuntypeId' (capital T in mid-word) for the marker type alias — same casing convention as mion's `RunType`
- Prefer type casting over type assertions
- Maintain consistent formatting with the existing codebase
- Don't use `@param` and `@returns` comments in JSDoc
- Prefer one-liner comments for functions, eg `/** does this and that **/`
- Prefer one-line `if` statements, eg `if (condition) doSomething();`

## Development Workflow

- Never run `pnpm run build` during development (only for publishing)
- Run `pnpm run clean` (nx reset + per-package clean) before a fresh start
- After modifying Go sources, **rebuild the binary** before re-running JS plugin tests (see "Testing")
- Use `pnpm run test` to run all JS tests; use `go test ./internal/...` for Go
- Before committing, run `pnpm run lint` and `pnpm run format` (fix any errors first)
- Always prefer pnpm scripts from `package.json` over raw `pnpm exec <command>` when a script exists
- Pre-commit hook ([.husky/pre-commit](.husky/pre-commit)) runs `lint-staged` automatically — activated by `pnpm install` via the root `prepare` script

## ⚠️ Go binary rebuild requirement

- The Vite plugin spawns `bin/ts-go-run-types` as a child process; it does NOT link against Go source. After modifying any Go source under [cmd/](cmd/) or [internal/](internal/), you MUST rebuild before re-running JS tests: `go build -o bin/ts-go-run-types ./cmd/ts-go-run-types`
- Go-only tests (`go test ./internal/...`) do NOT need the prebuilt binary — they exercise the packages directly
- Vite plugin tests (`pnpm --filter vite-plugin-runtypes test`) DO require the rebuilt binary

## Rewrite mechanics

- Rewrites operate on **byte offsets, not string indices** — tsgo positions are UTF-8 byte offsets. The Vite plugin's [rewrite.ts](packages/vite-plugin-runtypes/src/rewrite.ts) works on a `Buffer`, not a JS string. Don't "fix" it to use string slicing; multibyte source characters will misalign the inserted hash.
- The emitted `virtual:runtypes-cache` module is **self-wired**: `const t_<hash> = {…}` declarations first, then an init block patches reference slots in place. This avoids circular-dependency issues at module load — see [render-cache.ts](packages/vite-plugin-runtypes/src/render-cache.ts) and [internal/emit/tsmodule.go](internal/emit/tsmodule.go) for the mirrored emitters (keep them in sync).
- Types are **deduplicated twice** in [internal/serialize](internal/serialize/) — pointer identity (same `*checker.Type` reached via two paths) AND structural id (two distinct `Type` objects with the same shape). Both collapse to a single cache entry.

## Documentation

- [README.md](README.md) — project overview, how-it-works, usage, CLI flags
- [CONTRIBUTORS.md](CONTRIBUTORS.md) — full contributor setup, patch management workflow, dev-loop recipes, troubleshooting table
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — detailed design, execution model, the sentinel marker, lossy mappings
- [docs/ROADMAP.md](docs/ROADMAP.md) — scope + known lossy mappings
