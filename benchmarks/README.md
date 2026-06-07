# Validation benchmarks — containerized (podman)

Compares **ts-go-run-types** validators against **zod**, **typebox**, **ajv**
and (optionally) **typia**, on a shared set of basic types. Like the docs
website, all heavy tooling (the validator libraries + vite) lives **only inside
a podman image** — the host never installs it. This keeps the benchmark/
validator supply-chain surface off your machine.

## What runs where

| Inside the image (installed)         | Bind-mounted from the repo at run time            |
| ------------------------------------ | ------------------------------------------------- |
| zod, @sinclair/typebox, ajv, typia   | `benchmarks/src/` (the suite + per-library files) |
| vite + its toolchain                 | `bin/ts-go-run-types` (the Go resolver binary)    |
| (node_modules, never on the host)    | `packages/ts-go-run-types`, `vite-plugin-runtypes` (first-party) |

ts-go-run-types is special: its validators are generated at **build time** by
`vite-plugin-runtypes`, which spawns the **Go binary**. That's why the container
needs both **vite** (in the image) and the **Go binary** (mounted in) to build
the ts-go-run-types column — the other libraries are plain runtime deps.

## Usage

From the repo root:

```bash
pnpm run bench:prep          # build the Go binary + JS packages on the host (one-time)
pnpm run bench:build-image   # build the podman image
pnpm run bench               # build + run the benchmark in the container
```

`bench` prints, per case, a correctness check **and** validation throughput for
every library, then a coverage summary. It exits non-zero if any *supported*
validator is incorrect, so the run doubles as a cross-library conformance test.

```
case             ts-go-run-types       zod       typebox       ajv       typia
string                  201.5M/s     1.0M/s       89.7M/s    38.9M/s          —
user                     83.9M/s      685k/s      55.2M/s    22.0M/s          —
bigint                  107.1M/s      1.3M/s      69.2M/s          —          —
...
Coverage: ts-go-run-types 14/14 · zod 14/14 · typebox 14/14 · ajv 13/14
```

## "Not supported" cases

When a library cannot express a type, its validator is the `'not-supported'`
sentinel (rendered `—`) instead of a failure. For example **ajv** uses JSON
Schema, which has no `bigint`, so `bigint` is not-supported for ajv. Add new
cases the same way: a real validator where the library can express the type, the
sentinel where it can't.

## Adding a case

1. Add the type to [`src/suite/types.ts`](src/suite/types.ts).
2. Add `valid`/`invalid` samples + the case name to
   [`src/suite/samples.ts`](src/suite/samples.ts).
3. Add a validator (or `NOT_SUPPORTED`) for the case in **every** file under
   [`src/libs/`](src/libs/) — the `Record<CaseName, …>` type makes the compiler
   remind you of any you miss.

## typia (optional / experimental)

Typia, like ts-go-run-types, derives validators from TypeScript types via a
compile-time transform. Enable it with `BENCH_TYPIA=1`:

```bash
BENCH_TYPIA=1 pnpm run bench
```

This wires `@ryoppippi/unplugin-typia` into the vite build. It is currently
**blocked by an upstream typia ↔ typescript transformer version conflict**
(typia's `FileTransformer` fails against the installed TypeScript), so the typia
column stays not-supported by default. The wiring and validators
([`src/libs/typia.ts`](src/libs/typia.ts)) are in place — pin a compatible
`typia` / `typescript` / `@ryoppippi/unplugin-typia` triple to light it up.

## Behind a corporate / MITM proxy

Same as the website: point the image build at the proxy CA and use host
networking.

```bash
BENCH_CA_CERT=/usr/local/share/ca-certificates \
BENCH_BUILD_NETWORK=host \
  pnpm run bench:build-image
```

The Go binary + first-party packages are built on the host by `bench:prep` and
mounted in, so the benchmark run itself needs no network.
