# ts-run-types

Compile-time type resolver for [mion runtypes](https://github.com/mionkit) on **TypeScript 7 / typescript-go (tsgo)**.

`ts-run-types` is a native Go binary that reaches into tsgo's type checker (via the `oxc-project/tsgolint` shim layer) and answers *call-site* type queries. A paired Vite plugin rewrites marker calls (`getTypeInfo(x)`, `isType<T>(x)`, `router(routes)`, …) into cache lookups and emits a deduplicated type-metadata module the runtime (and the JIT) can consume.

## Why

TypeScript 7 ships the compiler as a compiled Go binary. The legacy custom-transformer API has not been ported (see [microsoft/typescript-go#516](https://github.com/microsoft/typescript-go/issues/516)), and the compiler can no longer be monkey-patched from Node. Runtime type-reflection libraries that relied on patching `tsc` therefore need a new, native side-channel into the checker.

`ts-run-types` provides that channel — for both **annotation-driven** queries (`isType<User>(x)`) and **inference-driven** queries (`router(routes)` inferring the shape of `routes` without any type argument).

## Status

Experimental. Tracks `oxc-project/tsgolint`, which itself tracks `microsoft/typescript-go` via renovate. Production hardening pending TypeScript 7 GA.

## How it works

```
 Vite plugin       ──▶  Go resolver (tsgo checker)  ──▶  JSON type projection
      │                                                       │
      └─── rewrites call sites ◀────── stable site id ────────┘
                 │
                 ▼
       virtual:runtypes-cache   ◀── runtime / JIT consumes metadata
```

1. The Vite plugin scans each `.ts` file for marker calls.
2. For each call, it asks the resolver for the resolved type at that position. The resolver walks the AST, invokes the appropriate tsgo checker API (`getTypeAtLocation`, `getTypeFromTypeNode`, `getResolvedSignature`, …), and returns a dedup-by-id JSON type node.
3. The plugin rewrites the call to pass the site id, and emits `virtual:runtypes-cache` — a module exporting the full type table for the runtime.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the detailed architecture.

## Build

```bash
git submodule update --init --recursive
(cd third_party/tsgolint/typescript-go && git am --3way --no-gpg-sign ../patches/*.patch)
go build -o bin/ts-run-types ./cmd/ts-run-types
```

## Run

### One-shot (stdio JSON)

```bash
bin/ts-run-types --one-shot --tsconfig tsconfig.json < requests.jsonl > cache.json
```

`requests.jsonl` is newline-delimited queries:

```json
{"op":"resolveArgumentInferred","file":"src/app.ts","callPos":42,"index":0}
{"op":"resolveTypeArgument","file":"src/app.ts","callPos":120,"index":0}
{"op":"dump"}
```

### Daemon (Vite / HMR)

```bash
bin/ts-run-types --daemon --tsconfig tsconfig.json --socket /tmp/ts-run-types.sock
```

The Vite plugin spawns this for you; see [`packages/vite-plugin-runtypes`](./packages/vite-plugin-runtypes).

## Test

```bash
go test ./internal/...
pnpm -C packages/vite-plugin-runtypes test
```

Fixtures cover primitive/object/union annotations, inferred literals, inferred function signatures, the `router(routes)` generic-inference case, and inferred generic-argument substitution.

## Layout

```
cmd/ts-run-types/         CLI entry point
internal/program/         tsconfig + VFS bootstrap
internal/walker/          position → AST node finder
internal/resolver/        query dispatch (annotation | typeArg | argInferred)
internal/serialize/       *checker.Type → TypeNode (dedup by id)
internal/protocol/        stdio JSON request/response types
internal/testfixtures/    .ts inputs + golden JSON outputs
packages/vite-plugin-runtypes/   Vite plugin, rewrites marker calls
third_party/tsgolint/     git submodule, provides the tsgo shim layer
docs/ARCHITECTURE.md      detailed design
```

## License

MIT — see [LICENSE](./LICENSE).
