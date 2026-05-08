# ts-run-types

Compile-time type resolver for [mion runtypes](https://github.com/mionkit) on **TypeScript 7 / typescript-go (tsgo)**.

`ts-run-types` is a native Go binary that reaches into tsgo's type checker (via the `oxc-project/tsgolint` shim layer) and answers *call-site* type queries. A paired Vite plugin rewrites every call whose trailing parameter is the sentinel marker `RuntypeId<T>` (from `@mionkit/runtypes`) and emits a deduplicated type-metadata module the runtime (and the JIT) can consume.

## Why

TypeScript 7 ships the compiler as a compiled Go binary. The legacy custom-transformer API has not been ported (see [microsoft/typescript-go#516](https://github.com/microsoft/typescript-go/issues/516)), and the compiler can no longer be monkey-patched from Node. Runtime type-reflection libraries that relied on patching `tsc` therefore need a new, native side-channel into the checker.

`ts-run-types` provides that channel — driven by a single primitive (the `RuntypeId<T>` sentinel) rather than a hard-coded list of function names, so users can wrap the canonical helper freely.

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

1. User code imports `RuntypeId<T>` / `getRuntypeId<T>(val)` from `@mionkit/runtypes`. Any user-defined wrapper function may also declare `id?: RuntypeId<T>` as its trailing parameter to opt into the same flow.
2. The Vite plugin sends each source file to the Go binary's `scanFile` op. The binary walks every `CallExpression`, asks tsgo for the resolved signature, and returns one site per call whose trailing parameter is a `RuntypeId<T>` (declared in `@mionkit/runtypes`) with `T` concretely bound.
3. The plugin patches each call to pass the resolved hash id at the trailing slot, padding with `undefined` if the call had fewer existing args.
4. At build end, the plugin emits `virtual:runtypes-cache` — a deepkit-shaped, fully-knotted Type graph keyed by hash id. Runtimes read it via `getMeta(id)`.

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the detailed architecture.

## Build

```bash
git submodule update --init --recursive
(cd third_party/tsgolint/typescript-go && git am --3way --no-gpg-sign ../patches/*.patch)
go build -o bin/ts-run-types ./cmd/ts-run-types
```

## Use

```ts
import { getRuntypeId, type RuntypeId } from "@mionkit/runtypes";

// 1. Direct reflection — T inferred from the argument.
const userId = getRuntypeId({ id: 1, name: "m" });

// 2. Explicit type argument.
const stringId = getRuntypeId<string>();

// 3. User-defined wrapper — declare the same trailing RuntypeId<T> param,
//    the transformer treats it identically.
function isType<T>(val: unknown, id?: RuntypeId<T>): boolean {
  // ... validate via getMeta(id!) ...
  return true;
}
isType<User>(payload);
```

The transformer rewrites each call to:

```ts
getRuntypeId({ id: 1, name: "m" }, "abc123");
getRuntypeId<string>(undefined, "Lk7Px9");
isType<User>(payload, "qzPnXt");
```

A free type parameter (a call inside a generic body where the marker's `T` is the wrapper's own type variable) is *skipped* — the wrapper must propagate by declaring `id?: RuntypeId<T>` itself and the injection happens at the wrapper's own call sites.

## CLI

### One-shot (stdio JSON)

```bash
bin/ts-run-types --one-shot --tsconfig tsconfig.json < requests.jsonl > cache.json
```

`requests.jsonl` is newline-delimited queries:

```json
{"op":"scanFile","file":"src/app.ts"}
{"op":"dump"}
```

### Daemon (Vite / HMR)

```bash
bin/ts-run-types --daemon --tsconfig tsconfig.json --socket /tmp/ts-run-types.sock
```

### Marker overrides

```
--marker-name NAME       default: RuntypeId
--marker-module MODULE   default: @mionkit/runtypes
```

The marker is detected by both name AND declaring module, so a user's own `type RuntypeId<T> = ...` declared elsewhere does not accidentally trigger rewrites.

## Test

```bash
go test ./internal/...
pnpm -C packages/runtypes test
pnpm -C packages/vite-plugin-runtypes test
```

Fixtures cover all atomic deepkit kinds (string, number, BigInt, Symbol, Date, RegExp, enums, literals), primitive/object/union annotations, inferred function signatures, generic inference, and user-defined wrappers.

## Layout

```
cmd/ts-run-types/                CLI entry point
internal/program/                tsconfig + VFS bootstrap
internal/walker/                 position → AST node finder
internal/marker/                 RuntypeId<T> sentinel detection
internal/resolver/               scanFile + dump dispatch
internal/serialize/              *checker.Type → TypeNode (dedup by id)
internal/protocol/               stdio JSON request/response types
internal/testfixtures/           .ts inputs
packages/runtypes/               @mionkit/runtypes — marker type + helper
packages/vite-plugin-runtypes/   Vite plugin, drives the binary
third_party/tsgolint/            git submodule — tsgo shim layer
docs/ARCHITECTURE.md             detailed design
```

## License

MIT — see [LICENSE](./LICENSE).
