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
  - `vite-plugin-runtypes`: Vite plugin — spawns the Go binary, applies byte-offset rewrites + import injection, serves the per-entry `virtual:rt/*` modules
- Run commands in a specific package: `pnpm --filter @mionjs/ts-go-run-types run <cmd>` or `pnpm --filter vite-plugin-runtypes run <cmd>`
- Or navigate to package directory and run commands locally
- All devDependencies should be installed root-level, not in the packages
- Cross-package deps use the `workspace:*` protocol — pnpm rewrites it to concrete versions on publish

## Go side

- Go version: **≥ 1.26** (enforced by `go.mod`)
- Build the binary with `go build -o bin/ts-go-run-types ./cmd/ts-go-run-types`
- Run Go tests with `go test ./internal/...`
- Go fixtures live in [internal/testfixtures](internal/testfixtures/) (F1–F17) covering atomic reflection kinds, primitives/objects/unions, inferred generics, and `InjectRunTypeId<T>` marker variants
- The Go pipeline is split into single-purpose packages under [internal/](internal/) (program, resolver, marker, compiled/runtype, compiled/typefns, compiled/purefns, compiled/entrymod, protocol, constants, diag, cache, hashid, testfixtures) — keep each one focused; do not introduce cross-package state
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

- Rewrites are positioned by **UTF-8 byte offsets, not string indices** — tsgo positions count bytes. The Vite plugin's [rewrite.ts](packages/vite-plugin-runtypes/src/rewrite.ts) applies edits through a `MagicString` (so `transform()` returns a real source map and the user's original lines/columns survive the injected import block + bindings) and converts every resolver offset via `makeByteToChar` before indexing. Don't index the JS string with a raw resolver offset; multibyte source characters will misalign the inserted hash.
- **Module grouping is configurable** via the plugin's `moduleMode` option (mirrored as the binary's `--module-mode` flag; values in [internal/constants/constants.go](internal/constants/constants.go)): `default` is described below; `allSingle` bundles EVERYTHING (one module per fn family under `fns/<tag>` with one NAMED export per entry (the same `__rt_` binding name every module mode exports under) plus one `pf` pure-fn bundle, and the reflection facades fold into the runtypes bundle; `Site.Module` / `Replacement.ImportFrom` point the rewrite's clauses at the bundle specifier (the clause shape is the same named import everywhere), and the family bundles join the runtypes bundle as mutable modules invalidated in `handleHotUpdate`); `allModules` splits everything (per-node runtype modules, tuple kind 0 — the pre-bundle layout, kept as an escape hatch; measured slower on dense reflection graphs). The grouping layer is `entrymod.RenderGrouped` + `Resolver.moduleGrouping`; per-entry renderers are identical across modes.
- **Every cache entry is its own virtual module** (default mode) — `virtual:rt/<key>.js` (`<fnHash>_<typeId>` for function entries and JSON composites, `pf/<ns>/<fn>` for pure fns) — EXCEPT runtype nodes, which ride as headless ROWS of THE single data bundle `virtual:rt/runtypes.js` (tuple kind 4: content-hash key, rows array, ONE combined `ini` footer), with a tiny per-reflection-root facade `virtual:rt/<rootId>.js` (kind 5: imports the bundle, carries the root id) so the rewrite's binding-only injection is unchanged. Each node row exists exactly once app-wide, and runtype emission is demand-driven on REFLECTION sites — a createX-only file emits zero runtype modules. Every module exports ONE positional tuple under its BINDING NAME (`__rt_<key>`, identifier-escaped — the same name in the export, every import clause, and the call-site binding; imports never rename): `[kindOrFamilyTag, depsThunk|hole, ini|hole, …legacy positional args]`. Absent slots are JS array HOLES, not a `u`/`undefined` alias (the runtime reads tuples by index, so a hole is indistinguishable from undefined); there is no `const u=undefined;` line. The assembler lives in [internal/compiled/entrymod/entrymod.go](internal/compiled/entrymod/entrymod.go); the runtime consumer in [packages/ts-go-run-types/src/runtypes/entryTuple.ts](packages/ts-go-run-types/src/runtypes/entryTuple.ts) — those two files are the tuple-layout sync boundary. Constants (virtual prefix, binding prefix) come from [internal/constants/constants.go](internal/constants/constants.go) (mirrored to TS via `pnpm run gen:ts-constants`).
- **Imports and `deps()` carry DIRECT dependencies only** — never the flattened transitive closure (flattening was quadratic text on dense graphs: 6x wire payload / 4x render time on the real suites). Both lists are leaves-first, alphabetical within a dependency level (Tarjan SCC collapse for recursive types), never self (consumers already hold the tuple; dep-less entries leave the deps slot a JS array HOLE — `[tag,,ini,…]` — instead of a thunk), and `deps()` is a lazy THUNK inlined straight into the slot (`()=>[d1]`, no named `const deps=`) — so module-level import cycles never hit TDZ. The runtime's `initFromTuple` walks the thunks RECURSIVELY (post-order, processed-keys guard) in two phases: register every unseen tuple in the closure (children before parents), then run runtype `ini` footers — refs always resolve. `ini` bodies patch through the registry (`c(id)`), never through imported bindings.
- The rewrite injects one deduped import block at offset 0 per user file plus the entry-module BINDING at each call site (`createValidate<T>(__rt_<fnHash>_<id>)`) — no id strings ride along; ids derive from the tuple (slot 3). Entry modules are content-addressed (ids embed the binary version), so they are immutable and never need HMR invalidation — except the runtype data bundle, the ONE mutable module (its rows are the union of reflection demand): the plugin invalidates it in `handleHotUpdate` when a scan reports `addedRunTypes`. The Vite plugin serves bodies verbatim from the `entryModules` map on the resolver's `dump` response. Tests can short-circuit by setting `includeEntryModules: true` on `scanFiles` to receive the same map scoped to **just the files in that request** (per-request projection, not session-wide accumulation — callers wanting everything in memory use `dump`). Demanded entries that get dropped (unsupported kinds, dangling deps) still emit a resolvable `KindMissing` stub module; the runtime degrades to the family identity fn, preserving the old silent-degrade semantics.
- **Builtin classes project atomically** — `Date` / `Map` / `Set` / `RegExp` / Temporal / the non-serializable set stop at subKind + classRef (+ Map/Set element `Arguments`); their lib members are never walked or interned (`projectClass` in [internal/compiled/runtype/serialize.go](internal/compiled/runtype/serialize.go)). Every consumer keys on subKind — don't reintroduce member expansion.
- Types are **deduplicated twice** in [internal/compiled/runtype/](internal/compiled/runtype/) — pointer identity (same `*checker.Type` reached via two paths) AND structural id (two distinct `Type` objects with the same shape). Both collapse to a single cache entry.
- **Never store parent-relative data on a canonical node**. Cache entries are shared singletons (one per structural id), so any field whose meaning depends on which parent referenced the node — `parent` back-link, "my slot index in MY parent", "I'm a discriminator for THIS parent union" — is silently wrong the moment that node appears under more than one parent. If a relationship is parent-scoped, store it on the **parent** (e.g. `RunType.UnionDiscriminators` lives on the union, not on the property), or have the consumer build the back-link at walk time from a known root. See `docs/ROADMAP.md` → "JSON shape — known limitations" for the `parent` row and the union discriminator wire shape rationale.

## Two injection markers + demand-driven function caches

There are **two** trailing-slot injection markers (both in [`packages/ts-go-run-types/src/markers.ts`](packages/ts-go-run-types/src/markers.ts)). Design write-up: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) → "The second marker — `InjectTypeFnArgs<T, Fn>` and demand-driven caches".

