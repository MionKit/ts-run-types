---
type: feature
spec: guidelines
status: done
created: 2026-07-24
---

# Export canonical format-name runtime constants for consumers

**Status:** shipped via Go codegen (approach A below). Split out of
[export-compiled-fn-structs-and-reconstruction-api.md](./export-compiled-fn-structs-and-reconstruction-api.md)
(its "Also:" section) and rewritten because investigation corrected its original premise.

## What shipped ✅

A new Go→TS mirror `packages/ts-runtypes/src/go-generated/typeFormats.generated.ts`, generated from
the Go format registry, exported from `@ts-runtypes/core`:

- `typeFormats` — a runtime `const` keyed by canonical format name, each entry `{name, kind}` where
  `kind` is the base `RunTypeKind` the format refines (`RunTypeKind.string` for `uuid`/`email`/`date`/…,
  `number` for `numberFormat`, `bigint` for `bigintFormat`, `class` for `nativeDate` + the six
  `temporal*`). 18 formats today.
- `FormatName` — `keyof typeof typeFormats`, the union of every canonical name (the full
  `formatAnnotation.name` set, not the narrower `LeafFormatName`).
- `TypeFormatMeta` — the per-entry metadata interface.

Pieces:
- `formats.Registered()` — new exported enumerator over the format registry
  ([registry.go](../../ts-go-runtypes/internal/cachegen/typefunctions/formats/registry.go)), sorted
  by (kind, name).
- `cmd/gen-type-formats` — the generator (blank-imports `formats/all`, enumerates `Registered()`,
  emits the TS), modeled on `gen-fn-hashes` (stdout capture). `TestTypeFormatsFileInSync` +
  `TestRegisteredNonEmpty` are its containment drift guards.
- `pnpm rtx core codegen typeformats [--check]` — the rtx target (in `all`); CI's `--check` is the
  exact byte-for-byte guard.
- Barrel export from `packages/ts-runtypes/src/index.ts`.

**Runtime surface (confirm, no code change):** a reflected prop carries `formatAnnotation.{name,
params}` (`RunType.formatAnnotation`, already public via the exported `RunType` + `FormatAnnotation`).
A consumer reads `prop.formatAnnotation.name` and looks it up in `typeFormats`.

**Tests:** `packages/ts-runtypes/test/features/typeFormats.test.ts` — asserts the const surface + kinds,
and reflects a format field via BOTH `getRunType<T>()` (static) and `getRunType(value)` (reflection)
per the Marker coverage rule, asserting the runtime `formatAnnotation.name` matches `typeFormats`.
**Docs:** the reflection guide (`container/website/content/2.guide/3.reflection.md`) + `docs/ARCHITECTURE.md`.

## Why codegen (approach A) over the alternatives

Exporting a runtime const of the full `FormatAnnotation.name` set introduced a single-source-of-truth
question, because the names live in Go (each emitter's `Name()`). Codegen (a `cmd/gen-type-formats`
generator + sync test + `rtx codegen` target, mirroring `runTypeKind.generated.ts`) was chosen over a
hand-maintained const because it has zero drift by construction and its `--check` guard is identical
to the existing mirrors. The hand-maintained alternative still needed a Go test to compare against the
registry, so it did not actually escape the Go dependency while adding a drift surface.

## Corrected premises (the original "Also:" got these wrong)

1. `LeafFormatName` is **not** the runtime format-name set — only the 10 leaf-brand discriminators
   (`builderTypes.ts:81`), missing `uuid`/`email`/`date`/`time`/`dateTime`/`ip`/`domain`/`url`. The
   real target is the `FormatAnnotation.name` superset, and `FormatName` (above) now IS that superset.
   `LeafFormatName` was intentionally NOT surfaced, to avoid a consumer mistaking it for the full set.
2. The reflected field is `formatAnnotation.{name, params}` (`types.ts:115-117`), not `formatName` /
   `formatParams`. Already public; documented rather than changed.
3. Go is the single source of truth (`registry.go:82-86` + per-format `Name()`). `temporalPlainMonthDay`
   and `temporalDuration` have no registered emitter, so they are correctly absent from the generated
   table (they were absent from `LeafFormatName` too — the codegen makes that agreement explicit).

## Out of scope (unchanged)

- The mion repo (`FormatNames`/`FormatName` deletion in `packages/core/src/constants.ts` is mion's
  follow-up).
- Changing `formatAnnotation` shape or the Go emit — names are read as-is.
