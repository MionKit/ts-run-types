# Validation benchmarks — per-competitor isolated builds (podman)

Compares **RunTypes** validators against **zod**, **typebox**, **ajv**
and **typia**, over the **full** `validation` + `format-validation` + `realworld`
suites (263 cases — the exact cases the package tests itself with, plus a
real-world DTO group). All heavy tooling (the validator libraries, vite, typia's
tsgo transform) lives **only inside a podman image** — the host never installs it.

## Architecture — every competitor is its own isolated build

Each competitor is a **standalone pnpm project**: its own `package.json` (under
[`_deps/competitors/<name>/`](_deps/competitors/)) → its own `node_modules`, with
its source under [`competitors/<name>/`](competitors/), its own build and its own
`dist/run.mjs`, run as its own process
writing [`results/<name>.json`](results/). [`aggregate.mjs`](aggregate.mjs) then
joins those per-competitor results by case key into one comparison table.

```
competitors/<name>/  cases.ts ── (the validators) ─┐
shared/cases/    ────  the 263 cases (samples + metadata, ZERO library deps)
shared/harness/  ────  runCompetitor() + writeResult()  ──> results/<name>.json
                                                             aggregate.mjs ──> table
```

This isolation is the whole point:

- **One competitor can never break another.** typia's heavier / more fragile
  tree (its tsgo transform: `ttsc` + `@ttsc/unplugin` + `@typescript/native-preview`)
  installs into *its own* `node_modules`; a fresh, supply-chain-blocked, or broken
  dep there can't abort zod/typebox/ajv/ts-go. Each competitor installs in its own
  `Containerfile` layer with its own pnpm store cache.
- **RunTypes is just another competitor.** Its `cases.ts` is a
  `CompetitorCases` map like everyone else's; the runner has no ts-go branch. The
  only thing special about it is *build* mechanics — its validators are generated
  at build time by `vite-plugin-runtypes` spawning the **Go binary**, so that
  binary + the first-party packages are bind-mounted into its `node_modules` at run
  time (see [`scripts/benchmarks.sh`](../scripts/benchmarks.sh) `mount_args`).

## Totality — a validator **or** an explicit not-supported, for every case

The shared cases (`shared/cases`) carry only **samples + metadata** — no library
imports. Each competitor's [`cases.ts`](competitors/zod/cases.ts) is a **total**
`Record<CaseKey, CaseEntry>`: every case key maps either to a lazy validator
builder `() => (v) => boolean` **or** to the `NOT_SUPPORTED` sentinel. The
`CaseKey` union is derived from the suite objects
([`shared/cases/index.ts`](shared/cases/index.ts)), so **TypeScript fails the
build if a competitor omits any case** — that is the "function or explicit
not-supported, for every case" guarantee. There are no silent gaps.

The runner ([`shared/harness/runner.ts`](shared/harness/runner.ts)) builds each
validator, then checks correctness against the case's valid/invalid samples and
measures throughput. A builder that **throws** is a hard `errored` (a broken
plugin rewrite for ts-go, a broken schema for the rest) — surfaced loudly, never
hidden as not-supported.

Typical coverage (validations/sec; the gap widens on complex objects):

```
case                  ts-runtypes       zod    typebox      ajv      typia
simple_interface              107M/s     646k/s     93M/s        —          —
nested_object                  78M/s     481k/s     69M/s        —          —
user (realworld)               63M/s     337k/s     50M/s     24M/s      68M/s

Coverage (of 263):
  ts-runtypes   ok=260   not-supported=3
  zod               ok=118   not-supported=145
  typebox           ok=96    not-supported=167
  ajv               ok=67    not-supported=196
  typia             ok=40    not-supported=223
```

Why the competitors are not-supported on so many: JSON Schema (ajv) has no
`bigint`, can't reject `NaN`/`Infinity`, can't validate `Date`/`Map`/`Set`/`Temporal`;
TypeBox can't express bigint literals or `RegExp`; zod has no compile-time type
recovery for many TS-only constructs; typia's runtime semantics diverge on a
handful of shapes (see below). RunTypes is not-supported only on the three
cases that are intrinsically un-validatable (bare `symbol` at a root, etc.).

## typia — wired via the tsgo transform

typia, like RunTypes, derives validators from TypeScript **types** at
build time, so it is the most apt comparison. This project runs on tsgo
(typescript-go / `@typescript/native-preview`), and typia's tsgo path is the
`samchon/ttsc` toolchain — typia ships a **Go-native transform** that plugs into
`ttsc`. (The older `@ryoppippi/unplugin-typia` is archived and has no tsgo
support.) Because bundlers bypass the `ttsc` CLI, the typia competitor drives the
same transform through `@ttsc/unplugin`'s esbuild adapter and bundles to one
`dist/run.mjs` — see [`competitors/typia/esbuild.config.mjs`](competitors/typia/esbuild.config.mjs)
(it also documents the one esbuild quirk it works around: stripping typia's
`: input is T =>` return-predicate annotations before esbuild parses).

