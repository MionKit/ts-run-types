# Protobuf alignment — investigation (maybe)

> **Status: investigation only.** Nothing here is implemented or scheduled. This
> documents what it would take to make ts-runtypes' binary serialization
> interoperate with Protocol Buffers, which TypeScript features map cleanly, which
> do not, and a sketch of a "TS-superset of protobuf" that round-trips every TS
> type while emitting build-time diagnostics whenever a type steps outside what
> the protobuf spec can express.

## Why this might be worth it

The current binary format is **private and positional**: both sides know the
exact `RunType` ahead of time, so the wire carries values only (no field names,
no field numbers, no type tags beyond union discriminators). That makes it very
compact, but it is **ts-runtypes-only** — no other language or tool can read it.

Protobuf is the opposite trade: it spends bytes on a field-number tag per field
so the payload is self-describing enough to be read by any language's protobuf
runtime, survive field add/remove, and integrate with the gRPC / protobuf
ecosystem. Aligning would let a ts-runtypes service exchange binary messages
with Go / Rust / Java / Python services and generate `.proto` schemas from
TypeScript types.

The appealing part: TypeScript is a far richer type system than proto3, and we
already carry a precise `RunType` graph plus numeric **format brands**
(`int8`/`int16`/`int32`, `uint8/16/32`, `BigInt64`, `Float`, …) that line up
almost 1:1 with protobuf scalar types. So the mapping is mostly mechanical — the
interesting work is the handful of TS features protobuf simply cannot represent,
and deciding what to do about them.

## TL;DR / recommendation

- A **proto3-compatible target** is feasible for the common DTO subset
  (messages, scalars, enums, repeated, maps, nested messages, Date→Timestamp).
  Our format brands give us the scalar-width info proto needs.
- The blockers are **structural**, not scalar: protobuf has **no tuples, no
  arbitrary unions, no literal types, no heterogeneous index keys, no
  `undefined`/`null` distinction, and requires stable per-field numbers** that
  TypeScript does not provide.
- The pragmatic shape is a **superset**: emit standard protobuf for everything
  mappable (so external tools interop), define a small, documented extension
  encoding for the TS-only constructs, and raise a **build-time diagnostic**
  (new `PB0xx` codes) whenever a type uses a feature that is lossy or
  unrepresentable under strict proto3 — exactly mirroring how
  `createValidate` already warns on non-serialisable members.
- This is a **second serialization target**, not a tweak to the existing one. It
  trades the current format's compactness (no field tags) for cross-language
  interop. Both should coexist; the user picks per encoder.

## Two different contracts

| | current ts-runtypes binary | protobuf |
| --- | --- | --- |
| Schema knowledge | both sides hold the exact `RunType` | embedded field tags; schema optional at read |
| Field identity | **positional** (declaration order) | **field number** in every tag |
| Per-field overhead | none (values only) | 1+ byte tag per present field |
| Optional fields | shared presence bitmap (1 bit each) | per-field presence (tag absent = unset) |
| Cross-language | no | yes |
| Forward/back compat | no (schema lock-step) | yes (unknown fields preserved) |
| Unions | discriminator byte + flat-merged props | `oneof` (named fields only) |

The headline consequence: **our format is smaller**, protobuf is **portable**.
Aligning is about offering portability as an option, not replacing the compact
format.

## Protobuf wire-format primer (proto3)

- Every field on the wire is `tag = (field_number << 3) | wire_type`, written as
  a varint, followed by the payload.
- **Wire types:** `0` varint (`int32/64`, `uint32/64`, `sint32/64` zig-zag,
  `bool`, `enum`); `1` 64-bit (`fixed64`, `sfixed64`, `double`); `2`
  length-delimited (`string`, `bytes`, embedded message, **packed** repeated
  scalars); `5` 32-bit (`fixed32`, `sfixed32`, `float`).
- **Scalars:** `double float int32 int64 uint32 uint64 sint32 sint64 fixed32
  fixed64 sfixed32 sfixed64 bool string bytes`.
- **message** → length-delimited (a sub-stream of tagged fields).
- **repeated** → packed (scalars: one length-delimited run) or unpacked (one tag
  per element for messages).
- **map<K,V>** → sugar for `repeated MapEntry { key = 1; value = 2; }`; **K is
  restricted to integral or string types** (no float, bytes, enum, or message
  keys).
