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
  - `ts-go-run-types`: `@mionjs/ts-go-run-types` — `InjectRunTypeId<T>` marker type, `getRunTypeId` (static), `reflectRunTypeId` (reflection)
  - `vite-plugin-runtypes`: Vite plugin — spawns the Go binary, applies byte-offset rewrites, emits `virtual:runtypes-cache`
- Run commands in a specific package: `pnpm --filter @mionjs/ts-go-run-types run <cmd>` or `pnpm --filter vite-plugin-runtypes run <cmd>`
- Or navigate to package directory and run commands locally
- All devDependencies should be installed root-level, not in the packages
- Cross-package deps use the `workspace:*` protocol — pnpm rewrites it to concrete versions on publish

## Go side

- Go version: **≥ 1.26** (enforced by `go.mod`)
- Build the binary with `go build -o bin/ts-go-run-types ./cmd/ts-go-run-types`
- Run Go tests with `go test ./internal/...`
- Go fixtures live in [internal/testfixtures](internal/testfixtures/) (F1–F17) covering atomic reflection kinds, primitives/objects/unions, inferred generics, and `InjectRunTypeId<T>` marker variants
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

- the **static** form `getRunTypeId<T>()` — caller supplies `T` explicitly, no value;
- the **reflection** form `reflectRunTypeId(value)` — `T` inferred from a runtime value.

Write paired tests (not parameterized): each scenario is two distinct tests, each using the natural call shape for its intent — e.g. `getRunTypeId<string>()` vs `const s: string = 'hello'; reflectRunTypeId(s);`. Both forms should resolve to the same cache entry for equivalent `T`, and at least one paired test per suite should assert that hash equivalence (see `TestAtomic_FormEquivalence` in [internal/resolver/atomic_test.go](internal/resolver/atomic_test.go)).

## Publishing Modules

- Dual module output: CommonJS and ESM (see each package's `exports` block)
- Output directory: `./dist/` per package — `tsc -p tsconfig.json` per package via `lerna run build`
- **Before publishing, always run the pre-publish verification script:** `pnpm run pre-publish-test` (wraps [scripts/pre-publish-test.sh](scripts/pre-publish-test.sh))
- Publish via `pnpm run npm-publish` ([scripts/publish.sh](scripts/publish.sh)) — interactive: `npm whoami` → clean-tree check → `lerna version` → OTP prompt → `lerna publish from-package`
- Unpublish a bad release: `pnpm run npm-unpublish <version>` ([scripts/unpublish.sh](scripts/unpublish.sh))

## Code Style

- No 'I' prefix for interfaces or 'T' prefix for type parameters
- Use 'InjectRunTypeId' (capital T in mid-word) for the marker type alias — same casing convention as mion's `RunType`
- Prefer type casting over type assertions
- Maintain consistent formatting with the existing codebase
- Don't use `@param` and `@returns` comments in JSDoc
- Prefer one-liner comments for functions, eg `/** does this and that **/`
- Prefer one-line `if` statements, eg `if (condition) doSomething();`
- Use meaningful variable names in both Go and JS/TS — avoid one-letter abbreviations like `p`, `c`, `t`. When a struct field has a JSON tag, reuse that name for the local variable. Bad: `func New(p *Program, c *Checker)`. Good: `func New(program *Program, checker *Checker)`. Loop indices (`i`, `k`, `v`) and `err` are fine.

## Development Workflow

- Never run `pnpm run build` during development (only for publishing) — **EXCEPT for `vite-plugin-runtypes`**, which MUST be rebuilt after every src modification. The marker package's typecheck consumes the plugin via its published `dist/index.d.ts` (the plugin's `exports` map has no `"source"` condition like the marker package does), so stale dist types break consumer typechecking. Run `pnpm --filter vite-plugin-runtypes run build` after editing anything under [packages/vite-plugin-runtypes/src/](packages/vite-plugin-runtypes/src/).
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

## Marker package self-import resolution

The marker package's own tests import from its public name `@mionjs/ts-go-run-types`, and both vitest and tsgo need to resolve that to the in-tree `src/index.ts` rather than the (un)built `dist/`. The wiring is:

- [`packages/ts-go-run-types/package.json`](packages/ts-go-run-types/package.json) — `exports[".source"]` points at `./src/index.ts`. Opt-in lane; consumers without the `source` condition fall through to the normal `types`/`import`/`require` entries.
- [`packages/ts-go-run-types/vitest.config.ts`](packages/ts-go-run-types/vitest.config.ts) — `resolve.conditions: ['source']` (mirrored on `ssr.resolve.conditions`) for vite's runtime resolver.
- [`packages/ts-go-run-types/tsconfig.test.json`](packages/ts-go-run-types/tsconfig.test.json) — `customConditions: ["source"]` for tsgo's type-resolution pass.

Both flags select the same `"source"` entry. Drop either one and the package self-import will resolve to the built `dist/` instead, breaking tests during dev when dist is missing or stale.

