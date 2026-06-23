# Binary encoder buffer sizing — three explicit modes

> **Status: PLAN, pending agreement (2026-06-23).** This doc **merges and
> supersedes** the two previous specs:
> - `docs/todos/binary-buffer-sizing.md` (deferred improvements — container-boundary
>   reservation, backstop retirement, lower cold start, pooling, decaying stats)
> - `docs/todos/binary-caller-supplied-buffer-size.md` (`createBinarySizer<T>()`,
>   `bufferSize` option, caller-supplied serializer)
>
> The shipped baseline it builds on (Welford prediction, in-place grow, the
> `{sizing:'exact'}` two-pass, the backstop loop) is documented in
> [docs/done/binary-buffer-sizing.md](../done/binary-buffer-sizing.md). Items here
> that are explicitly **out of scope** (pooling, decaying stats, p99, lower cold
> start, instrumentation) are carried forward verbatim in the last section so they
> are not lost.

## Goal

Replace today's implicit `sizing: 'adaptive' | 'exact'` with **three explicit
modes** that make the size source and the per-write capacity behaviour first-class:

```ts
sizing: 'precalculate' | 'dynamic' | 'initial'
```

| mode | how the buffer is sized | `ensureCapacity` (per-write reserve) | overflow behaviour |
|---|---|---|---|
| **precalculate** | a no-op **measure pass** computes the exact byte count, then allocate exactly that (today's `'exact'`) | **not called** — the emitted `ensureCapacity?.(N)` short-circuits (the member is `undefined`); buffer is exact | impossible |
| **dynamic** | adaptive Welford prediction per `cacheKey` (today's `'adaptive'`) | **grows in place** — the ONLY mode that invokes it; the Go emitter now reserves for the inline scalar/framing writes too, so growth covers every write path | grows, never throws |
| **initial** | caller supplies the size every call (`bufferSize`, or a pre-built serializer) | **not called** — short-circuits exactly like `precalculate`; buffer is caller-sized | raw write **throws** `RangeError` (caller owns correctness) |

> **`ensureCapacity` is invoked in `dynamic` only.** In both `precalculate` and
> `initial` the serializer's `ensureCapacity` member is `undefined`, so every
> emitted and internal reserve site (`Ser.ensureCapacity?.(N)`) **short-circuits**:
> the function is not called and its size argument `N` is not even evaluated. This is
> a genuinely un-taken call, not a no-op body.

Two consequences fall out and are part of this plan:

1. **The backstop grow-and-retry loop is retired.** It only exists today because the
   inline writes can overflow in adaptive mode. Once `dynamic` reserves for every
   write, no mode needs it: `precalculate` can't overflow, `dynamic` grows in place,
   `initial` throws by design.
2. **`precalculate` AND `initial` stop calling `ensureCapacity` entirely.** Today's
   `{sizing:'exact'}` is "worst of both" — it runs the measure pass *and* still calls
   the grow check on every write (and even re-allocates for long ASCII strings). In
   the new design both fixed-size modes leave the `ensureCapacity` member `undefined`,
   so every reserve site short-circuits — no call, no arg eval, and the long-ASCII
   resize churn disappears.

## Why — the measurements that drive this

Full serialization suite (132 binary cases, 16 groups), encode ops/sec, geomean,
the `precalculate` measure pass vs `dynamic` (one-off measurement, the whole suite
run under each sizing mode):

- **The measure pass costs ~27% encode throughput, uniformly** (every group −19% to
  −33%; worst cases −42% to −50% for temporal / union-of-array / array-of-date).
  So `precalculate` must stay **opt-in** and be honestly documented as a
  determinism tool, not a speed tool.
- **`ensureCapacity` itself is cheap.** Removing the per-write check in a single
  pass is worth ~0% on number-heavy payloads (scalars are written inline and never
  call it today) and only +1–13% on string-heavy ones. So the win from skipping it
  in `precalculate`/`initial` is modest but free; the win from *adding* it in
  `dynamic` (to retire the backstop) is paid for by a small, container-granular
  reserve, not a per-scalar tax.
- **Bytes are identical across modes** (0 mismatches over 132 cases) — the wire
  format never changes, so ops/sec is the only axis that moves.
- One latent bug the runs surfaced: `reserveForString` reserves the worst case
  (`5 + chars*3`), so a long **ASCII** string forces a full realloc+copy on *every*
  encode — today even under `{sizing:'exact'}`. In the new design the measure-pass
  modes no-op that reserve, so the churn disappears for them; `dynamic` still wants
  the smarter reservation (see Phase 4).

## Design

### A. Runtime — `packages/ts-runtypes/src/runtypes/dataView.ts`

1. **`ensureCapacity` becomes a per-instance MEMBER that can be absent** (it is a
   `protected` method today), set once at construction:
   - `dynamic`: a **shared** module-level grow function (real geometric,
     prefix-preserving). Assigning the same function reference to every dynamic
     serializer keeps the call site monomorphic; method-call binding gives it `this`.
   - `precalculate` / `initial`: **`undefined`**.

   Every reserve site — emitted, and internal (`serString`'s `reserveForString`,
   `serEnum`, `serLength`, the temporal writers) — calls it through **optional
   chaining** `Ser.ensureCapacity?.(N)`. When the member is `undefined` the call
   short-circuits: the function is not invoked and `N` is not evaluated. This is what
   makes both fixed modes genuinely not call it (an un-taken call, not a no-op body),
   while `dynamic` stays a monomorphic call to the one shared grow function. The
   measure pass keeps using `SizingSerializerImpl` (its writes are already no-ops; its
   `ensureCapacity` member is `undefined` too).

2. **`reserveForString` / `serString` / `serFloat64` / `serEnum` / `serLength` /
   temporal writers** call `ensureCapacity` exactly as today. With `grow=false` the
   call is a single early-return, so the string resize-churn vanishes for
   `precalculate`/`initial` and the measured ≤13% string tax is removed there.

3. **`createDataViewSerializer(cacheKey, {size, grow})`** — thread the `grow` flag
   through (default `true`). The measure-pass and caller-size paths pass `grow:false`.

### B. Go emitter — reserve for the inline writes (`internal/compiled/typefns/`)

Today the emitter writes scalars + framing **inline** to `Ser.view` / `Ser.index`
(numbers `setFloat64`, null/bool/void `setUint8`, union tags, optional bitmaps,
index-sig count slot, numeric map keys, numeric-format `setInt8/16/32`), bypassing
the serializer methods — see `binary_to.go`, `union_flat_binary.go`,
`class_serializer.go`. These are the writes that can overflow.

**Change:** every inline write reserves first, via the existing comma-sequence
short syntax already used in the emitter (e.g. `(Ser.index++, null)` in
`binary_from.go`, and the fused `setFloat64(index, v, 1, (index += 8))`). The
reserve is fused into the same expression so it composes in `CodeE` (expression)
positions — array elements, arrow bodies — not just `CodeS`:

```js
// number, today:
Ser.view.setFloat64(Ser.index, v, 1, (Ser.index += 8))
// number, with reserve fused (the "runa, runb" comma-sequence form). The `?.`
// short-circuits in precalculate/initial — not called, and `8` is not evaluated:
(Ser.ensureCapacity?.(8), Ser.view.setFloat64(Ser.index, v, 1, (Ser.index += 8)))
```

**Granularity — reserve per CONTAINER, not per scalar** (this is the headline of the
old `binary-buffer-sizing.md` item #1, and what keeps `dynamic` fast and keeps the
no-op count tiny for the other two modes):

- **Fixed-width arrays** (`array<number>`, `array<boolean>`, …): one reserve before
  the loop covering the length varint + every element, e.g.
  `Ser.ensureCapacity?.(MAX_VARINT + v.length * 8)`, then the loop body writes raw.
- **Object scalar runs / tuples**: fold adjacent fixed-width fields into one reserve
  for the run; a string/variable field ends the run (it reserves itself).
- **Framing**: reserve right before the union discriminator tag, the optional-bitmap
  zero-loop (`bitmapLength` bytes), the index-sig count slot, a numeric map key.
- **Variable / complex array elements** (`array<string>`, `array<object>`): rely on
  the child's own reserves (`serString` reserves; nested fixed-width scalars fuse
  their own). No per-iteration container reserve needed.

The emitted body is **mode-independent** — it always contains the `?.` reserves;
the serializer's `ensureCapacity` member (the shared grow function in `dynamic`,
`undefined` in `precalculate`/`initial`) decides whether each one runs. So there is
still **one cache entry per type** and the modes do **not** fold into the cache key
(they are runtime-only options, like `rejectCircularRefs`).

