# Binary format as a Protocol Buffers superset — Design

> Companion to [binary-protobuf-superset.md](binary-protobuf-superset.md) (the spec).
> This doc resolves the spec's "Open questions" and is the contract the
> implementation is built against. On ship, the protobuf ↔ TS mapping + subset
> list fold into [docs/ARCHITECTURE.md](../ARCHITECTURE.md) and the website
> serialization/interop pages, and both files `git mv` to [docs/done/](../done/).

## Decisions (resolving the spec's open questions)

| Question | Decision |
| --- | --- |
| **Scope** | All 7 deliverables in one PR. |
| **Interop bar** | **TRUE protobuf interop**: in-subset bytes decode in any language from a generated `.proto`, enforced in CI by round-tripping through protobuf.js and compiling the `.proto`. |
| **proto2 vs proto3** | **proto3.** TS optional (`?`) → proto3 `optional` (explicit presence). Non-optional fields use proto3 implicit presence (always on the wire). |
| **Field numbers** | **Explicit `ProtoField<N>` marker, 1-based declaration-order default** when unmarked. The Go emitter is the single source: the same number is written on the wire AND emitted into the `.proto`. |
| **Wire coexistence** | **Per-message all-or-nothing.** A top-level type is classified at build time as fully in-subset or not. In-subset → **pure** protobuf bytes (no RunTypes framing, no mode byte → foreign-readable) + a `.proto`. Out-of-subset → current RunTypes binary fallback + a build-time **Warning** at the `createBinaryEncoder<T>()` call site naming the offending member. |
| **Mode signaling** | **None on the wire.** Mode is a static property of `T`, baked into the emitted codec at build time. Our own decoder for `T` knows which path; foreign decoders read pure protobuf. A runtime mode prefix would break pure interop, so we do not add one. |
| **Parity tool** | **protobuf.js** (runtime `.proto` parse + reflection). Dev/test dependency ONLY — never reaches the shipped codec, which stays dependency-free. |
| **64-bit ints** | `int64`/`uint64`/`sint64`/`fixed64`/`sfixed64` ↔ TS `bigint` (with a `bigintFormat` whose min/max fit the 64-bit range). 32-bit and narrower ↔ TS `number`. |
| **Scalar selection** | Reuse the existing `integerType()` constraint analysis (`formats/numeric/numberformat.go`) — the same min/max/format data `precalculate` reads for sizing — extended to choose the narrowest correct protobuf scalar. Single source of truth for wire + `.proto` + size. |
| **`bytes` ↔ `Uint8Array`** | **In-subset via a parallel projection.** `Uint8Array` / `Uint8ClampedArray` / `ArrayBuffer` → protobuf `bytes` (zero-copy where possible). `DataOnly<T>` is left UNTOUCHED (it still strips these, preserving its instantiation budget); the binary/protobuf DECODER return type instead uses a new `ProtoData<T>` projection that keeps binary buffers as bytes. Other typed arrays (`Int32Array`, …) → packed `repeated` scalar is a follow-up; `DataView` / `SharedArrayBuffer` stay out. |
| **`enum`** | TS **numeric enum** → protobuf `enum` (integer values; a synthesized `…_UNSPECIFIED = 0` member is added when the TS enum has no 0). TS **string-literal union** → a generated protobuf `enum` with stable, declaration-order integer assignment (the string↔int table lives in the `.proto`; lossy in that the wire carries the integer, reconstructed to the string on decode). |
| **`oneof`** | **Deferred to a follow-up increment.** Each variant consumes a field number, which breaks the one-number-per-field model the emitter / `.proto` / runtime all share, so it is sequenced after the core codec. For now: optional (`T \| undefined`) and homogeneous scalar/literal unions (`"a" \| "b"` → one string field) are in-subset; discriminated / heterogeneous unions round-trip via the fallback + Warning. The classifier already produces `ProtoFormOneof`, so re-widening is localized. |
| **`map<K,V>`** | TS `Map<K,V>`, `Record<K,V>`, and string/number index signatures → protobuf `map<K,V>` when the key is `string` or an integral `number`. `Set<V>` → `repeated V`. Other key types → out-of-subset. |
| **Backward compat** | The fallback (current) format is kept **verbatim**. In-subset types **change** their wire bytes (positional → protobuf). The format is private and content-addressed (entry ids embed the binary version), with no persisted-data compat guarantee, so this is acceptable; called out in the changelog. |

