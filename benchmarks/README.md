# Validation benchmarks — containerized (podman)

Compares **ts-go-run-types** validators against **zod**, **typebox**, **ajv**
and (optionally) **typia**, over the **full** `validation` + `format-validation`
suites (the exact cases the package tests itself with — see
[`src/suites/`](src/suites/)). Like the docs website, all heavy tooling (the
validator libraries + vite) lives **only inside a podman image** — the host
never installs it.

The real suites are vendored under `src/suites/` so the plugin can rewrite their
`createValidate<T>()` calls at build time. ts-go-run-types validators come
straight from each case's `validate` thunk + `getSamples()`; the competitors
([`src/competitors/`](src/competitors/)) provide a hand-written schema per case
where the library can express the type, and the **not-supported** sentinel (`—`)
where it can't — e.g. JSON Schema (ajv) has no `bigint`, can't reject
`NaN`/`Infinity`, and can't validate `Date`/`Map`/`Set`/`Temporal`; TypeBox
can't express bigint literals or `RegExp`. A competitor map is partial: any case
key it omits is automatically not-supported.

Typical result (validations/sec) — note the gap widens on complex objects:

```
case                  ts-go-run-types       zod    typebox      ajv
simple_interface                  93M/s     591k/s     61M/s        —
nested_object                     74M/s     456k/s     51M/s        —
discriminated_union               ...
Coverage: ts-go 208/223 · zod 72 · typebox 62 · ajv 31
```

## What runs where

| Inside the image (installed)       | Bind-mounted from the repo at run time                           |
| ---------------------------------- | ---------------------------------------------------------------- |
| zod, @sinclair/typebox, ajv, typia | `benchmarks/src/` (the suite + per-library files)                |
| vite + its toolchain               | `bin/ts-go-run-types` (the Go resolver binary)                   |
| (node_modules, never on the host)  | `packages/ts-go-run-types`, `vite-plugin-runtypes` (first-party) |

ts-go-run-types is special: its validators are generated at **build time** by
`vite-plugin-runtypes`, which spawns the **Go binary**. That's why the container
needs both **vite** (in the image) and the **Go binary** (mounted in) to build
the ts-go-run-types column — the other libraries are plain runtime deps.

## Usage

From the repo root:

```bash
pnpm run bench:prep          # build the Go binary + JS packages on the host (one-time)
pnpm run bench:build-image   # build the podman image
pnpm run bench               # runtime: build + validate + throughput, in the container
pnpm run bench:typecost      # compile-time: TS type-instantiation cost, in the container
```

`bench` prints, per case (grouped by suite/group), a correctness check **and**
validation throughput for every library, then a coverage summary. It exits
non-zero if any _supported_ validator is incorrect, so the run doubles as a
cross-library conformance test. Env knobs: `BENCH_NO_TIMING=1` (correctness
only, fast), `BENCH_TIME_MS=100` (per-cell measurement window).

## Type-checking cost (`bench:typecost`)

A second, orthogonal axis: how expensive each form is for the **TypeScript
compiler** to type-check. Every schema library that recovers a static type
(`Static<typeof schema>` / `z.infer<typeof schema>`) makes the checker _evaluate_
that type at every use site; a plain `type T = …` definition is essentially free.

`bench:typecost` ([`typecost.mjs`](typecost.mjs)) assembles, per case, a tiny
self-contained `.ts` probe per **form**, compiles each in isolation through the
TypeScript compiler API, and reads `program.getInstantiationCount()`
(baseline-subtracted, so the number is the marginal cost for that case). Each
probe **assigns a real value** — `const x: <type> = <the case's first valid
sample, serialized>` — so TypeScript is forced to fully resolve the type **and**
structurally check the value against it (the cost you pay on every
`const x: T = {…}`). A bare `let x!: T` under-counts, because the checker
resolves the type lazily and never does the assignability walk. Forms:

- **ts-go (type)** — `type T = <the TS type>; const x: T = <value>;` (type-definition form)
- **ts-go (schema)** — `const s = RT.…; type T = Static<typeof s>; const x: T = <value>;`
- **zod** — `const s = z.…; type T = z.infer<typeof s>; const x: T = <value>;`
- **typebox** — `const s = Type.…; type T = Static<typeof s>; const x: T = <value>;`
- **ajv** — none (JSON Schema has no static type inference)

The probe sources are **extracted from the real code** (TS compiler API): the
`createValidate<TYPE>()` type arg and `validateSchema`'s `createValidate(RT.…)`
arg from each suite case, and the `c(EXPR)` arg from the competitor maps — and
the assigned value is the case's `getSamples().valid[0]` serialized back to a
literal — so the probe is the exact type/schema the runtime benchmark uses, with
a real value of that type. `BENCH_DUMP=<GROUP.case>` prints a case's four probe
sources verbatim (what actually gets compiled).

Apples-to-apples over the cases all forms support (your DTO type-checks pay this
on every build / in your editor):

```
ts-go(type)      ~5 instantiations/case     # writing the type is ~free
ts-go(schema)   ~400 /case
typebox         ~535 /case
zod             ~786 /case
```

i.e. the type-definition form is ~80–160× cheaper for `tsc` to resolve than any
schema→type form — including ts-go's own value-first schema form. Cases whose
type references globals the pinned TypeScript lacks (e.g. `Temporal`) or that are
inline-recursive without a name report `err` and are excluded from totals.

## Layout

- [`src/suites/validation/`](src/suites/validation/),
  [`src/suites/format-validation/`](src/suites/format-validation/) — the real
  suites, copied verbatim from the package (`src/util/deserializeRTFunctions.ts`
  is an inert stub; the benchmark only calls each case's `validate` thunk).
- [`src/suites/realworld/`](src/suites/realworld/) — a **real-world scenario**
  group: typical relational / CMS / API / form DTOs (`User`, `Order`, `BlogPost`,
  `Product`, a paginated `ProductPage`, a `RegistrationForm`). Authored for the
  benchmark (not vendored) in the same case shape, with full zod/typebox/ajv
  coverage, so it's the most representative head-to-head — it flows through both
  the runtime and typecost benchmarks.
- [`src/suites/adapter.ts`](src/suites/adapter.ts) — flattens both suites to
  `{key, samples, tsValidate}`; `factoryThrows` / unsupported-root cases become
  not-supported.
- [`src/competitors/{zod,typebox,ajv}.ts`](src/competitors/) — partial maps
  keyed by `GROUP.case`; an omitted key is not-supported for that library.
- [`src/run.ts`](src/run.ts) — the runner.

## Adding competitor coverage for a case

Add an entry `'GROUP.case': c(<schema>)` to the relevant
`src/competitors/<lib>.ts` map. Leave it out (or note why) to keep it
not-supported. Run with `BENCH_NO_TIMING=1` and fix any reported mismatch (or
downgrade it to not-supported when the library genuinely diverges from
ts-go-run-types' semantics).

## typia (not currently wired)

Typia, like ts-go-run-types, derives validators from TypeScript types via a
compile-time transform, so it would be the most apt comparison. It is **not** in
the current runner: an attempt to wire `@ryoppippi/unplugin-typia` into the vite
build hit an upstream typia ↔ typescript transformer version conflict (typia's
`FileTransformer` throws against the installed TypeScript). The `BENCH_TYPIA=1`
hook in `vite.config.ts` is left as a placeholder; re-introduce a
`src/competitors/typia.ts` map (a `typia.createIs<T>()` per case) and pin a
compatible `typia` / `typescript` / `@ryoppippi/unplugin-typia` triple to enable
it.

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
