# RunTypes Architectural Guidelines

For setup, build, test, and publish workflows, see [SETUP.md](SETUP.md) — the single setup document. The [ts-runtypes-setup skill](.claude/skills/ts-runtypes-setup/) automates host bootstrap end-to-end.

## Dual-language repo: Go binary + JS workspace

- **Go binary** at [cmd/ts-runtypes/](cmd/ts-runtypes/) + [internal/](internal/) reaches into tsgo's checker via the `oxc-project/tsgolint` shim to answer call-site type queries.
- **JS workspace** at [packages/](packages/) — `ts-runtypes` (marker + runtime helpers), `runtypes-devtools` (spawns the binary, rewrites calls, emits the cache module; also ships the OXlint/ESLint lint plugin on its `./eslint` subpath — pure transport over the resolver's `checkEnrich` + `includeRtDiagnostics` scan flags, see [docs/ARCHITECTURE.md → The lint surface](docs/ARCHITECTURE.md#the-lint-surface--one-pass-oxlintESLint-transport)), and `ts-runtypes-bin` (platform launcher: `getExePath()` resolves the prebuilt resolver binary for the host from per-platform `ts-runtypes-binary-<os>-<arch>` optional deps).
- **External Go deps** at [third_party/](third_party/) are git submodules treated as read-only vendored sources.
- The Go binary is the side-channel; the JS packages are the only public surface.
- The Vite plugin's tests spawn `bin/ts-runtypes` — the binary MUST be built before `pnpm test` (see [SETUP.md → Build](SETUP.md#build)).

## Package manager — pnpm (NOT npm)

- Use pnpm 11+; never `npm install` (ignores `pnpm-workspace.yaml` security policies).
- pnpm-specific settings live in `pnpm-workspace.yaml`; `.npmrc` is auth/registry only.
- Full policy list (frozenLockfile, minimumReleaseAge, ignoreScripts, allowNonRegistryProtocols, savePrefix, strictPeerDependencies, nodeLinker) and dep-update gotchas are in [SETUP.md → pnpm policies](SETUP.md#pnpm-policies-workspace-security-posture).
- All `dependencies` and `devDependencies` are exact-pinned; only `runtypes-devtools` peerDeps stay as ranges so consumers can dedupe Vite.
- Cross-package deps use the `workspace:*` protocol; pnpm rewrites it to concrete versions on publish.

## Monorepo structure

- pnpm workspaces ([pnpm-workspace.yaml](pnpm-workspace.yaml)) for lockstep versioning ([version.json](version.json), bumped by [scripts/release/bump-version.mjs](scripts/release/bump-version.mjs)) and topo-ordered scripts (`pnpm -r run`).
- All three published packages (`ts-runtypes`, `runtypes-devtools`, `ts-runtypes-bin`) move in lockstep (`forcePublish: true`, `exact: true`); the per-platform `ts-runtypes-binary-*` packages are assembled at publish time and pinned exact-equal to the same version.
- `ts-runtypes` exposes the `InjectRunTypeId<T>` marker and `getRunTypeId` (static `getRunTypeId<T>()` + value-first `getRunTypeId(value)` forms).
- `runtypes-devtools` spawns the Go binary, applies byte-offset rewrites + import injection, serves the per-entry `virtual:rt/*` modules. Its `binary` option is OPTIONAL — when omitted it resolves the host binary via `ts-runtypes-bin`'s `getExePath()`.
- **Binary distribution** mirrors typescript-go's esbuild-style pattern: the Go resolver is cross-compiled per platform (`CGO_ENABLED=0`, [scripts/release/build-binaries.mjs](scripts/release/build-binaries.mjs)) into `ts-runtypes-binary-<os>-<arch>` packages (os/cpu-gated, binary at `lib/`), published by [scripts/release/publish.sh](scripts/release/publish.sh) BEFORE the launcher so its optional deps always exist. NEVER add a postinstall downloader — `ignoreScripts: true` blocks it. The binary embeds `constants.Version` (folded into typeID hashes) + `constants.TsgoVersion` (pure metadata: `--version` + the launcher's `tsgo` field, NEVER in the hash).
- Filter a package: `pnpm --filter ts-runtypes run <cmd>` or `pnpm --filter runtypes-devtools run <cmd>`.
- All devDependencies live root-level; never per-package.

## Go side

- Go ≥ 1.26 (enforced by `go.mod`); `go test ./internal/...` for the Go suite.
- Pipeline is split across single-purpose packages under [internal/](internal/) — program, resolver, marker, compiled/runtype, compiled/typefns, compiled/purefns, compiled/entrymod, compiled/transform (rewrite + source-map: `Apply`/`ComputeEdits`/`ComposeMaps`), compile (the `--compile` tsc-like batch: overlay emit + map composition), protocol, constants, diag, cache, hashid, testfixtures — keep each focused, never introduce cross-package state.
- Go fixtures live in [internal/testfixtures/](internal/testfixtures/) (F1–F17) covering atomic kinds, primitives/objects/unions, inferred generics, and `InjectRunTypeId<T>` marker variants.
- Our Go code lives ONLY in [cmd/](cmd/) and [internal/](internal/); never edit [third_party/](third_party/).

## ⚠️ External Go dependencies — `third_party/` is OFF-LIMITS

- [third_party/tsgolint/](third_party/tsgolint/) is `oxc-project/tsgolint` (which itself nests `microsoft/typescript-go`) — external upstream source.
- Never edit any file under [third_party/](third_party/), including the patches under [third_party/tsgolint/patches/](third_party/tsgolint/patches/) — they're upstream artifacts; local edits are discarded by `git submodule update` and never reach contributors.
- `.gitmodules` declares `ignore = dirty` for tsgolint, so accidental edits are invisible to `git status` — easy to lose work.
- Bumping the pinned revision is a separate intentional commit on the submodule pointer.
- If a `third_party/` change seems genuinely required (e.g. tsgo needs a new exported symbol), STOP and surface the case — the patch-authoring workflow is in [SETUP.md → Patching tsgolint](SETUP.md#patching-tsgolints-typescript-go); do not improvise.

## Testing

- JS uses **Vitest** (root [vitest.config.ts](vitest.config.ts)); test files use `.spec.ts` or `.test.ts`.
- All JS: `pnpm test`. Single file: `pnpm exec vitest run <pattern>`. Single package: `pnpm --filter <name> test`.
- Go: `go test ./internal/...`.
- ALWAYS rebuild `bin/ts-runtypes` before `pnpm test` — plugin tests spawn it; `pnpm run pretest` runs [`scripts/core/build.sh`](scripts/core/build.sh) automatically (covers the Go binary, the marker dist, and the vite plugin dist).
- Never run `pnpm run build` during development (only for publishing) — EXCEPT for `runtypes-devtools`, which MUST be rebuilt after every src edit (consumers read its dist `.d.ts` for typecheck; no `source` condition in its exports).

### ⚠️ Marker test coverage rule

- Any test exercising the marker API (Go under [internal/](internal/) or JS plugin under [packages/runtypes-devtools/test/](packages/runtypes-devtools/test/)) MUST cover both call shapes of `getRunTypeId`: static `getRunTypeId<T>()` (caller supplies T, no value) AND reflection `getRunTypeId(value)` (T inferred from the value).
- Write paired tests (not parameterized); use the natural call shape for each intent — e.g. `getRunTypeId<string>()` vs `const s: string = 'hello'; getRunTypeId(s);`. Both forms should resolve to the same cache entry for equivalent T.
- At least one paired test per suite must assert hash equivalence between the two forms (see `TestAtomic_FormEquivalence` in [internal/compiler/resolver/atomic_test.go](internal/compiler/resolver/atomic_test.go)).

## Code style

- No `I` prefix on interfaces; no `T` prefix on type parameters.
- `InjectRunTypeId` (capital T mid-word) — same casing as `RunType`.
- Prefer type casting over assertions.
- No `@param` / `@returns` in JSDoc; prefer one-liner comments and one-line `if`s.
- Use meaningful names in Go + TS; avoid one-letter abbreviations like `p`, `c`, `t`; when a struct field has a JSON tag, reuse that name for the local variable. Loop indices (`i`, `k`, `v`) and `err` are fine.

## Environment variables

- **Single source of truth:** `rt_env_registry()` in [scripts/env/registry.sh](scripts/env/registry.sh) lists EVERY env var the project consumes (scripts, containers, CI, tests). `pnpm run check:env` prints it. **Any new env var a script / container / CI step / test reads MUST be added there** — the registry is the contract.
- **Prefix runtypes-owned vars with `RT_`** (`RT_WEBSITE_*`, `RT_BENCH_*`, `RT_FUZZ_*`, `RT_AUDIT_*`, …). External/standard names keep their conventional spelling because the tools that read them require it: `NPM_TOKEN`, `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`, `GHCR_*`, `CI`, `NODE_ENV`, `PORT`.
- **Three scopes** (the registry's `SCOPE` column): `secret` (credential), `dev` (overridable knob with a default), `internal` (set by the scripts themselves — container paths / plumbing). Mark new vars accordingly.
- **`.env.sample` mirrors the user-settable rows only** (`secret` + `dev`); add new ones there too. NEVER list an `internal` var in `.env.sample` — setting it breaks the run.
- **One credential, one load path:** secrets live directly in `.env` (loaded by [scripts/env/registry.sh](scripts/env/registry.sh) / [scripts/env/load.mjs](scripts/env/load.mjs)); no file-path alternates or proxy/duplicate names.
- A var that crosses the host→container or host→CI boundary must be renamed on BOTH ends in the same change (the setter and every reader), or the protocol silently breaks.

## Development workflow

- **The internal `rt` CLI ([scripts/rt.mjs](scripts/rt.mjs)) is the front door for dev/website/bench/publish** — run it as `pnpm rt <area> <command>` over the area scripts (core/website/bench/container/env/release): e.g. `pnpm rt core fuzz <suite>`, `pnpm rt website dev`, `pnpm rt bench`, `pnpm rt verify`, `pnpm rt fmt`, `pnpm rt core codegen all --check`, `pnpm rt release`. It's a zero-dep dispatcher over the same `scripts/*.sh`/`*.mjs`/`vitest` the workflows call (never a reimplementation), so it can't drift from CI, and it builds the resolver + dists first where needed (replacing the old per-script `check:builds` pre-hooks). Run `pnpm rt --help`. The underlying `scripts/*.sh` and the CI-literal aliases (`check:builds`, `check-format`, `lint`, `test`, `build`) stay as-is — `rt` sits above them.
- After modifying Go sources, rebuild `bin/ts-runtypes` before re-running JS plugin tests; Go-only tests (`go test ./internal/...`) exercise the packages directly and don't need the prebuilt binary.
- `pnpm run clean` (per-package clean via `pnpm -r run clean`) before a fresh start.
- Before committing, run `pnpm run lint` and `pnpm run format` (fix errors first).
- **"Format" means running `pnpm run format` — never hand-format, and never widen its scope.** That one command is the single source of truth: it runs **oxfmt** over `packages/**/*.ts` (TypeScript), **Prettier** over `packages/**/*.md` (markdown only), AND `gofmt -w` over `cmd` + `internal` (all the Go source). `pnpm run check-format` is its read-only twin (CI / pre-commit). The scope is deliberately narrow: everything else is EXCLUDED on purpose — the website / docs / scripts / `.claude` markdown (Prettier mangles the MDC `::`-component and ` ```md ` examples in them), the vendored `third_party/` and `_deps/` trees, lockfiles, and the `internal/**/testdata` golden fixtures. If a formatting change ever seems needed outside `pnpm run format`'s scope, STOP and surface it rather than running oxfmt/Prettier/gofmt manually over other paths.
- Prefer `pnpm` scripts from `package.json` over raw `pnpm exec <cmd>` when a script exists.
- **Found a bug outside your current task's scope? Tell the user AND file it.** Any defect discovered along the way — a fuzzer finding, a soundness-tripwire message in test output (e.g. the noop-predicate mismatch log), a latent bug a new test exposes, a doc-vs-code contradiction — gets BOTH: (1) surfaced to the user in your reply (what it is, where it came from, whether it predates your change — bisect if cheap), and (2) recorded as a spec file under [docs/todos/](docs/todos/) with the evidence and a concrete fix plan, so it survives the session. Never let an out-of-scope finding live only in chat, and never silently widen your task to fix it without asking.
- Pre-commit hook ([.husky/pre-commit](.husky/pre-commit)) runs `lint-staged` automatically — activated by `pnpm install` via the root `prepare` script.
- Containerized website + benchmarks share ONE podman image (website at `/app`, benchmarks at `/bench`). Image lifecycle (build/push/pull/ensure/lock/clean) is owned by [scripts/container/image.sh](scripts/container/image.sh) (shared helpers in [scripts/container/lib.sh](scripts/container/lib.sh)); [scripts/website/site.sh](scripts/website/site.sh) runs the site and [scripts/website/bench-data/bench.sh](scripts/website/bench-data/bench.sh) runs the bench half under `/bench`, both delegating image ops to image.sh. See [SETUP.md → Containerized apps](SETUP.md#containerized-apps-docs-website--benchmarks).

## PR readiness

Before opening a PR, confirm the change is **PR ready** — never open one otherwise. For any **new feature, or a significant change to an existing one**, treat all of the following as a hard gate:

- **Front-end tests exist and pass.** Every new or changed behaviour needs Vitest coverage under [packages/](packages/) (`.spec.ts` / `.test.ts`); run the whole JS suite with `pnpm test`. Marker-API work must cover BOTH `getRunTypeId` call shapes (the **Marker test coverage rule** under [Testing](#testing)). Go-side changes also need `go test ./internal/...`.
- **Docs are updated — especially the website.** Reflect the change in [container/website/content/](container/website/content/) (follow the **Website docs style** section below), and update [README.md](README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) or [docs/ROADMAP.md](docs/ROADMAP.md) whenever it touches what they describe (CLI flags, execution model, scope, lossy mappings).
- **If the PR implements a [docs/todos/](docs/todos/) spec, `git mv` it into [docs/done/](docs/done/) (or [docs/partially/](docs/partially/)) and update it to match what shipped.**

### ⚠️ The FE-test gate needs a built environment — set it up FIRST

The Vite-plugin tests **spawn the Go binary** ([packages/runtypes-devtools/test/](packages/runtypes-devtools/test/)), so `pnpm test` fails immediately on a host that isn't bootstrapped. **A fresh clone is NOT ready**: the [third_party/](third_party/) submodules are uninitialised and `bin/ts-runtypes` does not exist yet.

If the FE tests can't run (missing binary, submodule errors, no Go / pnpm), **set the environment up before drawing any conclusion** — never report "tests pass" or "tests skipped" from an unbuilt host. The full host bootstrap is automated by the [ts-runtypes-setup skill](.claude/skills/ts-runtypes-setup/) — **use it**. The pieces the FE suite needs:

1. the [third_party/](third_party/) submodules (tsgolint + its nested typescript-go) initialised, with patches applied,
2. the Go resolver built into `bin/ts-runtypes`,
3. `runtypes-devtools` built (consumers and the typecheck read its dist).

Full manual steps are in [SETUP.md](SETUP.md). After touching Go sources, rebuild `bin/ts-runtypes` before `pnpm test` (`pnpm run pretest` runs the staleness check).

## Git workflow

- **PRs land via Rebase-and-merge — keep every branch LINEAR (no merge commits).**
- **Integrate upstream by rebasing, never merging.** When `main` moves (it may be **force-updated** / history-rewritten), rebase onto it:
  ```
  git fetch origin main
  git rebase origin/main            # resolve conflicts here, per replayed commit
  git push --force-with-lease origin <branch>
  ```
- **Never `git merge main` into a feature branch.** A merge commit makes the *final tree* clean — so the merge API reports `mergeable` and `git merge-base --is-ancestor` looks fine — but GitHub's rebase-merge replays your ORIGINAL commits one-by-one and fails with **"this branch cannot be rebased due to conflicts."** The merge check and the rebase check disagree, so a branch that looks mergeable still can't land.
- Commits authored before a `main` change (e.g. deleting/renaming files `main` later edited) MUST be rebased so they're rewritten on top of the new `main`. A branch that won't rebase cleanly must be linearized onto current `main` before review — rebase, or rebuild as a single commit: `git commit-tree $(git rev-parse HEAD^{tree}) -p origin/main` then `git reset --hard <new>`.
- Before pushing, confirm the branch is linear: `git log --oneline origin/main..HEAD` lists only your own commits, with **no merge commits**.
- After any rebase, push with `git push --force-with-lease` — never plain `--force` (the lease refuses the push if the remote branch moved under you).
- **Resolve a PR review thread once you've FIXED it — never before.** When a review comment is addressed by a pushed change, mark that thread resolved (GitHub `resolve_review_thread`) so the reviewer sees only what's still open. This applies ONLY to fixes: a **push-back** (you disagree and explain why you won't make the change) or a plain **explanation / answer** (no code change) is left OPEN for the reviewer to close — resolving it would hide the discussion before they've read it. Reply with the reasoning in both cases; resolve only the fixes.

## Marker package self-import resolution

- The marker package's own tests import its public name `ts-runtypes`; both vitest and tsgo must resolve that to in-tree `src/index.ts`, NOT the (un)built `dist/`.
- [`packages/ts-runtypes/package.json`](packages/ts-runtypes/package.json) — `exports[".source"]` points at `./src/index.ts`. Opt-in lane; consumers without the `source` condition fall through to the normal `types`/`import`/`require` entries.
- [`packages/ts-runtypes/vitest.config.ts`](packages/ts-runtypes/vitest.config.ts) — `resolve.conditions: ['source']` (mirrored on `ssr.resolve.conditions`) for vite's runtime resolver.
- [`packages/ts-runtypes/tsconfig.test.json`](packages/ts-runtypes/tsconfig.test.json) — `customConditions: ["source"]` for tsgo's type-resolution pass.
- Drop either flag and the self-import resolves to `dist/` instead, breaking dev tests when dist is missing or stale.
- The marker scanner in [`internal/compiler/marker/marker.go`](internal/compiler/marker/marker.go) gates `InjectRunTypeId<T>` recognition by walking up from the declaration's source file to the nearest `package.json` and matching its `"name"` field — `node_modules`-resolved and source-resolved imports both work. **Don't reintroduce the old path-fragment heuristic.**
- The Go test suite ([`internal/testfixtures/runtypes.d.ts`](internal/testfixtures/runtypes.d.ts)) uses the older ambient `declare module` form because the fixtures live under `internal/` without their own package.json; that path is also honored by the marker scanner — keep the overlay in sync with the marker package's public API.

## Rewrite mechanics

Full description: [docs/ARCHITECTURE.md → Rewrite mechanics](docs/ARCHITECTURE.md#rewrite-mechanics). Highlights to follow when touching rewrite or entry-module code:

- Rewrites use UTF-8 BYTE offsets (tsgo positions count bytes); the Go transform package ([transform.go](internal/compiler/sourcerewrite/transform.go)) converts every offset via `makeByteToChar` before indexing — never index the source string with a raw resolver offset.
- Edits go through the in-house `EditBuffer` ([editbuffer.go](internal/compiler/sourcerewrite/editbuffer.go)) for a real source map (original lines/columns survive the injected import block + bindings); it replaced the `magic-string` dependency, so the plugin carries no bundling deps — its ONLY runtime dep is `ts-runtypes-bin` (the platform binary launcher, itself dependency-free). Its map matches magic-string's `hires: 'boundary'` output — the ported source-map algorithm is credited to magic-string (MIT) in the file header.
- **Two transform wire modes**, plugin option `transformMode: 'go' | 'edits'` (default `'edits'`; per-request `emitEdits`, NEVER a disk-cache fingerprint input): `'go'` returns the whole rewritten `code` + map (universal / non-JS-host path, safe fallback); `'edits'` returns `TransformResult{ImportBlock, Edits, SourceHash}` and the plugin applies it with the resurrected JS `EditBuffer` ([edit-buffer.ts](packages/runtypes-devtools/src/edit-buffer.ts)) via `applyEdits` ([apply-edits.ts](packages/runtypes-devtools/src/apply-edits.ts)). `ComputeEdits` ([edits.go](internal/compiler/sourcerewrite/edits.go)) shares `Apply`'s `buildInsertion`/`buildImportBlock` and the JS applier mirrors `Apply`'s `prepend`/`appendLeft`/`update` order, so the two modes are **byte-identical by construction** — pinned by the mode-parity corpus in [transform-modes.test.ts](packages/runtypes-devtools/test/transform-modes.test.ts). **New sync boundaries:** the Go and JS `EditBuffer`s are twins (edit `Text` + offsets must apply identically), and `SourceHash` (Go `edits.go`) ⇄ `sourceHash` (JS `apply-edits.ts`) is a byte-for-byte **FNV-1a/32-over-UTF-8** contract (the `'edits'` source-consistency guard) — change one side, change both. `Edit` offsets are **UTF-16 code units** (Go already ran `makeByteToChar`). Benchmark: `scripts/website/bench-data/bench.sh transform-wire`. `sourcesContent: false` (go-mode) drops the map's embedded original source.
- Plugin options `moduleMode` (default | allSingle | allModules) and `inlineMode` (default | allInternal) configure entry grouping + child inlining; the two never share disk caches (fingerprint folds inlineMode in).
- **Every cache entry is its own virtual module** EXCEPT runtype nodes, which ride as headless rows of the single data bundle `virtual:rt/runtypes.js` (kind 4) — one row per node app-wide. Per-reflection-root facade `virtual:rt/<rootId>.js` (kind 5) imports the bundle.
- Every module exports ONE positional tuple under `__rt_<key>`: `[tag, depsThunk|hole, ini|hole, …]`. Absent slots are JS array HOLES, NOT `undefined` aliases.
- Tuple-layout sync boundary: [internal/compiler/virtualmodules/virtualmodules.go](internal/compiler/virtualmodules/virtualmodules.go) (assembler) and [packages/ts-runtypes/src/runtypes/entryTuple.ts](packages/ts-runtypes/src/runtypes/entryTuple.ts) (runtime). Constants from [internal/constants/constants.go](internal/constants/constants.go), mirrored via `pnpm run gen:ts-constants`.
- **Imports and `deps()` carry DIRECT dependencies only** — never the transitive closure (flattening was 6x wire / 4x render on real suites). Leaves-first, alphabetical within a level (Tarjan SCC for cycles), never self; `deps()` is a lazy thunk inlined into the slot so module cycles never hit TDZ.
- Rewrite injects one deduped import block at offset 0 + the entry-module BINDING at each call site (`createValidate<T>(__rt_<fnHash>_<id>)`); ids derive from tuple slot 3 — no id strings on the wire.
- Entry modules are content-addressed (ids embed binary version), immutable, never HMR-invalidated — EXCEPT the runtype data bundle, invalidated in `handleHotUpdate` when a scan reports `addedRunTypes`.
- **Builtin classes project atomically** — Date / Map / Set / RegExp / Temporal stop at subKind + classRef (+ Map/Set element). Lib members are never walked or interned (`projectClass` in [internal/cachegen/runtype/serialize.go](internal/cachegen/runtype/serialize.go)); every consumer keys on subKind.
- Types are **deduplicated twice** in [internal/cachegen/runtype/](internal/cachegen/runtype/) — pointer identity AND structural id — both collapse to a single cache entry.
- **Never store parent-relative data on a canonical node.** Cache entries are shared singletons (one per structural id); parent-scoped data lives on the parent (e.g. `RunType.UnionDiscriminators` on the union, not the property), or the consumer builds back-links at walk time.

## Two injection markers + demand-driven function caches

Full design: [docs/ARCHITECTURE.md → The second marker — `InjectTypeFnArgs<T, Fn>` and demand-driven caches](docs/ARCHITECTURE.md#the-second-marker--injecttypefnargst-fn-and-demand-driven-caches). Both markers live in [packages/ts-runtypes/src/markers.ts](packages/ts-runtypes/src/markers.ts).

- `InjectRunTypeId<T>` — reflection-only (`getRunTypeId` static + value-first forms, value-first RT builders, `createMockType`). Injects `"<typeId>"`; drives the `runTypes` reflection cache (1:1 on shape, no options).
- `InjectTypeFnArgs<T, Fn>` — every `createX<T>()` factory (`createValidate`, `createGetValidationErrors`, the `huk`/`suk`/`uke`/`uku`/`fmt` group, `createJsonEncoder/Decoder`, `createBinaryEncoder/Decoder`). Injects `["<typeId>", "<fnHash>"]`; `fnHash` is a length-3 opaque hash Go computes from `Fn` + the call-site `CompTimeFnArgs` literal. Runtime treats `fnId` as an opaque lookup key — **no runtime hashing**. Cache key: `<fnHash>_<typeId>`.
- `CompTimeFnArgs<T>` is the fn-selecting variant of `CompTimeArgs<T>` — validates literals identically (CTA0xx) and marks the param whose literal value selects the `createX` variant. Plain `CompTimeArgs<T>` stays for other literal params.
- Function caches are **demand-driven**: a family's cache contains only the types its own call sites request. Scanner computes structured demand on `protocol.Site.Demand []SiteDemand{FamilyTag, VariantSuffix, Options, FnHash}`; `collectFamilyDemand` in [internal/cachegen/typefunctions/module.go](internal/cachegen/typefunctions/module.go) closes it transitively. Gate is `len(dump.Sites) > 0`. A `getRunTypeId`-only file emits ZERO function-cache entries.
- Operations registry: the 11 public `createX` ops + 5 internal primitives + `FnHashFor`/`PlainHash`/`Canonical`/`DemandFor` live in [internal/cachegen/operations](internal/cachegen/operations/). `FnHashLen = 3`; an `init()` collision guard fails the build on collision in the closed option set (never auto-grown).
- JSON encoder/decoder composition is Go-emitted: one COMPOSITE cache entry per (typeId, strategy) keyed by composite fnHash ([internal/cachegen/typefunctions/json_composite.go](internal/cachegen/typefunctions/json_composite.go)) wraps the primitives with native JSON — `createJsonEncoder/Decoder` collapse to the same pure `resolveTupleEntry` lookup as binary. Per-strategy tags live in `constants.jsonCompositeTags` (deliberately NOT in `CacheModules`, so the generated TS mirror is untouched).
- Encoder strategy set: `clone` (default, shape-derived, strips undeclared keys via `prepareForJsonSafe`); `mutate` (in-place, preserves extras); `direct` (single-pass).
- Disk cache format **v11**: keys embed fnHash; payload is the tuple `ArgsText` (default-valued slots — interior ones too — rendered as JS holes via `typefunctions.holeifyArgs`) + persisted `IsNoop` bit.
- Plugin **`emitMode`** option (`code` | `functions` | `both`; binary `--emit-mode`) selects what each fn entry ships: `code` (default) body string (runtime rebuilds via `new Function`); `functions` live `createRTFn` closure; `both` ships both (CSP runtimes reading `.code`). Disk fingerprint ([internal/cachegen/diskcache/fingerprint.go](internal/cachegen/diskcache/fingerprint.go), tag v4) folds `emitMode` in so modes never cross-read.
- `it` (validate) is special — a shared cross-family dep because JSON/binary union decoders + `validationErrors` call `val_<member>` at runtime. Edges ride each entry's `SoftDeps` (imported, never cascade-dropped — bodies guard with `?.fn(…) ?? true`); resolver renders foreign entries to fixpoint (`resolveCrossFamilyEdges` in [internal/compiler/resolver/dispatch.go](internal/compiler/resolver/dispatch.go)). A union-only file still gets per-member `val_` entries via the union's import closure.
- **Noop elision is semantic, never shape-based** ([internal/cachegen/typefunctions/noop_types.go](internal/cachegen/typefunctions/noop_types.go)). EVERY family implements `IsNoopType` over the TYPE GRAPH (cycle-safe greatest fixpoint, memoized in `FactsTable`) and the renderer takes the noop verdict from it — emitted text never decides (the body's shape survives only as the renderer's protective tripwire: predicate-true/body-live ships the LIVE body + stderr log). Predicates mirror their own emitter arm-by-arm, delegate where the emitter delegates (cj → pjs wholesale; cjr → rj's arms with its own object arms false; one parameterised mirror for the five unknown-keys families), and reuse the emitter's own helpers (`isStrippedUnionMember`, the flat-union `roundTripsRaw` bucketing, …). The dispatch gate is fed only by `NoopComposeAround` families — sj (fragment concatenation) and fb (positional byte reads) are root-verdict-only. An all-elided JSON composite (no live primitive bindings, no `[v]` wrapRoot envelope) ships as the noop SHORT-FORM tuple; the runtime substitutes native `JSON.stringify`/`JSON.parse` (`entryTuple.ts` familyMeta — never the host primitive's identity). SOUNDNESS CONTRACT (one-directional): predicate true ⇒ body is identity — false negative costs bytes, false positive silently skips a transform. Corpus test ([internal/compiler/resolver/noop_predicate_test.go](internal/compiler/resolver/noop_predicate_test.go)) pins every family's unsound direction; when adding a kind or changing an emit arm, keep the predicate arm in sync.
- **Adding a new RT function family:** add to [internal/cachegen/operations](internal/cachegen/operations/) registry (Name + FamilyTag + Axis + FnKey), `typefunctions.Families` ([internal/cachegen/typefunctions/families.go](internal/cachegen/typefunctions/families.go)), `familyAddedFlags` in [internal/compiler/resolver/dispatch.go](internal/compiler/resolver/dispatch.go), and the runtime `familyMeta` table in [packages/ts-runtypes/src/runtypes/entryTuple.ts](packages/ts-runtypes/src/runtypes/entryTuple.ts). Give its `createX` an `InjectTypeFnArgs<T, '<fnKey>'>` trailing param (+ `CompTimeFnArgs` slot for comptime options). Cross-family refs ride `SoftDeps` automatically.

## validate contract — serializable data only

Full rationale: [docs/ARCHITECTURE.md → Validate contract](docs/ARCHITECTURE.md#validate-contract--serializable-data-only).

- `createValidate<T>()` and `createGetValidationErrors<T>()` validate **serializable data**, not the full TypeScript type — non-serialisable members (functions, methods, symbols, symbol-keyed props, getters/setters with no backing data) are silently dropped with a build-time **Warning** (VL010/VL011/VL012/VL013, VE010/…).
- Rationale: JSON drops them on the wire anyway; the JSON-shaped projection of `T` matches the typical use case (RPC, persistence, network IO).
- Consequence: `interface User { name: string; onClick: () => void }` produces a validator that only checks `name`; `isUser({name:'x', onClick:'not-a-fn'})` returns `true`. VL010 at build time is the only signal — do NOT treat it as an error.
- Same rule for JSON / binary: non-serialisable at a **property** position silently drops with a per-family Warning; at a **root** or propagating position (array element, tuple slot, union member, function param/return) it emits `alwaysThrow` with an **Error**-severity diagnostic that throws at runtime — the build halts.
- Clean line: **Warning** = expected drop, fine; **Error** = will throw at runtime, build must fail.
- **Decoders return the data-only projection.** `createJsonDecoder<T>()` and `createBinaryDecoder<T>()` return `DataOnly<T>` (the `dataonly-extract` type in [packages/ts-runtypes/src/runtypes/dataOnly.ts](packages/ts-runtypes/src/runtypes/dataOnly.ts)), NOT bare `T`. Projection lives on the factory overload return (`JsonDecoderFn<DataOnly<T>>` / `BinaryDecoderFn<DataOnly<T>>`); the `JsonDecoderFn`/`BinaryDecoderFn` aliases stay `=> T`. Encoders unchanged. Type-level only — no runtime / emitter change.
- Future direction (out of scope): refine return type to `ValidateFn<DataOnly<T>>`, rename `createValidate` → `createIsDataType`, or add a stricter `createIsFullType` that errors instead of dropping. Discuss in [docs/ROADMAP.md](docs/ROADMAP.md) before changing — current callers depend on the silent-drop semantics.

## Documentation

- [README.md](README.md) — project overview, how-it-works, usage, CLI flags.
- [SETUP.md](SETUP.md) — single setup doc: prereqs, bootstrap, build, test, lint, dev loop, containerized apps, publishing, troubleshooting.
- [.claude/skills/ts-runtypes-setup/](.claude/skills/ts-runtypes-setup/) — automated host bootstrap + smoke verification skill.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — detailed design, execution model, sentinel markers, lossy mappings, factory reference.
- [docs/ROADMAP.md](docs/ROADMAP.md) — scope + known lossy mappings.

### Website docs style (`container/website/content/`)

User-facing docs under [container/website/content/](container/website/content/) (Nuxt + Docus Markdown + MDC) follow a deliberate, reader-first voice. Keep it when editing:

- **Plain, user-focused language.** Say what a feature does for the reader and why it helps, not how it is built; cut deep internals (hashing, byte offsets, "side-channel", "fixpoint", demand-driven cache mechanics).
- **No dashes chaining clauses or sentences.** No em-dash, en-dash, `--`, or a spaced single `-` as punctuation; use a comma, a period, or parentheses. Hyphenated words (`build-time`) and dashes inside code / flags / URLs are fine.
- **Prefer fenced code blocks over heavy inline `code`.** Keep essential public API / type names, but do not clutter prose with backticks.
- **Short frontmatter `description`:** one simple sentence, aim under ~100 chars; leave already-short ones alone.
- **Style passes are prose-only.** A style/voice pass never touches: MDC component syntax (`::` / `:::`, `<code-import>`, `::code-group`, `::note`, `::suite-table`, `::bench-table`, twoslash blocks), the content of fenced code blocks, the `<!-- code-import-timestamp -->` comments (machine-owned, always off-limits), or `index.md` (the home page: hand-tuned copy and the densest custom-MDC usage).
- **API-truth updates are the opposite of forbidden.** When the product API changes, updating the affected code examples, `index.md`'s included, is REQUIRED. Keep the edit scoped to the example (never restructure an MDC component), and verify the per-file MDC-component and code-fence counts match the pre-edit baseline afterwards.
- **Prefer `<code-import>` over hand-written fences for TypeScript examples.** Import real files from [packages/examples/src/](packages/examples/src/) — they compile under [packages/examples/tsconfig.json](packages/examples/tsconfig.json) (wired into the root `typecheck` script, hence `pnpm run lint` and CI), so the type checker flags doc drift instead of letting it rot. Hand-written fences are for bash/CLI, JSON config, output/tree listings, and deliberately partial or deliberately invalid fragments only. Example files resolve the public package names via the tsconfig `paths` (built dist `.d.ts` — the published surface).
- **Broad style pass:** fan out one agent per `N.section/` dir, then verify em/en dashes are gone and per-file MDC-component / code-fence counts match the pre-edit baseline.
