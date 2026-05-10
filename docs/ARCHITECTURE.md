# Architecture

`ts-run-types` is a compile-time **type resolver** for [mion runtypes](https://github.com/mionkit) targeting **TypeScript 7 / tsgo**. It provides a native side-channel into tsgo's type checker for tools (Vite plugin, codegen, test harness) that need to know a TypeScript type at a specific call site without relying on the legacy custom-transformer API (which the Go port does not expose; see [microsoft/typescript-go#516](https://github.com/microsoft/typescript-go/issues/516)).

## Big picture

```
  .ts source                   Go resolver                  JSON type table
  ┌─────────┐   (file,pos)   ┌──────────────┐   TypeNode   ┌───────────────┐
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

1. **Build lifecycle** (Vite, Rollup, CI codegen): Go resolver is spawned once, receives one query per marker call site, dumps the full table at end-of-build, is torn down.
2. **Query lifecycle**: every marker call in user code (`isType<T>(x)`, `getTypeInfo(x)`, `router(routes)`) maps to a single resolver request. The request carries `(file, position, kind)`. The response carries a stable type id plus any newly added type nodes.
3. **Runtime lifecycle**: the rewritten source passes the site id into the library's runtime helper, which does a cache lookup. No reflection work happens at runtime beyond a `Map.get`.

## Package layout

```
cmd/ts-run-types/                CLI entry point
internal/program/                tsconfig + VFS bootstrap
internal/walker/                 position → AST node finder
internal/resolver/               query dispatch
internal/serialize/              *checker.Type → protocol.TypeNode (dedup by id)
internal/protocol/               stdio JSON request/response types
internal/testfixtures/           fixture .ts + shared tsconfig
packages/vite-plugin-runtypes/   JS side — rewrites marker calls to pass site ids
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

Two tiny primitives:

- `NodeAt(sf, pos)` — deepest `*ast.Node` whose `[Pos, End)` contains `pos`. Implemented with `ForEachChild` recursion — no sort required because TS AST ranges are strictly nested.
- `CallExpressionAt(sf, pos)` — walks up `.Parent` from `NodeAt` until it finds a `KindCallExpression`. Callers point at the callee's first character and the walker finds the enclosing call.

### internal/serialize

The core projection. `Cache` interns `*checker.Type` → stable id (`t0`, `t1`, …). `Cache.Serialize(tc, t)` returns the id; recursion is broken by reserving the id before descending. The switch on `t.Flags()` covers:

- primitives (`string`, `number`, `boolean`, `bigint`, `symbol`)
- literals (preserving the literal value)
- unions / intersections (members as id references)
- object types (properties, optional flag, call/construct signatures)
- function types (inferred parameter names + types, inferred return)
- `any` / `unknown` / `never` / `void` / `null` / `undefined`
- enum
- fallback with `tc.TypeToString(t)` as a human-readable placeholder

Type alias names (`type User = …`) are attached via the shim's `Type_alias` accessor and surface as `TypeNode.Alias` so runtime consumers can key caches by the user-visible name.

### internal/resolver

Dispatches one of five operations per request:

| op                         | checker call                                                                   |
| -------------------------- | ------------------------------------------------------------------------------ |
| `resolveAnnotation`        | `checker.GetTypeFromTypeNode(node)`                                            |
| `resolveTypeArgument`      | same, applied to `ce.TypeArguments.Nodes[index]`                                |
| `resolveArgumentInferred`  | `checker.GetTypeAtLocation(ce.Arguments.Nodes[index])`                          |
| `resolveSymbol`            | `checker.GetTypeAtLocation(nodeAt(pos))`                                        |
| `dump`                     | returns the full cache + site map                                               |

Every resolved id is recorded in an append-only `Sites` slice so the final dump is a complete build manifest.

### internal/protocol

Pure struct definitions shared between the Go resolver and the TS plugin. Stdio protocol is newline-delimited JSON; one `Request` in, one `Response` out, EOF terminates. The daemon mode wraps a Unix-socket accept loop around the same handler, one client at a time.

### internal/emit

Two output formats share the same in-memory `protocol.Dump`:

- **`json.go`** — pretty-printed JSON. Child Type slots stay as `{kind: -1, id: N}` ref sentinels. Suitable for inspection, debugging, cross-language consumers, CI snapshot tests.
- **`tsmodule.go`** — the **runtime artifact**. Emits a self-contained TypeScript module: every type is declared as a top-level `const t<N>` carrying scalar fields, then a footer block fills in reference-bearing slots (`type`, `return`, `parameters`, `types`, `parent`) by direct assignment. Consumers `import { __runtypes } from "./runtypes-cache"` and call `__runtypes.get(id)` to obtain a fully-knotted deepkit `Type` object — no rehydration step at consumer load time, no helper function to call.

### packages/vite-plugin-runtypes

- `ResolverClient` — spawns the Go binary, serialises outstanding queries, parses line-delimited responses.
- `rewrite.ts` — regex-based scan for configured markers; for each call, asks the resolver, then inserts `, <id>` as a numeric extra argument before the closing `)`. A hand-rolled bracket-aware scanner skips strings, templates and comments so the close paren is correct for nested/odd cases.
- `render-cache.ts` — TS-side renderer that mirrors `internal/emit/tsmodule.go` byte-for-byte; produces the same `.ts` artifact from a `Dump`.
- `index.ts` — Vite plugin glue. Emits a `virtual:runtypes-cache` module exporting `__runtypes: Map<number, Type>` and `__sites`. In production builds the same shape can be written to disk by passing `--out-ts` to the Go binary directly.

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

Out of scope for v0.2: `templateLiteral`, `regexp`, `infer`, decorators (`MinLength<5>`-style), `TypeNumberBrand`, runtime-only fields (`function`, `classType`, `enum`). All have v0.3+ workaround proposals in the roadmap.

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

# Go test suite — 9 cases covering both annotation-based and inference-based
# reflection across primitives / unions / objects / functions / generics:
go test ./internal/...

# JS plugin tests — spawns the real Go binary and asserts the full round-trip:
pnpm -C packages/vite-plugin-runtypes install
pnpm -C packages/vite-plugin-runtypes test
```

## Limitations (POC status)

- The plugin's call-site scanner is regex-based. A production build should use a real JS/TS parser (`es-module-lexer` for speed, `ts.createSourceFile` for fidelity).
- Recursive self-referential types produce `t<id>` back-references in the JSON, but consumers must re-knot them on load; the runtime Map keeps ids, not in-memory cycles.
- No source-map adjustments when the rewriter injects arguments. Negligible for the POC, small fix for production.
- The shim locks us into tsgo's internal API surface. A renovate-driven sync on the tsgolint submodule keeps it current.
- Concurrency: `Cache` is not safe for concurrent use; the resolver holds one checker per process and serialises requests.
