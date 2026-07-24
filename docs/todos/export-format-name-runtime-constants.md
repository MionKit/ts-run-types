---
type: feature
spec: guidelines
status: todo
created: 2026-07-24
---

# Export canonical format-name runtime constants for consumers

Split out of [export-compiled-fn-structs-and-reconstruction-api.md](../partially/export-compiled-fn-structs-and-reconstruction-api.md)
(its "Also:" section). That todo shipped the compiled-fn structs + reconstruction API; this is the
remaining format-name half, rewritten because investigation corrected its original premise.

## Intent

A consumer that maps a reflected property's format to something external (mion's drizzle extension
maps a reflected prop's format name → a DB column) needs the **canonical format-name strings**
ts-runtypes stamps on reflected props. Today ts-runtypes exposes those names only as **types** (and
only partially), so mion re-declares them as a runtime `const FormatNames = {…}` in
`packages/core/src/constants.ts` and keys its mappers off that mirror. Exposing the canonical
runtime constants from ts-runtypes lets the mirror be deleted. Overlaps mion
`docs/todos/formats-brandname-upstream.md` (mion side, out of scope here).

## Corrected premises (from investigation — the original todo got these wrong)

1. **`LeafFormatName` is NOT the runtime format-name set.** Declared at
   `packages/ts-runtypes/src/runtypes/builderTypes.ts:81` as `keyof LeafTypeByFormatName<…>`, it
   unions only the **10 leaf-brand discriminators**: `stringFormat`, `numberFormat`, `bigintFormat`,
   `nativeDate`, `temporalInstant`, `temporalZonedDateTime`, `temporalPlainDate`, `temporalPlainTime`,
   `temporalPlainDateTime`, `temporalPlainYearMonth`. It is **missing** exactly the string
   sub-formats a consumer keys off: `uuid`, `email`, `date`, `time`, `dateTime`, `ip`, `domain`,
   `url` (and note `temporalPlainMonthDay` / `temporalDuration` exist as builders but are absent from
   `LeafTypeByFormatName` too). The real target set is the `FormatAnnotation.name` **superset**.

2. **The reflected runtime field is `formatAnnotation.{name, params}`, not `formatName` /
   `formatParams`.** `RunType.formatAnnotation?: FormatAnnotation` at
   `packages/ts-runtypes/src/runtypes/types.ts:115-117`; `FormatAnnotation = { name: string; params?:
   … }` at `packages/ts-runtypes/src/runtypes/formatAnnotation.ts:5-8`. Both `RunType` and
   `FormatAnnotation` are **already public** (`src/index.ts:21`, `:108`), so the runtime surface a
   consumer reads (`prop.formatAnnotation.name` / `.params`) already exists. This half is a
   **confirm + document**, no code change.

3. **Go is the single source of truth for the name strings.** Each format emitter returns its
   canonical name from a `Name()` method (`ts-go-runtypes/internal/cachegen/typefunctions/formats/
   registry.go:82-86` + per-format files: `string/uuid.go`, `string/email.go`, `datetime/date.go`,
   `numeric/numberformat.go`, …; temporal names are table-driven in `datetime/temporalFormat.go`).
   The TS side mirrors them as hand-kept `__rtFormatName` string-literal type args. There is **no**
   runtime const table anywhere today; the closest enumeration is the `switch (annotation.name)` in
   `packages/ts-runtypes/src/mocking/mockStringFormat.ts:33-58` (string kind only).

## The design decision (why this is `spec: guidelines`)

Exporting a runtime const of the full `FormatAnnotation.name` set introduces a **new
single-source-of-truth question**, because the names live in Go. Two viable shapes:

- **(A) Codegen from Go (recommended).** Add a `cmd/gen-format-names` generator that enumerates the
  format registry and emits `packages/ts-runtypes/src/go-generated/formatNames.generated.ts` (a
  `const` + a derived type), plus a `TestFormatNamesFileInSync` guard and a `pnpm rtx core codegen
  format-names [--check]` target — mirroring `runTypeKind.generated.ts` exactly (see
  `packages/ts-runtypes/src/go-generated/runTypeKind.generated.ts` and its generator
  `cmd/gen-run-type-kind`). Zero drift, architecturally consistent. Cost: a new Go `cmd` + codegen
  wiring, and it **needs the Go toolchain** (≥ 1.26 per `go.mod`; the web container currently has
  1.24.7, so `bash scripts/setup-claude-web.sh` / the ts-runtypes-setup skill must run first).
- **(B) Hand-maintained TS const + Go sync test.** Add `export const FormatNames = {…} as const`
  (full runtime set) to the core package. Faster, no generator, but the drift guard still needs a Go
  test that enumerates the registry and compares — so it does not escape the Go-toolchain
  requirement, and without that guard the list silently drifts from Go's `Name()` methods.

Prefer (A) unless there's a reason not to. Confirm the approach before building.

Whichever is chosen, also **export `LeafFormatName` as a type** (currently internal — reachable
in-repo via `schema/static.ts:16-25` but forwarded by no public barrel) only if it's clarified as
the *leaf-brand* set, not the full runtime name set, so consumers don't mistake it for the latter.

## Tests

- A sync guard (Go `TestFormatNamesFileInSync`, or the (B) comparison test) proving the exported
  const equals the Go registry's `Name()` set. This is the load-bearing test.
- A Vitest test in `packages/ts-runtypes/test/` that reflects a type carrying a format (e.g. a UUID
  string field and a `Date`) via **both** `getRunType<T>()` (static) and `getRunType(value)`
  (reflection) — per the Marker test coverage rule — and asserts the reflected
  `formatAnnotation.name` equals the exported constant, confirming the runtime surface end to end.

## Done when

- The canonical format-name strings are reachable as a runtime `const` from `@ts-runtypes/core`,
  covering the full `FormatAnnotation.name` set a reflected prop can carry.
- A drift guard fails the build if the const and the Go `Name()` set diverge.
- Docs: the reflection guide (`container/website/content/2.guide/3.reflection.md`) documents reading
  `formatAnnotation.name` / `.params` off a reflected prop and keying off the exported const;
  `docs/ARCHITECTURE.md` notes the const's source of truth if codegen is chosen.

## Out of scope

- Anything in the mion repo (`FormatNames`/`FormatName` deletion in `packages/core/src/constants.ts`
  is mion's follow-up, tracked mion-side).
- Changing `formatAnnotation` shape or the Go emit — names are read as-is.
