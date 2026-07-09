# Rename the `Static<T>` type extractor to `InferType<T>`

Status: DONE (shipped 2026-07-09). Filed alongside the playground
`Static<typeof MyType>` examples (PR #205 / the schema-example enhancement).

## What shipped

`Static<RT>` → `InferType<RT>` across the whole surface. Canonical definition in
`runtypes/builderTypes.ts`, re-exported through `schema/static.ts` and
`index.ts` (`export {type InferType}`). No `Static` or `Infer` alias — single
name only. All internal src / test / example / doc / playground-preset / benchmark
references updated; the two Go resolver test overlays (`schema_optional_reflect_test.go`,
`comptimeargs_composer_test.go`) that mirror the public schema types were kept in
sync. Dists rebuilt (`@ts-runtypes/core`, playground `.vendor` + WASM overlay).
Verified: `pnpm run typecheck`, `pnpm test` (7774 pass), the playground harness,
and all six schema presets resolving `InferType<typeof MyType>` with zero
diagnostics.

The only surviving `Static` tokens are intentional: prose ("static form" / "Static
check only"), TypeBox's real `Static<T>` API where it is named as a comparison, and
the historical `docs/done` / `docs/partially` notes.

## Decision

Rename the public type-extractor `Static<T>` → **`InferType<T>`**.

- **Single name.** `InferType` only. Do NOT ship a `Static` alias, and do NOT
  ship an `Infer` alias — `Infer` on its own is too generic (reads like a
  general inference util, not "the type modeled by this schema").
- Usage becomes: `type User = InferType<typeof MyType>`.
- This is a breaking change to the published surface. We are pre-1.0, so it is
  the right moment to make it; no deprecation alias is kept.

## Rationale

`Static` is inherited from the original `runtypes` library and TypeBox (both use
`Static<typeof X>`). It is on-brand but abstract: it names "the static /
compile-time type", not obviously "recover the original TypeScript type from the
schema". `InferType` states the intent directly and stays specific.

Ecosystem for "recover the TS type from a schema":

| Library            | Extractor                              |
| ------------------ | -------------------------------------- |
| runtypes / TypeBox | `Static<typeof X>`                     |
| Zod                | `z.infer<typeof X>` (+ input/output)   |
| ArkType            | `typeof x.infer`                       |
| Valibot            | `InferOutput<typeof X>`                |
| io-ts              | `TypeOf<typeof X>`                     |
| Yup / superstruct  | `InferType` / `Infer`                  |

`InferType` matches the widely-understood "infer" mental model (Zod/ArkType)
while remaining unambiguous (unlike a bare `Infer`), and avoids `TypeOf`
(clashes mentally with the `typeof` keyword).

Semantics stay identical: `InferType<typeof schema>` recovers the FULL modeled
type `T` (branded formats preserved), NOT the data-only projection — that
remains `DataOnly<T>`.

## Scope + fix plan

Canonical definition: `packages/ts-runtypes/src/runtypes/builderTypes.ts:39`
(`export type Static<RT> = …`), re-exported via
`packages/ts-runtypes/src/schema/static.ts` and `packages/ts-runtypes/src/index.ts`.
~37 references across src / tests / examples / docs / playground.

1. **Rename the type** in `runtypes/builderTypes.ts`; update the re-export in
   `schema/static.ts` and `index.ts` (`export { type InferType }`).
2. **Update all internal references** (`Static<…>` → `InferType<…>`) across
   `packages/ts-runtypes/src/**` (schema/atomic, schema/compose, schema/static,
   runtypes/types, markers, …) and `packages/ts-runtypes/test/**` (incl. the
   type-safety / static-equivalence suites).
3. **Docs + examples:** `README.md`, `docs/ARCHITECTURE.md`, and every
   `packages/examples/src/**` that imports `Static` (guide/types-vs-schemas-*,
   \_homepage/define-schema, whatis-duality, …), plus the website content under
   `container/website/content/**`.
4. **Playground:** `container/website/app/playground/presets.ts` (the schema
   examples now read `type <Name> = Static<typeof MyType>`) → `InferType`. The
   editor stubs were retired (the editor reads the real `@ts-runtypes/core`
   overlay), so no stub to touch; the `.vendor/ts-runtypes-dist/**.d.ts` are
   generated — rebuild, don't hand-edit.
5. **Rebuild dists** (`@ts-runtypes/core`, `ts-runtypes-devtools`) so the
   published `.d.ts` and the vendored playground dist carry `InferType`.
6. **Verify:** `pnpm run typecheck` (marker package + testfixtures + examples),
   `pnpm test`, and a playground harness pass (the six schema presets resolve
   `InferType<typeof MyType>` with zero diagnostics).

## Notes

- Breaking API change; call it out in the changelog / release notes.
- Grep guard after the rename: no bare `\bStatic\b` type-extractor references
  should remain outside historical docs/notes (the word "static" in prose is
  fine).
