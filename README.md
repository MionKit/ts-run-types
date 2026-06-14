# RunTypes

Compile-time runtime-type resolver on **TypeScript 7 / typescript-go (tsgo)**.

RunTypes is a native Go binary that reaches into tsgo's type checker (via the `oxc-project/tsgolint` shim layer) and answers _call-site_ type queries. A paired Vite plugin rewrites every call whose trailing parameter is the sentinel marker `InjectRunTypeId<T>` (from `ts-runtypes`) and emits a deduplicated type-metadata module the runtime (and the RT) can consume.

## Why

TypeScript 7 ships the compiler as a compiled Go binary. The legacy custom-transformer API has not been ported (see [microsoft/typescript-go#516](https://github.com/microsoft/typescript-go/issues/516)), and the compiler can no longer be monkey-patched from Node. Runtime type-reflection libraries that relied on patching `tsc` therefore need a new, native side-channel into the checker.

RunTypes provides that channel — driven by a single primitive (the `InjectRunTypeId<T>` sentinel) rather than a hard-coded list of function names, so users can wrap the canonical helpers freely.

## Status

Experimental. Tracks `oxc-project/tsgolint`, which itself tracks `microsoft/typescript-go` via renovate. Production hardening pending TypeScript 7 GA.

## How it works

```
  app.ts ──▶ runtypes-devtools ──[scanFiles]──▶  ts-runtypes (Go)
                       │                                 │
                       │                                 │ tsgo Checker
                       │                                 │
                       │       ◀── Site[] ───────────────┤  walk CallExpr,
                       │   rewrite hash → arg slot       │  detect InjectRunTypeId<T>
                       │                                 │
                       │                                 │ structural-id → hashid
                       │                                 │  (reflection-shape Type)
                       ▼     ◀── modules ──[generate]──────┘
           <outDir>/types/<key>.js (real files)  ──▶  runtime / RT registry
```

1. User code imports `InjectRunTypeId<T>` / `getRunTypeId<T>()` (static) or `getRunTypeId(val)` (reflection) from `ts-runtypes`. Any user-defined wrapper function may also declare `id?: InjectRunTypeId<T>` as its trailing parameter to opt into the same flow.
2. The Vite plugin sends each source file to the Go binary's `scanFiles` op. The binary walks every `CallExpression`, asks tsgo for the resolved signature, and returns one site per call whose trailing parameter is a `InjectRunTypeId<T>` (declared in `ts-runtypes`) with `T` concretely bound. `scanFiles` accepts an array of files in a single request; opt-in flags (`includeRunTypes`, `includeCacheSource`) project the response down to just those files.
3. The plugin patches each call to pass the resolved hash id at the trailing slot, padding with `undefined` if the call had fewer existing args.
4. Every cache entry is its own real module, written to disk at build start: `<outDir>/types/<key>.js` (the cache key — bare type hash for runtypes, `<fnHash>_<typeId>` for function entries, `pf/<ns>/<fn>` for pure fns). `<outDir>` defaults to `<srcDir>/runtypes` (inferred from tsconfig; the generated `types/` is gitignored). The transform injects the matching **relative** imports into each user file, so bundlers code-split and tree-shake entries natively — and resolve them with no per-bundler virtual-module plumbing, which is what makes the one plugin work the same on Vite/Rollup/webpack/Rspack/esbuild. Each module exports one positional tuple (`export const e = […]`); the runtime registers a tuple's dependency closure on first use and serves lookups from the `rtUtils` registry (module/naming constants come from [internal/constants/constants.go](internal/constants/constants.go)).

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the detailed design — execution model, the sentinel markers, the reflection shape, and the factory reference (the intentional divergences are listed there and in [docs/ROADMAP.md](docs/ROADMAP.md)).

### Data flow

- **Types are deduplicated twice.** [internal/compiled/runtype/](internal/compiled/runtype/) holds a cache keyed by both _pointer identity_ (the same `*checker.Type` visited via two paths) **and** _structural id_ (two distinct `Type` objects with the same shape). Both collapse to a single cache entry, so the emitted metadata is stable across runs.
- **Structural ids are deterministic.** [internal/compiled/runtype/typeid/](internal/compiled/runtype/typeid/) mirrors the reference `_createTypeId` to compose `${kind}{child1,child2,…}` recursively, with a back-reference token for cycles. The structural id is then run through the quickHash rolling hash (prime-37, letter-first alphanumeric alphabet) in [internal/hashid](internal/hashid/), yielding a 7-character hash.
- **Rewrites are positioned by byte offsets, not string indices.** tsgo positions are UTF-8 byte offsets. The Vite plugin's [rewrite.ts](packages/runtypes-devtools/src/rewrite.ts) therefore converts every resolver offset to a UTF-16 index before editing (otherwise multibyte source characters would misalign the inserted hash) and applies the edits through an in-house `EditBuffer` ([edit-buffer.ts](packages/runtypes-devtools/src/edit-buffer.ts)), so the transform returns a real source map — breakpoints and stack traces land on the user's original lines. The plugin ships **no runtime dependencies**: `EditBuffer` is a small from-scratch string-editor + source-map generator covering just the slice of `magic-string` the rewrite needs.
- **Entry modules defer all wiring to runtime registration.** [internal/compiled/entrymod](internal/compiled/entrymod/) assembles one ES module per function entry: imports of the entry's DIRECT dependencies (leaves-first, alphabetical within a dependency level; recursive types collapse via SCC so cycles import each other safely — the transitive closure loads through the dep modules' own imports) and a lazy `deps()` thunk the runtime walks recursively. Runtype nodes are denser: they ride as rows of the single data bundle `<outDir>/types/runtypes.js` (one combined `ini(rtu)` patches reference slots through the registry), aliased by a tiny facade module per reflection root so each node exists exactly once app-wide. Tuples never reference imported bindings eagerly, so circular type graphs evaluate without TDZ hazards. Module naming/export constants come from [internal/constants/constants.go](internal/constants/constants.go) — the JS side reads the same values from a generated mirror (`pnpm run gen:ts-constants`), so the two halves can't drift. The Go side renders every module and the `generate` op writes it to disk (write-only-on-change, stale-file GC, inter-module imports relativized) — there's no JS-side renderer to keep in sync.
- **The marker is detected by name _and_ declaring module.** [internal/marker](internal/marker/) checks both `InjectRunTypeId` and that the alias is declared in `ts-runtypes`, so a user's own `type InjectRunTypeId<T> = ...` declared elsewhere does not trigger rewrites.

## Components

### Go side

| Path                                                       | Purpose                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [cmd/ts-runtypes/main.go](cmd/ts-runtypes/main.go) | CLI entry; stdio one-shot and Unix-socket daemon modes.                                                      |
| [internal/program](internal/program/)                      | Loads tsconfig + VFS, bootstraps tsgo `Program` + `Checker`.                                                 |
| [internal/resolver](internal/resolver/)                              | `scanFiles` / `dump` op dispatch; AST call-walk (`walk.go` + `scan.go`); asks checker for resolved signatures. |
| [internal/marker](internal/marker/)                                  | `InjectRunTypeId<T>` sentinel detection (name + module check); filters free type parameters.                    |
| [internal/compiled/runtype/](internal/compiled/runtype/)             | `*checker.Type` → reflection-shape `Type`; pointer + structural dedup; JSON/TS-module renderers.                |
| [internal/compiled/runtype/typeid/](internal/compiled/runtype/typeid/) | Structural-id computer mirroring the reference `_createTypeId`; deterministic, cycle-aware.                         |
| [internal/compiled/typefns/](internal/compiled/typefns/)             | Per-fn AOT emitters (validate, validationErrors, JSON, binary, formats, …).                                             |
| [internal/hashid](internal/hashid/)                                  | quickHash rolling hash → short alphanumeric id dictionary; configurable length.                                |
| [internal/constants](internal/constants/)                            | Cross-package constants (cache module settings). Mirrored to TS via `cmd/gen-ts-constants`.                    |
| [internal/protocol](internal/protocol/)                              | Wire types: `Request`, `Response`, `Type`, `Site`, `Dump`.                                                     |
| [internal/testfixtures](internal/testfixtures/)                      | F1–F17 `.ts` inputs: atomic reflection kinds, primitives/objects/unions, inferred generics, marker variants.   |

### JS side

| Path                                                                                                         | Purpose                                                                                           |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| [packages/ts-runtypes](packages/ts-runtypes/)                                                       | `ts-runtypes` — `InjectRunTypeId<T>` marker type, `getRunTypeId` (static + value-first forms). |
| [packages/runtypes-devtools](packages/runtypes-devtools/)                                              | Cross-bundler plugin (unplugin: Vite/Rollup/webpack/Rspack/esbuild): spawns the Go binary, writes cache modules to real files under `<outDir>/types/`, injects relative imports per file. |
| [packages/runtypes-devtools/src/resolver-client.ts](packages/runtypes-devtools/src/resolver-client.ts) | Spawns the Go binary; line-delimited JSON over stdio.                                             |
| [packages/runtypes-devtools/src/rewrite.ts](packages/runtypes-devtools/src/rewrite.ts)                 | Applies returned `Site[]` as byte-offset insertions into source.                                  |

## Use

```ts
import {getRunTypeId, type InjectRunTypeId} from 'ts-runtypes';

// 1. Static form — explicit type argument, no value.
const stringId = getRunTypeId<string>();
const userId = getRunTypeId<{id: number; name: string}>();

// 2. Reflection form — T inferred from a runtime value.
const sayHelloId = getRunTypeId(sayHelloFn);

// 3. User-defined wrapper — declare the same trailing InjectRunTypeId<T> param,
//    the transformer treats it identically.
function validate<T>(val: unknown, id?: InjectRunTypeId<T>): boolean {
  // ... validate via cache[RUNTYPES_VAR_PREFIX + id!] ...
  return true;
}
validate<User>(payload);
```

The transformer rewrites each call to:

```ts
getRunTypeId<string>(undefined, 'Lk7Px9');
getRunTypeId<{id: number; name: string}>(undefined, 'abc123');
getRunTypeId(sayHelloFn, 'qzPnXt');
validate<User>(payload, 'mNr4Vw');
```

A free type parameter (a call inside a generic body where the marker's `T` is the wrapper's own type variable) is _skipped_ — the wrapper must propagate by declaring `id?: InjectRunTypeId<T>` itself and the injection happens at the wrapper's own call sites.

## CLI

### One-shot (stdio JSON)

```bash
bin/ts-runtypes --one-shot --tsconfig tsconfig.json < requests.jsonl > cache.json
```

`requests.jsonl` is newline-delimited queries:

```json
{"op":"scanFiles","files":["src/app.ts"]}
{"op":"dump"}
```

### Daemon (Vite / HMR)

```bash
bin/ts-runtypes --daemon --tsconfig tsconfig.json --socket /tmp/ts-runtypes.sock
```

### Marker family

Three marker brands are exported from `ts-runtypes`:

- `InjectRunTypeId<T>` — trailing-slot brand; the build injects a stable type-id at the call site.
- `CompTimeArgs<T>` — the argument at this slot must be a literal (or a `const`-of-literal chain).
- `PureFunction<F>` — the argument must be an inline arrow / function expression that passes the purity rules.

Each marker is recognised by both its symbol name AND its declaring module, so a user's own `type InjectRunTypeId<T> = ...` declared elsewhere does not accidentally trigger the toolchain. The marker set is fixed (no `--marker-name` / `--marker-module` CLI knobs — those were retired in the marker migration); custom shapes can still be built by constructing `marker.Options{Specs: [...]}` directly from Go when embedding the resolver.

## Build & Test

The repository contains a Go binary and a pnpm/Lerna workspace of JS packages. See [SETUP.md](SETUP.md) for full contributor setup, patch management, and publishing.

```bash
git submodule update --init --recursive
(cd third_party/tsgolint/typescript-go && git am --3way --no-gpg-sign ../patches/*.patch)
go build -o bin/ts-runtypes ./cmd/ts-runtypes
pnpm install --frozen-lockfile
go test ./internal/...
pnpm test
```

The JS plugin tests spawn `bin/ts-runtypes`, so the Go binary must be built before `pnpm test`.

## Repository layout

```
cmd/ts-runtypes/                CLI entry point
internal/                        Go pipeline (program, resolver, marker,
                                  compiled/runtype, compiled/typefns, compiled/purefns,
                                  protocol, constants, diag, cache, entrymod, hashid, testfixtures)
packages/ts-runtypes/        ts-runtypes — marker type + helpers
packages/runtypes-devtools/   Vite plugin, drives the binary
third_party/tsgolint/            git submodule — tsgo shim layer + patches
docs/ARCHITECTURE.md             detailed design + factory reference
docs/ROADMAP.md                  scope + known lossy mappings
scripts/                         publish / unpublish / pre-publish-test / pack
pnpm-workspace.yaml              workspace + supply-chain hardening
lerna.json                       lockstep version + publish config
nx.json                          build-cache config
eslint.config.js                 flat ESLint config (TypeScript-aware)
.prettierrc                      formatter config
```

`packages/*` is a pnpm workspace managed by Lerna.

## License

Proprietary — all rights reserved. No use, copying, or distribution without prior written authorization. See [LICENSE](./LICENSE).
