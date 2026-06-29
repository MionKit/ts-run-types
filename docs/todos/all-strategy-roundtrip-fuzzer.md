# All-strategy round-trip fuzzer

> **Status: TODO (design note, 2026-06-29).** Spun off while shipping the
> `compact` JSON encoder strategy ([../done/small-json-tuple-strategy.md](../done/small-json-tuple-strategy.md)).
> The existing per-type fuzzer ([packages/ts-runtypes/test/fuzz/type/](../../packages/ts-runtypes/test/fuzz/type/))
> only exercises the DEFAULT JSON strategy (clone encode / strip decode) plus
> binary; it never round-trips through `mutate`, `direct`, or the new `compact`.
> This todo adds a dedicated fuzzer that round-trips a random value through
> EVERY codec/strategy compiled for the same random type and checks they all
> agree.

## Goal

For each iteration:

1. Generate a random type `T` (reuse [core/typeGen.ts](../../packages/ts-runtypes/test/fuzz/core/typeGen.ts)).
2. Generate random data-only value(s) of `T` (reuse `createMockType` / the value
   generators in [value/shapeValue.ts](../../packages/ts-runtypes/test/fuzz/value/shapeValue.ts)).
3. Round-trip each value through every codec/strategy compiled for that SAME `T`:
   - JSON: `clone`, `mutate`, `direct`, `compact`
   - binary
   - native `JSON.stringify` / `JSON.parse` (only where the value is JSON-safe)

Both the random VALUES and the FUNCTIONS (`createValidate`, the encoders, the
decoders) are built from the same randomly generated type per iteration: one
random `T` drives the value generator and every compiled factory.

## Invariants (the oracle)

Per strategy, for each value:

1. **Round-trip identity (on the data-only projection):** `decode(encode(value))`
   deep-equals `value`, ignoring undeclared / extra properties (the data-only
   contract strips them). Reuse the suite's `normalizeForComparison`.
2. **Both ends validate:** the input value AND the round-tripped output both pass
   `isType` = `createValidate<T>()` (true on both ends).
3. **Cross-strategy agreement:** all strategies agree on the decoded data-only
   value, and agree on serialize-vs-`alwaysThrow` (a type one codec refuses, the
   others refuse too, modulo documented per-codec exceptions).

## Open questions

- **Extend or fork the harness.** The `type/` harness already compiles a random
  `T` and wires factories from injected tuples, but it currently emits only the
  default JSON strategy and asserts a fixed fn-site count (`EXPECTED_FN_SITES`).
  Decide whether to extend it (add the strategy call sites + `byFamily` keying)
  or build a parallel harness focused on the all-strategy matrix.
- **"Ignore extra props" comparison.** Reuse `normalizeForComparison` from the
  serialization suite util.
- **Seed / soak wiring.** Reuse [core/seededRng.ts](../../packages/ts-runtypes/test/fuzz/core/seededRng.ts)
  and the existing soak harness so a failing seed is reproducible.
- **alwaysThrow types.** When a codec legitimately `alwaysThrow`s for a given `T`
  (a non-serializable root, etc.), skip that strategy for that type rather than
  treating it as a violation, matching how the existing oracles handle it.

## Acceptance

- A new fuzz integration test (under [packages/ts-runtypes/test/fuzz/](../../packages/ts-runtypes/test/fuzz/))
  round-trips random values through clone / mutate / direct / compact / binary
  for the same random type and finds zero oracle violations over a seeded corpus.
- `git mv` this file to [../done/](../done/) (or [../partially/](../partially/)) on ship.