### C. Encoder entry — `packages/ts-runtypes/src/createRTFBinary.ts`

```ts
sizing?: 'precalculate' | 'dynamic' | 'initial';   // default 'dynamic'
bufferSize?: number;                                // required for 'initial'
```

- **dynamic** (default): `createDataViewSerializer(cacheKey, {grow:true})` (adaptive
  prediction). No backstop loop — just `encodeFn(value, ser); ser.markAsEnded(); return ser.getBuffer()`.
- **precalculate**: measure pass (`createSizingSerializer`) → `createDataViewSerializer(cacheKey, {size: sizer.getLength(), grow:false})`.
- **initial**: `createDataViewSerializer(cacheKey, {size: bufferSize, grow:false})`;
  a raw write throws `RangeError` if `bufferSize` is too small (propagated, not caught).
- **caller-supplied serializer** (`createBinaryEncoder(value, serializer)`) keeps
  working unchanged — the caller already owns sizing + grow.
- **Retire** `MAX_BUFFER_BYTES` + the `for(;;) try/catch` backstop (see Phase 5).

### D. Public size API (from the caller-supplied todo)

1. **`createBinarySizer<T>()` → `(value) => number`** — the exact on-wire byte count.
   Reuses the `'tb'` family entry (same `InjectTypeFnArgs<T, 'tb'>` injection as
   `createBinaryEncoder`) run against `createSizingSerializer`, so **no new cache
   family** and **no Go emitter change**. Verify the marker scanner recognises it by
   the injected param (`internal/marker`) — expected to need no allowlist change.
