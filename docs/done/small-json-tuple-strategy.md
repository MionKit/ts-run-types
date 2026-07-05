# Compact "small-json" encoder strategy — declared props as positional tuples

> **Status: SHIPPED (2026-06-29).** Implemented as the `compact` JSON
> encoder/decoder strategy. What shipped vs the design below:
> - **Name** is `compact` (not `tuple`/`small`): the public `strategy` value on
>   BOTH `createJsonEncoder` and `createJsonDecoder`, and the benchmark column label.
> - **Optionals** use a `null` placeholder (not a presence bitmap) — the cheapest
>   path, reusing the existing TS-tuple optional convention. Consequence: a
>   `T | null` *optional* field cannot distinguish present-`null` from absent
>   (both decode to `undefined`), an accepted limitation.
> - **Paired encoder + decoder.** A positional array cannot be read by the
>   key-based strip/preserve decoders, so `compact` is a strategy on both factories.
> - **Mechanism:** two new internal type-walking primitive families (`compactForJson`/`cj`,
>   `compactFromJson`/`cjr`) modeled on `prepareForJsonSafe`/`restoreFromJson`,
>   identical except the object-literal / plain-class arm emits a positional array.
>   Composite tags `jeCO`/`jdCO`. Unions reuse the keyed flat-union envelope; any
>   object carrying an index signature (records, and fixed objects with dynamic
>   keys) stays keyed — only fixed-shape objects with no index signature are
>   tupled (a nested fixed object inside a record still goes positional).
> - **Benchmark:** the serialization bench data + website gained a `compact` column.
> - **Deferred:** a dedicated all-strategy round-trip fuzzer is captured separately
>   in [../todos/all-strategy-roundtrip-fuzzer.md](../todos/all-strategy-roundtrip-fuzzer.md);
>   the existing fuzzers were intentionally left untouched here.
>
> ---
>
> Original design note (2026-06-24). Came out of the serialization
> benchmark analysis: in a JS runtime the binary codec is 5–13x slower to encode
> than native `JSON.stringify` (it pushes bytes in JS; JSON is V8 C++), and its
> only real payload edge over JSON is **field-name elision** — JSON repeats
> `"name"`,`"email"`,… on every object, binary writes values positionally. This
> strategy captures most of that payload win in JSON, at native speed, by emitting
> declared object props as a positional array (a tuple) instead of a keyed object.
> Sibling of the binary rework explored in
> [binary-protobuf-superset.md](../done/binary-protobuf-superset.md) — together they
> answered "should we drop binary?". The protobuf-interop half was investigated and
> dropped (will not implement, not worth the cost); the answer landed at: make JSON
> small for RPC (this strategy), and keep binary only for numeric / byte-heavy
> payloads.

## Goal

