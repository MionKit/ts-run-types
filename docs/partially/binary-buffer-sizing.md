# Binary encoder buffer sizing — strategy, current fix, and next steps

## ⏳ Pending (as of 2026-06-21)

The "fix shipped now" portion is fully landed (Welford mean + kσ prediction,
in-place geometric grow with prefix preservation, `reserveForString`, all
serializer writers reserve first, the streamlined backstop retry loop, and the
`binaryEncoderResize.test.ts` regression test). The following deferred items are
**not yet implemented**:

- **Container-boundary capacity reservation in the Go emitter (the headline next
  step).** `ensureCapacity` is still `private` in `dataView.ts` with no Go
  callers; `binary_to.go` / `union_flat_binary.go` still emit inline
  scalar/framing writes (length prefixes, optional-bitmap zero-loop, union tags)
  with no per-container reserve. The backstop retry loop has NOT been retired.
- **Buffer pooling per `cacheKey`** — a fresh `ArrayBuffer` is still allocated on
  every encode.
- **Forgetting/decaying statistics for regime shifts** — `recordObservedSize`
  still keeps an unbiased all-observations Welford accumulator only.
- **Streaming-quantile (p99) prediction** (P²/t-digest) — not present.
- **Lower the 16 MiB cold-start default** — `defaultBufferSize` is still
  `2 ** 24` (blocked on container reservation covering all write paths).
- **Two-pass measure-then-allocate opt-in** — ✅ SHIPPED. `createBinaryEncoder(value, {sizing: 'exact'})` runs a no-op measure pass (`createSizingSerializer`) over the SAME emitted encode body, then allocates the precise byte count, so no inline write can overflow. Opt-in; the default stays adaptive + backstop. The caller-supplied-size variant (passing a buffer size, exposing `createBinarySizer`) is tracked in [docs/todos/binary-caller-supplied-buffer-size.md](../todos/binary-caller-supplied-buffer-size.md).
- **Encoder instrumentation** (backstop hit-rate, bytes wasted) to drive the
  data-led decisions on #3/#4/#6 — not present.
- **Docs not updated:** no "buffer sizing" paragraph in
  `container/website/content/2.guide/3.serialization.md`; no rewrite-mechanics
  note in `docs/ARCHITECTURE.md`; no cross-links to the plugin-config / benchmark
  pages once those land.

Detail on each is in the **Deferred improvements** and **Documentation impact**
sections below.

---

**Status:** partially improved (this PR). Welford prediction + in-place grow for
the serializer's own writers landed; container-boundary reservation in the Go
emitter is the remaining work, tracked below.

This documents how `createBinaryEncoder<T>()` decides how big a buffer to
allocate, the failure mode the fuzzer surfaced, the change shipped now, and the
improvements deferred for later.

## Where the code lives

- Encoder entry + backstop loop — [`packages/ts-runtypes/src/createRTFBinary.ts`](../packages/ts-runtypes/src/createRTFBinary.ts)
- Serializer, prediction, and in-place grow — [`packages/ts-runtypes/src/runtypes/dataView.ts`](../packages/ts-runtypes/src/runtypes/dataView.ts)
- Go emitter that inlines scalar/framing writes — [`internal/compiled/typefns/binary_to.go`](../internal/compiled/typefns/binary_to.go), [`union_flat_binary.go`](../internal/compiled/typefns/union_flat_binary.go)
- Regression test — [`packages/ts-runtypes/test/fuzz/binaryEncoderResize.test.ts`](../packages/ts-runtypes/test/fuzz/binaryEncoderResize.test.ts)

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
10 KB string after fifty empty ones) overflows and — pre-fix — threw
`RangeError: buffer too small to encode string … Call resize() and retry.`
The encoder's catch did eventually grow, but only by **re-encoding from
scratch**, sometimes several doublings deep. High-variance (bimodal) workloads
paid this on every large item.

## The fix shipped now

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

### Why a backstop loop still exists

The Go-emitted bodies write **scalars and container framing inline** to
`Ser.view`/`Ser.index` for throughput — numbers (`setFloat64`), array/map length
prefixes (`setUint32`), union discriminator tags (`setUint8`/`setUint16`), and
optional-property bitmaps (`setUint8`). These bypass the serializer's methods, so
they cannot self-grow. If a prediction under-allocates for an all-scalar payload
(e.g. a large array of numbers with no strings), a raw write still throws a
`RangeError`.