## Protobuf ↔ TypeScript mapping (deliverable 1)

### Scalars

Numeric scalar is chosen from the field's **format + min/max** (the data
`integerType()` already reads), not a blanket `double`:

| TS (with format/range) | protobuf scalar | Wire | Notes |
| --- | --- | --- | --- |
| `number`, `integer`, `0 ≤ max ≤ 2³²−1` | `uint32` / `fixed32` | varint / fixed | `fixed32` when values are large+uniform; varint otherwise. |
| `number`, `integer`, `[-2³¹, 2³¹)` | `int32` / `sint32` | varint / zigzag | `sint32` (zigzag) when often-negative; `int32` otherwise. |
| `number`, `integer`, wider than 32-bit but safe-int | `double` | fixed64 | No `int64` for `number` (precision); use `bigint` for true 64-bit. |
| `number`, `float`/low-precision format | `float` | fixed32 | From a `float32`-style format. |
| `number`, unconstrained | `double` | fixed64 | Lossless fallback (current behaviour). |
| `bigint`, `[-2⁶³, 2⁶³)` | `int64` / `sint64` / `sfixed64` | varint / zigzag / fixed | |
| `bigint`, `[0, 2⁶⁴)` | `uint64` / `fixed64` | varint / fixed | |
| `boolean` | `bool` | varint | |
| `string` | `string` | length-delimited | UTF-8, already byte-identical to protobuf. |

### Composite

| TS | protobuf | Notes |
| --- | --- | --- |
| object / interface / class (structural) | `message` | Length-delimited. Fields numbered by marker/decl-order. |
| `T[]` / `ReadonlyArray<T>` | `repeated T` | Scalar elements use **packed** encoding (proto3 default). |
| `Map<K,V>` / `Record<K,V>` / index sig | `map<K,V>` | `K` ∈ {`string`, integral `number`}. |
| `Set<V>` | `repeated V` | Decoded back into a `Set`. |
| discriminated union of messages | `oneof` (deferred) | Follow-up increment; out-of-subset for now (fallback + Warning). |
| numeric `enum` | `enum` | Synthesize `_UNSPECIFIED = 0` if absent. |
| string-literal union | generated `enum` | Stable decl-order integers; lossy (int on wire). |
| `x?: T` (optional) | proto3 `optional T` | Explicit presence. |
| `Date` | `google.protobuf.Timestamp` | Well-known type. |
| `Temporal.Instant` | `google.protobuf.Timestamp` | |
| `Temporal.Duration` | `google.protobuf.Duration` | |

### Out-of-subset (→ fallback + Warning)