2. **`bufferSize` option** — the ergonomic form of `initial` (above).
3. **Document the pre-built serializer pattern** — building one at a known size
   (`createBinarySizer` gives the safe number) and reusing it across encodes to pool
   the buffer and skip a fresh `ArrayBuffer` per call.

## Decisions (agreed 2026-06-23)

1. **Mode names** — `precalculate` | `dynamic` | `initial`. **Default `dynamic`**
   (the renamed current adaptive behaviour).
2. **No backward compatibility** — `'adaptive'` and `'exact'` are removed outright,
   no deprecated aliases. The shipped `{sizing:'exact'}` test + bench move to the new
   names as part of this work (pre-1.0, a hard rename is fine).
3. **Reserve granularity** — per-container, with per-site comma-fusion only where a
   scalar truly stands alone. Preserves `dynamic` throughput and minimises the
   short-circuited `?.` sites for the other two modes.
4. **Skip mechanism for `precalculate`/`initial`** — optional chaining
   `Ser.ensureCapacity?.(N)` against an instance member that is `undefined` in both
   fixed modes, so the call short-circuits (not invoked, arg not evaluated). A no-op
   *method* is rejected because it still invokes a call.
5. **`initial` overflow** — wrap the native `RangeError` with a clearer message naming
   `bufferSize` + `createBinarySizer`, then rethrow (no retry).

## Implementation phases

1. **Runtime grow flag.** `ensureCapacity` public + `grow` gate; thread `grow`
   through `createDataViewSerializer`. Wire the three modes in `createRTFBinary.ts`
   (keep the backstop for now). Tests: modes produce byte-identical output;
   `precalculate` never grows (spy asserts `resize` is not called); `initial`
   throws on an undersized `bufferSize`.
