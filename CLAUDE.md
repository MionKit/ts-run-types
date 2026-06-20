# RunTypes Architectural Guidelines

For setup, build, test, and publish workflows, see [SETUP.md](SETUP.md) — the single setup document. The [ts-runtypes-setup skill](.claude/skills/ts-runtypes-setup/) automates host bootstrap end-to-end.

## Dual-language repo: Go binary + JS workspace

- **Go binary** at [cmd/ts-runtypes/](cmd/ts-runtypes/) + [internal/](internal/) reaches into tsgo's checker via the `oxc-project/tsgolint` shim to answer call-site type queries.
- **JS workspace** at [packages/](packages/) — `ts-runtypes` (marker + runtime helpers), `runtypes-devtools` (spawns the binary, rewrites calls, emits the cache module), and `ts-runtypes-bin` (platform launcher: `getExePath()` resolves the prebuilt resolver binary for the host from per-platform `ts-runtypes-binary-<os>-<arch>` optional deps).
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

- pnpm workspaces ([pnpm-workspace.yaml](pnpm-workspace.yaml)) + Lerna ([lerna.json](lerna.json)) for lockstep versioning and topo-ordered scripts.
- All three published packages (`ts-runtypes`, `runtypes-devtools`, `ts-runtypes-bin`) move in lockstep (`forcePublish: true`, `exact: true`); the per-platform `ts-runtypes-binary-*` packages are assembled at publish time and pinned exact-equal to the same version.
- `ts-runtypes` exposes the `InjectRunTypeId<T>` marker and `getRunTypeId` (static `getRunTypeId<T>()` + value-first `getRunTypeId(value)` forms).
- `runtypes-devtools` spawns the Go binary, applies byte-offset rewrites + import injection, serves the per-entry `virtual:rt/*` modules. Its `binary` option is OPTIONAL — when omitted it resolves the host binary via `ts-runtypes-bin`'s `getExePath()`.
- **Binary distribution** mirrors typescript-go's esbuild-style pattern: the Go resolver is cross-compiled per platform (`CGO_ENABLED=0`, [scripts/build-binary-packages.mjs](scripts/build-binary-packages.mjs)) into `ts-runtypes-binary-<os>-<arch>` packages (os/cpu-gated, binary at `lib/`), published by [scripts/publish.sh](scripts/publish.sh) BEFORE the launcher so its optional deps always exist. NEVER add a postinstall downloader — `ignoreScripts: true` blocks it. The binary embeds `constants.Version` (folded into typeID hashes) + `constants.TsgoVersion` (pure metadata: `--version` + the launcher's `tsgo` field, NEVER in the hash).
- Filter a package: `pnpm --filter ts-runtypes run <cmd>` or `pnpm --filter runtypes-devtools run <cmd>`.
- All devDependencies live root-level; never per-package.

## Go side

- Go ≥ 1.26 (enforced by `go.mod`); `go test ./internal/...` for the Go suite.
- Pipeline is split across single-purpose packages under [internal/](internal/) — program, resolver, marker, compiled/runtype, compiled/typefns, compiled/purefns, compiled/entrymod, protocol, constants, diag, cache, hashid, testfixtures — keep each focused, never introduce cross-package state.
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
- ALWAYS rebuild `bin/ts-runtypes` before `pnpm test` — plugin tests spawn it; `pnpm run pretest` runs [`scripts/check-stale-builds.sh`](scripts/check-stale-builds.sh) automatically (covers the Go binary, the marker dist, and the vite plugin dist).
- Never run `pnpm run build` during development (only for publishing) — EXCEPT for `runtypes-devtools`, which MUST be rebuilt after every src edit (consumers read its dist `.d.ts` for typecheck; no `source` condition in its exports).

### ⚠️ Marker test coverage rule

- Any test exercising the marker API (Go under [internal/](internal/) or JS plugin under [packages/runtypes-devtools/test/](packages/runtypes-devtools/test/)) MUST cover both call shapes of `getRunTypeId`: static `getRunTypeId<T>()` (caller supplies T, no value) AND reflection `getRunTypeId(value)` (T inferred from the value).
- Write paired tests (not parameterized); use the natural call shape for each intent — e.g. `getRunTypeId<string>()` vs `const s: string = 'hello'; getRunTypeId(s);`. Both forms should resolve to the same cache entry for equivalent T.
- At least one paired test per suite must assert hash equivalence between the two forms (see `TestAtomic_FormEquivalence` in [internal/resolver/atomic_test.go](internal/resolver/atomic_test.go)).

