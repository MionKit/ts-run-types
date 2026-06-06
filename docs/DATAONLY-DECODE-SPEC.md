# Spec: `DataOnly<T>` return types for JSON & binary decoders

**Status:** Proposed — spec only. Full investigation + implementation plan to follow.
**Scope:** type-level return annotation for the decode APIs. No runtime or emitter change.

## Problem

`createJsonDecoder<T>()` and `createBinaryDecoder<T>()` today return `=> T`.

A decoded value is reconstructed from JSON / bytes, so it can only hold serialisable
data — it can never carry the functions, methods, `Promise`s, symbols, or
non-serialisable built-ins (typed arrays, `ArrayBuffer`, `DataView`, …) that `T`
may declare. For any such **"dirty" `T`**, `=> T` is **unsound**: the type promises
members the value does not have, so calling e.g. a method on a decoded value
type-checks but throws at runtime.

This is sharper than `isType`, where over-promising is harmless — a decoder hands
back a real object the caller will consume as `T`.

## Proposal

Annotate the decode return as the data-only projection:

- `createJsonDecoder<T>()` → `JsonDecoderFn<DataOnly<T>>`
- `createBinaryDecoder<T>()` → `(bytes) => DataOnly<T>`

`DataOnly<T>` ([`src/runtypes/types.ts`](../packages/ts-go-run-types/src/runtypes/types.ts))
is the exact shape the AOT validator/serialiser produces: keeps primitives /
`Date` / `RegExp` / `Map` / `Set` / Temporal, strips functions / constructors /
`Promise` / symbols / non-serialisable built-ins, projects plain & host classes
structurally, recursing through arrays / tuples / objects (depth-bounded). On an
already-data-only `T` it is the **identity** (`DataOnly<T> ≡ T`), so clean DTOs see
no change in their type.

**No emitter or runtime change.** `DataOnly` is purely the type-level return
annotation; the Go side already drops/throws on the same members. This only makes
the TypeScript signature tell the truth about what the decoder returns.

## Scope

- **IN:** type-first decode return types — `createJsonDecoder<T>()`,
  `createBinaryDecoder<T>()` (keep the value-first / schema overloads consistent).
- **OUT — encoders** (`createJsonEncoder` / `createBinaryEncoder`): they take `T`
  as *input* (you pass your real object; non-data is dropped at emit), so the input
  type stays `T`.
- **OUT — `isType` / `getTypeErrors`:** separate discussion; `DataOnly` there is the
  identity on data and lower value.
- **OUT — emitter semantics, diagnostics, unknown-key families:** unchanged.

## Why `DataOnly` (vs "return exact `T` or fail")

A stricter alternative — make the emitter **error** on any unsupported member so
decoders return exact `T` — was considered and set aside:

- **breaking:** reverses the documented silent-drop contract (`Warning = expected
  drop`);
- **shallow `Omit` burden:** forces per-type `Omit<T, K>`, which only strips
  top-level keys — a nested non-data member can't be `Omit`-ed without redefining
  the nested type;
- **pushes the work onto every consumer.**

`DataOnly` is automatic, recurses into nesting, and is non-breaking.

## Overhead (measured)

Compile-time only; zero runtime. ~620 type-instantiations per **distinct** response
type; **~1 per additional use** (TS caches the instantiation per type), linear in
distinct-type count, incremental across builds. 100 distinct response types ≈ 62k
instantiations (~0.2 s — a few % of a real typecheck). Cost is bounded by the number
of distinct response types, **not** by the number of endpoints or client usages, so
routing every return value through it scales linearly and reuse is effectively free.

## Open questions (for the implementation phase)

1. Value-first / schema decoders (`createJsonDecoder(rt)`): derive the same
   `DataOnly`-projected static type, or leave as-is?
2. `JsonDecoderFn` shape change ([`createRTFunctions.ts`](../packages/ts-go-run-types/src/createRTFunctions.ts))
   and `createBinaryDecoder` signature ([`createBinary.ts`](../packages/ts-go-run-types/src/createBinary.ts))
   — overload ergonomics and any consumers relying on `=> T`.
3. Test suite: decode round-trip / id-integrity cases that assert `=> T` need
   updated expectations; reuse the `DataOnly` faithfulness harness
   ([`test/types/dataonlyHarness.ts`](../packages/ts-go-run-types/test/types/dataonlyHarness.ts)).
4. This deliberately re-introduces the previously-reverted "decoder `DataOnly`"
   change — confirm nothing tied to that revert needs re-touching.
5. Docs: README decode examples + the CLAUDE.md "isType contract" section should
   note that decode returns the data-only projection.

## Acceptance

- `createJsonDecoder<Dirty>()` / `createBinaryDecoder<Dirty>()` return the projected
  (data-only) type; clean DTOs are unchanged (`DataOnly<T> ≡ T`).
- No runtime or emitter behaviour change; all existing decode round-trips pass.
- `DataOnly` faithfulness + per-branch instantiation-budget tests stay green.
