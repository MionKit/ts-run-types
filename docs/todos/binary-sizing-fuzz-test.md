# Fuzz test — binary cold-start estimate never under-allocates for in-bounds data

> **Status: TODO.** Follows the compile-time size estimate shipped in
> [docs/done/binary-encoder-sizing-redesign.md](../done/binary-encoder-sizing-redesign.md).

## Goal

A property / fuzz test that proves the per-type buffer-size estimate is **sound
for in-bounds data**: a value whose collections, strings and formatted scalars
stay within the estimation rules must encode through the `dynamic` strategy
**without growing the buffer** — i.e. `ensureCapacity` / `resize` never fires and
`ser.buffer.byteLength` is unchanged after `encode(value)`.

The estimate is only a seed (grow-on-miss keeps things correct either way), but
the whole point is that in-bounds data skips the realloc on a cold start. This
test pins that property and guards against drift between the Go estimator and the
real wire size.

## What to cover

- Generate random types + values (reuse the existing type fuzzer under
  [packages/ts-runtypes/test/fuzz/](../../packages/ts-runtypes/test/fuzz/)), with
  values constrained to the estimate's assumptions: collection lengths ≤ `items`,
  strings ≤ `maxLength` / `defaultStringBytes`, scalars within their declared
  format range, optionals/unions within the `sizeBias` headroom.
- **Especially the serialization-format types**, where the estimate should be
  near-exact: numbers packed to int8/16/32 (+ unsigned), 64-bit bigints,
  fixed/`maxLength` strings (uuid, email, …), bounded collections, datetime
  layouts.
- Run on a **cold cache** (fresh `cacheKey` or cleared `sizeHistory`) so the
  estimate is the buffer seed, not Welford history.

## Assertion

For each in-bounds value: encode with `sizeStrategy: 'dynamic'`, then assert the
buffer never grew (`ser.buffer.byteLength` equals the seeded estimate; equivalently
`resize`/`ensureCapacity` was never invoked). Cross-check against
`createBinarySizer<T>()` — the exact size must be ≤ the estimate.

## Acceptance

- Zero in-bounds values trigger a grow; lands in the existing fuzz suite with a
  soak variant (mirrors `binaryDynamicGrow` / the type-fuzz oracle).
- Contract is one-directional: **over-**estimating (no grow, some slack) is fine;
  **under-**estimating for in-bounds data is the bug this catches. Out-of-bounds
  data (larger than the rules assume) is allowed to grow and is out of scope.