- `InjectRunTypeId<T>` — **reflection-only** sites (`getRunTypeId`, `reflectRunTypeId`, value-first RT builders, `createMockType`). Injects a bare `"<typeId>"` string and drives the `runTypes` reflection cache (1:1 on shape, no options — unchanged).
- `InjectTypeFnArgs<T, Fn>` — **every `createX<T>()` factory** (`createValidate`, `createGetValidationErrors`, the `huk`/`suk`/`uke`/`uku`/`fmt` group, `createJsonEncoder`/`createJsonDecoder`, `createBinaryEncoder`/`createBinaryDecoder`). Injects a `["<typeId>", "<fnHash>"]` tuple, where `fnHash` is an **opaque precomputed hash** (length 3 — `hash(operationName + sorted comptime-args)`) the scanner computes from `Fn` + the call-site `CompTimeFnArgs` literal (the `ValidateOptions` bag for `it`/`te`, the JSON strategy for the encoder/decoder). Go computes every fnHash; the runtime treats `fnId` as an opaque lookup-key prefix — **no runtime hashing**. The tuple is the complete demand: it tells the backend exactly what to emit AND gives the runtime the exact lookup key — no key re-derivation.
- `CompTimeFnArgs<T>` — the fn-selecting variant of `CompTimeArgs<T>` (both in [`packages/ts-go-run-types/src/markers.ts`](packages/ts-go-run-types/src/markers.ts)). It validates literals identically (CTA0xx) but also marks the parameter whose literal value selects the `createX` function variant; the scanner reads it to compute the injected fnHash. Plain `CompTimeArgs<T>` stays for other literal params (pure-fn keys, builder configs).

