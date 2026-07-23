# Spec: `DataOnly<T>` return types for JSON & binary decoders

> _Resurfaced historical doc, kept as a record of implemented work. Project names have changed since: `ts-go-run-types` / `@mionjs/ts-go-run-types` is now `ts-runtypes`, the `vite-plugin-runtypes` plugin is now `ts-runtypes-devtools`, and `reflectRunTypeId(value)` is now `getRunTypeId(value)`. Some paths and symbols below may since have been renamed, removed, or ported to Go._

**Status:** Implemented. `createJsonDecoderFn<T>()` / `createBinaryDecoderFn<T>()` return `DataOnly<T>`.
**Scope:** type-level return annotation for the decode APIs. No runtime or emitter change.

## Problem

`createJsonDecoderFn<T>()` and `createBinaryDecoderFn<T>()` today return `=> T`.

A decoded value is reconstructed from JSON / bytes, so it can only hold serialisable
data — it can never carry the functions, methods, `Promise`s, symbols, or
non-serialisable built-ins (typed arrays, `ArrayBuffer`, `DataView`, …) that `T`
may declare. For any such **"dirty" `T`**, `=> T` is **unsound**: the type promises
members the value does not have, so calling e.g. a method on a decoded value
type-checks but throws at runtime.

This is sharper than `validate`, where over-promising is harmless — a decoder hands
back a real object the caller will consume as `T`.

## Proposal

Annotate the decode return as the data-only projection:

- `createJsonDecoderFn<T>()` → `JsonDecoderFn<DataOnly<T>>`
- `createBinaryDecoderFn<T>()` → `(bytes) => DataOnly<T>`

`DataOnly<T>` ([`src/runtypes/dataOnly.ts`](../packages/ts-go-run-types/src/runtypes/dataOnly.ts))
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

- **IN:** type-first decode return types — `createJsonDecoderFn<T>()`,
  `createBinaryDecoderFn<T>()` (keep the value-first / schema overloads consistent).
- **OUT — encoders** (`createJsonEncoderFn` / `createBinaryEncoderFn`): they take `T`
  as *input* (you pass your real object; non-data is dropped at emit), so the input
  type stays `T`.
- **OUT — `validate` / `getValidationErrors`:** separate discussion; `DataOnly` there is the
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

## Open questions (resolved during implementation)

1. **Value-first / schema decoders** (`createJsonDecoderFn(rt)`): projected too. The
   schema form infers `T = Static<typeof rt>`, then the same overload return
   projects it — consistent with the type-first form, no extra wiring.
2. **`JsonDecoderFn` / `createBinaryDecoderFn` signature**: the projection lives on the
   **factory overload return** (`JsonDecoderFn<DataOnly<T>>` /
   `BinaryDecoderFn<DataOnly<T>>`), NOT on the `JsonDecoderFn`/`BinaryDecoderFn`
   aliases — those stay `=> T` as composable primitives. Baking it into the alias
   breaks the binary decoder's own body (its `decodeFn` returns `T`, not
   `DataOnly<T>`) and doing both would double-project to `DataOnly<DataOnly<T>>`. A
   single localized cast at the binary impl's `return` bridges the runtime value to
   the projected type.
3. **Test suite**: only two sites needed updating — `classSerializer.test.ts`, which
   reconstructs REAL class instances via a registered serializer and then called a
   projected-away method (`Point.mag()`); those cast the decode result back to the
   real type to reflect that domain knowledge. Round-trip suites assert runtime
   values (`.toEqual`) so they were unaffected. New type-level contract test:
   [`test/types/decodeReturnType.test.ts`](../packages/ts-go-run-types/test/types/decodeReturnType.test.ts).
4. **Previously-reverted change**: no revert commit found in history; nothing tied to
   it needed re-touching.
5. **Docs**: this spec + the CLAUDE.md "validate contract" section note the projection.
   README has no decode examples, so nothing to amend there.

## Acceptance — met

- ✅ `createJsonDecoderFn<Dirty>()` / `createBinaryDecoderFn<Dirty>()` return the projected
  (data-only) type; clean DTOs are unchanged (`DataOnly<T> ≡ T`).
- ✅ No runtime or emitter behaviour change; all existing decode round-trips pass
  (full marker-package suite: 5899 tests green).
- ✅ `DataOnly` faithfulness + per-branch instantiation-budget tests stay green.