- **oneof** → a set of fields sharing "at most one set"; each member keeps its
  own field number and type. Members **cannot be `repeated`**.
- **presence:** proto3 `optional` puts the field in a synthetic one-field oneof
  so absence is observable; bare scalars default to zero-value with no presence.
- **enum** → varint; the first value must be `0`.
- **Well-known types:** `google.protobuf.Timestamp` (`int64 seconds` + `int32
  nanos`), `Duration`, `Any`, `Struct`/`Value`/`ListValue` (JSON-shaped),
  `NullValue`, scalar wrappers (`Int32Value` …), `Empty`, `FieldMask`.

## Feature mapping: TypeScript → protobuf

Legend: ✅ native · 🟡 well-known / lossy-but-faithful · 🔶 representable with an
extension or a convention · ❌ not expressible in proto3.

### Scalars & format brands (the easy, high-value part)

| TS / RunType | proto3 | status | notes |
| --- | --- | --- | --- |
| `boolean` | `bool` | ✅ | |
| `string`, template-literal | `string` | ✅ | template-literal collapses to `string` (constraint lost on wire) |
| `number` (unbranded) | `double` | ✅ | JS number is f64; `NaN`/`±Infinity` are representable in `double` |
| `Float` brand | `double` (or `float`) | ✅ | `float` if a 32-bit brand is added |
| `Integer` / `PositiveInt` | `int64` / `uint64` | 🟡 | JS safe-int range exceeds `int32`; `int64` is safe, but decodes as `bigint`/`string` in some runtimes |
| `int8` / `int16` / `int32` | `int32` (or `sint32`/`sfixed32`) | ✅ | brand gives exact width; sub-32 widths still ride `int32` on the wire |
| `uint8` / `uint16` / `uint32` | `uint32` (or `fixed32`) | ✅ | |
| `bigint` (unbranded) | `string` | 🟡 | arbitrary precision; no proto scalar fits |
| `BigInt64` | `int64` | ✅ | |
| `BigUInt64` | `uint64` | ✅ | |
| `Uint8Array` / bytes brand | `bytes` | ✅ | |
| `Date` | `google.protobuf.Timestamp` | 🟡 | seconds+nanos; sub-ms ok, but invalid dates can't map |
| `Temporal.Instant` | `Timestamp` | 🟡 | nanosecond precision fits seconds+nanos |
| `Temporal.PlainDate/Time/DateTime/YearMonth` | custom message or `string` | 🔶 | no proto well-known; encode as a small message or ISO string |
| `Temporal.ZonedDateTime/Duration/MonthDay` | `string` / `Duration` | 🟡 | `Duration` for `Temporal.Duration`; others ISO string |
| `RegExp` | message `{ source: string; flags: string }` | 🔶 | no well-known; a conventional message |
| literal types (`'a'`, `42`, `true`) | — | ❌ | proto has no singleton type; see Unions / Enums below |

### Containers

| TS | proto3 | status | notes |
| --- | --- | --- | --- |
| `interface` / object literal | `message` | ✅ | each prop → a numbered field |
| nested object | embedded `message` | ✅ | |
| `T[]` / `ReadonlyArray<T>` | `repeated T` | ✅ | packed for scalar `T` |
| `Array<Array<T>>` | — | 🔶 | proto has **no repeated-of-repeated**; wrap inner array in a message |
| tuple `[A, B, C]` | message `{ f1: A; f2: B; f3: C }` | 🔶 | loses "tuple-ness"; positional → named fields by convention |
| tuple with rest `[A, ...B[]]` | message `{ head: A; rest: repeated B }` | 🔶 | convention |
| `Record<string, V>` / index sig | `map<string, V>` | ✅ | if `V` is mappable |
| `Record<number, V>` | `map<int32, V>` (or `int64`) | 🟡 | proto map int keys are 32/64-bit |
| `Record<symbol, V>` / arbitrary key | — | ❌ | proto map keys must be integral or string |
| `Map<K, V>` | `map<K, V>` | 🟡 | only if `K` is string/integral; arbitrary `K` ❌ |
| `Set<T>` | `repeated T` | 🟡 | uniqueness not enforced on the wire |
| `enum` (numeric) | `enum` | ✅ | proto requires a `0` member; may need a synthetic `UNSPECIFIED = 0` |
| `enum` (string) / const enum | `enum` + value map | 🟡 | proto enum values are integers; need a name↔number table |