Function caches are **DEMAND-DRIVEN**: a family's cache contains only the types its own `createX` call sites request. A hash isn't reversible, so demand is no longer reverse-parsed from `fnId` — the scanner computes structured demand and carries it on `protocol.Site.Demand []SiteDemand{FamilyTag, VariantSuffix, Options, FnHash}`; `collectFamilyDemand` in [`internal/compiled/typefns/module.go`](internal/compiled/typefns/module.go) reads that and closes it transitively. All function families are demand-driven now (no "migrated families" gate — the gate is simply `len(dump.Sites) > 0`). A `getRunTypeId`-only file emits **zero** function-cache entries.

The renderable RT "operations" — the 11 public `createX` ops + 5 internal-only primitives — and the fnHash machinery (`FnHashFor`/`PlainHash`/`Canonical`/`DemandFor`, `FnHashLen = 3`, plus an `init()` collision guard that fails the build if the closed operation/option set ever collides at that length — a collision is an internal bug, never auto-grown) live in the single-source-of-truth package [`internal/operations`](internal/operations/). The cache key is `<fnHash>_<typeId>`. JSON encoder/decoder composition is **Go-emitted**: one COMPOSITE cache entry per (typeId, strategy) keyed by the composite fnHash (see [`internal/compiled/typefns/json_composite.go`](internal/compiled/typefns/json_composite.go)) wraps the underlying primitives with native JSON, so `createJsonEncoder`/`createJsonDecoder` collapse to the same pure `resolveTupleEntry` lookup as binary — no runtime strategy branching. Per-strategy composite tags live in `constants.jsonCompositeTags` (deliberately NOT in `CacheModules`, so the generated TS mirror is untouched). The encoder strategy set is `clone` | `mutate` | `direct` — `clone` (default) is shape-derived and strips undeclared keys by construction (wraps `prepareForJsonSafe`), so there is no separate strip variant; `mutate` transforms in place and preserves extras; `direct` is single-pass. Disk cache format is **v6** (keys embed fnHash; the payload is the tuple `ArgsText` for per-entry modules, with default-valued tails — isNoop `false`, empty dep arrays, the `u` createRTFn placeholder — trimmed off, see `typefns.trimArgsTail`). The plugin's **`emitMode`** option (`code` | `functions` | `both`; mirrored as the binary's `--emit-mode` flag, validated against `constants.EmitMode`) selects what each fn entry ships in its code/factory slots: `code` (default) ships only the body string (runtime rebuilds the factory via `new Function`); `functions` ships only the live `createRTFn` closure (code derived lazily from `createRTFn.toString()` via `entryCode` if ever read); `both` ships both (the body twice — for CSP runtimes that also read `.code`). The disk fingerprint (`internal/cache/disk/fingerprint.go`, tag v4) folds `emitMode` in so the three modes never cross-read.

