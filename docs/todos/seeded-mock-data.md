# Seeded, repeatable mock data (`createMockData({ seed })`)

Status: **READY.** New feature. Planned for the next release.

## Problem

`createMockData<T>()` produces fresh random values on every call, built on
`Math.random()` and `crypto.randomUUID()`. Test environments that rely on
repeatability (snapshot tests, deterministic fixtures, reproducible failures)
have no way to pin the output. We want an optional `seed` on the mock options
that guarantees the same seed always yields the same generated value, for every
type. When no seed is passed, behavior is unchanged (native randomness).

## Plan

### 1. Write a seeded PRNG in JS

Neither `Math.random`, `crypto.getRandomValues`, nor `crypto.randomUUID` accept
a seed, so we need our own generator. Implement a small, well-known,
deterministic 32-bit PRNG (e.g. **mulberry32** or **sfc32**, with a
splitmix-style seed expansion so a single integer seed produces a good initial
state). It only needs to be repeatable and reasonably distributed, not
cryptographic. It will be slower than `Math.random()`; that is acceptable and
only on the seeded path.

New file, e.g. `packages/ts-runtypes/src/mocking/mockRandom.ts`.

### 2. A random class that switches native vs seeded

Create a `MockRandom` class exposing every random operation the mock library
needs (float `[0,1)`, int-in-range, pick-item-from-list, boolean, bigint,
string chars, uuid v4/v7, date, etc.):

- **No seed** (`new MockRandom()`) — each method delegates to the native source
  (`Math.random()`, `crypto.randomUUID()`, `new Date()`). Existing behavior,
  zero change.
- **Seed passed** (`new MockRandom(seed)`) — each method draws from the PRNG
  from step 1 and builds values deterministically.

Determinism nuances to handle in the class (call these out in the
implementation, they are the easy-to-miss parts):

- **UUID under a seed** — build the 16 bytes from PRNG output, then set the
  version/variant bits (v4: version nibble `4`, variant `8/9/a/b`). Do not call
  `crypto.randomUUID()` on the seeded path.
- **UUID v7 timestamp** — v7 embeds a real millisecond timestamp; a real clock
  is not repeatable. On the seeded path derive the timestamp deterministically
  (fixed base epoch + PRNG-derived offset), or the v7 mocks won't repeat. See
  `randomUUIDv7()` in
  [mockStringFormat.ts:173](../../packages/ts-runtypes/src/mocking/mockStringFormat.ts).
- **Time-based mocks** — `mockDate`'s default `maxDate = new Date()`
  ([mockUtils.ts:55](../../packages/ts-runtypes/src/mocking/mockUtils.ts)) and
  Temporal/date-bound mocks read the current clock. Under a seed these defaults
  must become deterministic (fixed reference time) too, else Date/Temporal
  values still drift.
- **Draw-order dependence** — seeded output depends on the exact order of PRNG
  draws, so a later refactor that reorders `random()` calls changes the output.
  The repeatability tests (below) are what pin this; note it in a comment.

### 3. Thread the seed from mock options into every random call

- Add `seed?: number` to `MockOptions`
  ([mockTypes.ts](../../packages/ts-runtypes/src/mocking/mockTypes.ts)) with a
  default of `undefined` in
  [constants.mock.ts](../../packages/ts-runtypes/src/mocking/constants.mock.ts),
  and surface it on the public `RunTypeMockOptions` so callers can pass
  `createMockData(schema, { mock: { seed: 123 } })`.
- Construct one `MockRandom` from `mockOptions.mock.seed` when the merged
  options are built (`mergeMockOptions` /the factory closure in
  [createMockData.ts](../../packages/ts-runtypes/src/mocking/createMockData.ts))
  and carry the instance on the options object. `MockOptions` already threads
  through `mockRunType` → `mockSwitch` → the per-kind mock fns
  ([mockType.ts](../../packages/ts-runtypes/src/mocking/mockType.ts)), so the
  instance rides along for free — prefer this over a module-level ambient
  singleton (reentrancy: nested/concurrent `createMockData` calls must not share
  a cursor). If threading the instance through every helper signature is too
  invasive, a per-invocation context set at the top of the factory call is the
  fallback, but keep it call-scoped, not module-global.
- Replace the direct `Math.random()` / `crypto` calls with calls on the
  `MockRandom` instance. Every site to migrate — the core primitives in
  [mockUtils.ts](../../packages/ts-runtypes/src/mocking/mockUtils.ts) (`random`,
  `randomItem`, `mockBoolean`, `mockBigInt`, `mockNumber`, `mockString`,
  `mockSymbol`, `mockRegExp`, `mockDate`, `mockAny`), plus the format/edge mocks
  that call randomness directly: `mockStringFormat.ts` (uuid v4/v7),
  `mockNumberFormat.ts`, `mockBigIntFormat.ts`, `mockTemporal.ts`,
  `mockDateTimeBounds.ts`, `mockInvalid.ts`, `mockOversized.ts`,
  `binarySize.ts`. Grep `Math.random\|randomUUID\|crypto\.` under
  `packages/ts-runtypes/src/mocking/` to confirm the full list before starting;
  a single missed site silently breaks repeatability for that type.
- `randomItem` over MockData enrichment pools must also draw from the seeded
  instance so pool selection is deterministic.

## Tests (repeatability across multiple types)

Add a Vitest suite under
[packages/ts-runtypes/test/](../../packages/ts-runtypes/test/) (or the mocking
test area) asserting:

- **Same seed ⇒ identical output** for a spread of kinds: primitive
  (number, string, bigint, boolean), uuid v4 **and** v7, date/temporal, array,
  object, discriminated union, and a nested/composite type. Two `createMockData`
  calls with the same seed produce deep-equal values.
- **Different seed ⇒ different output** (probabilistically; assert not-equal on
  a type with enough entropy).
- **No seed ⇒ still random** — two no-seed calls differ (guards against
  accidentally defaulting the seed to a constant).
- **Option merge** — seed honored from both the factory options and the
  per-call options, with call overriding factory (matches the existing
  call < factory < defaults merge in `mergeMockOptions`).
- Cover both `createMockData` shapes where natural: schema-first
  (`createMockData<T>(schema, …)`) and value-first (`createMockData(value, …)`).

## Docs

- Document `seed` in the createMockData API reference and the website mocking
  docs ([container/website/content/](../../container/website/content/), plain
  voice, no em-dashes). A one-line example: pass `seed` for reproducible
  fixtures.
- If the enrichment/mocking skill docs
  ([packages/ts-runtypes/skills/](../../packages/ts-runtypes/skills/)) describe
  mock options, add `seed` there too.

## Done when

- `createMockData(schema, { mock: { seed } })` is deterministic for every type
  above; no-seed behavior is byte-for-byte unchanged.
- No remaining direct `Math.random` / `crypto` call on the mock path bypasses
  `MockRandom`.
- Repeatability suite + existing mock tests green (`pnpm test`); docs updated.
</content>
