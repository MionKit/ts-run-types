# Fuzzing & hardening

Autonomous, reproducible fuzzing of the runtime validation/serialization
functions. The harness reuses the reflection graph the library already builds:
because every `RunType` is walkable at runtime, the same giant-switch design as
the mock walker drives both _valid_ and _invalid_ data generation, and a small
oracle layer decides when a function misbehaves.

> Status: **Phase 1 (data fuzzing) implemented.** Phase 2 (random TypeScript
> source generation) is specified at the end of this document but not built.

## Why it exists

The validate/serialize functions are exercised by ~3k example-based suite
tests, but those use small, hand-written values. Fuzzing feeds _thousands_ of
randomized values per type into every function and checks invariants that must
hold for **all** inputs. The first run already found and fixed a real bug — see
[Findings](#findings).

## Layout

All under [`packages/ts-go-run-types/test/fuzz/`](../packages/ts-go-run-types/test/fuzz/):

| File                          | Role                                                                                                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seededRng.ts`                | Deterministic PRNG (`mulberry32`) + `withSeededRandom(seed, fn)` — scopes a seeded `Math.random` so a whole run replays from one number.                             |
| `invalidValue.ts`             | The metamorphic **giant switch** — the inverse of `mockType.ts`. Per-kind wrong-value generation + the tandem tree walk that corrupts one provably-invalid position. |
| `fuzzOracle.ts`               | The oracle layer: `FuzzTarget` shape + the O1–O7 invariant checks.                                                                                                   |
| `fuzzRunner.ts`               | The driver: `runFuzz` (fixed iterations) and `runFuzzForDuration` (autonomous soak). Type-blind junk generator.                                                      |
| `*.unit.test.ts`              | Offline unit tests (no Go binary) over hand-built `RunType` graphs.                                                                                                  |
| `fuzz.integration.test.ts`    | End-to-end sweep over REAL compiled functions (needs the plugin + binary).                                                                                           |
| `binaryEncoderResize.test.ts` | Pinned regression for the first finding.                                                                                                                             |

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
  After many small encodes the prediction converges down to ~2× the running
  average, so an above-average string overflowed the buffer and threw
  `RangeError: buffer too small … Call resize() and retry.` instead of growing.
  The encoder now performs that grow-and-retry itself
  ([`createRTFBinary.ts`](../packages/ts-go-run-types/src/createRTFBinary.ts)),
  pinned by `binaryEncoderResize.test.ts`.

## Phase 2 — random TypeScript source generation (not implemented)

Phase 1 fuzzes _values_ against a fixed set of types. Phase 2 would fuzz the
_types_ themselves: generate random but valid TypeScript source (a third giant
switch that emits type declarations + `createX<T>()` call sites), run the whole
pipeline (Go resolver → plugin → runtime), and check the same oracles, catching
resolver/emitter bugs that hand-written fixtures miss.

Sketch:

- A recursive type-shape generator (seeded) emitting `.ts` source: primitives,
  objects, unions, arrays, tuples, optionals, literals, nesting to a depth bound.
- For each generated type, emit `createValidate`/`createMockType`/encoder/decoder
  call sites into a temp fixture, then drive `bin/ts-go-run-types` over it
  (compare against `scripts/dump-test-modules.mjs`, which already spawns the
  binary on a fixture set).
- Oracle: the type must resolve without diagnostics, and the Phase-1 value
  oracles (O1–O7) must hold for the generated type — closing the loop between
  random _types_ and random _values_.
- Run under `runFuzzForDuration` for autonomous soak, logging each failure with
  the generating seed so the offending source regenerates deterministically.