2. **`createBinarySizer<T>()` + `bufferSize`.** Public factory + option. Fuzz oracle
   `sizer(v) === encode(v).byteLength` over generated types. Verify marker scanner.
3. **Go emitter reserves.** Container-boundary `ensureCapacity` for every inline
   write, fused via comma-sequence. Rebuild `bin/ts-runtypes`. The existing
   serialization + binary suites must stay byte-identical.
4. **Smarter `reserveForString`** (optional, fixes the churn for `dynamic`): reserve
   a tighter estimate than worst-case `chars*3`, or grow less aggressively.
5. **Retire the backstop.** Only after a fuzz pass proves `dynamic` never overflows
   across the whole suite + random payloads (every inline write provably reserves).
   Remove `MAX_BUFFER_BYTES` + the retry loop. Until proven, keep it as a
   `dynamic`-only safety net.
6. **Docs.** See below.

## Testing (hard gate — both `getRunTypeId` call shapes where the marker is touched)

- **Byte-identity across modes**: `precalculate`/`dynamic`/`initial` (+ caller
  serializer) produce identical bytes and round-trip — extend
  `test/adapters/binaryExactSize.test.ts` (rename to `binarySizingModes.test.ts`).
- **`precalculate` AND `initial` never call `ensureCapacity`**: assert the
  serializer's `ensureCapacity` member is `undefined` after construction in both
  modes (so every `?.(N)` site short-circuits), and that `resize`/grow is never
  invoked. `dynamic` has it defined.
- **`initial` throws** on an undersized buffer; succeeds at the `createBinarySizer`
  size.
- **Sizer oracle**: `createBinarySizer(v) === createBinaryEncoder(v).byteLength`
  (fuzz over generated types) — pins the measure pass to the real encoder.
- **`dynamic` overflow fuzz** (gates Phase 5): random + suite payloads against a
  deliberately tiny initial prediction never throw.
- **Regression**: keep `test/fuzz/binaryEncoderResize.test.ts` green (or port it to
  `dynamic`).
- **Throughput sanity** — the committed `test/bench/binaryWire.bench.test.ts`
  (default = `dynamic`) under `BINARY_BENCH=1` confirms the Phase 3 container
  reserves don't regress `dynamic` encode throughput.

## Docs impact (PR-readiness gate)

- `container/website/content/2.guide/3.serialization.md` — a "buffer sizing"
  section: the three modes, what each is for (dynamic = default/fast, precalculate =
  deterministic but ~27% slower on encode, initial = caller-owned/pooling),
  `createBinarySizer`, `bufferSize`. Website voice rules apply (plain language, no
  em-dashes, short frontmatter) — see
  [CLAUDE.md → Website docs style](../../CLAUDE.md#website-docs-style-container/websitecontent).
- `docs/ARCHITECTURE.md` rewrite-mechanics — note the emitter now reserves at
  container boundaries and the backstop is gone.
- `README.md` — CLI/option surface if the mode names appear there.
- On landing: `git mv` this doc into `docs/done/` (or `partially/`) and update
  `docs/done/binary-buffer-sizing.md` to reference the new modes + the retired backstop.

## Out of scope — carried forward from `binary-buffer-sizing.md`

These remain deferred and are **not** part of this plan; kept here so they survive
the merge:

- **Buffer pooling per `cacheKey`** — an automatic grow-only pooled serializer per
  key. `initial` + caller-supplied serializer already enable manual pooling; an
  automatic per-key pool is separate.
- **Forgetting / decaying statistics** for regime shifts (EWMA / windowed Welford) —
  `dynamic` still keeps an unbiased all-observations accumulator.
- **Streaming-quantile (p99) prediction** (P² / t-digest) for `dynamic`.
- **Lower the 16 MiB cold-start default** (`defaultBufferSize = 2**24`) — safer once
  `dynamic` reserves cover all paths, but still its own change.
- **Encoder instrumentation** (grow-rate, bytes wasted) to drive the stats items
  above from real-corpus data.
