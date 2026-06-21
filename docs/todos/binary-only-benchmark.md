# Binary-only benchmark — compare the four `sizeStrategy` modes

> **Status: TODO.** Follows the sizing redesign shipped in
> [docs/done/binary-encoder-sizing-redesign.md](../done/binary-encoder-sizing-redesign.md)
> and [docs/done/binary-sizing-modes.md](../done/binary-sizing-modes.md).

## Goal

A benchmark dedicated to the binary codec that measures each
`createBinaryEncoder` **sizing strategy** against the others on the same shapes
and values: `dynamic` (default), `precalculate`, `initialSize`, `intoBuffer`.

Today no benchmark passes a `sizeStrategy` at all — both
[binaryWire.bench.test.ts](../../packages/ts-runtypes/test/bench/binaryWire.bench.test.ts)
and the container serialization suites
([gen-serialization-bench.mjs](../../scripts/gen-serialization-bench.mjs),
`container/benchmarks`) only ever exercise the default `dynamic` path. So the
relative cost of the strategies is undocumented, and the guide's claim that
`precalculate` is "roughly a quarter slower"
([2.guide/3.serialization.md](../../container/website/content/2.guide/3.serialization.md))
is an estimate, not a measured number.

## What to cover

- **One encoder per strategy** over a shared set of representative shapes (reuse
  the `binaryWire.bench.test.ts` payloads: short/long/uuid strings, the 4-string
  object, arrays of 100 strings/numbers), plus at least one format-constrained
  shape (packed ints, fixed/`maxLength` strings) where `precalculate` and the
  cold-start estimate should be near-exact.
- **Metrics per strategy:** encode throughput (ops/sec), decode throughput, and
  allocation behaviour, the per-encode `Uint8Array` view alloc for
  `dynamic`/`precalculate`/`initialSize` versus zero fresh allocation for
  `intoBuffer` reusing one buffer in a loop.
- **Cold vs warm for `dynamic`:** first-encode (estimate seeds the buffer) versus
  steady state (Welford history), to show the seed pays off and the buffer
  settles without growing.
- Validate the "quarter slower" `precalculate` figure and quantify what
  `intoBuffer` actually saves in a hot loop (the headline reason to reach for it).

## Where it lives

Either extend `binaryWire.bench.test.ts` with a strategy axis (gated behind the
existing `BINARY_BENCH=1`, stays quiet in the normal suite), or add a small
standalone binary-only bench. Keep it ts-runtypes-internal (no competitors) since
zod/typebox/typia/ajv have no equivalent knob, this is about our own modes.

## Acceptance

- A table comparing all four strategies on the shared payloads: encode/decode
  ops/sec and allocation per call.
- Numbers back (or correct) the guide's `precalculate` "quarter slower" claim and
  show the `intoBuffer` hot-loop saving.
- Round-trips assert correctness so it doubles as a regression guard, matching the
  existing wire bench.