The first build compiles typia's native plugin once (~200s, "once per cache key")
via ttsc's own embedded Go toolchain. Since the image is deps-only (no source at
build time), this compile happens on the **first run that includes typia** rather
than at image build, writing into a persisted named volume (`competitors/typia/node_modules/.ttsc`)
so every later run reuses it; `pnpm run bench:clean` drops the volume.

typia entries copy the per-case literal `T` verbatim from the ts-go competitor
(the type must be written at the `createIs<T>()` call site, like ts-go's
`createValidate<T>()`). A case is supported only when typia can express the type
**and** its runtime semantics match the shared samples; the divergences that force
`NOT_SUPPORTED` are documented inline in
[`competitors/typia/cases.ts`](competitors/typia/cases.ts) — e.g. `createIs<number>()`
accepts `NaN`/`Infinity`, `Date` is an `instanceof` check, and a string index
signature accepts an explicit-`undefined` property value (`{a: undefined}`).

## What runs where

The image is **deps-only**: it bakes per-competitor `node_modules` (from the
manifests in [`_deps/`](_deps/)) and nothing first-party. ALL benchmark source —
the shared suite, every competitor's source files, `typecost/`, `aggregate.mjs` —
is bind-mounted at run time (`scripts/benchmarks.sh:mount_args`), so an image is
invalidated only when a dependency manifest changes.

| Inside the image (deps only)                           | Bind-mounted from the repo at run time                     |
| ------------------------------------------------------ | ---------------------------------------------------------- |
| zod · @sinclair/typebox · ajv · typia · vite · esbuild | every competitor's source files + `shared/` + `typecost/` source |
| each competitor's `node_modules` + `package.json`      | `bin/ts-runtypes` + `packages/*` (ts-go competitor only) |
| typia's `.ttsc` compile cache → a persisted named volume | writable `results/` (so each `<name>.json` survives `--rm`) |

## Usage

From the repo root:

```bash
pnpm run bench:prep            # build the Go binary + first-party JS packages on the host (one-time)
pnpm run bench                 # build + validate + throughput for EVERY competitor + aggregate
pnpm run bench:one zod         # the same for a SINGLE competitor (fastest verification loop)
pnpm run bench:typecost        # compile-time: per-competitor TS type-instantiation cost
pnpm run bench:smoke           # quick: build every competitor's dist (no run)
# --- image publishing (maintainer) ---
pnpm run bench:build-image     # build the podman image locally (per-competitor installs)
pnpm run bench:login           # log in to GHCR (needs a PAT; see SETUP.md)
pnpm run bench:push            # build + push the multi-arch image to GHCR
pnpm run bench:pull            # pull the published image and tag it locally
```

The run commands **pull the latest published `ghcr.io/mionkit/tsrt-bench:latest`
by default** (cheap no-op when current), falling back to a local build when the
registry is unreachable. Set `BENCH_USE_LOCAL=1` to build/use a local image
(offline, or to test a dep bump before pushing). typia's native plugin is no
longer pre-warmed at build time — the first `BENCH_TYPIA=1` run compiles it
(~200s) into a persisted named volume that later runs reuse (`bench:clean` drops it).

`bench` runs each competitor in its **own `--rm` container** (strongest
isolation), then `aggregate.mjs` prints the table + coverage. It exits non-zero if
any competitor has a `fail`/`errored` case, so the run doubles as a cross-library
conformance test. Each run also **publishes** the per-competitor JSON into the
canonical `<repo>/.docdata/benchmarks/` dir, which the docs website mounts
read-only (`MION_DOCDATA`) to build benchmark docs from. Env knobs: `BENCH_NO_TIMING=1` (correctness only, fast),
`BENCH_TIME_MS=100` (per-cell window). typia runs **by default** now that each
competitor installs in isolation; a failed typia build degrades gracefully (its
column is left blank that run). Set `BENCH_NO_TYPIA=1` to skip it on a host where
its native plugin won't build.

## Type-checking cost (`bench:typecost`)

A second, orthogonal axis: how expensive each form is for the **TypeScript
compiler** to type-check. Every schema library that recovers a static type
(`Static<typeof schema>` / `z.infer<typeof schema>`) makes the checker *evaluate*
that type at every use site; a plain `type T = …` definition is essentially free.

[`typecost/typecost.mjs`](typecost/typecost.mjs) assembles, per case, a tiny
self-contained `.ts` probe per **form**, compiles each in isolation through the
TypeScript compiler API, and reads `program.getInstantiationCount()`
(baseline-subtracted, so the number is the marginal cost for that case). Each
probe **assigns a real value** — `const x: <type> = <the case's first valid
sample>` — so TypeScript fully resolves the type **and** structurally checks the
value against it (the cost you pay on every `const x: T = {…}`). Forms, extracted
per-competitor from each competitor's own files:

- **ts-go (type)** — `competitors/ts-runtypes/cases.ts` `createValidate<TYPE>()` type arg.
- **typia** — `competitors/typia/cases.ts` `typia.createIs<TYPE>()` type arg (format suites use typia tag intersections, e.g. `string & tags.MaxLength<5>`).
- **ts-go (schema)** — `competitors/ts-runtypes/schemaCases.ts` `createValidate(EXPR)` arg.
- **zod / typebox** — `competitors/<name>/cases.ts` schema expressions.
- **ajv** — none (JSON Schema has no static type inference).

