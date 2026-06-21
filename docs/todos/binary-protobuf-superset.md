# Align the binary format with Protocol Buffers — a protobuf superset

> **Status: TODO (design note, 2026-06-24).** Came out of the same serialization
> analysis: the binary codec is slower than native JSON in a JS runtime, and its
> biggest *missing* justification is **interop** — today the wire format is private,
> so there is no cross-language reason to pay binary's CPU cost. This todo
> re-justifies binary by aligning its wire format with Protocol Buffers (interop for
> the supported subset) while keeping the current format as a fallback for the
> TypeScript features protobuf cannot express. Sibling of
> [small-json-tuple-strategy.md](small-json-tuple-strategy.md): tuple-JSON wins
> general RPC; protobuf-aligned binary keeps the numeric / typed-array / at-rest /
> cross-language niche. Builds on the binary sizing work in
> [docs/done/binary-encoder-sizing-redesign.md](../done/binary-encoder-sizing-redesign.md)
> and is measured by [binary-only-benchmark.md](binary-only-benchmark.md).

## Goal

Make the RunTypes binary format a **superset of Protocol Buffers**:

- When a type is fully expressible in protobuf, encode it in a **protobuf
  wire-compatible** way (so the bytes are readable by a standard protobuf decoder
  in any language, given the schema), picking the **narrowest scalar the type's
  format + min/max allow** rather than a blanket `double` (see deliverable 7).
