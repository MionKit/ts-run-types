# Binary encoder buffer sizing — shipped baseline

> **SUPERSEDED (2026-06-23) by the three-mode design in
> [docs/done/binary-sizing-modes.md](binary-sizing-modes.md).** This doc describes
> the earlier baseline. Since then: the opt-in `{sizing: 'exact'}` became
> `{sizing: 'precalculate'}`; the default `'adaptive'` became `'dynamic'`; a third
> `'initial'` (caller `bufferSize`) mode and `createBinarySizerFn<T>()` shipped; the
> Go emitter now reserves at container boundaries for the inline writes; and the
> **backstop retry loop was retired** (every write reserves via
> `Ser.ensureCapacity?.(n)`, which is now a per-instance member — the grow function
> in `dynamic`, `undefined` in the fixed-size modes). Read the new doc for the
> current behaviour; the history below is kept for context.
>
> **Original status: implemented (verified against the source 2026-06-22).** Welford
> (mean + k·σ) prediction, in-place prefix-preserving buffer growth, per-writer
> capacity reservation, the streamlined backstop retry loop, and the opt-in
> two-pass `'exact'` sizing all landed and are pinned by tests.

This documents how `createBinaryEncoderFn<T>()` decides how big a buffer to
allocate, the failure mode the fuzzer surfaced, and the change that fixed it.

## Where the code lives

- Encoder entry + backstop loop — [`packages/ts-runtypes/src/createRTFBinary.ts`](../../packages/ts-runtypes/src/createRTFBinary.ts)
- Serializer, prediction, in-place grow, sizing serializer — [`packages/ts-runtypes/src/runtypes/dataView.ts`](../../packages/ts-runtypes/src/runtypes/dataView.ts)
- Go emitter that inlines scalar/framing writes — [`internal/cachegen/typefunctions/binary_to.go`](../../internal/cachegen/typefunctions/binary_to.go), [`union_flat_binary.go`](../../internal/cachegen/typefunctions/union_flat_binary.go)
- Regression test (in-place grow) — [`packages/ts-runtypes/test/fuzz/binaryEncoderResize.test.ts`](../../packages/ts-runtypes/test/fuzz/binaryEncoderResize.test.ts)
- Exact-sizing test (`{sizing: 'exact'}`) — [`packages/ts-runtypes/test/adapters/binaryExactSize.test.ts`](../../packages/ts-runtypes/test/adapters/binaryExactSize.test.ts)

## The original strategy (adapted from an API model)

The encoder owns a `DataViewSerializer` and must pick its initial `ArrayBuffer`
size before encoding. The strategy was lifted from an API framework where each
endpoint tracked its own buffer size — starting big and shrinking incrementally
toward observed usage — then adapted for our per-type use case. Three coupled
mechanisms:

1. **Predict** (`predictBufferSize`/`sizeForKey`): per-`cacheKey` rolling
   average × a fixed `sizeMultiplier` (2), cold-starting at `defaultBufferSize`
   (16 MiB).
2. **Record** (`recordObservedSize`): an EMA, `(prev + observed) / 2`, blended
   against the 16 MiB default so the prediction decays _down_ from "really big"
   over successive encodes.
3. **Resize** (encoder loop): when the buffer under-allocated, a raw DataView
   write threw a `RangeError`; the encoder caught it, **doubled the buffer, and
   re-encoded the whole payload from a clean index**.

### The failure the fuzzer found

The EMA converges to the **mean** payload size, and the `× 2` multiplier is a
crude, variance-blind stand-in for the tail. After many small encodes for a key,
the prediction sits near the small mean; the next above-average payload (e.g. a
10 KB string after fifty empty ones) overflowed and — pre-fix — threw
`RangeError: buffer too small to encode string … Call resize() and retry.`
The encoder's catch did eventually grow, but only by **re-encoding from
scratch**, sometimes several doublings deep. High-variance (bimodal) workloads
paid this on every large item.

## What shipped

### 1. Welford prediction (mean + k·σ) — replaces the mean-EMA