ts-go(type) and typia are both **pure-type** forms — the cost is just resolving
the literal `T` the developer writes (no schema object, no runtime transform
involved in type-checking). They diverge only where typia expresses a constraint
as a tag intersection rather than a mion `Format*` brand, and over the differing
subset of cases each supports.

```
ts-go(type)      ~4 instantiations/case     # writing the type is ~free
typebox        ~219 /case
ts-go(schema)  ~546 /case
zod            ~619 /case
```
(apples-to-apples averages over the cases all forms support; run `bench:typecost`
for the live typia column.)

i.e. the type-definition form is ~55–155× cheaper for `tsc` to resolve than any
schema→type form — including ts-go's own value-first schema form. Adding a
competitor automatically extends typecost; it is a separate command, never gating
the runtime benches.

**Value forcing vs. broader accepted sets.** A few forms intentionally accept a
wider value set than their *static* type — ts-go's `noLiterals` option (the type
stays the literal `2`, but any number validates) and the serializable-only
validate contract (a function/method member is dropped, so the data sample omits
it). For those the chosen sample need not satisfy `T`, so the probe falls back to
**declare-only** (`let x!: T`) and measures pure type-resolution cost. A genuine
type error (a name the type can't resolve, an excessively-deep instantiation —
e.g. typebox on a circular tuple) still fails and reports `err`, excluded from
totals; the full `err` detail (case · form · first TS message) prints after the
table.

**Inspection knobs.** `BENCH_CASE=<substr>` restricts **both** the runtime bench
and typecost to cases whose dotted key contains the (case-insensitive) substring —
run **one case across every library** to compare/diagnose it. A filtered run prints
to the console and does **not** rewrite the results JSON (nor aggregate or publish
to `.docdata`), so a per-case iteration loop never clobbers the published full-suite
results. `BENCH_DUMP=<exact.key>` is typecost-only: it prints the assembled probe
sources for one case and exits. All are forwarded into the container:

```bash
BENCH_CASE=atomic_union pnpm bench           # runtime throughput, every competitor, one case
BENCH_CASE=atomic_union pnpm bench:typecost  # type-instantiation cost, every form, one case
BENCH_DUMP=UNION.atomic_union pnpm bench:typecost
```

After a filtered iteration loop, run the **full** `pnpm bench` / `pnpm
bench:typecost` (no `BENCH_CASE`) once to refresh the canonical results JSON.

## Layout

```
shared/
  cases/{validation,format-validation,realworld}/  the 263 cases (samples + metadata, no library deps)
  cases/index.ts                                    the CaseKey union (drives totality) + iterateCases()
  harness/{types,measure,runner,result}.ts          the generic, competitor-agnostic run loop
competitors/<name>/        (source only on the host — bind-mounted at run time)
  cases.ts          total Record<CaseKey, CaseEntry> — a builder or NOT_SUPPORTED per case
  main.ts           runCompetitor({name, cases}) → writeResult() → results/<name>.json
  tsconfig.json     extends ../../tsconfig.base.json
  vite.config.ts    per-competitor build (typia uses esbuild.config.mjs instead)
  (ts-go also: schemaCases.ts for the typecost schema column; setup.ts registers format patterns)
_deps/                     (package-manager files only — kept out of the source dirs so
  pnpm-workspace.yaml      no one can `pnpm install` at a competitor dir; COPYed into the image)
  .npmrc
  competitors/<name>/package.json   ONLY that competitor's deps (isolation)
  typecost/package.json
typecost/typecost.mjs   per-competitor type-instantiation cost
aggregate.mjs           results/*.json → comparison table + coverage; sets the exit code
```

## Adding competitor coverage for a case

Edit the relevant `competitors/<name>/cases.ts`: change a `NOT_SUPPORTED` entry to
a builder `() => { const s = <schema>; return (v) => <validate>(v, s); }` (the
`CaseKey` union catches typo'd keys at compile time). Run `pnpm run bench:one
<name>` with `BENCH_NO_TIMING=1` and fix any reported mismatch — or downgrade it
back to `NOT_SUPPORTED` (with a one-line reason) when the library genuinely
diverges from RunTypes' semantics. To add a whole new competitor, copy a
`competitors/<name>/` source folder, add its `package.json` under
`_deps/competitors/<name>/`, write a total `cases.ts`, add a COPY+install layer
to [`Containerfile`](Containerfile), and add it to `competitor_list()` in
`scripts/benchmarks.sh`.

## Behind a corporate / MITM proxy

The image build must trust the proxy CA to install deps over TLS. When
`BENCH_CA_CERT` is unset, the script auto-detects host CA certs in
`/usr/local/share/ca-certificates` and trusts them in the image; pass it
explicitly (file or dir) to override, and point the build at the proxy network:

```bash
BENCH_CA_CERT=/usr/local/share/ca-certificates \
BENCH_BUILD_NETWORK=host \
  pnpm run bench:build-image
```

The Go binary + first-party packages are built on the host by `bench:prep` and
mounted in, so the benchmark **run** itself needs no network.
```
