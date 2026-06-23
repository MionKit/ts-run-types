# Markers + value-first across external modules — a test matrix, and the pure-function "no external handle" rule

> **Status: pending (design + test note, 2026-06-23).** Real projects split
> types, schemas, option presets, and pure functions across modules. The TYPE
> channel resolves imported types for free, but the AST-literal channel
> (`CompTimeArgs` / `CompTimeFnArgs` / `PureFunction` const-traces) is
> deliberately same-module in some places and cross-module in others (the
> spread-operand trace now follows import aliases). We have **no systematic
> coverage** of "define it in module A, use the marker in module B", so those
> asymmetries are untested and possibly surprising. Two goals:
> 1. A comprehensive external-module **test matrix** for every marker + the
>    basic `createX` surface, locking down (and surfacing the gaps in) the
>    cross-module behavior.
> 2. A deliberate **restriction**: a `PureFunction` literal must never be
>    reachable as a value — not imported, not exported — so the build's
>    AOT-compiled copy is the only thing that can ever run.

## Background — what is same-module vs cross-module TODAY

- **Type args** (`InjectRunTypeId<T>`, `InjectTypeFnArgs<T, Fn>`): tsgo resolves
  imported types; cross-module already works with no special handling (the
  marker reads the resolved type off the brand).
- **`CompTimeArgs` / `CompTimeFnArgs` identifier trace**
  (`resolveConstInitializer`, [internal/comptimeargs/comptimeargs.go](../../internal/comptimeargs/comptimeargs.go)):
  **same-module only** — it does NOT apply `ResolveImportAlias`. So an imported
  *whole* option-bag const or an imported builder-child const is rejected
  (CTA001).
- **Spread-operand trace** (`ResolveSpreadContainer`,
  [internal/comptimeargs/values.go](../../internal/comptimeargs/values.go)):
  **cross-module** via `ResolveImportAlias` (mirrors the regex-literal trace).
  So `{...importedFragment}` resolves.
- **Net asymmetry:** `object({...importedBase, x: string()})` works, but
  `object({field: importedFieldConst})` and
  `createValidate(undefined, importedOptsConst)` do NOT (CTA001). The
  split-and-merge story is cross-module; the whole-const story is not.
- **`PureFunction` / `registerPureFnFactory`** (`CheckLiteralFunction`,
  [comptimeargs.go](../../internal/comptimeargs/comptimeargs.go)):
  resolves a **same-module** `const f = …` or `function f(){}` (no
  `ResolveImportAlias`), so an imported function is already rejected (PFN001).
  There is **no `export` check** — an *exported* same-module pure-fn literal is
  accepted today.

## Part 1 — External-module test matrix

Build a small multi-module fixture set (a `schemas.ts` / `types.ts` /
`presets.ts` / `fields.ts` "library" module + a `consumer.ts` that imports from
it) and assert each marker behaves correctly when its TYPE or SCHEMA lives in
the other module. Cover, at minimum:

- **`InjectRunTypeId<T>` reflection** — `getRunTypeId<ImportedType>()` and the
  reflection form `getRunTypeId(valueOfImportedType)`; `getRunType` likewise;
  `createMockType<ImportedType>()`. (Marker-coverage rule: BOTH `getRunTypeId`
  call shapes, with a hash-equivalence assertion.)
- **Value-first builders with imported children** — `createValidate(ImportedSchema)`
  where `ImportedSchema = object({...})` lives in the library module; nested
  `object({inner: ImportedSchema})`; `array(ImportedSchema)`. This is the
  asymmetry above: decide (Decision 1) whether an imported builder-child const
  should resolve cross-module like a spread fragment, then pin the chosen
  behavior.
- **`InjectTypeFnArgs<T, Fn>` for the full `createX` surface** with an imported
  `T`: `createValidate` / `createGetValidationErrors`, the unknown-keys group
  (`createHasUnknownKeys` / `createStripUnknownKeys` / `createUnknownKeyErrors`
  / `createUnknownKeysToUndefined`), `createFormatTransform`,
  `createJsonEncoder` / `createJsonDecoder`, `createBinaryEncoder` /
  `createBinaryDecoder`, `createStandardSchema`. Assert each produces a working
  fn over imported-typed data (round-trip where applicable).
- **`CompTimeFnArgs` option presets** — `createValidate(undefined, {...importedPreset})`
  (cross-module spread, should work today) AND
  `createValidate(undefined, importedPreset)` (whole imported const — rejected
  today; Decision 1). Assert the spread-merged variant equals the inlined one
  (fnId convergence), and that the resolved variant is correct.
