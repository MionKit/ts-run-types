# Fuzzing & hardening

Autonomous, reproducible fuzzing of the runtime validation/serialization
functions. The harness reuses the reflection graph the library already builds:
because every `RunType` is walkable at runtime, the same giant-switch design as
the mock walker drives both _valid_ and _invalid_ data generation, and a small
oracle layer decides when a function misbehaves.

> Status: **Phase 1 (data fuzzing) AND Phase 2 (random type generation)
> implemented.** Phase 1 fuzzes values against a fixed set of types; Phase 2
> fuzzes the types themselves. See [Phase 2](#phase-2--random-typescript-type-generation-implemented).

## Why it exists

The validate/serialize functions are exercised by ~3k example-based suite
tests, but those use small, hand-written values. Fuzzing feeds _thousands_ of
randomized values per type into every function and checks invariants that must
hold for **all** inputs. The first run already found and fixed a real bug — see
[Findings](#findings).

## Layout

All under [`packages/ts-go-run-types/test/fuzz/`](../packages/ts-go-run-types/test/fuzz/):

| File                           | Role                                                                                                                                                                 |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seededRng.ts`                 | Deterministic PRNG (`mulberry32`) + `withSeededRandom(seed, fn)` — scopes a seeded `Math.random` so a whole run replays from one number.                             |
| `invalidValue.ts`              | The metamorphic **giant switch** — the inverse of `mockType.ts`. Per-kind wrong-value generation + the tandem tree walk that corrupts one provably-invalid position. |
| `fuzzOracle.ts`                | The oracle layer: `FuzzTarget` shape + the O1–O7 (value) and TR1–TR4 (resolver/emit) invariant checks.                                                               |
| `fuzzRunner.ts`                | The Phase-1 driver: `runFuzz` (fixed iterations) and `runFuzzForDuration` (autonomous soak). Type-blind junk generator.                                              |
| `*.unit.test.ts`               | Offline unit tests (no Go binary) over hand-built `RunType` graphs + the Phase-2 generator/value layers.                                                             |
| `fuzz.integration.test.ts`     | Phase-1 end-to-end sweep over REAL compiled functions (needs the plugin + binary).                                                                                   |
| `binaryEncoderResize.test.ts`  | Pinned regression for the first finding.                                                                                                                             |
| `typeGen.ts` _(Phase 2)_       | The THIRD giant switch — a seeded recursive generator of random serialisable type SHAPES + a renderer to `.ts` source.                                               |
| `shapeValue.ts` _(Phase 2)_    | Shape→value: a conforming value for any shape, and a sound one-position corruption (mirrors invalidValue.ts's contract).                                             |
| `typeFuzzHarness.ts` _(Ph 2)_  | Drives generated source through the resolver (`--inline-server`) → entry modules → REAL runtime functions; records the resolver/emit observations.                   |
| `typeFuzzRunner.ts` _(Ph 2)_   | The Phase-2 driver: `runTypeFuzz` / `runTypeFuzzForDuration` — Tier-A (resolver/emit) + Tier-B (value) oracles per generated type.                                   |
| `typeFuzz.integration.test.ts` | Phase-2 end-to-end sweep over generated TYPES (needs the binary).                                                                                                    |

## Data generation — three streams

Everything draws from a seeded `Math.random`, so each iteration is reproducible
from its `seed`.

1. **Valid** — `createMockType<T>()`. Valid by construction; the strong oracles
   expect acceptance / round-trip equality.
2. **Invalid** — `mutateToInvalid(schema, validMock)`. Takes a valid mock and
   corrupts exactly one position to a wrong type. Invalid by construction; the
   oracle expects rejection.
3. **Junk** — `randomJunk()`. Type-blind random values (bounded depth, acyclic).
   Validity is unknown, so only the robustness/consistency oracles apply.

### The giant switch (`invalidForKind`)

Mirrors `mockSwitch` in `mockType.ts`: one `case` per `RunTypeKind`. What counts
as "wrong" depends entirely on the node, so each case returns a value of a
**disjoint** type (a `'123'` string for `number` probes loose coercion) plus a
`proven` flag.

`proven` is `false` exactly where a value _can't_ be shown invalid in isolation:
`any` / `unknown` (accept everything) and bare `union` (a sibling branch may
re-accept). Those are never used as corruption sites.

### Soundness contract (one-directional)

> When `mutateToInvalid` returns a value, `validate<T>` on it MUST be `false`.

The tandem walker is deliberately conservative — it never descends through
`union`, `any`, `unknown`, index signatures, or Map/Set internals, where a
sibling or catch-all could re-accept the corruption. A false **negative**
(returning `null` when a deeper mutation was possible) only costs coverage; a
false **positive** would produce a spurious oracle failure. Same shape as the
noop-predicate contract in the serializer.

## The oracle layer

Fuzzing is only as good as its oracle. We derive invariants from properties the
library must uphold, never from hand-written expected outputs:

| Id     | Class       | Invariant                                                     |
| ------ | ----------- | ------------------------------------------------------------- |
| **O1** | strong      | `validate(mock)` is `true`                                    |
| **O2** | strong      | `validate(corrupted-mock)` is `false`                         |
| **O3** | robustness  | `validate(anything)` returns a boolean, never throws          |
| **O4** | consistency | `validate(x)` ⇔ `getValidationErrors(x).length === 0`         |
| **O5** | strong      | JSON wire is stable: `encode(decode(encode v)) === encode(v)` |
| **O6** | strong      | binary wire is byte-stable through `decode∘encode`            |
| **O7** | robustness  | `encode(valid)` does not throw and yields a wire value        |

O5/O6 compare the **wire image** (`encode∘decode∘encode === encode`) rather than
value equality, which sidesteps the optional-`undefined`-key vs dropped-key
mismatch the mock produces. O4 is a cheap, powerful cross-check: the two
validation functions disagreeing is almost always a bug.

## Running

```bash
# offline unit tests — pure logic, no Go binary needed
pnpm run fuzz:unit

# end-to-end sweep over compiled functions (builds binary + plugin first)
pnpm run fuzz

# autonomous soak: fuzz for 60s, log every finding (set FUZZ_SOAK_MS / FUZZ_SEED)
pnpm run fuzz:soak

# Phase 2 — generate random TYPES and sweep both oracle tiers (builds binary first)
pnpm run fuzz:types

# Phase 2 autonomous soak (set FUZZ_TYPES_SOAK_MS / FUZZ_SEED)
pnpm run fuzz:types:soak
```

Reproducing a reported violation: every `Violation` carries the `seed` that
produced it. `withSeededRandom(seed, …)` (or `runFuzz(targets, {seed})`) replays
the exact same data.

Adding a target: in `fuzz.integration.test.ts`, build a concretely-typed
`const schema = RT.…` and wire the `createX(schema)` factories into a
`FuzzTarget`. The plugin resolves each `createX` **statically from its argument
type**, so the schema must be a concrete `const` — never a generic `RunType`
parameter passed through a helper (that injects the `unknown` runtype).

## Findings

- **Binary encoder buffer overflow on valid data** (fixed). `createBinaryEncoder`
  owns its serializer and sizes it from adaptive history (`predictBufferSize`).
  After many small encodes the prediction converged down toward the running
  mean, so an above-average string overflowed the buffer and threw
  `RangeError: buffer too small … Call resize() and retry.` instead of growing.
  Fixed in two steps: the serializer's writers now GROW IN PLACE (no throw, no
  re-encode) and the size predictor moved from a mean-EMA to Welford
  mean + k·σ. See
  [`docs/binary-buffer-sizing.md`](./binary-buffer-sizing.md); pinned by
  `binaryEncoderResize.test.ts`.

## Phase 2 — random TypeScript type generation (implemented)

Phase 1 fuzzes _values_ against a fixed set of types. Phase 2 fuzzes the _types_
themselves: it generates random but valid TypeScript source (the THIRD giant
switch — type declarations + `createX<T>()` call sites), runs the whole pipeline
(Go resolver → plugin → runtime), and checks both the resolver/emit behaviour
and the same value oracles, catching resolver/emitter bugs hand-written fixtures
miss.

### The third giant switch

[`typeGen.ts`](../packages/ts-go-run-types/test/fuzz/typeGen.ts) generates an
abstract `TypeShape` (one variant per serialisable RunType kind) seeded from
`Math.random`, then renders it to a TS type expression. The space:

- primitives (`number` / `string` / `boolean` / `bigint` / `null`), `Date`,
- string/number/boolean literals,
- arrays, tuples, objects with optional + non-identifier-keyed properties,
- three value-disjoint union flavours (distinct literals; distinct primitive
  kinds; tagged objects with a discriminant literal),
- nesting to a depth/breadth bound.

The space is **deliberately data-only** (no functions / methods / symbols /
index signatures): those silently drop under the validate / JSON / binary
contracts, which would turn a strong oracle into a false positive.

### Two streams, generated from the shape

Because we already hold the abstract shape, both value streams come straight
from it ([`shapeValue.ts`](../packages/ts-go-run-types/test/fuzz/shapeValue.ts)) —
no dependency on `createMockType`:

1. **Valid** — `validValue(shape)`: a conforming value (finite numbers, valid
   `Date`s, sometimes-omitted optionals).
2. **Invalid** — `corruptValue(shape, valid)`: clones the value and replaces ONE
   position with a value of a disjoint kind. Same one-directional soundness
   contract as `invalidValue.ts`: never descends through a `union` (a sibling
   could re-accept), so a returned corruption is always rejected.

### The pipeline harness

[`typeFuzzHarness.ts`](../packages/ts-go-run-types/test/fuzz/typeFuzzHarness.ts)
turns a shape into REAL compiled runtime functions, reusing the vite-plugin test
helpers ([`helpers/inline.ts`](../packages/vite-plugin-runtypes/test/helpers/inline.ts)):

1. render the `.ts` fixture (one call site per family + a `getRunTypeId<T>()`
   reflection site),
2. push it to a persistent `--inline-server` `ResolverClient` via `setSources`
   (atop the `RUNTYPES_DTS` ambient overlay — a small inferred Program, no
   node_modules), then `scanFiles` with `includeEntryModules`,
3. `evalEntryModules` executes the emitted per-entry virtual modules into their
   positional tuples,
4. each fn tuple is passed as the injected id to the REAL factory
   (`createValidate(undefined, undefined, tuple)` → `initFromTuple` links the
   whole dependency closure into the live `rtUtils`, exactly as a rewritten call
   site would).

### Two oracle tiers

[`typeFuzzRunner.ts`](../packages/ts-go-run-types/test/fuzz/typeFuzzRunner.ts)
checks, per generated type:

| Tier  | Id      | Invariant                                                                                                                        |
| ----- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **A** | **TR1** | resolver doesn't crash + no Error-severity diagnostics                                                                           |
| **A** | **TR2** | every `createX<T>()` resolved to a site (6 fn + 1 reflection)                                                                    |
| **A** | **TR3** | every demanded entry module evaluates (emitted factory code is valid JS, no dangling ref)                                        |
| **A** | **TR4** | the real `createX` factories materialise from the tuples                                                                         |
| **B** | O1–O7   | the Phase-1 value oracles hold for the generated type (valid accepted, corruption rejected, JSON/binary wire-stable, junk total) |

Tier A alone catches resolver panics, malformed emit (invalid JS), and dangling
cache refs; Tier B closes the loop between random _types_ and random _values_,
reusing the Phase-1 `fuzzOracle.ts` checks verbatim.

Each iteration seeds `genShape` and the value stream from one number (the
resolver step between them is deterministic from the shape), so a reported
violation replays the exact type AND values from its `seed`.

### Known limitations / future kinds

- The live `rtUtils` registry accumulates across a long soak (every distinct
  generated type registers its closure once); fine for time-bounded runs.
- Not yet generated: intersections, `Record`/index signatures, enums, classes,
  recursive (named self-referential) types, branded `TypeFormat` primitives.
  Each is a natural new arm of `typeGen.ts` + `shapeValue.ts`.