- When a type uses a TypeScript feature **outside** the protobuf-expressible
  subset, fall back to the **current** binary encoding for that part, and emit a
  build-time **Warning** ("type uses `<feature>` not supported by Protocol Buffers;
  encoded with RunTypes binary, not protobuf-interop-compatible").
- Provide a `ProtoBuff` (working name) constraint type so users can statically
  assert protobuf-compatibility: `const msg = {…} satisfies ProtoBuff<T>` (or
  `T extends ProtoBuff`), which type-errors when `T` contains an unsupported
  feature.
- **Emit `.proto` schema files** for the supported types (the schema the other side
  needs to read our bytes) and **use existing JS protobuf tooling as the parity
  oracle** — round-trip our bytes through a real protobuf implementation and compile
  our generated `.proto` — so "protobuf-compatible" is *verified, not asserted*. The
  JS protobuf lib is a dev/test dependency only; the shipped codec keeps its
  dependency-free posture (no protobuf runtime dep).

## Why

- **Interop is the only justification binary is missing.** It is already private +
  CPU-slow in JS; protobuf alignment is the one thing that turns "a private binary
  blob" into "bytes another service/language can read", which is the classic reason
  to accept a binary format at all.
- **Salvages the binary investment.** Rather than removing the codec (the
  alternative considered), this gives it a real, differentiated home: numeric-heavy
  / typed-array / at-rest payloads *and* cross-language interop.
- **Pairs with the small-json strategy.** With tuple-JSON taking the general-RPC
  payload win at native speed, binary no longer needs to justify itself for
  ordinary app data — it specializes in interop + packed numerics.

## Deliverables

1. **A protobuf ↔ TypeScript feature mapping** (the core artifact): scalars
   (`int32`/`int64`/`uint32`/`uint64`/`sint*`/`fixed*`/`float`/`double`/`bool`/
   `string`/`bytes`), `message` ↔ object, `repeated` ↔ array, `map<K,V>` ↔ `Record`
   / index signature, `enum` ↔ TS enum / literal-union, `oneof` ↔ discriminated
   union, field presence/`optional`/defaults, nested messages, and well-known types
   (`Timestamp`/`Duration` ↔ `Date`/`Temporal`, `Struct`/`Any` ↔ `unknown`).
   Document each direction and the lossiness.
2. **The supported subset definition** — exactly which TS constructs map to
   protobuf and which do not (literal types, template-literal types, arbitrary
   unions/intersections, tuples, symbols, functions, index signatures beyond
   `map<>`, etc. land in the unsupported set).
3. **Emitter changes** — in-subset types emit protobuf-wire bytes; out-of-subset
   types fall back to the current binary encoding and raise the Warning diagnostic
   (new code, Warning severity, same machinery as VL010-style warnings; surfaced at
   the `createBinaryEncoder<T>()` call site).
4. **The `ProtoBuff<T>` constraint type** — resolves to `T` when every member is
   protobuf-expressible, otherwise to an error-branded type so
   `x satisfies ProtoBuff<T>` fails compilation, ideally naming the offending
   member.
5. **`.proto` schema generation (core, not stretch)** — emit a `.proto` file from
   each supported TS type, using the *same* stable field numbers the emitter writes
   on the wire (single source of truth). It is half of interop: the other side needs
   the schema to read our bytes. Must regenerate deterministically.
6. **Parity harness built on existing JS protobuf tooling** — wire a JS protobuf
   library into the test suite as the trusted oracle: (a) our encoder's bytes decode
   correctly through it, (b) its bytes decode correctly through our decoder, and
   (c) our generated `.proto` compiles (via the lib's parser or `protoc`). This is
   how parity is *enforced* in CI rather than eyeballed. Strictly a dev/test
   dependency — never pulled into the shipped codec.
7. **Format + min/max → narrowest protobuf scalar (refines #1).** Use each type's
   *format* and numeric limits to select the tightest correct protobuf scalar
   instead of mapping every `number` to `double`. This is the *same* constraint data
   the binary codec's `precalculate` sizing already reads to compute exact byte sizes
   ([docs/done/binary-encoder-sizing-redesign.md](../done/binary-encoder-sizing-redesign.md)) —
   reuse that analysis as the single source of truth. Examples: an `int32`/`uint8`
   format, or a min/max inside `[-2^31, 2^31)`, → `int32`; `min ≥ 0` → an unsigned
   type (`uint32`/`fixed32`); 64-bit ranges → `int64`/`uint64` (TS `bigint`); a
   `float32`/low-precision format → `float`, otherwise `double`; signed-and-often-
   negative → `sint*` (zigzag); an unconstrained `number` falls back to `double`
   (no precision loss).

## Open questions (resolve as part of this todo)

- **Field numbers/tags — the central problem.** Protobuf wire keys on field
  *numbers*, not names or positions. How do we derive *stable* field numbers from a
  TS type? (declaration order, an explicit marker/annotation, deterministic hashing
  with collision handling). Stability across edits is required for interop.
- **proto2 vs proto3.** Default to proto3; reconcile presence/defaults/`optional`
  semantics with TS optional + the data-only contract.
- **64-bit ints.** `int64`/`uint64`/`fixed64` exceed JS safe-integer range → map to
  `bigint`; define the TS-side representation.
- **`bytes` ↔ `Uint8Array`/`ArrayBuffer`** and **packed `repeated` scalars** — this
  is binary's genuine both-axes win (small *and* fast via bulk copy). Confirm
  whether the encoder can zero-copy typed arrays / packed numerics rather than
  walking element-by-element; that determines how strong the numeric niche really
  is.
- **`enum`** needs integer values; define the TS enum / literal-union → protobuf
  enum mapping (and reserved/unknown values).
- **`oneof` ↔ discriminated unions** — discriminator field + variant mapping.
- **`map<K,V>` key constraints** — protobuf maps allow only integral/string keys;
  reconcile with TS `Record`/index-signature key types.
- **Wire coexistence.** How does a payload signal protobuf-mode vs fallback-mode —
  per message, per field, or whole-message? A message containing any out-of-subset
  field is not protobuf-readable as a whole; decide whether the superset is
  per-message all-or-nothing for interop purposes.
- **Backward compatibility** with the current binary format / already-emitted
  `createBinaryEncoder` output, and whether the current format stays as the
  fallback verbatim or is refactored.
- **The interop bar.** Is the goal *true* protobuf interop (a real `protoc`/protobuf
  library in another language decodes our bytes from a generated `.proto`) or merely
  "protobuf-shaped"? True interop sets the field-number + wire-format + `.proto`
  requirements above; pick the bar explicitly.
- **`satisfies ProtoBuff` ergonomics** — how to produce a *useful* type error that
  points at the unsupported member.
- **Which JS protobuf tool** for the parity oracle (and possibly `.proto` parsing) —
  protobuf.js (runtime `.proto` parse + reflection), `@bufbuild/protobuf`
  (+ `protoc-gen-es`, modern/codegen), or `ts-proto`. Pick one; it must stay a
  dev/test-only dependency and never reach the shipped codec.
- **`.proto` ↔ wire single source of truth.** The field numbers in the generated
  `.proto` must be exactly the numbers the emitter writes; derive both from one
  place so they cannot drift.
- **Scalar-selection heuristics** (deliverable 7): signed vs unsigned (`min ≥ 0`);
  varint vs fixed (`fixed32`/`fixed64` for large/uniform values, varint/`sint` for
  small or signed); 32 vs 64 bit by range; `float` vs `double` by precision
  constraint; and the boundary cases where a range straddles a type limit. The
  choice must match what the generated `.proto` declares *and* what `precalculate`
  assumes for sizing.

## Acceptance

- A documented protobuf ↔ TS mapping + the supported-subset list.
- For an in-subset type: a `.proto` is emitted and compiles (`protoc` / the JS tool's
  parser), and bytes round-trip **both ways** through a real JS protobuf library
  (our encode → its decode, and its encode → our decode) — parity enforced by the
  tooling harness in CI, not by inspection.
- Format-constrained numerics select the narrowest correct scalar (a `uint8` /
  `int32` / min-max-bounded field is **not** emitted as `double`), and the selected
  type agrees with both the generated `.proto` and the `precalculate` byte size.
- An out-of-subset type still round-trips via the current binary fallback **and**
  emits the "not protobuf supported" Warning at build time.
- `x satisfies ProtoBuff<T>` compiles for supported `T` and fails (with a member-
  pointing message) for unsupported `T`.
- Docs updated (README / [docs/ARCHITECTURE.md](../ARCHITECTURE.md) / website
  serialization + interop pages); benchmark note/column if the protobuf path changes
  measured size/speed; `git mv` this file to [docs/done/](../done/) on ship.