- **`CompTimeArgs` spread fragments** — `object({...importedBase, …})`,
  `tuple([...importedHead, …])` (cross-module; locks in the recent spread work).
- **Convergence** — every imported-defined case converges on the SAME
  structural id / fnId as its inline-defined twin.

Suggested homes: Go resolver-level fixtures (two-file `setupInline` overlays,
[internal/resolver/inline_test.go](../../internal/resolver/inline_test.go)) for
scan/id/fnId convergence, plus a JS plugin or marker-package test for runtime
round-trips (real `ts-runtypes` imports across files).

## Part 2 — The pure-function "no external handle" rule

A `PureFunction` literal is extracted and AOT-compiled by the build; the
compiled copy is the single source of truth. If the original literal is
reachable as a value, a caller can import and invoke the **raw, un-compiled**
function directly, diverging from the compiled behavior. So forbid any handle to
it:

- **Reject an imported pure-fn** (already rejected by the same-module trace —
  keep it, and make the diagnostic explicit about *why*).
- **Reject an EXPORTED pure-fn** — new check. The function passed to
  `PureFunction<F>` / `registerPureFnFactory` must be **inline** or a
  **non-exported** same-module `const` / `function`. Cover every export form:
  `export const f = …`, `export function f(){}`, a later `export {f}`,
  `export default`, and re-exports.

Implementation sketch: in `CheckLiteralFunction`
([comptimeargs.go](../../internal/comptimeargs/comptimeargs.go)), once the
literal resolves to a same-module declaration, reject it when that declaration
(or its binding) carries an export modifier / participates in an export
statement. Emit a new diagnostic (e.g. **PFN002**, Error severity) with fix
text: "inline the function at the call site, or bind it to a module-private
`const` that nothing exports." Wire the code into
[internal/diag/codes_marker.go](../../internal/diag/codes_marker.go) and the
[diagnosticCatalog.ts](../../packages/runtypes-devtools/src/diagnosticCatalog.ts).

## Design decisions to settle

1. **Imported whole-const args (children / option bags): allow cross-module?**
   Spread fragments already cross modules; whole consts do not. Options:
   (a) make `resolveConstInitializer` follow import aliases too (symmetry — any
   imported literal const works), or (b) keep whole consts same-module and steer
   users to the spread form. Recommended: **(a)** for parity, gated behind the
   test matrix so the behavior is pinned either way. Note the cost: cross-module
   const tracing pulls another module's AST during scan.
2. **Pure-fn rule scope.** Apply to BOTH `PureFunction<F>` and
   `registerPureFnFactory`. Confirm a non-exported `function` declaration AND a
   non-exported `const` arrow both stay allowed; only export/import is rejected.
3. **Diagnostic code(s).** One new `PFN002` for "exported / externally
   reachable", or reuse PFN001 with a distinct reason. Recommended: a distinct
   code, since the fix differs ("un-export it" vs "make it inline/literal").

## Out of scope

- Changing how imported TYPES resolve (already correct cross-module).
- The enrichment (`FriendlyType` / `MockData`) maps — those are committed files,
  a separate authoring story.

## Test plan

- **Go (`internal/resolver`)** — two-file overlays for each matrix row;
  convergence asserts (imported vs inline → same id / fnId). New reject tests
  for an exported pure-fn (PFN002) and an imported pure-fn (PFN001/PFN002).
- **Go (`internal/comptimeargs`)** — reflection-free `CheckLiteralFunction`
  unit tests for the export/import rejection (mirrors
  [internal/comptimeargs/spread_test.go](../../internal/comptimeargs/spread_test.go)).
- **JS (marker package / plugin)** — real cross-file imports: an imported schema
  drives a working validator / JSON codec; the marker-coverage rule (both
  `getRunTypeId` shapes) holds for an imported type.
- If Decision 1 = (a): flip the "imported whole-const rejected" cases to
  "accepted + convergent".

## Acceptance

- Every marker + basic `createX` works (or is intentionally, test-pinned
  rejected) when its type/schema/preset is defined in an external module, and
  converges with the inline-defined twin.
- A pure-fn that is imported OR exported fails with a precise, actionable
  diagnostic; an inline or module-private pure-fn still passes.
- `go test ./internal/...` and `pnpm test` green.
