# Binary encoder buffer sizing — deferred improvements

> **Status: pending (verified against the source 2026-06-22).** The shipped
> baseline — Welford (mean + k·σ) prediction, in-place prefix-preserving growth,
> per-writer capacity reservation, the streamlined backstop retry loop, and the
> opt-in two-pass `'exact'` sizing — is documented in
> [docs/done/binary-buffer-sizing.md](../done/binary-buffer-sizing.md). This file
> tracks what is **not yet implemented**. The caller-supplied size API
> (`createBinarySizer`, a `bufferSize` encoder option) is a separate spec:
> [binary-caller-supplied-buffer-size.md](binary-caller-supplied-buffer-size.md).

## Pending items (summary)

- **Container-boundary capacity reservation in the Go emitter (the headline next
  step).** `ensureCapacity` is `protected` in `dataView.ts` with no Go callers;
  `binary_to.go` / `union_flat_binary.go` still emit inline scalar/framing writes
  (length prefixes, optional-bitmap zero-loop, union tags) with no per-container
  reserve. The backstop retry loop has NOT been retired.
- **Buffer pooling per `cacheKey`** — a fresh `ArrayBuffer` is still allocated on
  every encode.
- **Forgetting/decaying statistics for regime shifts** — `recordObservedSize`
  still keeps an unbiased all-observations Welford accumulator only.
- **Streaming-quantile (p99) prediction** (P²/t-digest) — not present.
- **Lower the 16 MiB cold-start default** — `defaultBufferSize` is still
  `2 ** 24` (blocked on container reservation covering all write paths).
- **Encoder instrumentation** (backstop hit-rate, bytes wasted) to drive the
  data-led decisions on the statistics items — not present.
- **Docs not updated:** no "buffer sizing" paragraph in
  `container/website/content/2.guide/3.serialization.md`; no rewrite-mechanics
  note in `docs/ARCHITECTURE.md`; no cross-links to the plugin-config / benchmark
  pages once those land.

> The two-pass measure-then-allocate opt-in that used to live here as item #6 has
> **shipped** as `{sizing: 'exact'}` — see [docs/done/binary-buffer-sizing.md](../done/binary-buffer-sizing.md).

## Deferred improvements (detail)

### 1. Container-boundary capacity reservation in the emitter — retires the backstop loop

Instead of letting inline scalar/framing writes throw, have the Go emitter
reserve capacity once per container where the size is known:
`Ser.ensureCapacity(4)` before a length prefix, `Ser.ensureCapacity(4 + n*8)`
before an array-of-numbers loop, the discriminator width before a union tag,
`bitmapLength` before the optional-bitmap zero-loop. This is **one reserve per
container, not per scalar**, so throughput is preserved, and it eliminates the
re-encode path entirely. Requires exposing `ensureCapacity` publicly (it is
`protected` today) and editing `binary_to.go` / `union_flat_binary.go` /
`class_serializer.go` + rebuilding the Go binary. This is the natural next step.

### 2. Buffer pooling per `cacheKey`

Today a fresh `ArrayBuffer` is allocated on every `encode` call. A pooled,
grow-only serializer per key (with occasional shrink) would cut GC pressure on
hot encode loops. Orthogonal to prediction. Explicitly deferred. (The
caller-supplied-serializer path already lets a caller pool a buffer by hand —
see the done doc — but there is no automatic per-key pool.)

### 3. Forgetting statistics for regime shifts

Welford keeps an unbiased mean + variance over _all_ observations, so after
millions of encodes it stops adapting; a sustained shift in payload size (e.g. a
deploy that grows records) is absorbed only slowly. An exponentially-weighted
mean+variance (West's online algorithm) or a windowed/decaying accumulator would
restore the responsiveness the old aggressive EMA had, without its variance
blindness.

### 4. Streaming-quantile prediction (p99)

A P²/t-digest sketch per key would bound the backstop/grow rate by construction
(size for the p99) rather than assuming a roughly-normal spread around the mean.
More per-key state; only worth it if measurements show mean + k·σ mispredicts on
real corpora.

### 5. Lower the 16 MiB cold start

With in-place grow + container reservation in place, an under-allocated first
encode is no longer catastrophic, so the giant cold-start default
(`defaultBufferSize = 2 ** 24`) could drop substantially (cutting first-encode
memory for every new key). Blocked on improvement #1 covering all write paths.
This is the knob the tsconfig-plugin sweep
([expose-go-compiler-constants-via-tsconfig-plugin.md](expose-go-compiler-constants-via-tsconfig-plugin.md))
wants to surface.

## Measuring before picking more

Before investing in the statistics work (#3/#4) or any further strategy,
instrument the encoder to record, per key, the backstop-loop hit rate and bytes
wasted (allocated − used). Pick the next strategy on data from a real corpus,
not on intuition.

## Documentation impact (when this lands)

When the remaining work (container-boundary reservation, pooled buffers, lower
cold start, etc.) ships, the docs need an update so users can find the tunables
without reading source:

- `container/website/content/2.guide/3.serialization.md` — extend the binary
  section with a short "buffer sizing" paragraph: cold-start default, the Welford
  prediction model, and the ceiling at `2 ** 32`. Voice rules apply: plain
  language, no em-dashes, short frontmatter (see
  [CLAUDE.md → Website docs style](../../CLAUDE.md#website-docs-style-container/websitecontent)).
- The serialization-format benchmark in
  [missing-benchmark-features.md](../done/missing-benchmark-features.md) is the
  right surface for "what does buffer sizing actually cost"; cross-link the two
  pages once both land.
- The plugin-config sweep
  ([expose-go-compiler-constants-via-tsconfig-plugin.md](expose-go-compiler-constants-via-tsconfig-plugin.md))
  is the natural home for any new plugin option that surfaces
  `defaultBufferSize` / `sizeMultiplier` / `maxStrCacheLength` / `maxCacheSize`.
  Coordinate the docs so the runtime knob page links to the rationale here.
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — if container-boundary
  reservation lands, mention it in the rewrite-mechanics section so the
  binary-emitter contract is discoverable.
