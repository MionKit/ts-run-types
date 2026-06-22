# Binary encoding — caller-supplied buffer size (strategy 1)

> **Status: pending (verified against the source 2026-06-22).** Items 1
> (`createBinarySizer<T>()`) and 2 (a `bufferSize` encoder option) are **not yet
> implemented** — confirmed absent in `createRTFBinary.ts` (`BinaryEncoderOptions`
> has only `cacheKey` / `rejectCircularRefs` / `sizing`) and nowhere in the
> marker scanner. Item 3 (caller-supplied serializer) **already works** today:
> `createBinaryEncoder(value, serializer)` accepts a second argument, so only
> documenting the pattern is outstanding. The shipped buffer-sizing baseline
> (including the `{sizing: 'exact'}` two-pass referenced below) is in
> [docs/done/binary-buffer-sizing.md](../done/binary-buffer-sizing.md); the
> broader deferred-improvements list is in
> [docs/todos/binary-buffer-sizing.md](binary-buffer-sizing.md).

## Why

The Go-emitted `toBinary` bodies write scalars and container framing **inline** to
the DataView (`Ser.view.setFloat64(Ser.index, v, 1, (Ser.index += 8))`,
`setUint8(Ser.index++, …)`, union tags, optional bitmaps) instead of going through
the self-growing serializer methods — deliberately, to avoid a function call per
write. The consequence: those writes do **not** reserve capacity, so if the buffer
is too small a raw `setX` throws `RangeError`.

Today there are two ways the encoder copes:
- **adaptive** (default): predict the size from per-key Welford history, and on a
  miss the encoder's backstop loop grows + re-encodes from a clean index.
- **exact** (shipped, opt-in): `createBinaryEncoder(value, {sizing: 'exact'})`
  runs a no-op measure pass over the same encode body to compute the precise byte
  count, then allocates exactly that. See
  [docs/done/binary-buffer-sizing.md](../done/binary-buffer-sizing.md).

This todo covers the **third** option: let the caller pass the buffer size (or a
pre-built serializer they sized themselves), so a hot path can skip both the
prediction and the measure pass.

## What to build

1. **Public size API.** Expose `createBinarySizer<T>()` returning
   `(value) => number` — the exact on-wire byte count. It reuses the existing
   `'tb'` family entry (same `InjectTypeFnArgs<T, 'tb'>` injection as
   `createBinaryEncoder`) run against `createSizingSerializer`, so it needs **no
   new cache family** and no Go emitter changes. Marker-scanner detection is by
   the injected param type, so adding the factory should not need a scanner
   allowlist change — verify against `internal/marker`.

2. **Caller-supplied size on the encoder.** Accept an explicit size:
   ```ts
   createBinaryEncoder<T>(value, {bufferSize: 4096})
   ```
   threading it to `createDataViewSerializer(cacheKey, size)`. The caller owns
   correctness — if their size is too small the backstop still catches it (owned
   path) or it throws (caller-supplied serializer path). Document that
   `createBinarySizer` is the way to get a guaranteed-safe size.

3. **(Already possible — verified.) Caller-supplied serializer.** `createBinaryEncoder`
   already accepts a second `serializer` argument (see `createRTFBinary.ts`); the
   only outstanding work is to document the pattern of building one at a known
   size and reusing it across encodes to pool the buffer.

## Notes / gotchas

- Binary options are runtime-only (not compile-time args), so `bufferSize` /
  `sizing` must NOT fold into the cache key (mirror how `rejectCircularRefs` is
  handled).
- A pooled, caller-owned serializer is the lowest-allocation path (no fresh
  `ArrayBuffer` per encode); pair this work with a buffer-pooling note.
- Keep `createBinarySizer` and the encoder byte-for-byte consistent — both must
  run the SAME emitted `'tb'` body (the sizer via `createSizingSerializer`). A
  fuzz oracle `sizer(v) === encode(v).byteLength` over generated types pins it.