A 4th `createJsonEncoder`/`createJsonDecoder` **strategy** alongside `clone`,
`mutate`, `direct` (working name `tuple`; the user's name is "small-json") that
produces a shorter wire payload by dropping declared key names: the declared shape
is encoded as a positional array, decoded back to the keyed object by the
shape-driven decoder. Because the heavy serialization stays in native
`JSON.stringify`/`parse` and we only add a shape walk (the same walk `clone`
already does in `prepareForJsonSafe`), it keeps JSON-class speed while approaching
binary's size.

Measured motivation (realworld `User`, from the current bench):
`object JSON 103 B → tuple JSON 54 B (-48%) → binary 43 B`, with tuple-JSON
encoding at ~3.0M/s (native) vs binary's ~241k/s. Estimated roundtrip at 100 Mbps:
tuple ≈ 194k/s, object-JSON ≈ 112k/s, binary ≈ 86k/s — tuple-JSON beats both.

## Encoding rules (the spec)

Behaves like `clone` (shape-derived, strips undeclared keys; pairs with a
strip-style decoder) **except** for the wire shape of objects:

- **Declared props → positional tuple.** Emit `[v0, v1, …]` in a stable canonical
  field order (reuse the binary codec's existing field ordering). No key names on
  the wire. Nested declared objects recurse (each becomes its own tuple).
- **Optionals → short placeholder.** An absent optional encodes as a placeholder
  (`null` or `0`) to keep later positions aligned and stay compact. (See open
  questions — `null` vs `0`, present-`null` vs absent, trailing-optional trimming.)
- **Undeclared / index-signature extras → trailing object.** Extra keys (the same
  ones `mutate`/`preserve` carry) are encoded as a regular keyed object in the
  **last array position**: `[v0, …, v(N-1), {extra: …}]`. The decoder knows the
  declared field count `N` from the shape, so positions `0..N-1` are declared and
  `[N]`, when present, is the extras bag — no ambiguity.
- **Records (pure index signature, no fixed declared props) → skip the tuple.**
  With no fixed positions there is nothing to tuple, so encode as a regular keyed
  object (the index-signature map). The tuple wrapping only applies to types with
  declared positional fields.
- **Decoder.** `JSON.parse` → walk the shape reattaching field names by position →
  rebuild the object (and merge the trailing extras bag when present). Cost ≈ the
  existing strip/preserve restore walk.

## New benchmark column (required)

The serialization bench must gain a **new column** for this strategy, in the
results data and the website pages:

- Add a `tuple` entry to `ROUNDTRIPS` in
  [scripts/gen-serialization-bench.mjs](../../scripts/gen-serialization-bench.mjs)
  (`{key:'tuple', enc:'tupleEncoder', dec:'tupleDecoder', kind:'json'}`) and to
  `SOURCE_FIELDS` so the hover panel shows its body.
- Add `tupleEncoder` / `tupleDecoder` thunks to the `SerializationCase` shape
  ([packages/ts-runtypes/test/suites/serialization/types.ts](../../packages/ts-runtypes/test/suites/serialization/types.ts))
  and to every case across the serialization + format-serialization suites.
- The bench `competitors` array and `BenchTable.vue`
  ([container/website/app/components/content/BenchTable.vue](../../container/website/app/components/content/BenchTable.vue))
  render columns from the data, so the new column flows through once the data has
  it; verify column ordering/labels read well next to `clone`/`binary`.

## Touchpoints

- **Go pipeline.** New strategy in the operations registry
  ([internal/cachegen/operations](../../internal/cachegen/operations/)), the JSON composite emitter
  ([internal/cachegen/typefunctions/json_composite.go](../../internal/cachegen/typefunctions/json_composite.go)),
  and a per-strategy tag in `constants.jsonCompositeTags`
  ([internal/constants/constants.go](../../internal/constants/constants.go)).
- **Runtime.** Tuple build/restore in the json composite runtime +
  [packages/ts-runtypes/src/runtypes/entryTuple.ts](../../packages/ts-runtypes/src/runtypes/entryTuple.ts).
- **Public surface.** Add the strategy to the `createJsonEncoder`/`createJsonDecoder`
  `strategy` option union and document it.
- **Tests.** Serialization suite round-trips for the new strategy (extend
  [serializationAsserts.ts](../../packages/ts-runtypes/test/util/serializationAsserts.ts)
  with a tuple pairing); Go tests for the emitter.
- **Docs.** Website serialization pages + the encoder-strategy section of
  [docs/ARCHITECTURE.md](../ARCHITECTURE.md) and README.

## Open questions (resolve as part of this todo)

- **Optionals.** `null` vs `0` placeholder; how to distinguish "present and `null`"
  from "absent"; whether to trim *trailing* absent optionals (omit them, since the
  decoder knows `N`) for extra savings, and how that interacts with the trailing
  extras slot.
- **Unions.** Need a discriminator slot (which variant) so the decoder picks the
  right shape — mirror what the binary codec already does.
- **TS tuple types.** A TS tuple is already positional; ensure no double-wrapping
  and no collision with the trailing-extras-object convention.
- **Maps / Sets / Date / Temporal / class instances.** Confirm they encode as in
  `clone`'s `prepareForJsonSafe` output, nested inside the tuple positions.
- **Data-only projection.** Non-serializable members are dropped (validate
  contract); confirm dropped members don't shift positions vs the decoder's view of
  the declared shape.
- **Field-order stability + wire coupling.** The wire is shape-coupled (both ends
  need the type), like binary; reuse the binary canonical order and note the
  versioning/evolution constraint.
- **Naming.** Final strategy key (`tuple` / `small` / `compact`) and option docs.

## Acceptance

- `createJsonEncoder<T>(undefined, {strategy: '<name>'})` + its decoder round-trip
  every serialization-suite case (atomic, objects, records, unions, optionals,
  nested, realworld), including the trailing-extras and pure-record paths.
- The serialization bench shows the new column in results + on the website, with
  payload meaningfully smaller than `clone` on realworld shapes (target: roughly
  the `User` 103→54 B delta) and competitive-or-better roundtrip at default
  bandwidth.
- Strategy documented (public API + ARCHITECTURE + website); `git mv` this file to
  [docs/done/](../done/) on ship.
