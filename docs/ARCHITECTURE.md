# Architecture

`ts-go-run-types` is a compile-time **type resolver** for [mion runtypes](https://github.com/mionkit) targeting **TypeScript 7 / tsgo**. It provides a native side-channel into tsgo's type checker for tools (Vite plugin, codegen, test harness) that need to know a TypeScript type at a specific call site without relying on the legacy custom-transformer API (which the Go port does not expose; see [microsoft/typescript-go#516](https://github.com/microsoft/typescript-go/issues/516)).

## Big picture

```
  .ts source                   Go resolver                  JSON type table
  ┌─────────┐    scanFiles    ┌──────────────┐   TypeNode   ┌───────────────┐
  │  app.ts │ ─────────────▶ │  ts-go-run-types │ ───────────▶ │  site → id    │
  └─────────┘                │  (typescript- │              │  id   → node  │
       ▲                     │   go checker) │              └───────────────┘
       │ rewrites calls      └──────┬───────┘                       │
       │                            │                               │
  ┌─────────┐                       │ spawns (stdio JSON)           │ virtual
  │  Vite   │ ◀─────────────────────┘                               │ module
  │  plugin │ ────────────────────────────────────────────────────▶ │ import
  └─────────┘                                                       ▼
                                                             runtime / JIT
```

### Three lifecycles

1. **Build lifecycle** (Vite, Rollup, CI codegen): Go resolver is spawned once, receives one `scanFiles` query per source file, dumps the full table at end-of-build, is torn down.
2. **Query lifecycle**: every source file with calls to `RuntypeId<T>`-marked functions is sent to `scanFiles`. The resolver walks every CallExpression, asks tsgo for the resolved signature, and returns one site per call whose trailing parameter type is the sentinel marker.
3. **Runtime lifecycle**: the rewritten source passes the site id as the trailing argument; the library's runtime helper does a `Map.get(id)`. No reflection work happens at runtime.

## Execution model — what we replace and what we don't

We **do not replace `tsc`**, and we do not implement a compiler. The Vite plugin is a normal `transform()` plugin running inside Vite/Rollup's pipeline, and the Go binary is a separate process used solely for _type resolution at call sites_ — it emits no JavaScript.

Concretely, at build time:

| Stage                                  | Tool                                                                        | Responsibility                                                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Type checking the project              | Whatever the user's tsconfig points at — `tsc`, `vue-tsc`, the editor, etc. | Unchanged. We don't type-check on the user's behalf.                                                                                                                    |
| TS → JS emit                           | Vite's default (esbuild)                                                    | Unchanged. We never write `.js`.                                                                                                                                        |
| Type-id injection at marked call sites | **vite-plugin-runtypes** + **ts-go-run-types** Go binary                    | The plugin's `transform()` hook spawns the binary, asks "what `T` is bound at each `RuntypeId<T>` call?", and rewrites those calls in-place via byte-offset insertions. |
| Cache module emission                  | **vite-plugin-runtypes** (`virtual:runtypes-cache`)                         | One synthetic ES module containing the full reflection-shape `RunType` graph, keyed by hash.                                                                            |
| Runtime metadata access                | `import * as cache from 'virtual:runtypes-cache'` + `cache[RUNTYPES_VAR_PREFIX + id]` | Direct property access on the cache module's namespace — no Map, no resolver indirection. Future transformer pass can rewrite to named imports for tree-shaking.       |

### Why a separate Go binary

`tsc` (the JavaScript build) shipped a [custom-transformer API](https://github.com/itsdouges/typescript-transformer-handbook) that runtime-type libraries (`ts-runtime`, `typia`, `deepkit`, and others) hooked into. That API let a Node-side program walk the AST and rewrite source _with access to the checker_ before `tsc` emitted JS.

`tsgo` — the Go port that will become TypeScript 7 — **does not currently expose any plugin or transformer API to user code**. The compiler is now a single statically-linked Go binary that runs as a CLI; you cannot load a Node plugin into it, and the checker's symbol-resolution machinery lives behind Go's `internal/` visibility wall (which Go enforces at the compiler level — see the "Shims" section below).

Tracking issue: [microsoft/typescript-go#516 — Plugin support](https://github.com/microsoft/typescript-go/issues/516). As of this writing, no roadmap.

That leaves two choices for type-aware tooling against TypeScript 7:

1. **Wait** for an official API. Unbounded timeline.
2. **Reach into tsgo's checker at the Go level** via a side-channel. That's what this project does, using the [oxc-project/tsgolint](https://github.com/oxc-project/tsgolint) shim layer (also used by oxc's TypeScript linter for the same reason). When #516 lands, we swap the shim for the official API and leave the Vite plugin, marker, cache, and runtime untouched.

### Where each process runs

```
┌───────────────────────────────────────────────────────────────────────┐
│  Vite dev server  /  rollup build  (Node.js)                          │
│                                                                       │
│  ┌────────────────┐   transform(file)    ┌────────────────────────┐   │
│  │  Vite core     │ ───────────────────▶ │  vite-plugin-runtypes  │   │
│  │  (esbuild)     │                      │  (Node)                │   │
│  │                │   ◀── rewritten src  └─────────┬──────────────┘   │
│  └────────────────┘                                │ stdio JSON       │
│                                                    ▼                  │
└───────────────────────────────────────────────┬───────────────────────┘
                                                │
                            spawn() one child   │
                                                ▼
                                  ┌──────────────────────────┐
                                  │  bin/ts-go-run-types  (Go)  │
                                  │  ─────────────────────   │
                                  │  tsgo Program + Checker  │
                                  │  via shim/* imports      │
                                  └──────────────────────────┘
```

The Go binary is a long-lived child process during a build session: spawned once, fed one `scanFiles` request per `.ts` file, dumped at the end of the build, then torn down. The plugin can also run it as a Unix-socket daemon for HMR scenarios where the build session outlives a single Vite invocation.

The user's tsconfig drives both worlds: the binary parses it to bootstrap the same `Program` view tsgo would use, so what we resolve as type `T` is exactly what tsgo resolves.

## The sentinel marker

Detection is anchored on a single TypeScript type alias exported from the `@mionjs/ts-go-run-types` package:

```ts
export type RuntypeId<T> = string & {readonly __mionRuntypeBrand?: T};
```

A function opts into compile-time id injection by declaring `id?: RuntypeId<T>` as its **trailing parameter**. The transformer rewrites every call site of such a function, injecting the resolved hash id at that slot. This includes:

- The static helper `getRuntypeId<T>(id?)` shipped from `@mionjs/ts-go-run-types` — explicit type, no value.
- The reflection helper `reflectRuntypeId<T>(value, id?)` — `T` inferred from a runtime value.
- Any user-defined wrapper that propagates the marker — `function isType<T>(v, id?: RuntypeId<T>)`.

Detection requires both:

1. The trailing parameter type alias must be named `RuntypeId` (configurable via `--marker-name`).
2. The alias must be declared in `@mionjs/ts-go-run-types` (configurable via `--marker-module`). Either inside `declare module "@mionjs/ts-go-run-types" { ... }` or in a file path containing `/@mionjs/ts-go-run-types/`. This rules out accidental collisions with same-named user types declared elsewhere.

A call inside a generic body where the marker's `T` is the wrapper's own free type parameter is **skipped** — there's no concrete `T` to assign an id to yet. The wrapper must propagate the marker via its own signature, and the injection happens at the wrapper's call sites instead.

## Package layout

```
cmd/ts-go-run-types/                CLI entry point
internal/program/                tsconfig + VFS bootstrap
internal/walker/                 position → AST node finder + call iterator
internal/marker/                 RuntypeId<T> sentinel detection
internal/resolver/               scanFiles + dump dispatch
internal/serialize/              *checker.Type → protocol.RunType (dedup by id)
internal/protocol/               stdio JSON request/response types
internal/testfixtures/           fixture .ts + shared tsconfig
packages/runtypes/               @mionjs/ts-go-run-types — marker type + getRuntypeId/reflectRuntypeId
packages/vite-plugin-runtypes/   JS side — drives scanFiles, patches calls
third_party/tsgolint/            git submodule — shim layer into typescript-go
docs/                            this file
```

### internal/program

Wraps the [`oxc-project/tsgolint`](https://github.com/oxc-project/tsgolint) shim packages into a simple `program.New(Options)` that:

- layers an optional overlay VFS on top of `osvfs` + `cachedvfs` + `bundled`
- parses the supplied tsconfig via `tsoptions.GetParsedCommandLineOfConfigFile`
- builds a `compiler.Program` and calls `BindSourceFiles()`

`NewInferred` is a second constructor that skips tsconfig for one-shot queries on loose files.

### internal/walker

- `NodeAt(sf, pos)` — deepest `*ast.Node` whose `[Pos, End)` contains `pos`.
- `CallExpressionAt(sf, pos)` — walks up from `NodeAt` until it finds a `KindCallExpression`.
- `ForEachCallExpression(sf, cb)` — depth-first visitor over every CallExpression in a source file. Used by the resolver's `scanFiles` op.

### internal/marker

`Detect(t *checker.Type, opts Options) (typeArg, ok)` — given the type of a function's trailing parameter, returns whether it matches the configured marker (name + declaring-module check) and extracts the single type argument `T`. `IsFreeTypeParameter(t)` filters out calls inside generic bodies.

### internal/serialize

`Cache` interns `*checker.Type` → stable hash id (e.g. `abc123`). `Cache.AssignID(t)` is the public entry point used by the marker scanner; `Cache.Serialize(t)` returns a `KindRef` sentinel pointing at the cached entry. Recursion is broken by reserving the id before descending. Structural dedup means two distinct AST types that share the same shape end up with the same id.

### internal/resolver

Dispatches two operations:

| op         | semantics                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scanFiles` | Walks every CallExpression in file. For each whose resolved signature has a trailing `RuntypeId<T>` param with bound T, returns a `Site{Pos, ID, ParamIndex, ArgsCount}`. |
| `dump`     | Returns the full cache (every RunType) + the running Sites slice.                                                                                                         |

`Pos` is the byte offset of the closing `)` of the call — the TS-side patcher inserts at that offset. `ParamIndex` is the 0-based slot the injected id goes into; `ArgsCount` is the number of arguments the user already wrote (so the patcher knows whether to pad with `undefined`).

### internal/protocol

Pure struct definitions shared between the Go resolver and the TS plugin. Stdio protocol is newline-delimited JSON; one `Request` in, one `Response` out, EOF terminates. The daemon mode wraps a Unix-socket accept loop around the same handler, one client at a time.

### internal/emit

Two output formats share the same in-memory `protocol.Dump`:

- **`json.go`** — pretty-printed JSON. Child RunType slots stay as `{kind: -1, id: "<hash>"}` ref sentinels. Suitable for inspection, debugging, cross-language consumers, CI snapshot tests.
- **`runtypes_module.go`** — the **runtime artifact**. Emits a self-contained ESM module: every type is declared as a top-level `export const t_<hash>` carrying scalar fields, then a footer block fills in reference-bearing slots (`child`, `return`, `parameters`, `children`, `parent`) by direct assignment. The variable prefix and module name come from `internal/constants/constants.go` (mirrored to TS via `cmd/gen-ts-constants`). Consumers `import * as cache from "virtual:runtypes-cache"` and access entries via `cache[RUNTYPES_VAR_PREFIX + id]` — no Map lookup, no rehydration step. A future transformer can rewrite this to direct `import {t_<hash>}` named imports for tree-shaking.

### packages/runtypes (`@mionjs/ts-go-run-types`)

Public marker package. Exports:

- `type RuntypeId<T>` — the sentinel.
- `function getRuntypeId<T>(id?)` — static marker. Use with an explicit type argument when there's no runtime value. Throws if called without an injected id (i.e. the plugin isn't active).
- `function reflectRuntypeId<T>(value, id?)` — reflection marker. `T` is inferred from `value`. Same runtime contract as `getRuntypeId`.


Cache lookup is done by the consumer directly: `import * as cache from 'virtual:runtypes-cache'; cache[RUNTYPES_VAR_PREFIX + id]`. No library indirection.

### packages/vite-plugin-runtypes

- `ResolverClient` — spawns the Go binary, serialises outstanding queries, parses line-delimited responses. Forwards `--marker-name` / `--marker-module` if the user overrides them.
- `rewrite.ts` — single function: for each file, calls `scanFiles`, then applies the returned sites as **byte-offset** insertions to the source. Operates on a `Buffer` rather than a JS string because tsgo positions are UTF-8 byte offsets — JS string math would skew on any multibyte character (e.g. em-dashes in comments).
- `index.ts` — Vite plugin glue. Short-circuits any file that doesn't contain the marker-module name as a cheap pre-filter. `load("virtual:runtypes-cache")` returns the `runTypeCacheSource` field from the resolver's `dump` response — the Go side is the single renderer.

## Slot injection and padding

The id is injected at the trailing `RuntypeId<T>` slot. The Go binary returns `ParamIndex` + `ArgsCount` per site; the TS-side `buildInsertion()` pads with `undefined` whenever the caller wrote fewer arguments than `paramIndex`:

```
getRuntypeId<T>()         →   getRuntypeId<T>("<hash>")
reflectRuntypeId(val)     →   reflectRuntypeId(val, "<hash>")
isType<T>(v)              →   isType<T>(v, "<hash>")
```

Neither built-in helper needs padding (`getRuntypeId` puts the id at slot 0; `reflectRuntypeId` already has `value` at slot 0 and the id at slot 1). The padding mechanism remains in place for user-defined wrappers with additional intermediate parameters.

## Reflection shape

The protocol's `RunType` is the canonical mion runtypes reflection-shape discriminated union. Specifically:

- **Numeric `ReflectionKind`** is declared in a stable order (never=0, any=1, …, callSignature=35) so the integer values are wire-safe across releases. Sentinel `-1` is reserved for ref slots.
- **Container shape**: `KindObjectLiteral.children` is an array of `KindPropertySignature`/`KindMethodSignature`/`KindIndexSignature`/`KindCallSignature` nodes; `KindFunction.parameters` is an array of `KindParameter` nodes; tuple elements are wrapped as `KindTupleMember`.
- **Annotations carried**: `id`, `typeName`, `typeArguments`, `optional`, `readonly`, `abstract`, `static`, `inlined`, `flags`, `description`, `default` (literal-only), `classRef` (provenance for v0.3 lazy-import).
- **Knotted output**: the runtime artifact pre-resolves cycles and wires `parent` references via direct assignment, so `cache[RUNTYPES_VAR_PREFIX + id]` is a drop-in source of `RunType` objects for the user's runtypes JIT — no adapter layer needed.

Lossy mappings are recorded in [docs/ROADMAP.md](./ROADMAP.md). Highlights:

- Symbol-keyed property names → synthetic `@@<name>` strings + `flags: ["symbol"]`.
- Function/closure-valued `default` → omitted with `flags: ["nonLiteralDefault"]` marker.
- `bigint` literal values → string with `flags: ["bigint"]` (consumer parses with `BigInt(…)`).
- `parent` not in JSON; the `.ts` artifact wires it. JSON-only consumers re-knot themselves.

Out of scope for v0.2: `templateLiteral`, `infer`, decorators (`MinLength<5>`-style), `TypeNumberBrand`, runtime-only fields (`function`, `classType`, `enum`). All have v0.3+ workaround proposals in the roadmap. Regex literals are now produced via AST-trace from `const`-bound regex initializers — see [atomic-types.md § RegExp](./atomic-types.md#regexp).

See also the per-kind references:

- [atomic-types.md](./atomic-types.md) — primitives, regex, literals, enums, `Date`.
- [member-types.md](./member-types.md) — single-typed members: `Array`, `Property`, `Method`.
- [collection-types.md](./collection-types.md) — multi-typed containers: tuples, unions, intersections, promises, functions, object literals, classes, recursive types.

### Member types and cycle resolution

Member types are the family of nodes that own exactly one child slot — `Array<T>`, `TupleMember`, `Property`, `PropertySignature`, `Parameter`, `IndexSignature` (which adds an `index` key slot alongside its `type`). `Promise<T>` is modeled as a native type with the same single-child shape. They show up everywhere a parent composite needs to point at "the type of this slot".

The wire format keeps these slots small via the `KindRef = -1` sentinel: every child RunType returned by `serialize.Cache.Serialize` is a `{kind: -1, id: "<hash>"}` stub. The canonical full RunType lives once in the cache, keyed by id. JSON consumers detect the sentinel and dereference manually; the emitted `virtual:runtypes-cache` module derefs at module-load time and hands consumers a fully-knotted graph.

Cycles close at two layers without special-case code:

- **Serializer**: [`serialize.Cache.assignID`](../internal/serialize/serialize.go) reserves the id and inserts a placeholder cache entry **before** projecting the type's children. A recursive walk that re-enters the same `*checker.Type` hits the `byPtr` lookup and gets back the reserved id immediately — no infinite recursion, no second projection.
- **Emit**: the runtime artifact ([`internal/emit/runtypes_module.go`](../internal/emit/runtypes_module.go)) declares every type as a scalar-only `export const t_<hash>` first, then writes a footer of direct property assignments (`t_<hash>.child = t_<otherHash>;`). All consts exist before any assignment runs, so back-edges work without forward-reference errors. The Vite plugin reads the rendered module string from the resolver's `dump` response — there's no JS-side renderer to mirror.

Callers walking a member type's child ref can ask the resolver for the canonical RunType via the `resolveId` op (see `OpResolveID` in `internal/protocol/protocol.go`). The returned RunType's child slots remain `KindRef` sentinels — the caller drills in by re-issuing `resolveId` per id.

## Shims — reaching into tsgo's `internal/`

### The visibility problem

`microsoft/typescript-go` keeps almost everything we need under `internal/*`:

```
github.com/microsoft/typescript-go/internal/checker
github.com/microsoft/typescript-go/internal/ast
github.com/microsoft/typescript-go/internal/parser
github.com/microsoft/typescript-go/internal/compiler
...
```

Go enforces an [`internal` visibility rule](https://go.dev/doc/go1.4#internalpackages) at the compiler level: a package whose path contains `…/internal/…` may only be imported by code rooted in the same module. So **no external Go program is allowed to import `internal/checker`** — including this one. The TypeScript team did that deliberately: they want freedom to refactor those packages.

A _shim_ is a thin, **publicly-importable** wrapper package that lives outside `internal/` and re-exports the symbols inside. The shim is what makes external Go consumers (this project, the [oxc TypeScript linter](https://github.com/oxc-project/tsgolint), and others) possible.

### Two techniques, mixed

The shim files (under [`third_party/tsgolint/shim/*`](../third_party/tsgolint/shim/), auto-generated by tsgolint's `tools/gen_shims`) use **two complementary techniques**:

**(1) Type aliases** for types, methods, and exported functions:

```go
// shim/checker/shim.go (excerpt)
package checker

import "github.com/microsoft/typescript-go/internal/checker"

type Checker     = checker.Checker     // full method set preserved
type AccessFlags = checker.AccessFlags
const AccessFlagsNone = checker.AccessFlagsNone
```

A type alias preserves the _whole_ method set of the underlying type. Once `Checker` is aliased, every exported method on it — `Checker.GetTypeAtLocation`, `Checker.GetResolvedSignature`, etc. — is callable from outside with no further plumbing. This covers ~80% of the surface.

**(2) `//go:linkname` directives** for unexported helpers we still need:

```go
// shim/vfs/osvfs/shim.go (excerpt)
//go:linkname FS github.com/microsoft/typescript-go/internal/vfs/osvfs.FS
func FS() vfs.FS
```

`//go:linkname` is a Go-runtime escape hatch that says "treat the name on the left as an alias of the symbol on the right at link time," bypassing visibility entirely. It's officially discouraged (and required `-gcflags=-checklinkname=0` for a while) but it's the only way to call genuinely unexported helpers. The shim uses it sparingly — type aliases do the heavy lifting wherever possible.

### How we wire the shim into this module

[`go.mod`](../go.mod) maps the shim import paths into our vendored tsgolint submodule via `replace` directives:

```go
replace (
  github.com/microsoft/typescript-go/shim/ast      => ./third_party/tsgolint/shim/ast
  github.com/microsoft/typescript-go/shim/checker  => ./third_party/tsgolint/shim/checker
  github.com/microsoft/typescript-go/shim/compiler => ./third_party/tsgolint/shim/compiler
  ...
)
```

So when [`internal/program/program.go`](../internal/program/) writes `import "github.com/microsoft/typescript-go/shim/checker"`, it picks up the aliased `internal/checker` from the typescript-go that tsgolint vendors. We never write `internal/*` import paths ourselves — Go would refuse to compile if we did.

### Patches we layer on top

A handful of upstream `internal` symbols that tsgolint _wants_ to alias are themselves unexported (lowercase) in typescript-go. For those, [`third_party/tsgolint/patches/*.patch`](../third_party/tsgolint/patches/) apply small visibility lifts to the nested typescript-go submodule (e.g. uppercase a method name, or expose a constructor). The bootstrap step (`git am --3way --no-gpg-sign ../patches/*.patch`) applies them on a fresh checkout.

[DEVS.md → Patching tsgolint's typescript-go](../DEVS.md#patching-tsgolints-typescript-go) documents how to add a new patch.

### Maintenance model

- The oxc-project tsgolint repo tracks typescript-go via renovate. Whenever typescript-go bumps, tsgolint regenerates its shim and we pick it up via `git submodule update`. Drift is bounded and automatable.
- The runtime cost of going through a shim is **zero**: aliases and `//go:linkname` are link-time, not runtime constructs.
- When [microsoft/typescript-go#516](https://github.com/microsoft/typescript-go/issues/516) lands with an official transformer/linter API, we replace the shim imports with that API — call sites in [`internal/program`](../internal/program/), [`internal/marker`](../internal/marker/), and [`internal/resolver`](../internal/resolver/) change; everything else (sentinel detection, structural ids, hash dictionary, cache emission, Vite plugin) stays put.

## Build and test

```bash
# One-time setup:
git submodule update --init --recursive
(cd third_party/tsgolint/typescript-go && \
  git am --3way --no-gpg-sign ../patches/*.patch)

# Build the resolver:
go build -o bin/ts-go-run-types ./cmd/ts-go-run-types

# Go test suite — covers atomic reflection kinds + scanFiles detection over the
# F1–F17 fixtures:
go test ./internal/...

# JS test suites — spawn the real Go binary and assert the full round-trip:
pnpm -C packages/runtypes install
pnpm -C packages/runtypes test
pnpm -C packages/vite-plugin-runtypes install
pnpm -C packages/vite-plugin-runtypes test
```

## Workspace self-imports in tests

Two independent resolvers see `import { … } from '@mionjs/ts-go-run-types'` inside the marker package's own tests, and both must land on the same target:

1. **Vitest / Vite** — runtime resolution. Driven by `resolve.conditions: ['source']` in [`vitest.config.ts`](../packages/ts-go-run-types/vitest.config.ts).
2. **tsgo** — the Go-side TypeScript checker invoked by [`vite-plugin-runtypes`](../packages/vite-plugin-runtypes/) to compute runtype ids. Driven by `customConditions: ["source"]` in [`tsconfig.test.json`](../packages/ts-go-run-types/tsconfig.test.json).

Both conditions select the `"source": "./src/index.ts"` entry on the marker package's `package.json` `exports` map. External consumers (without `source` in their conditions) fall through to the normal `"types"` / `"import"` / `"require"` entries, getting the built `dist/`. The `"source"` lane is opt-in and workspace-internal.

### Why two condition flags, not one resolver

Vite's resolver and tsgo's resolver are unrelated implementations. Vite reads `resolve.conditions` from `vitest.config.ts`. tsgo reads `customConditions` from the tsconfig it was launched with. Neither sees the other's setting. Wiring both is required for consistent behavior across the runtime path (vitest loads the test module) and the type-checking path (tsgo's marker scan walks call sites).

### How the marker gate plays into this

[`internal/marker/marker.go`](../internal/marker/marker.go) gates whether a `RuntypeId<T>` reference counts as the marker by checking that the alias' declaration lives inside the configured marker package. The check accepts two forms:

1. The declaration is inside an ambient `declare module "<module>" { … }` block (used by [`internal/testfixtures/runtypes.d.ts`](../internal/testfixtures/runtypes.d.ts) and any other synthetic fixture without a real package.json on disk).
2. The declaration's file belongs to an on-disk package whose `package.json` `"name"` equals `<module>`. The check walks parent directories from the declaration file looking for the nearest `package.json` and reads its name. The on-disk directory name is irrelevant — only the `"name"` field matters.

Form 2 is what makes the source-condition path work. When tsgo resolves `@mionjs/ts-go-run-types` to `packages/ts-go-run-types/src/index.ts`, the marker scanner walks up that path, finds `packages/ts-go-run-types/package.json`, reads `"name": "@mionjs/ts-go-run-types"`, and accepts. The same check accepts files from `node_modules/@mionjs/ts-go-run-types/dist/index.d.ts` for external consumers (its enclosing `package.json` has the same name).

An earlier version of `DeclaredInModule` matched by **file-path string** instead of by `package.json` name — accepting any path containing `/@mionjs/ts-go-run-types/`. That worked for `node_modules` consumers but failed for workspace self-imports, where the on-disk directory (`packages/ts-go-run-types/`) doesn't contain the published name. To work around it, the marker package shipped a `test/runtypes.d.ts` ambient overlay file mirroring the public API. The package.json walk removed that workaround — there's no overlay file for `@mionjs/ts-go-run-types` anymore.

The Go test suite still needs `internal/testfixtures/runtypes.d.ts` because the fixture files live under the monorepo's `internal/` tree, which doesn't have its own `package.json` and shouldn't pretend to be the marker package. The ambient-module form (gate form 1) is the right tool for synthetic fixtures.

## Limitations

- No source-map adjustments when the rewriter injects arguments. Negligible for the POC, small fix for production.
- The shim locks us into tsgo's internal API surface. A renovate-driven sync on the tsgolint submodule keeps it current.
- Concurrency: `Cache` is not safe for concurrent use; the resolver holds one checker per process and serialises requests.
- v1 supports a single, trailing `RuntypeId<T>` parameter per signature. Multiple markers per call (or non-trailing position) is a v2 follow-up.
