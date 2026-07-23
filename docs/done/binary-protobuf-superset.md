# Align the binary format with Protocol Buffers — WILL NOT IMPLEMENT

> **Status: started, then dropped mid-implementation (2026-06-25).** A working
> foundation was built on branch `claude/binary-protobuf-superset` (subset
> predicate, scalar selection, `Uint8Array`/`ArrayBuffer` → `bytes`, field-number
> layout, field classifier, deterministic `.proto` generation, and the runtime
> protobuf wire primitives — all tested) and then **removed**. On closer analysis
> the benefit did not justify the cost, so the work was stopped roughly half-way
> (no wire emitter, no `ProtoBuff<T>`, no parity harness). This file records the
> decision so the idea is not re-investigated from scratch.

## Why not

1. **Protobuf only pays off for interop with systems that are not ours.** When both
   ends are our paired `createBinaryEncoderFn<T>` / `createBinaryDecoderFn<T>`, the wire
   format is a private implementation detail; protobuf's per-field tags, length
   prefixes, and tag-dispatch decode loop are pure overhead with no benefit.
2. **That audience barely exists for a TS-first server.** Protobuf in JS shows up
   almost only at a polyglot / gRPC boundary. A non-JS system being a client of a
   TS-first JS server, with the TS types as the contract, is not a realistic
   target; and teams who do live in protobuf are `.proto`-first with existing
   tooling (`ts-proto`, `buf`), i.e. the opposite direction from ours.
3. **It is slower and more restricted than what we already have.** Decode is a
   tag-driven loop (vs. our positional reads), it is larger for dense structs, and
   protobuf's data model is narrower than TypeScript, so a large set of types
   (`oneof` / discriminated unions, enums, `Date` / `Temporal`, etc.) only ever
   fall back anyway.
4. **The real win was elsewhere.** Most of binary's size advantage comes from
   dropping property names, which tuple-JSON captures at native
   `JSON.parse` / `stringify` speed without the expensive JS-to-buffer round-trip.
   Binary stays the right tool only for numeric / byte-heavy payloads (`bigint`,
   float-dense arrays, `Uint8Array`). That is the chosen direction instead:
   [small-json-tuple-strategy.md](../todos/small-json-tuple-strategy.md).

## What it was (original intent)

Make the binary format a superset of Protocol Buffers: emit protobuf
wire-compatible bytes for the protobuf-expressible subset of a TS type (readable
cross-language given a generated `.proto`), fall back to the current binary
encoding plus a build-time Warning otherwise, and add a `ProtoBuff<T>` constraint
type so users could statically assert protobuf-compatibility. Measured against
[binary-only-benchmark.md](../todos/binary-only-benchmark.md), sibling of the
tuple-JSON strategy.

## Disposition

- All implementation and investigation files from the branch were deleted in the
  tidy-up commit; the current binary format and everything else are untouched.
- The foundation is recoverable from git history (branch
  `claude/binary-protobuf-superset`, commits up to `3a12881`) if this is ever
  revisited under a concrete gRPC / polyglot-interop requirement.