`sizeHistory` now stores a per-key Welford accumulator (`SizeStats { count,
mean, m2 }`) instead of a single rolling average. Prediction is:

```
allocSize = ceil(mean + sizeMultiplier × stddev)
```

`sizeMultiplier` (default 2) is reinterpreted from "× the average" to "k standard
deviations of headroom." The headroom now tracks the **observed spread**: stable
keys get a tight allocation, bursty keys automatically get more. The magic `× 2`
is gone.

### 2. In-place grow for the serializer's own writers — removes the string re-encode

`DataViewSerializer` gained `ensureCapacity(extraBytes)`, which grows the buffer
**geometrically but at least to the exact deficit** and **copies the written
prefix** into the new buffer (`resize` is now prefix-preserving too). Every
serializer writer that advances the cursor reserves first: `serString` (via
`reserveForString`, which reserves the worst-case 3 bytes/UTF-16-unit so
`encodeInto` can never truncate), `serFloat64`, `serEnum`, `serByte`, the
Temporal writers.

Consequence: the dominant overflow case — an above-average **string**, the one
the regression test pins — now settles in a **single buffer copy**, with no
throw and no re-encode. Because a tight Welford prediction is now cheap to miss,
the two changes reinforce each other.

### 3. Two-pass measure-then-allocate (opt-in) — `{sizing: 'exact'}`

`createBinaryEncoderFn(value, {sizing: 'exact'})` runs a no-op measure pass
(`createSizingSerializer`, which points `view` at a zero-length scratch
`DataView` and makes `ensureCapacity` a no-op) over the **same** emitted encode
body, computes the precise on-wire byte count, then allocates exactly that. No
inline write can overflow, so the backstop below never fires, at the cost of one
extra traversal. It is opt-in; the default stays adaptive + backstop. Pinned by
`binaryExactSize.test.ts`.

### Why a backstop loop still exists (and is retained)

The Go-emitted bodies write **scalars and container framing inline** to
`Ser.view`/`Ser.index` for throughput — numbers (`setFloat64`), array/map length
prefixes (`setUint32`), union discriminator tags (`setUint8`/`setUint16`), and
optional-property bitmaps (`setUint8`). These bypass the serializer's methods, so
they cannot self-grow. If an adaptive prediction under-allocates for an
all-scalar payload (e.g. a large array of numbers with no strings), a raw write
still throws a `RangeError`.

The encoder therefore keeps a **streamlined retry loop** as a correctness
backstop: catch the `RangeError`, grow (prefix-preserving `resize`), and
re-encode until it fits or hits the `2 ** 32` ceiling. With Welford headroom this
fires rarely, never for the string case, and never under `{sizing: 'exact'}`.
(Retiring it entirely is the headline pending item — see the todo.)

### Already possible: caller-supplied serializer

`createBinaryEncoderFn(value, serializer)` accepts a pre-built `DataViewSerializer`
as a second argument; the caller then owns sizing and end-of-payload semantics
(the encoder records no history on their behalf). Building one at a known size
and reusing it across encodes pools the buffer and avoids a fresh `ArrayBuffer`
per call. The ergonomic wrappers for this path — a `bufferSize` encoder option
and a `createBinarySizerFn<T>()` that returns the exact byte count — are **not yet
built**; they are tracked in
[binary-caller-supplied-buffer-size.md](../todos/binary-caller-supplied-buffer-size.md).

## Verified against the source (2026-06-22)

- `SizeStats { count, mean, m2 }`, Welford `recordObservedSize`, and
  `predictBufferSize` (mean + k·σ) — `dataView.ts`.
- `ensureCapacity` (currently `protected`) + prefix-preserving `resize`;
  `reserveForString` reserves the worst-case 3 bytes/UTF-16 unit; `serFloat64`,
  `serEnum`, `serByte`, and the Temporal writers each reserve first — `dataView.ts`.
- Backstop retry loop and the `{sizing: 'exact'}` two-pass (`createSizingSerializer`)
  — `createRTFBinary.ts`.
- Tests: `binaryEncoderResize.test.ts` (in-place grow), `binaryExactSize.test.ts`
  (exact sizing).