The marker scanner in [`internal/marker/marker.go`](internal/marker/marker.go) gates `InjectRunTypeId<T>` recognition by walking up from the declaration's source file to the nearest `package.json` and matching its `"name"` field. This makes source-resolved imports work the same as `node_modules`-resolved ones — both end up at a `package.json` with `"name": "@mionjs/ts-go-run-types"`. **Don't reintroduce the old path-fragment heuristic.**

The Go test suite ([`internal/testfixtures/runtypes.d.ts`](internal/testfixtures/runtypes.d.ts)) uses the older ambient `declare module` form because the fixtures live under `internal/` without their own package.json. That path is also still honored by the marker scanner — keep the overlay in sync with the marker package's public API when adding new marker functions.

## Rewrite mechanics

- Rewrites operate on **byte offsets, not string indices** — tsgo positions are UTF-8 byte offsets. The Vite plugin's [rewrite.ts](packages/vite-plugin-runtypes/src/rewrite.ts) works on a `Buffer`, not a JS string. Don't "fix" it to use string slicing; multibyte source characters will misalign the inserted hash.
- The emitted `virtual:runtypes-cache` module is **self-wired**: `export const t_<hash> = {…}` declarations first, then an init block patches reference slots in place. This avoids circular-dependency issues at module load. The renderer lives in [internal/emit/runtypes_module.go](internal/emit/runtypes_module.go) and emits plain JS; the variable prefix and module name come from [internal/constants/constants.go](internal/constants/constants.go) (mirrored to TS via `pnpm run gen:ts-constants`). The Vite plugin reads `runTypeCacheSource` off the resolver's `dump` response and serves it as the virtual module body. Tests can short-circuit by setting `includeCacheSources: ['runType']` (or `['all']` for every kind) on `scanFiles` to receive the same body scoped to **just the files in that request** (per-request projection, not session-wide accumulation — callers wanting everything in memory use `dump`).
- Types are **deduplicated twice** in [internal/serialize](internal/serialize/) — pointer identity (same `*checker.Type` reached via two paths) AND structural id (two distinct `Type` objects with the same shape). Both collapse to a single cache entry.
- **Never store parent-relative data on a canonical node**. Cache entries are shared singletons (one per structural id), so any field whose meaning depends on which parent referenced the node — `parent` back-link, "my slot index in MY parent", "I'm a discriminator for THIS parent union" — is silently wrong the moment that node appears under more than one parent. If a relationship is parent-scoped, store it on the **parent** (e.g. `RunType.UnionDiscriminators` lives on the union, not on the property), or have the consumer build the back-link at walk time from a known root. See `docs/ROADMAP.md` → "JSON shape — known limitations" for the `parent` row and the union discriminator wire shape rationale.

## isType contract — serializable data only

`createIsType<T>()` and `createGetTypeErrors<T>()` validate **serializable data**, not the full TypeScript type. Non-serialisable members (functions, methods, symbols, symbol-keyed properties, getters/setters with no backing data) are **silently dropped** from the validated shape with a build-time **Warning** diagnostic (IT010/IT011/IT012/IT013, TE010/…). This is by design — JSON drops them on the wire anyway, so validating against a JSON-shaped projection of `T` is the right semantic for the typical use case (RPC, persistence, network IO).

Consequence: `interface User { name: string; onClick: () => void }` produces a validator that only checks `name`. A user passing `{name: 'x', onClick: 'not-a-fn'}` will see `isUser(value)` return `true` — the schema **does not enforce** `onClick`. The IT010 warning at build time is the only build-time signal of this; do **not** treat it as an error.

This same rule applies to the JSON / binary serialisation families: a property that can't be serialised silently drops at the **property** position (with a per-family Warning code), while at the **root** or other propagating positions (array element, tuple slot, union member, function param/return) it generates an `alwaysThrow` factory with an **Error**-severity diagnostic — calling that factory throws at runtime, so the build halts.

The clean line: **Warning = expected drop, the user should know but it's fine**. **Error = will throw at runtime, build must fail**.

Future direction (out of scope for the current code): we may refine the return type to `IsTypeFn<DataOnly<T>>` (where `DataOnly<T>` strips non-serialisable members from the type), rename `createIsType` → `createIsDataType`, or introduce a separate stricter `createIsFullType` that errors instead of dropping. Discuss in [docs/ROADMAP.md](docs/ROADMAP.md) before changing — current callers depend on the silent-drop semantics.

## Documentation

- [README.md](README.md) — project overview, how-it-works, usage, CLI flags
- [CONTRIBUTORS.md](CONTRIBUTORS.md) — full contributor setup, patch management workflow, dev-loop recipes, troubleshooting table
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — detailed design, execution model, the sentinel marker, lossy mappings
- [docs/ROADMAP.md](docs/ROADMAP.md) — scope + known lossy mappings
- [docs/UNSUPPORTED-KINDS.md](docs/UNSUPPORTED-KINDS.md) — the unified throw architecture, which kinds are unsupported and why, the two-rule property-vs-non-property model