Heterogeneous **tuples**, **intersections** that don't reduce to a single
message, **template-literal** types (treated as `string` only if they have a
plain string format, else out), **symbols**/**functions** (already stripped by
the data-only contract), `unknown`/`any` (would need `google.protobuf.Struct`/
`Any` — deferred), `bigint` outside 64-bit, **`DataView` / `SharedArrayBuffer` /
non-`Uint8Array` typed arrays** (note `Uint8Array`/`ArrayBuffer` ARE in-subset as
`bytes`), `RegExp`, non-ISO `Temporal` calendars, and any `Map`/`Record` whose
key is not string/integral.

## `ProtoBuff<T>` constraint type (deliverable 4)

Mirrors `DataOnly<T>`'s discipline (depth-bounded, no `infer` on the hot path,
cheap structural gates). Resolves to `T` when every member is
protobuf-expressible; otherwise to an **error-branded** type that makes
`x satisfies ProtoBuff<T>` fail and names the offending member, e.g.:

```ts
type ProtoBuffError<Msg extends string> = {readonly __protoBuffError: Msg};
// ProtoBuff<{id: number; bad: symbol}> -> ProtoBuffError<"field 'bad' is not protobuf-expressible">
```

Lives beside `DataOnly` in `packages/ts-runtypes/src/runtypes/`, exported from
`index.ts`, and is compile-tested under `packages/ts-runtypes/test/types/`
(the same slice-and-compile harness pattern as `dataonly.compile.test.ts`).

### `ProtoData<T>` decoder projection

`createBinaryDecoder<T>()` (and a protobuf decoder) return `ProtoData<T>` — a
sibling of `DataOnly<T>` that is identical EXCEPT it KEEPS `Uint8Array` /
`Uint8ClampedArray` / `ArrayBuffer` (protobuf `bytes`) instead of stripping
them. `DataOnly<T>` itself is unchanged (its instantiation budget is
load-bearing and was deliberately tuned last task); `ProtoData<T>` is a
separate, self-contained projection so the bytes round-trip is reflected in the
decode return type without perturbing every `DataOnly` consumer. It is sliced +
compiled by the same per-branch budget harness as `DataOnly`.

## Field numbering mechanism (the central problem)

- **Default:** 1-based declaration order over the message's serializable fields
  (after data-only stripping), skipping numbers reserved by markers.
- **Explicit:** `ProtoField<N>` pins a field to number `N`. Type-level brand the
  Go marker scanner recognizes on the property (same machinery family as
  `InjectRunTypeId`, but read at the property position). Pinning is what makes
  the wire stable across reorders/inserts — the idiomatic protobuf workflow.
- **Collision/validation:** duplicate or out-of-range (`1 ≤ N ≤ 536870911`,
  excluding the reserved `19000–19999`) numbers are a build **Error**.
- **Single source of truth:** numbers are assigned once in Go and used for BOTH
  the wire tags and the generated `.proto`, so they cannot drift.

## `.proto` generation (deliverable 5)

For each in-subset top-level type, emit a deterministic `.proto3` file using the
assigned field numbers. Nested messages, enums, `oneof`, `map`, and well-known
imports (`Timestamp`/`Duration`) are emitted as needed. Deterministic ordering
(by field number) so regeneration is stable. Surfaced via the binary/CLI (exact
delivery path — plugin virtual module vs. CLI command — settled in the
implementation plan).

## Parity harness (deliverable 6)

protobuf.js as the trusted oracle, in the Vitest suite:

1. Our encoder's bytes decode correctly through protobuf.js (parse our `.proto`,
   `decode` our bytes, deep-equal the expected message).
2. protobuf.js-encoded bytes decode correctly through **our** decoder.
3. Our generated `.proto` parses/compiles under protobuf.js (and optionally
   `protoc` if present).

Strictly `devDependencies`; the shipped codec keeps zero runtime deps.

## Wire-format additions needed (runtime, `dataView.ts`)

Varint LEB128 already exists. To reach protobuf wire we add: **tag** read/write
(`(field_number << 3) | wire_type`), **zigzag** encode/decode for `sint*`,
**fixed32/fixed64** little-endian read/write (DataView already has the
primitives), **length-delimited** sub-message framing (varint length + bytes),
and **packed repeated** scalar runs. These are additive helpers; the fallback
codec is untouched.

## Build / verification gate

Go side: `go test ./internal/...`. Rebuild `bin/ts-runtypes` (main's binary is
stale relative to this branch), rebuild `runtypes-devtools`, then `pnpm test`
(the plugin tests spawn the binary). New coverage: subset-membership predicate
(Go), scalar selection (Go), `ProtoBuff<T>` compile tests (TS), `.proto`
generation snapshot (Go/TS), and the protobuf.js parity harness (TS) — both
`getRunTypeId` call shapes where the marker API is exercised.