### Unions, presence, top & bottom

| TS | proto3 | status | notes |
| --- | --- | --- | --- |
| discriminated union of messages | `oneof` | 🔶 | each member → a message field in a `oneof`; needs synthetic field names + numbers |
| union of scalars (`string \| number`) | `oneof { string; double }` | 🔶 | synthetic field per member |
| union incl. `repeated` member (`T[] \| U`) | — | ❌ | `oneof` members can't be `repeated`; wrap the array in a message |
| union of literals (`'a' \| 'b'`) | `enum` | 🟡 | all-string or all-number literal unions → enum; mixed ❌ |
| `optional` property (`x?: T`) | proto3 `optional T` | ✅ | per-field presence |
| `T \| undefined` | `optional T` | 🟡 | `undefined` ≈ "unset"; can't distinguish present-undefined |
| `T \| null` | `optional T` + `NullValue`, or `Value` | 🟡 | proto has no bare null; `NullValue`/`Value` carry it |
| `undefined` vs `null` both in a union | — | ❌ | proto can't model two distinct "empties" |
| `any` / `unknown` | `google.protobuf.Value` / `Any` / `bytes` | 🟡 | `Value` (JSON-shaped) is the faithful choice |
| `void` / `never` | — | ❌ | no field; `never` is a build error already |
| intersection (`A & B`) | merged `message` | 🔶 | structurally flatten into one message |
| recursive / circular types | self-referential `message` | ✅ | proto supports message self-reference |

### Not serialisable (already handled by ts-runtypes today)

`function`, `Promise`, `symbol`, methods, getters/setters, symbol-keyed props —
these are dropped or error today (VL/TB diagnostics) and are simply **out of
scope** for any wire format, proto included.

## The hard problems

1. **Stable field numbers.** Protobuf identifies fields by number, forever. TS
   has none. Options: (a) **declaration order** `1..N` — simple, but a reorder or
   insert silently breaks compatibility; (b) an explicit `@field(3)` JSDoc tag /
   a `FieldNumbers<T>` enrichment map (like the existing `FriendlyType`/`MockData`
   maps) so numbers are pinned in source; (c) a **name-derived** number (hash of
   the property name into the field-number space) — stable across reorders but
   risks collisions and wastes the low-tag-number byte budget. This is the single
   biggest design decision and the main reason proto-compat is a separate target.

2. **Unions → `oneof`.** Works only when members are distinguishable as named
   message/scalar fields and none is `repeated`. Discriminated unions map well;
   unions mixing arrays, literals, `null`/`undefined`, or overlapping object
   shapes need conventions or fall to ❌.

3. **Tuples.** No proto equivalent. The faithful encoding is a message with
   positional field names (`f1`, `f2`, …); round-trips within ts-runtypes but a
   foreign consumer sees a struct, not a tuple.

4. **Literal & template-literal types.** Erased to their base type on the wire;
   the literal constraint survives only in ts-runtypes' own validation, not in
   the `.proto`.

5. **Number type selection.** Unbranded `number` must default to `double` (only
   scalar that holds the full JS range incl. `NaN`/`Inf`). Branded formats let us
   pick `int32`/`uint32`/`int64` precisely — a real advantage over sch/zod which
   lack width info. A `float` (32-bit) and `sint`/`fixed` brand set would round
   out the mapping.

6. **`null` / `undefined`.** proto3 presence covers "absent"; representing an
   explicit `null` needs `NullValue`/`Value`, and distinguishing
   present-`undefined` from absent is impossible. ts-runtypes' data-only
   projection already removes most of this, but unions like `T | null |
   undefined` are genuinely unmappable.

7. **Map keys.** proto restricts map keys to integral/string. `Map<Foo, V>` or
   `Record<` branded-key `, V>` cannot be a proto map.

## The "TS-superset of protobuf" idea

Treat proto3 as the **compatible core** and layer the TS-only constructs on top:

- **Mappable types** emit standard proto3 wire (field-tagged), so any protobuf
  runtime in any language can read them via a generated `.proto`.