- `it` (validate) is **special** — a shared cross-family dependency, because the JSON/binary union decoders and `validationErrors` call `val_<member>` at runtime. Those edges ride each entry's module deps (`SoftDeps`: imported, but never cascade-dropped — the emitted bodies guard the lookups with `?.fn(…) ?? true`), and the resolver renders the referenced foreign entries to fixpoint (`resolveCrossFamilyEdges` in [internal/resolver/dispatch.go](internal/resolver/dispatch.go)). So a file that only serializes a union still gets the per-member `val_` entries its decoder needs — they arrive through the union entry's import closure.
- **Adding a new RT function family:** add an entry to the [`internal/operations`](internal/operations/) registry (Name + FamilyTag + Axis + FnKey), add a row to `typefns.Families` ([`internal/compiled/typefns/families.go`](internal/compiled/typefns/families.go)) plus a `familyAddedFlags` row in [`internal/resolver/dispatch.go`](internal/resolver/dispatch.go), add its tag to the runtime `familyMeta` table in [packages/ts-go-run-types/src/runtypes/entryTuple.ts](packages/ts-go-run-types/src/runtypes/entryTuple.ts) (fnID / args / defaultParamValues / noop identity), and give its `createX` an `InjectTypeFnArgs<T, '<fnKey>'>` trailing param (plus a `CompTimeFnArgs` option slot if it has comptime options) reading the injected entry tuple. `FamilySpec.Collect`/`FamilySpec.AnySupported` cover the per-family wrappers. Cross-family references work automatically — record them as walker cross-family deps and they ride the entry's SoftDeps into the resolver fixpoint (the `it` precedent).

## validate contract — serializable data only

`createValidate<T>()` and `createGetValidationErrors<T>()` validate **serializable data**, not the full TypeScript type. Non-serialisable members (functions, methods, symbols, symbol-keyed properties, getters/setters with no backing data) are **silently dropped** from the validated shape with a build-time **Warning** diagnostic (VL010/VL011/VL012/VL013, VE010/…). This is by design — JSON drops them on the wire anyway, so validating against a JSON-shaped projection of `T` is the right semantic for the typical use case (RPC, persistence, network IO).

Consequence: `interface User { name: string; onClick: () => void }` produces a validator that only checks `name`. A user passing `{name: 'x', onClick: 'not-a-fn'}` will see `isUser(value)` return `true` — the schema **does not enforce** `onClick`. The VL010 warning at build time is the only build-time signal of this; do **not** treat it as an error.

This same rule applies to the JSON / binary serialisation families: a property that can't be serialised silently drops at the **property** position (with a per-family Warning code), while at the **root** or other propagating positions (array element, tuple slot, union member, function param/return) it generates an `alwaysThrow` factory with an **Error**-severity diagnostic — calling that factory throws at runtime, so the build halts.

The clean line: **Warning = expected drop, the user should know but it's fine**. **Error = will throw at runtime, build must fail**.

**Decoders return the data-only projection.** `createJsonDecoder<T>()` and `createBinaryDecoder<T>()` return `DataOnly<T>` (the `// #region dataonly-extract` type in [`src/runtypes/dataOnly.ts`](packages/ts-go-run-types/src/runtypes/dataOnly.ts)), NOT bare `T`. A decoded value is reconstructed from JSON/bytes, so it can only ever hold serialisable data — the old `=> T` over-promised methods/`Promise`s/symbols the value doesn't have (calling them type-checked but threw). On a clean DTO `DataOnly<T> ≡ T`, so nothing changes. The projection lives on the **factory overload return** (`JsonDecoderFn<DataOnly<T>>` / `BinaryDecoderFn<DataOnly<T>>`), not on the `JsonDecoderFn`/`BinaryDecoderFn` aliases (those stay `=> T`). **Encoders are unchanged** (they take `T` as input). This is purely a type-level annotation: no runtime or emitter change.

Future direction (out of scope for the current code): we may refine the return type to `ValidateFn<DataOnly<T>>` (where `DataOnly<T>` strips non-serialisable members from the type), rename `createValidate` → `createIsDataType`, or introduce a separate stricter `createIsFullType` that errors instead of dropping. Discuss in [docs/ROADMAP.md](docs/ROADMAP.md) before changing — current callers depend on the silent-drop semantics.

## Documentation

- [README.md](README.md) — project overview, how-it-works, usage, CLI flags
- [CONTRIBUTORS.md](CONTRIBUTORS.md) — full contributor setup, patch management workflow, dev-loop recipes, troubleshooting table
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — detailed design, execution model, the sentinel markers, lossy mappings, and the `@mionjs/run-types` parity record (the port is complete; intentional divergences listed there)
- [docs/ROADMAP.md](docs/ROADMAP.md) — scope + known lossy mappings
