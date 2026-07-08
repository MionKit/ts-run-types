# Pre-publish e2e — step 2: shared feature app × multi-bundler build matrix

**Status:** todo (not started)
**Created:** 2026-07-08
**Scope:** `container/pre-publish-e2e/` (the consumer fixture) + the shared image
(`container/website/Containerfile`, to bake the builder toolchains). No
package/runtime code.
**Runs inside:** the containerized / host-native e2e harness from
[`prepublish-e2e-1-harness.md`](./prepublish-e2e-1-harness.md) — that spec is
*where the registry + install run*; this one is *what gets built and tested*.
This multi-app build IS the "consumer suite" that harness's
`pnpm rtx release e2e` drives.

> **Pre-publish e2e — 3 units.** ① [harness](./prepublish-e2e-1-harness.md) → **② this: the feature matrix** — build it *on* unit ①'s harness, so **implement after ①**. ③ [staged publish + deploy](./staged-npm-publish-and-deploy.md) is a **separate** track (publish pipeline, not the fixture).

## Context

[`container/pre-publish-e2e/test/e2e.test.ts`](../../container/pre-publish-e2e/test/e2e.test.ts) is a
single smoke: `createValidate<User>()` + `getRunTypeId<User>()` under Vite. It
exercises two of ~14 public feature families through **one** of the **seven**
published bundler adapters. `@ts-runtypes/devtools` ships adapters for
`vite · unplugin · rollup · webpack · rspack · esbuild · rolldown` and lint
transports for `eslint · oxlint` — none of the other six bundlers or the second
linter is exercised end-to-end anywhere.

**Why the e2e is the only place this can be tested:** every source-tree suite runs
the transform against `src/` under the test harness. Only an install-and-build
against the **published** packages, **inside each real bundler**, proves that (a)
the `exports` map resolves the adapter, (b) the plugin resolves + spawns the host
binary and rewrites inside *that* bundler's pipeline, and (c) the injected virtual
modules + tuple wiring **survive that bundler's output** (ESM/CJS conversion,
tree-shaking, minification, code-splitting).

## Architecture — shared app + per-bundler builder apps + build-output tests

Three layers:

```
container/pre-publish-e2e/
  apps/
    shared/                  # THE feature library — all 14 families, ONE copy, consumed as SOURCE
      src/
        validation.ts  json.ts  binary.ts  reflection.ts  formats.ts
        mocking.ts  unknown-keys.ts  markers.ts  standard-schema.ts
        serialization-edge.ts  overrides.ts  types-vs-schemas.ts  enrich/…
        index.ts             # re-exports every feature fn + a selfCheck() runner
    build-vite/              # HEAVY — Vite on Rolldown (rolldown-vite) + oxlint: FULL feature matrix
                             #   → @ts-runtypes/devtools/vite + /oxlint  (the modern, future-proof config)
    smoke-esbuild/           # light — esbuild  → /esbuild  + /eslint  (eslint transport lives here)
    smoke-rollup/            # light — rollup   → /rollup
    smoke-rolldown/          # light — rolldown standalone → /rolldown
    smoke-webpack/           # light — webpack  → /webpack   (droppable if CI wall-clock bites)
    smoke-rspack/            # light — rspack   → /rspack    (droppable if CI wall-clock bites)
  test/
    build-outputs.test.ts    # loads each app's dist + asserts (see "The test")
    rewrite-evidence.test.ts # static asserts over dist bytes
  package.json               # scripts: build:all (build every app), test (assert), lint:all
```

**The shared app is consumed as SOURCE by every builder** (relative import /
tsconfig `paths`, so it is first-party to each build), NOT as a pre-built dist. If
a builder consumed a pre-built shared, the RunTypes transform would have run once,
up front — and we would be testing nothing about that bundler's plugin. The whole
point is that **each bundler's RunTypes plugin transforms the shared source during
that bundler's build.**

### One deep config + light adapter smokes (decided 2026-07-08)

**One HEAVY app runs the full feature matrix: `build-vite` = Vite on Rolldown
(`rolldown-vite`) + oxlint** — the modern, future-proof consumer stack (Vite is
moving to Rolldown; oxlint is the oxc-native linter), so the config most likely to
be the common setup going forward gets the exhaustive coverage.

**Every other adapter gets a LIGHT smoke** — a minimal app (validate + reflection
+ one JSON round-trip) that only proves the adapter loads, transforms, and its
output runs: `smoke-esbuild` (carries the **eslint** transport, so both linters
are covered), `smoke-rollup`, `smoke-rolldown` (the standalone `./rolldown`
adapter — distinct from Vite-on-Rolldown), `smoke-webpack`, `smoke-rspack`. This
keeps the packaging guarantee — **every published adapter is built at least
once** — while paying the full-matrix cost only once, on the modern stack.