- **TS-only constructs** (tuples, arbitrary unions, literals, `Set`, dual
  null/undefined, non-integral map keys) use a documented **extension encoding**.
  Because protobuf parsers ignore unknown field numbers, the extension can be
  carried in a high field-number range or a wrapper message so a vanilla proto
  consumer still parses the message (skipping what it can't model) while
  ts-runtypes round-trips it fully.
- A **strictness knob** on the encoder:
  - `proto: 'strict'` → **error** (a `PB0xx` diagnostic) the moment a type uses a
    construct proto3 can't express, so the output is guaranteed vanilla-proto.
  - `proto: 'superset'` (default) → encode everything, **warn** (`PB0xx`) on each
    lossy/extension mapping so the author knows which fields a foreign consumer
    won't fully understand.
- **Diagnostics** reuse the existing build-time diagnostic pipeline (the
  `diag` package + the website diagnostic catalog). New codes, e.g.
  `PB001 tuple → positional message`, `PB002 union member not expressible in
  oneof`, `PB003 literal erased to base type`, `PB004 map key not integral/string`,
  `PB005 null/undefined not distinguishable`, `PB006 Set → repeated (uniqueness
  not enforced)`, `PB007 unbranded number → double`, each with severity tuned to
  the strictness mode.

## What it would take (work breakdown)

1. **A proto wire emitter.** A new RT-function family (`toProto`/`fromProto`),
   mirroring the `toBinary`/`fromBinary` emitters but writing field-number tags +
   the proto wire types instead of the positional layout. Reuses the walker,
   `DataViewSerializer`, varint code, and the family-registration checklist in
   `CLAUDE.md` (operations registry, `typefns.Families`, dispatch flags, runtime
   `familyMeta`, `InjectTypeFnArgs<T, '<key>'>`).
2. **A field-number strategy.** Pick (b) explicit `FieldNumbers<T>` enrichment +
   (a) declaration-order fallback, with a build error on collision/gap. This is
   the make-or-break design call and should be settled first.
3. **`.proto` schema generation.** Walk the `RunType` graph → emit
   `message`/`enum`/`oneof`/`map` definitions with the mapping rules above, the
   well-known imports (`Timestamp`, `Duration`, `Struct`, `Value`), and a comment
   per field noting any lossy mapping. This is the cross-language interop
   deliverable and can ship before/independently of the binary emitter.
4. **Well-known type integration.** `Date`/`Temporal.Instant` → `Timestamp`,
   `Temporal.Duration` → `Duration`, `any`/`unknown` → `Value`, `null` →
   `NullValue`. Needs runtime encode/decode for each.
5. **Number-format → proto-scalar table.** Mostly done conceptually (brands
   above); add `float`/`sint`/`fixed` brands if the precise wire types matter.
6. **Diagnostics + strictness modes.** The `PB0xx` catalog, the
   `proto: 'strict' | 'superset'` option, website catalog entries.
7. **Tests.** Round-trip within ts-runtypes; **cross-runtime** round-trip against
   a real protobuf library (encode here, decode in `protobufjs` / `google-protobuf`
   and vice-versa) for the mappable subset; a fuzz oracle that the generated
   `.proto` + a reference proto runtime agree with our encoder on every mappable
   generated type.

## Tradeoffs & open questions

- **Compactness vs interop.** Field tags cost ≥1 byte/field; our positional
  format costs zero. For closed ts-runtypes-to-ts-runtypes links the current
  format wins on size; proto only pays off when a foreign consumer or schema
  evolution is in play. Hence: **additional target, default stays positional.**
- **Is `.proto` generation alone the 80/20?** Possibly. Emitting `.proto` from TS
  types (so other services can codegen clients) may deliver most of the interop
  value without ts-runtypes itself speaking the proto wire — worth scoping as a
  first, smaller step.
- **Field-number stability** is a contract the author must own; without explicit
  numbers, "compatible" is a promise we can't keep across refactors.
- **proto2 vs proto3 vs editions.** proto3 is assumed here; explicit-presence and
  `optional` semantics differ in proto2/editions and would change the null/absent
  mapping.

## Suggested first step (if this ever graduates from "maybe")

Ship **`.proto` schema generation + the `PB0xx` diagnostic catalog** as a
read-only, no-wire-change feature: it surfaces exactly which types are
proto-clean vs lossy vs unrepresentable, validates the mapping table against a
real proto compiler, and gives users the cross-language schema — all before
committing to a second binary wire format.