The encoder therefore keeps a **streamlined retry loop** as a correctness
backstop: catch the `RangeError`, grow (prefix-preserving `resize`), and
re-encode until it fits or hits the `2 ** 32` ceiling. With Welford headroom this
fires rarely, and never for the string case.

## Deferred improvements (take later)

1. **Container-boundary capacity reservation in the emitter — retires the
   backstop loop.** Instead of letting inline scalar/framing writes throw, have
   the Go emitter reserve capacity once per container where the size is known:
   `Ser.ensureCapacity(4)` before a length prefix, `Ser.ensureCapacity(4 + n*8)`
   before an array-of-numbers loop, the discriminator width before a union tag,
   `bitmapLength` before the optional-bitmap zero-loop. This is **one reserve per
   container, not per scalar**, so throughput is preserved, and it eliminates the
   re-encode path entirely. Requires exposing `ensureCapacity` publicly and
   editing `binary_to.go` / `union_flat_binary.go` / `class_serializer.go` +
   rebuilding the Go binary. This is the natural next step.

2. **Buffer pooling per `cacheKey`.** Today a fresh `ArrayBuffer` is allocated on
   every `encode` call. A pooled, grow-only serializer per key (with occasional
   shrink) would cut GC pressure on hot encode loops. Orthogonal to prediction.
   Explicitly deferred.

3. **Forgetting statistics for regime shifts.** Welford keeps an unbiased mean +
   variance over _all_ observations, so after millions of encodes it stops
   adapting; a sustained shift in payload size (e.g. a deploy that grows
   records) is absorbed only slowly. An exponentially-weighted mean+variance
   (West's online algorithm) or a windowed/decaying accumulator would restore the
   responsiveness the old aggressive EMA had, without its variance blindness.

4. **Streaming-quantile prediction (p99).** A P²/t-digest sketch per key would
   bound the backstop/grow rate by construction (size for the p99) rather than
   assuming a roughly-normal spread around the mean. More per-key state; only
   worth it if measurements show mean+k·σ mispredicts on real corpora.

5. **Lower the 16 MiB cold start.** With in-place grow + container reservation in
   place, an under-allocated first encode is no longer catastrophic, so the
   giant cold-start default could drop substantially (cutting first-encode
   memory for every new key). Blocked on improvement #1 covering all write paths.

6. **Two-pass measure-then-allocate (opt-in).** A byte-counting pass followed by
   an exact allocation removes prediction, retries, and over-allocation entirely
   at ~2× encode CPU — the protobuf `ByteSizeLong` model. Worth offering as an
   opt-in for very large or highly variable payloads.

## Measuring before picking more

Before investing in #3/#4/#6, instrument the encoder to record, per key, the
backstop-loop hit rate and bytes wasted (allocated − used). Pick the next
strategy on data from a real corpus, not on intuition.

## Documentation impact (when this lands)

When the remaining work (container-boundary reservation, pooled buffers,
lower cold start, etc.) ships, the docs need an update so users can find
the tunables without reading source:

- `container/website/content/2.guide/3.serialization.md` — extend the
  binary section with a short "buffer sizing" paragraph: cold-start
  default, the Welford prediction model, and the ceiling at `2 ** 32`.
  Voice rules apply: plain language, no em-dashes, short frontmatter
  (see [CLAUDE.md → Website docs style](../../CLAUDE.md#website-docs-style-container/websitecontent)).
- The serialization-format benchmark in
  [pending-optimizations.md](pending-optimizations.md) is the right
  surface for "what does buffer sizing actually cost"; cross-link the
  two pages once both land.
- The plugin-config sweep
  ([expose-go-compiler-constants-via-tsconfig-plugin.md](expose-go-compiler-constants-via-tsconfig-plugin.md))
  is the natural home for any new plugin option that surfaces
  `defaultBufferSize` / `sizeMultiplier` / `maxStrCacheLength` /
  `maxCacheSize`. Coordinate the docs so the runtime knob page links
  to the rationale here.
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — if container-boundary
  reservation lands, mention it in the rewrite-mechanics section so the
  binary-emitter contract is discoverable.