`unplugin` is the shared substrate under the six, so it's covered implicitly.
`smoke-webpack`/`smoke-rspack` are the heaviest to spin up; if CI wall-clock
bites, drop them and **log** that `./webpack`/`./rspack` are unexercised (a known,
logged gap — never a silent skip).

## Layer 1 — the shared app implements every feature family

| # | Feature family | What the shared app exercises (happy path + cheap negative) | Public API (`packages/ts-runtypes/src/index.ts`) | Mirror example |
|---|----------------|-------------------------------------------------------------|--------------------------------------------------|----------------|
| 1 | **Validation & errors** | valid→`true`, invalid→`false`; `getValidationErrors` path+message | `createValidate`, `createGetValidationErrors` | `validation-*` |
| 2 | **Types ⇄ Schemas duality** | type-first reflection ≡ value-first `define` builder; `Static<typeof schema>` | `getRunType`, `RunType`, `Static` | `types-vs-schemas-*`, `define-*` |
| 3 | **Reflection / typeIds** | `getRunTypeId` static **and** value-first → same id for equal `T`; `getRunType` walk | `getRunTypeId`, `getRunType`, `RunTypeKind` | `markers-reflection`, `runtype-walk`, `one-type-one-id` |
| 4 | **JSON codec** | round-trip; `clone`/`mutate`/`direct` strategies; `DataOnly` decode | `createJsonEncoder/Decoder` | `json-*` |
| 5 | **Binary codec** | round-trip; sizer; buffer reuse; `DataOnly` decode | `createBinaryEncoder/Decoder`, `createBinarySizer`, `createDataView*` | `binary-*` |
| 6 | **Serialization edge** | circular guard throws; custom class serializer rebuilds instance | `setRejectCircularRefs`, `CircularReferenceError`, `registerClassSerializer` | `serialization-circular`, `custom-class-serializer` |
| 7 | **Unknown-keys family** | has / strip / errors / toUndefined on an object with extras | `createHasUnknownKeys` + the four `create*UnknownKey*` | `unknown-keys-*` |
| 8 | **Type formats** | branded format good/bad; custom `registerFormatPattern`; `createFormatTransform` | `TypeFormat`, `registerFormatPattern`, `createFormatTransform` | `type-formats-*`, `custom-format-pattern` |
| 9 | **Markers** | wrap/parse helper rewritten + runs; comptime literal selects variant; not-triggered stays inert | `InjectRunTypeId`, `InjectTypeFnArgs`, `CompTimeArgs`, `CompTimeFnArgs` | `markers-*` |
| 10 | **Mocking** | `createMockType<T>()` output passes `createValidate<T>()`; options/formats; custom generator | `createMockType`, `registerMockingFunction` | `mocking-*`, `custom-mocking-function` |
| 11 | **Enrichment / FriendlyText** | see **Enrichment** below (higher setup) | `FriendlyText`, `MockData`, `createFriendly`, `createFriendlyI18n` | `3.ai-integration` + enrich skill |
| 12 | **Standard Schema** | `~standard.validate` good→`{value}`, bad→`{issues}`; `runTypeErrorsToIssues` | `createStandardSchema`, `runTypeErrorsToIssues` | `standard-schema` |
| 13 | **Custom pure fn / overrides** | `overrideValidate<T>(fn)` wins; `PureFunction` | the `override*` group, `PureFunction` | `custom-pure-fn` |

Mirror the [`packages/examples/src/guide/`](../../packages/examples/src/guide/)
taxonomy one file per family — those already compile (wired into `typecheck`), so
the shared app is their runtime counterpart against installed packages. Write
**purpose-built** modules that parallel the guide filenames one-to-one; do **not**
import the example files directly — they resolve via tsconfig `paths` to dist, not
the installed package.

**Marker rule (CLAUDE.md):** where a family has two call shapes, the shared app
uses both — `getRunTypeId<T>()` **and** `getRunTypeId(value)`; `getRunType<T>()`
**and** `getRunType(value)`; each `createX` in reflection and value-first form —
with at least one convergence assertion (same id / same verdict).

## Layer 2/3 — the test: build all apps, then assert over the build output

