# Binary encoder sizing redesign — strategy-typed encode functions

> **Status: SHIPPED — Phase 1 + Phase 2 core (2026-06-24).** One Phase-2
> sub-item (per-call-site comptime overrides) is deferred; see **Implementation
> status** below. **Supersedes**
> [docs/done/binary-sizing-modes.md](./binary-sizing-modes.md) and
> [docs/done/binary-buffer-sizing.md](./binary-buffer-sizing.md), which
> describe the interim design (PR #142). Both are retired by this doc.

## Implementation status (2026-06-24)

**Phase 1 — strategy contract (DONE, committed `3b625a39`).** `sizeStrategy:
'dynamic' | 'precalculate' | 'initialSize' | 'into'`, `DataViewSerializer`
return, decoder-accepts-serializer, `createBinarySizer` kept,
`setDefaultBinarySizing` removed.

**Phase 2 — compile-time format-aware estimate (DONE, this change).**

- Format `BinarySize` hint: `formats.BinarySizer` capability +
  `BinarySizeHint{Fixed}` ([formats/registry.go](../../internal/compiled/typefns/formats/registry.go)),
  implemented by numberFormat (1/2/4/8) and bigintFormat (8) from the SAME
  `integerType`/`bigIntType` logic `EmitToBinary` uses.
- Per-type estimator: `EstimateBinarySize`
  ([binary_size_estimate.go](../../internal/compiled/typefns/binary_size_estimate.go))
  — memoized by type id, cycle-safe, format-aware, capped per subtree at
  `maxBytes`. Unit-tested in `binary_size_estimate_test.go`.
- Global config: `sizeBias` (0.8), `sizeItems` (100), `sizeStringBytes` (32),
  `sizeMaxBytes` (65536) as constants + tsconfig plugin keys + `runtypes-devtools`
  options + `--size-*` CLI flags, folded into the disk fingerprint (bumped
  `v6`→`v7`).
- Metadata: a trailing `binarySizeEstimate` slot on the `tb` entry tuple
  (`entrymod` renderer ↔ `entryTuple.ts` `FN_TYPE_TUPLE_KEYS` /
  `binarySizeEstimateFromTuple`), emitted only for `tb` (non-noop, non-variant).
- Runtime: the `dynamic` closure reads the estimate off the tuple and passes it
  as `coldStartSize` to `createDataViewSerializer`; `sizeForKey` uses it on a cold
  cache instead of `defaultBufferSize`; Welford history still refines.
- Default fallback lowered: `defaultBufferSize` 16 MiB (`2**24`) → 16 KiB
  (`2**14`) in [dataView.ts](../../packages/ts-runtypes/src/runtypes/dataView.ts).
  The estimate is the normal cold-start path; this flat fallback only applies to
  value-first / plugin-inactive encoders, so 16 MiB was indefensible.

> **Amendment (2026-06-24, post-merge follow-up).** Two changes after the spec
> below was written:
>
> 1. **Return type.** The encoder return changed from `DataViewSerializer` to a
>    **zero-copy `Uint8Array`** view of the written bytes (`.byteLength` is the
>    exact size; `.slice()` for an owned copy; for `intoBuffer` the view aliases
>    the caller's buffer). The serializer was a stateful instance and a leaky
>    abstraction; a `Uint8Array` covers every consumer use, still round-trips
>    through `createBinaryDecoder` (it already accepts any view), and the decoder's
>    serializer-detection branch was dropped.
> 2. **Strategy renamed.** `sizeStrategy: 'into'` → **`'intoBuffer'`** (the
>    parameter stays `into`, already typed `ArrayBuffer`). Self-documenting at the
>    factory call, alongside `initialSize`. The per-strategy overloads also gained
>    explicit forms so the return specialises for the static
>    `createBinaryEncoder<T>(undefined, {sizeStrategy})` form too.
>
> Mentions of a `DataViewSerializer` return or the `'into'` strategy below describe
> the interim design.
- Verified: full JS suite (7166), Go suite, fuzz oracle sweep, typecheck (only
  the pre-existing enrich errors), and an integration assertion that a cold
  `dynamic` buffer is the tight per-type estimate, not the flat fallback.

**Deferred (future enhancement, NOT shipped):** per-call-site **comptime
overrides** of `sizeBias` / `sizeItems` / an explicit `initialSize` via
`CompTimeFnArgs` on `createBinaryEncoder`. The global config covers the common
case; per-encoder bias tuning would need the scanner's `CompTimeFnArgs` +
demand machinery and either an `fnHash` fold (one `tb` entry per option set) or
a call-site injected literal (moving the estimate off the shared tuple). Scoped
but sizable; left out so the core ships clean. See the *Phase 2* notes below.

## Why the redesign

PR #142 shipped `sizing: 'precalculate' | 'dynamic' | 'initial'` with a runtime
`bufferSize`, an `ArrayBuffer` return, and a `setDefaultBinarySizing` global. The
benchmark and the follow-up discussion surfaced cleaner semantics:

- The size source (a number, or a caller buffer) and the overflow behavior (grow,
  throw, measure-exact) are **orthogonal**, and the overflow behavior must be fixed
  per encoder so the returned closure is **specialized** (monomorphic, no per-call
  strategy branch) and so TypeScript can **type the required argument** (you can't
  forget `size`/`into`).
- A fixed `ArrayBuffer` **cannot be grown while preserving the caller's reference**
  (growing allocates a new buffer). So a caller-supplied buffer can only ever be
  *fill-or-throw*, never silently re-pointed. That makes `into` a throw-on-overflow
  contract by nature.
- Returning the **serializer** (not a sliced `ArrayBuffer`) lets the caller choose
  zero-copy (`getBufferView()`) vs copy (`getBuffer()`) and avoids forcing an
  allocation. This is a low-level library: provide the primitive, let callers pool.

## API

`createBinaryEncoder<T>(opts?)`'s `sizeStrategy` (a **static literal**) selects the
returned function's signature and behavior:

```ts
// dynamic (default) — grow as needed; seeded by the Phase-2 estimate then history
createBinaryEncoder<T>(): (val) => DataViewSerializer
createBinaryEncoder<T>({ sizeStrategy: 'dynamic' }): (val) => DataViewSerializer

// precalculate — measure pass → allocate exactly; can't overflow
createBinaryEncoder<T>({ sizeStrategy: 'precalculate' }): (val) => DataViewSerializer

// initialSize — caller gives the size each call; throws on overflow (never resizes)
createBinaryEncoder<T>({ sizeStrategy: 'initialSize' }): (val, size: number) => DataViewSerializer

// into — caller gives the buffer each call; throws on overflow (never resizes)
createBinaryEncoder<T>({ sizeStrategy: 'into' }): (val, into: ArrayBuffer) => DataViewSerializer
```

| `sizeStrategy` | returned fn | initial size from | overflow |
|---|---|---|---|
| `dynamic` (default) | `(val) => Ser` | estimate → history → default | **grow** in place |
| `precalculate` | `(val) => Ser` | measure pass (exact) | impossible |
| `initialSize` | `(val, size) => Ser` | caller `size` | **throw** |
| `into` | `(val, into) => Ser` | caller `into.byteLength` | **throw** |

- **Return**: `DataViewSerializer`. Extract bytes via `getBufferView()` (zero-copy
  `Uint8Array`, e.g. a view into the caller's `into`) or `getBuffer()` (copy);
  `.index` is the byte count.
- **`createBinaryDecoder` accepts a `DataViewSerializer`** (reads its written view),
  so `decode(encode(v))` round-trips without the caller extracting bytes by hand.
- **`createBinarySizer<T>()` stays** — it's how a caller computes the exact `size`
  to feed `initialSize` (or to allocate an exact `into`).

### Why `sizeStrategy` is a static literal, not a runtime/Go-comptime arg

The emitted `toBinary` body is identical across strategies — only the JS wrapper
differs. So `sizeStrategy` lives entirely in TS/JS: the factory branches once on the
literal to return the specialized closure, and TS overloads type the returned
signature per strategy. It does **not** touch the `fnHash`, the cache entry, or the
plugin. (A non-literal strategy falls back to the `dynamic` overload.) Only the
**Phase-2 estimate params** are real Go-comptime.

### Overflow + `into` reference rule

`initialSize`/`into` set `grow = false`, so the serializer never resizes; an
over-large payload throws a `RangeError` (caught via a post-encode
`index > capacity` check, since a silent `Uint8Array` OOB still advances `index`).
A fixed `into` can't be grown without breaking the caller's reference, so throw is
the only correct behavior. (Optional later refinement: detect an ES2024 **resizable**
`ArrayBuffer` and `.resize()` it in place up to `maxByteLength` — reference
preserved. Core contract stays throw.)

### Removed / changed vs PR #142

- `sizing` → `sizeStrategy`; values `precalculate | dynamic | initial` → `precalculate | dynamic | initialSize | into`.
- `initial` mode → split into `initialSize` (number) + `into` (buffer).
- `bufferSize` factory option → **removed** (per-call `size` via the `initialSize` signature).
- caller-supplied-serializer second argument → **removed** (`into` replaces it).
- `setDefaultBinarySizing` / `getDefaultBinarySizing` global default → **removed** (strategy is a per-call-site literal; omitted = `dynamic`).
- return `ArrayBuffer` → return `DataViewSerializer`.
- `createBinarySizer` → **kept**. Backstop already retired (stays retired). Emitter reserves already in place (stay).

## Phase 2 — compile-time, format-aware size estimate (the `dynamic` seed)

A per-type default size computed **at build time** and baked into the `tb` entry
metadata, used by `dynamic` as the initial buffer size when there is no history (kills
the 16 MiB cold start — critical for short-lived/serverless where history never warms).

- **Structural + format-aware**: exact fixed bytes (numbers/bool/null/framing/bitmaps/
  union tags) + format bounds where present — packed numeric widths (int8/16/32),
  64-bit bigints, `maxLength`/`minLength` strings, fixed-format strings (uuid = exact),
  `maxItems` collections, temporal layouts. Derived from the **same** `FormatAnnotation`
  the emitter uses (add a `BinarySize(annotation) → {fixed | min,max}` hint to the
  format `BinaryEncoder` interface — single source of truth, can't drift).
- **Bias knob** `sizeBias ∈ [0,1]` (default `0.8`): `estimate = min + bias·(cappedMax − min)`,
  summed per field. `0` = tightest, `1` = most generous. Optionals weighted by bias;
  unions interpolate between smallest/largest member.
- **Unbounded defaults** (the "max" anchor where the type gives no ceiling):
  `items = 100` (typical paginated result), `stringBytes ≈ 32`, `maxSizeCap ≈ 64 KiB`
  (so a `maxLength<10MB>` doesn't allocate 10 MB).
- **Config**: global plugin options; per-call-site **comptime override** via the
  existing `CompTimeArgs`/`fnHash` machinery (`sizeBias`, `items`, an explicit
  `initialSize`), which override the globals for that call site.
- **Estimate + history** (kept, not replaced): estimate seeds the cold start; the
  Welford history still refines for long-lived processes.
- **Estimate is `dynamic`-only** — `precalculate` measures, `initialSize`/`into` take
  the caller's size/buffer.
- **Metadata**: a new size slot on the `tb` entry tuple (the `entrymod.go` ↔
  `entryTuple.ts` sync boundary + `constants`).
- Open impl choice: bake the final number per call site as an injected literal
  (shared body) vs fold the comptime args into the `fnHash` (separate entry per
  override). Lean injected-literal (no body duplication).

## Implementation plan

**Phase 1 — strategy contract (TS-only, no Go change, no rebuild).**
1. `dataView.ts`: let `createDataViewSerializer` wrap a caller `ArrayBuffer`
   (`{ buffer: into }`, `grow:false`) in addition to allocating `{ size, grow }`.
2. `createRTFBinary.ts`: replace `BinaryEncoderOptions.sizing`/`bufferSize` with
   `sizeStrategy`; overloads typing the returned signature per strategy; four
   specialized closures returning `DataViewSerializer`; `initialSize`/`into` throw on
   overflow. Remove `setDefaultBinarySizing`/`getDefaultBinarySizing` + `MAX_BUFFER_BYTES`
   already gone. Keep `createBinarySizer`.
3. `createBinaryDecoder`: accept a `DataViewSerializer` input (read `getBufferView()`).
4. `index.ts`: drop the removed exports; keep `createBinarySizer`.
5. Tests: rework `binarySizingModes.test.ts` (four strategies, return type, decoder-
   accepts-serializer, `initialSize`/`into` throw, byte-identity across strategies),
   `binaryDynamicGrow.test.ts`. Run the full serialization suite — round-trips keep
   working via decoder-accepts-serializer; fix byte/size assertions to `.index` /
   `.getBufferView()`.
6. Benches/docs: `binaryWire.bench.test.ts` (return type); update the website guide
   + `gen-serialization-bench.mjs` for the serializer return; remove the now-obsolete
   `bench-sizing-suite.mjs` (it relied on the removed global; the per-strategy numbers
   are recorded in this doc).

**Phase 2 — compile-time estimate (Go + protocol).**
7. Format `BinarySize` hints; per-type structural+bias estimator; global + comptime
   config; `tb` entry metadata slot (tuple-layout sync + constants); runtime use in the
   `dynamic` closure (estimate → history → default). Fuzz: `sizer(v)` oracle still
   holds; estimate never under-throws `dynamic` (it grows). Rebuild `bin/ts-runtypes`.

## Final per-strategy throughput (recorded, from the interim build)

vs `dynamic` (geomean, 132-case suite): `precalculate` ≈ −22%, caller-fixed buffer
(`initialSize`/`into`) ≈ +17% (no measure pass, no grow checks, exact pre-sized
buffer). 0 byte mismatches across strategies. These motivate keeping all four.

## Docs to update on landing

- Website `2.guide/3.serialization.md` — rewrite the sizing section for `sizeStrategy`
  + `DataViewSerializer` return + `createBinarySizer`.
- `docs/ARCHITECTURE.md` factory surface + table.
- Fold/retire the two superseded done-docs.