## Code style

- No `I` prefix on interfaces; no `T` prefix on type parameters.
- `InjectRunTypeId` (capital T mid-word) — same casing as `RunType`.
- Prefer type casting over assertions.
- No `@param` / `@returns` in JSDoc; prefer one-liner comments and one-line `if`s.
- Use meaningful names in Go + TS; avoid one-letter abbreviations like `p`, `c`, `t`; when a struct field has a JSON tag, reuse that name for the local variable. Loop indices (`i`, `k`, `v`) and `err` are fine.

## Development workflow

- After modifying Go sources, rebuild `bin/ts-runtypes` before re-running JS plugin tests; Go-only tests (`go test ./internal/...`) exercise the packages directly and don't need the prebuilt binary.
- `pnpm run clean` (nx reset + per-package clean) before a fresh start.
- Before committing, run `pnpm run lint` and `pnpm run format` (fix errors first).
- Prefer `pnpm` scripts from `package.json` over raw `pnpm exec <cmd>` when a script exists.
- Pre-commit hook ([.husky/pre-commit](.husky/pre-commit)) runs `lint-staged` automatically — activated by `pnpm install` via the root `prepare` script.
- Containerized website + benchmarks share ONE podman image (website at `/app`, benchmarks at `/bench`). Image lifecycle (build/push/pull/ensure/lock/clean) is owned by [scripts/podman-website.sh](scripts/podman-website.sh) (shared helpers in [scripts/lib-container.sh](scripts/lib-container.sh)); [scripts/website.sh](scripts/website.sh) runs the site and [scripts/benchmarks.sh](scripts/benchmarks.sh) runs the bench half under `/bench`, both delegating image ops to podman-website.sh. See [SETUP.md → Containerized apps](SETUP.md#containerized-apps-docs-website--benchmarks).

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

## Marker package self-import resolution

- The marker package's own tests import its public name `ts-runtypes`; both vitest and tsgo must resolve that to in-tree `src/index.ts`, NOT the (un)built `dist/`.
- [`packages/ts-runtypes/package.json`](packages/ts-runtypes/package.json) — `exports[".source"]` points at `./src/index.ts`. Opt-in lane; consumers without the `source` condition fall through to the normal `types`/`import`/`require` entries.
- [`packages/ts-runtypes/vitest.config.ts`](packages/ts-runtypes/vitest.config.ts) — `resolve.conditions: ['source']` (mirrored on `ssr.resolve.conditions`) for vite's runtime resolver.
- [`packages/ts-runtypes/tsconfig.test.json`](packages/ts-runtypes/tsconfig.test.json) — `customConditions: ["source"]` for tsgo's type-resolution pass.
- Drop either flag and the self-import resolves to `dist/` instead, breaking dev tests when dist is missing or stale.
- The marker scanner in [`internal/marker/marker.go`](internal/marker/marker.go) gates `InjectRunTypeId<T>` recognition by walking up from the declaration's source file to the nearest `package.json` and matching its `"name"` field — `node_modules`-resolved and source-resolved imports both work. **Don't reintroduce the old path-fragment heuristic.**
- The Go test suite ([`internal/testfixtures/runtypes.d.ts`](internal/testfixtures/runtypes.d.ts)) uses the older ambient `declare module` form because the fixtures live under `internal/` without their own package.json; that path is also honored by the marker scanner — keep the overlay in sync with the marker package's public API.

## Rewrite mechanics

Full description: [docs/ARCHITECTURE.md → Rewrite mechanics](docs/ARCHITECTURE.md#rewrite-mechanics). Highlights to follow when touching rewrite or entry-module code:

- Rewrites use UTF-8 BYTE offsets (tsgo positions count bytes); the Go transform package ([transform.go](internal/compiled/transform/transform.go)) converts every offset via `makeByteToChar` before indexing — never index the source string with a raw resolver offset.
- Edits go through the in-house `EditBuffer` ([editbuffer.go](internal/compiled/transform/editbuffer.go)) for a real source map (original lines/columns survive the injected import block + bindings); it replaced the `magic-string` dependency, so the plugin carries no bundling deps — its ONLY runtime dep is `ts-runtypes-bin` (the platform binary launcher, itself dependency-free). Its map matches magic-string's `hires: 'boundary'` output — the ported source-map algorithm is credited to magic-string (MIT) in the file header.
- Plugin options `moduleMode` (default | allSingle | allModules) and `inlineMode` (default | allInternal) configure entry grouping + child inlining; the two never share disk caches (fingerprint folds inlineMode in).
- **Every cache entry is its own virtual module** EXCEPT runtype nodes, which ride as headless rows of the single data bundle `virtual:rt/runtypes.js` (kind 4) — one row per node app-wide. Per-reflection-root facade `virtual:rt/<rootId>.js` (kind 5) imports the bundle.
- Every module exports ONE positional tuple under `__rt_<key>`: `[tag, depsThunk|hole, ini|hole, …]`. Absent slots are JS array HOLES, NOT `undefined` aliases.
- Tuple-layout sync boundary: [internal/compiled/entrymod/entrymod.go](internal/compiled/entrymod/entrymod.go) (assembler) and [packages/ts-runtypes/src/runtypes/entryTuple.ts](packages/ts-runtypes/src/runtypes/entryTuple.ts) (runtime). Constants from [internal/constants/constants.go](internal/constants/constants.go), mirrored via `pnpm run gen:ts-constants`.
- **Imports and `deps()` carry DIRECT dependencies only** — never the transitive closure (flattening was 6x wire / 4x render on real suites). Leaves-first, alphabetical within a level (Tarjan SCC for cycles), never self; `deps()` is a lazy thunk inlined into the slot so module cycles never hit TDZ.
- Rewrite injects one deduped import block at offset 0 + the entry-module BINDING at each call site (`createValidate<T>(__rt_<fnHash>_<id>)`); ids derive from tuple slot 3 — no id strings on the wire.
- Entry modules are content-addressed (ids embed binary version), immutable, never HMR-invalidated — EXCEPT the runtype data bundle, invalidated in `handleHotUpdate` when a scan reports `addedRunTypes`.
- **Builtin classes project atomically** — Date / Map / Set / RegExp / Temporal stop at subKind + classRef (+ Map/Set element). Lib members are never walked or interned (`projectClass` in [internal/compiled/runtype/serialize.go](internal/compiled/runtype/serialize.go)); every consumer keys on subKind.
- Types are **deduplicated twice** in [internal/compiled/runtype/](internal/compiled/runtype/) — pointer identity AND structural id — both collapse to a single cache entry.
- **Never store parent-relative data on a canonical node.** Cache entries are shared singletons (one per structural id); parent-scoped data lives on the parent (e.g. `RunType.UnionDiscriminators` on the union, not the property), or the consumer builds back-links at walk time.

## Two injection markers + demand-driven function caches

Full design: [docs/ARCHITECTURE.md → The second marker — `InjectTypeFnArgs<T, Fn>` and demand-driven caches](docs/ARCHITECTURE.md#the-second-marker--injecttypefnargst-fn-and-demand-driven-caches). Both markers live in [packages/ts-runtypes/src/markers.ts](packages/ts-runtypes/src/markers.ts).

- `InjectRunTypeId<T>` — reflection-only (`getRunTypeId` static + value-first forms, value-first RT builders, `createMockType`). Injects `"<typeId>"`; drives the `runTypes` reflection cache (1:1 on shape, no options).
- `InjectTypeFnArgs<T, Fn>` — every `createX<T>()` factory (`createValidate`, `createGetValidationErrors`, the `huk`/`suk`/`uke`/`uku`/`fmt` group, `createJsonEncoder/Decoder`, `createBinaryEncoder/Decoder`). Injects `["<typeId>", "<fnHash>"]`; `fnHash` is a length-3 opaque hash Go computes from `Fn` + the call-site `CompTimeFnArgs` literal. Runtime treats `fnId` as an opaque lookup key — **no runtime hashing**. Cache key: `<fnHash>_<typeId>`.
- `CompTimeFnArgs<T>` is the fn-selecting variant of `CompTimeArgs<T>` — validates literals identically (CTA0xx) and marks the param whose literal value selects the `createX` variant. Plain `CompTimeArgs<T>` stays for other literal params.
- Function caches are **demand-driven**: a family's cache contains only the types its own call sites request. Scanner computes structured demand on `protocol.Site.Demand []SiteDemand{FamilyTag, VariantSuffix, Options, FnHash}`; `collectFamilyDemand` in [internal/compiled/typefns/module.go](internal/compiled/typefns/module.go) closes it transitively. Gate is `len(dump.Sites) > 0`. A `getRunTypeId`-only file emits ZERO function-cache entries.
- Operations registry: the 11 public `createX` ops + 5 internal primitives + `FnHashFor`/`PlainHash`/`Canonical`/`DemandFor` live in [internal/operations](internal/operations/). `FnHashLen = 3`; an `init()` collision guard fails the build on collision in the closed option set (never auto-grown).
- JSON encoder/decoder composition is Go-emitted: one COMPOSITE cache entry per (typeId, strategy) keyed by composite fnHash ([internal/compiled/typefns/json_composite.go](internal/compiled/typefns/json_composite.go)) wraps the primitives with native JSON — `createJsonEncoder/Decoder` collapse to the same pure `resolveTupleEntry` lookup as binary. Per-strategy tags live in `constants.jsonCompositeTags` (deliberately NOT in `CacheModules`, so the generated TS mirror is untouched).
- Encoder strategy set: `clone` (default, shape-derived, strips undeclared keys via `prepareForJsonSafe`); `mutate` (in-place, preserves extras); `direct` (single-pass).
- Disk cache format **v9**: keys embed fnHash; payload is the tuple `ArgsText` (default-valued tails trimmed via `typefns.trimArgsTail`) + persisted `IsNoop` bit.
- Plugin **`emitMode`** option (`code` | `functions` | `both`; binary `--emit-mode`) selects what each fn entry ships: `code` (default) body string (runtime rebuilds via `new Function`); `functions` live `createRTFn` closure; `both` ships both (CSP runtimes reading `.code`). Disk fingerprint ([internal/cache/disk/fingerprint.go](internal/cache/disk/fingerprint.go), tag v4) folds `emitMode` in so modes never cross-read.
- `it` (validate) is special — a shared cross-family dep because JSON/binary union decoders + `validationErrors` call `val_<member>` at runtime. Edges ride each entry's `SoftDeps` (imported, never cascade-dropped — bodies guard with `?.fn(…) ?? true`); resolver renders foreign entries to fixpoint (`resolveCrossFamilyEdges` in [internal/resolver/dispatch.go](internal/resolver/dispatch.go)). A union-only file still gets per-member `val_` entries via the union's import closure.
- **Noop elision is semantic, not shape-based** ([internal/compiled/typefns/noop_types.go](internal/compiled/typefns/noop_types.go)). Per-family predicates over the TYPE GRAPH (cycle-safe greatest fixpoint, memoized in `FactsTable`; pj/rj/pjs implement `NoopTypePredicate` today). SOUNDNESS CONTRACT (one-directional): predicate true ⇒ body is identity — false negative costs bytes, false positive silently skips a transform. Corpus test ([internal/resolver/noop_predicate_test.go](internal/resolver/noop_predicate_test.go)) pins the unsound direction; when adding a kind or changing an emit arm, keep the predicate in sync.
- **Adding a new RT function family:** add to [internal/operations](internal/operations/) registry (Name + FamilyTag + Axis + FnKey), `typefns.Families` ([internal/compiled/typefns/families.go](internal/compiled/typefns/families.go)), `familyAddedFlags` in [internal/resolver/dispatch.go](internal/resolver/dispatch.go), and the runtime `familyMeta` table in [packages/ts-runtypes/src/runtypes/entryTuple.ts](packages/ts-runtypes/src/runtypes/entryTuple.ts). Give its `createX` an `InjectTypeFnArgs<T, '<fnKey>'>` trailing param (+ `CompTimeFnArgs` slot for comptime options). Cross-family refs ride `SoftDeps` automatically.

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

### Website docs style (`container-website/content/`)

User-facing docs under [container-website/content/](container-website/content/) (Nuxt + Docus Markdown + MDC) follow a deliberate, reader-first voice. Keep it when editing:

- **Plain, user-focused language.** Say what a feature does for the reader and why it helps, not how it is built; cut deep internals (hashing, byte offsets, "side-channel", "fixpoint", demand-driven cache mechanics).
- **No dashes chaining clauses or sentences.** No em-dash, en-dash, `--`, or a spaced single `-` as punctuation; use a comma, a period, or parentheses. Hyphenated words (`build-time`) and dashes inside code / flags / URLs are fine.
- **Prefer fenced code blocks over heavy inline `code`.** Keep essential public API / type names, but do not clutter prose with backticks.
- **Short frontmatter `description`:** one simple sentence, aim under ~100 chars; leave already-short ones alone.
- **Never modify** MDC components (`::` / `:::`, `<code-import>`, `::code-group`, `::note`, `::suite-table`, `::bench-table`, twoslash blocks), fenced code blocks, the `<!-- code-import-timestamp -->` comments, or `index.md` (the home page).
- **Broad pass:** fan out one agent per `N.section/` dir, then verify em/en dashes are gone and per-file MDC-component / code-fence counts match the pre-edit baseline.
