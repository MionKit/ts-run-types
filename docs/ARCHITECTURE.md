# Architecture

`ts-run-types` is a compile-time **type resolver** for [mion runtypes](https://github.com/mionkit) targeting **TypeScript 7 / tsgo**. It provides a native side-channel into tsgo's type checker for tools (Vite plugin, codegen, test harness) that need to know a TypeScript type at a specific call site without relying on the legacy custom-transformer API (which the Go port does not expose; see [microsoft/typescript-go#516](https://github.com/microsoft/typescript-go/issues/516)).

## Big picture

```
  .ts source                   Go resolver                  JSON type table
  ┌─────────┐    scanFile    ┌──────────────┐   TypeNode   ┌───────────────┐
  │  app.ts │ ─────────────▶ │  ts-run-types │ ───────────▶ │  site → id    │
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

1. **Build lifecycle** (Vite, Rollup, CI codegen): Go resolver is spawned once, receives one `scanFile` query per source file, dumps the full table at end-of-build, is torn down.
2. **Query lifecycle**: every source file with calls to `RuntypeId<T>`-marked functions is sent to `scanFile`. The resolver walks every CallExpression, asks tsgo for the resolved signature, and returns one site per call whose trailing parameter type is the sentinel marker.
3. **Runtime lifecycle**: the rewritten source passes the site id as the trailing argument; the library's runtime helper does a `Map.get(id)`. No reflection work happens at runtime.

## The sentinel marker

Detection is anchored on a single TypeScript type alias exported from the `@mionkit/runtypes` package:

```ts
export type RuntypeId<T> = string & { readonly __mionRuntypeBrand?: T };
```

A function opts into compile-time id injection by declaring `id?: RuntypeId<T>` as its **trailing parameter**. The transformer rewrites every call site of such a function, injecting the resolved hash id at that slot. This includes:

- The canonical helper `getRuntypeId<T>(val?, id?)` shipped from `@mionkit/runtypes`.
- Any user-defined wrapper that propagates the marker — `function isType<T>(v, id?: RuntypeId<T>)`.

Detection requires both:

1. The trailing parameter type alias must be named `RuntypeId` (configurable via `--marker-name`).
2. The alias must be declared in `@mionkit/runtypes` (configurable via `--marker-module`). Either inside `declare module "@mionkit/runtypes" { ... }` or in a file path containing `/@mionkit/runtypes/`. This rules out accidental collisions with same-named user types declared elsewhere.

A call inside a generic body where the marker's `T` is the wrapper's own free type parameter is **skipped** — there's no concrete `T` to assign an id to yet. The wrapper must propagate the marker via its own signature, and the injection happens at the wrapper's call sites instead.

## Package layout

```
cmd/ts-run-types/                CLI entry point
internal/program/                tsconfig + VFS bootstrap
internal/walker/                 position → AST node finder + call iterator
internal/marker/                 RuntypeId<T> sentinel detection
internal/resolver/               scanFile + dump dispatch
internal/serialize/              *checker.Type → protocol.TypeNode (dedup by id)
internal/protocol/               stdio JSON request/response types
internal/testfixtures/           fixture .ts + shared tsconfig
packages/runtypes/               @mionkit/runtypes — marker type + getRuntypeId
packages/vite-plugin-runtypes/   JS side — drives scanFile, patches calls
third_party/tsgolint/            git submodule — shim layer into typescript-go
docs/                            this file
examples/                        runnable fixtures
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
- `ForEachCallExpression(sf, cb)` — depth-first visitor over every CallExpression in a source file. Used by the resolver's `scanFile` op.

### internal/marker

`Detect(t *checker.Type, opts Options) (typeArg, ok)` — given the type of a function's trailing parameter, returns whether it matches the configured marker (name + declaring-module check) and extracts the single type argument `T`. `IsFreeTypeParameter(t)` filters out calls inside generic bodies.

### internal/serialize

`Cache` interns `*checker.Type` → stable hash id (e.g. `abc123`). `Cache.AssignID(t)` is the public entry point used by the marker scanner; `Cache.Serialize(t)` returns a `KindRef` sentinel pointing at the cached entry. Recursion is broken by reserving the id before descending. Structural dedup means two distinct AST types that share the same shape end up with the same id.

### internal/resolver

Dispatches two operations:

| op         | semantics                                                                 |
| ---------- | ------------------------------------------------------------------------- |
| `scanFile` | Walks every CallExpression in file. For each whose resolved signature has a trailing `RuntypeId<T>` param with bound T, returns a `Site{Pos, ID, ParamIndex, ArgsCount}`. |
| `dump`     | Returns the full cache (every Type) + the running Sites slice.            |

`Pos` is the byte offset of the closing `)` of the call — the TS-side patcher inserts at that offset. `ParamIndex` is the 0-based slot the injected id goes into; `ArgsCount` is the number of arguments the user already wrote (so the patcher knows whether to pad with `undefined`).

### internal/protocol

Pure struct definitions shared between the Go resolver and the TS plugin. Stdio protocol is newline-delimited JSON; one `Request` in, one `Response` out, EOF terminates. The daemon mode wraps a Unix-socket accept loop around the same handler, one client at a time.

### internal/emit

Two output formats share the same in-memory `protocol.Dump`:

- **`json.go`** — pretty-printed JSON. Child Type slots stay as `{kind: -1, id: "<hash>"}` ref sentinels. Suitable for inspection, debugging, cross-language consumers, CI snapshot tests.
- **`tsmodule.go`** — the **runtime artifact**. Emits a self-contained TypeScript module: every type is declared as a top-level `const t_<hash>` carrying scalar fields, then a footer block fills in reference-bearing slots (`type`, `return`, `parameters`, `types`, `parent`) by direct assignment. Consumers `import { __runtypes } from "./runtypes-cache"` and call `__runtypes.get(id)` to obtain a fully-knotted deepkit `Type` object — no rehydration step.

### packages/runtypes (`@mionkit/runtypes`)

Public marker package. Exports:

- `type RuntypeId<T>` — the sentinel.
- `function getRuntypeId<T>(val?, id?)` — canonical reflection helper. Throws at runtime if called without an injected id (i.e. the plugin isn't active).
- `function getMeta(id: RuntypeId<unknown>)` — cache lookup. Returns the deepkit-shape Type for an id, or `undefined` if the cache hasn't been wired up.
- `function __setRuntypeMetaResolver(fn)` — the virtual cache module calls this on first import.

### packages/vite-plugin-runtypes

- `ResolverClient` — spawns the Go binary, serialises outstanding queries, parses line-delimited responses. Forwards `--marker-name` / `--marker-module` if the user overrides them.
- `rewrite.ts` — single function: for each file, calls `scanFile`, then applies the returned sites as **byte-offset** insertions to the source. Operates on a `Buffer` rather than a JS string because tsgo positions are UTF-8 byte offsets — JS string math would skew on any multibyte character (e.g. em-dashes in comments).
- `render-cache.ts` — TS-side renderer that mirrors `internal/emit/tsmodule.go` byte-for-byte.
- `index.ts` — Vite plugin glue. Short-circuits any file that doesn't contain the marker-module name as a cheap pre-filter. Emits `virtual:runtypes-cache`.

## Padding for zero-arg calls

A call like `getRuntypeId<T>()` has zero arguments but the trailing slot is `paramIndex=1`. The patcher pads with `undefined` so the id lands at the correct slot:

```
getRuntypeId<T>()       →   getRuntypeId<T>(undefined, "<hash>")
getRuntypeId<T>(val)    →   getRuntypeId<T>(val, "<hash>")
isType<T>(v)            →   isType<T>(v, "<hash>")
```

The Go binary returns `ParamIndex` + `ArgsCount` per site; the TS-side `buildInsertion()` does the padding math.

## Deepkit shape compatibility

The protocol's `Type` is byte-shape compatible with [deepkit/type's `Type` discriminated union](https://github.com/marcj/deepkit/blob/master/packages/type/src/reflection/type.ts). Specifically:

- **Numeric `ReflectionKind`** matches deepkit's enum declaration order exactly (never=0, any=1, …, callSignature=35). Sentinel `-1` is reserved for ref slots.
- **Container shape** mirrors deepkit: `TypeObjectLiteral.types` is an array of `TypePropertySignature`/`TypeMethodSignature`/`TypeIndexSignature`/`TypeCallSignature` nodes; `TypeFunction.parameters` is an array of `TypeParameter` nodes; tuple elements are wrapped as `TypeTupleMember`.
- **Annotations carried**: `id`, `typeName`, `typeArguments`, `optional`, `readonly`, `abstract`, `static`, `inlined`, `flags`, `description`, `default` (literal-only), `classRef` (provenance for v0.3 lazy-import).
- **Knotted output**: the `.ts` runtime artifact pre-resolves cycles and wires `parent` references via direct assignment, so `__runtypes.get(id)` is a drop-in source of `Type` objects for the user's runtypes JIT — no adapter layer needed.

Lossy mappings are recorded in [docs/ROADMAP.md](./ROADMAP.md). Highlights:

- Symbol-keyed property names → synthetic `@@<name>` strings + `flags: ["symbol"]`.
- Function/closure-valued `default` → omitted with `flags: ["nonLiteralDefault"]` marker.
- `bigint` literal values → string with `flags: ["bigint"]` (consumer parses with `BigInt(…)`).
- `parent` not in JSON; the `.ts` artifact wires it. JSON-only consumers re-knot themselves.

Out of scope for v0.2: `templateLiteral`, `regexp` literals, `infer`, decorators (`MinLength<5>`-style), `TypeNumberBrand`, runtime-only fields (`function`, `classType`, `enum`). All have v0.3+ workaround proposals in the roadmap.

## go:linkname boundary

The shim layer we depend on (under `third_party/tsgolint/shim/*`) uses `//go:linkname` directives to re-export symbols from `github.com/microsoft/typescript-go/internal/*`. This is officially discouraged Go usage, but:

- The oxc-project fork tracks typescript-go via renovate, so shim drift is a bounded, automatable effort.
- Type aliases in the shim (`type Program = compiler.Program`) preserve the full method set of internal types — exported methods like `Program.GetTypeChecker` and `Checker.GetTypeAtLocation` are directly callable from outside, no linkname thunks required for them.
- We apply five performance/API patches from the tsgolint `patches/` directory to its typescript-go submodule as part of build; no changes to upstream typescript-go are needed beyond what tsgolint already carries.

When typescript-go#516 lands with an official transformer/linter API, swap the shim for that API and leave everything else unchanged.

## Build and test

```bash
# One-time setup:
git submodule update --init --recursive
(cd third_party/tsgolint/typescript-go && \
  git am --3way --no-gpg-sign ../patches/*.patch)

# Build the resolver:
go build -o bin/ts-run-types ./cmd/ts-run-types

# Go test suite — covers atomic deepkit kinds + scanFile detection over the
# F1–F17 fixtures:
go test ./internal/...

# JS test suites — spawn the real Go binary and assert the full round-trip:
pnpm -C packages/runtypes install
pnpm -C packages/runtypes test
pnpm -C packages/vite-plugin-runtypes install
pnpm -C packages/vite-plugin-runtypes test
```

## Limitations

- No source-map adjustments when the rewriter injects arguments. Negligible for the POC, small fix for production.
- The shim locks us into tsgo's internal API surface. A renovate-driven sync on the tsgolint submodule keeps it current.
- Concurrency: `Cache` is not safe for concurrent use; the resolver holds one checker per process and serialises requests.
- v1 supports a single, trailing `RuntypeId<T>` parameter per signature. Multiple markers per call (or non-trailing position) is a v2 follow-up.