`pnpm --filter …-e2e run build:all` builds every app (each bundler transforms the
shared source through its RunTypes plugin to `apps/<b>/dist`). Then
`pnpm test` runs assertions **over the built artifacts** — four kinds. The HEAVY
`build-vite` app runs **all four across the full matrix**; each light `smoke-*`
app runs (1) + a minimal (2)/(3) over its handful of markers (and (4) only where a
linter is wired):

1. **Build succeeds.** Each bundler + adapter produces output with no error. On
   its own this catches a broken `exports` entry or an adapter that doesn't load —
   the strict superset of the old #14 "does the subpath resolve" smoke.
2. **Runtime behavior.** Load each app's `dist` (node import / evaluate) and call
   the feature functions — validate true/false, codecs round-trip, `typeId` is a
   non-empty string equal across both shapes, mock passes validate, friendly
   message renders. Proves the transform is correct *after* that bundler mangled it.
3. **Rewrite evidence (static).** Grep the dist bytes: no residual un-rewritten
   `getRunTypeId<…>` / `createValidate<…>` markers; the injected cache-id bindings
   / `virtual:rt/*` wiring are present. Proves the plugin actually transformed —
   not silently no-op'd — inside that bundler.
4. **Lint transport.** Run each app's configured linter
   (`@ts-runtypes/devtools/{eslint,oxlint}`) over the shared source and assert
   **one** known RT diagnostic fires (e.g. a `caveats-missing-annotation` case) —
   the transport, not the diagnostic catalog, is what's under test. Covers the
   published lint surface in both linters.

## Where it runs — two independent axes (composition with the sister spec)

The multi-bundler matrix and the per-OS binary check are **separable axes**, and
each belongs where it's cheapest to get real coverage:

- **Bundler/linter-integration axis → runs IN the container (Linux) ONLY
  (confirmed acceptable).** It tests JS toolchain integration + build-output
  survival, which is OS-agnostic (the resolver is pure, `CGO_ENABLED=0`), so
  darwin/windows do NOT repeat it. Running the one heavy app + the light smokes
  once, on Linux, is the right cost. In-container, the fresh `@ts-runtypes/*`
  install comes straight from the in-container verdaccio — no port-publish needed
  for this path.
- **Per-OS binary axis → a lean host-native smoke** (the sister spec's
  host-native consumer: one app, one bundler, built + run natively on
  darwin/windows) covers launcher resolution + binary spawn per OS. The heavy
  bundler matrix does NOT need to repeat on every OS.

So: **local (Mac)** = full matrix in the container + the lean darwin smoke
host-native; **CI** = full matrix on the ubuntu lane, lean smoke on the
darwin/windows lanes.

**Bake the builder toolchains into the shared image** (rolldown-vite, esbuild,
rollup, rolldown, webpack, rspack + eslint/oxlint), exactly like the benchmark competitor
deps — so each e2e run only installs the *changing* `@ts-runtypes/*` from
verdaccio and every stable toolchain is already present. Adding these to the image
means a **republish** (per the image-inputs-changed rule).

## Enrichment sub-fixture (family 11 — highest setup)

`apps/shared/src/enrich/` gets committed `FriendlyText<T>` + `MockData<T>` mirrors
(authored via the **enrich** skill layout: `rt$label` / `rt$errors` / pool keys /
`@rtType`), and each builder's tsconfig gains the enrichment config the plugin
reads (`enrichDir`, the i18n block; the `friendlyErrors` plugin option). Assert
(post-build): `createFriendly` renders a message, `createFriendlyI18n` selects a
second locale + a plural, `createMockType` draws from the pool. Most likely family
to hide a packaging bug in the enrich subtree — worth the extra wiring.

## Acceptance criteria

- [ ] `apps/shared` implements families #1–#13 (+ enrichment), using both marker
      call shapes with convergence assertions.
- [ ] `build-vite` (Vite-on-Rolldown + oxlint) runs the FULL matrix; the light
      `smoke-*` apps build the shared source through esbuild/rollup/rolldown
      (+ webpack/rspack unless trimmed), each wiring its
      `@ts-runtypes/devtools/<adapter>`. Every published bundler adapter built ≥ once.
- [ ] `build:all` green for every app; `test` asserts the full runtime + rewrite
      evidence on `build-vite` and the minimal subset on each smoke; both linters
      exercised (oxlint on `build-vite`, eslint on `smoke-esbuild`).
- [ ] Builder toolchains baked into the shared image; each run installs only the
      fresh `@ts-runtypes/*` from verdaccio.
- [ ] Full matrix runs in the container (Linux); the sister spec's lean host-native
      smoke still gives per-OS binary coverage.
- [ ] On completion, `git mv` this spec to `docs/done/` and note what shipped.
</content>
