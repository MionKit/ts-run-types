# Markers + value-first across external modules — a test matrix, and the pure-function "no external handle" rule

> **Status: DONE (shipped 2026-06-23).** Real projects split types, schemas,
> option presets, and pure functions across modules. The TYPE channel already
> resolved imported types for free; this work made the AST-literal channel
> (`CompTimeArgs` / `CompTimeFnArgs` / `PureFunction` const-traces) consistent
> across the boundary and pinned it with a cross-module test matrix. Two goals,
> both delivered:
> 1. A comprehensive external-module **test matrix** for every marker + the
>    basic `createX` surface, locking down the cross-module behavior.
> 2. A deliberate **restriction**: a `PureFunction` literal must never be
>    reachable as a value (not imported, not exported), so the build's
>    AOT-compiled copy is the only thing that can ever run.
>
> ## What shipped
>
> - **Decision 1 = (a), cross-module parity, hardened.** A WHOLE imported `const`
>   (builder child or option bag) now resolves cross-module like a spread
>   fragment: `traceIdentifier` uses a new `resolveConstInitializerCrossModule`,
>   and `eachOptionProperty` follows an identifier option bag through the same
>   import-alias hop. The same-module-only `resolveConstInitializer` is kept for
>   the pure-fn / string-literal traces.
> - **New `as const` rule — CTA004.** A comptime arg bound to a `const` object
>   literal must carry literal value types; a widened member (`{strategy:
>   'mutate'}` inferred as `{strategy: string}`) is rejected. This keeps the
>   value the build reads from the AST in lockstep with the type TypeScript
>   resolves the overload against (a widened option bag could otherwise select a
>   different fn variant at the type level than the build injects). Shallow,
>   object-only: value-first builder results (`number()`) are left alone.
> - **Part 2 — literal-only PureFunction rule (chosen: strictest).** A
>   `PureFunction<F>` literal must be an INLINE arrow / function expression.
>   Every named reference is rejected, even a module-private `const f = …` /
>   `function f(){}` — a name is a handle something else could reach, and the
>   build's AOT-compiled copy must be the only callable one. Diagnostics:
>   imported (alias) or exported (inline `export`, `export {f}`, `export
>   default`, re-export) → **PFN002** (the external-handle case, specific fix);
>   any other named/non-function reference → **PFN001** "inline it". Covers both
>   `PureFunction<F>` and `registerPureFnFactory` (one path:
>   `CheckLiteralFunction`). Composition stays available via `utl.usePureFn('ns::id')`
>   (tracked dep), so reuse never needs a value handle. The built-in format
>   pure-fns already use inline factories, so the library's own code is unaffected.
> - **Decisions 2 & 3:** rule applies to both markers; distinct PFN001 vs PFN002
>   (both say "inline it", but PFN002 names the import/export cause).
>
> Code: `internal/compiler/comptimeargs/comptimeargs.go` (cross-module trace, widened-const
> guard, import/export rejection), `internal/compiler/resolver/scan.go` (option-bag
> cross-module read, CTA004/PFN002 mapping), `internal/diagnostics/codes_marker.go`.
> Tests: `internal/compiler/comptimeargs/external_test.go`,
> `internal/compiler/resolver/external_module_test.go`,
> `packages/ts-runtypes/test/external-module*.ts`,
> `packages/runtypes-devtools/test/pure-fns-cache.test.ts` (PFN002). Docs:
> `diagnosticCatalog.ts` (+ regenerated catalog JSON), `docs/ARCHITECTURE.md`,
> website compiler-markers + pure-functions guides.

## Background — what is same-module vs cross-module TODAY

- **Type args** (`InjectRunTypeId<T>`, `InjectTypeFnArgs<T, Fn>`): tsgo resolves
  imported types; cross-module already works with no special handling (the
  marker reads the resolved type off the brand).
- **`CompTimeArgs` / `CompTimeFnArgs` identifier trace**
  (`resolveConstInitializer`, [internal/compiler/comptimeargs/comptimeargs.go](../../internal/compiler/comptimeargs/comptimeargs.go)):
  **same-module only** — it does NOT apply `ResolveImportAlias`. So an imported
  *whole* option-bag const or an imported builder-child const is rejected
  (CTA001).
- **Spread-operand trace** (`ResolveSpreadContainer`,
  [internal/compiler/comptimeargs/values.go](../../internal/compiler/comptimeargs/values.go)):
  **cross-module** via `ResolveImportAlias` (mirrors the regex-literal trace).
  So `{...importedFragment}` resolves.
- **Net asymmetry:** `object({...importedBase, x: string()})` works, but
  `object({field: importedFieldConst})` and
  `createValidate(undefined, importedOptsConst)` do NOT (CTA001). The
  split-and-merge story is cross-module; the whole-const story is not.
- **`PureFunction` / `registerPureFnFactory`** (`CheckLiteralFunction`,
  [comptimeargs.go](../../internal/compiler/comptimeargs/comptimeargs.go)):
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
[internal/compiler/resolver/inline_test.go](../../internal/compiler/resolver/inline_test.go)) for
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
- **Reject an EXPORTED pure-fn** — new check. Cover every export form:
  `export const f = …`, `export function f(){}`, a later `export {f}`,
  `export default`, and re-exports.

> **Shipped stricter than this spec — literal-only.** During implementation the
> rule was tightened to: the only accepted form is an **inline** arrow / function
> expression. A non-exported same-module `const` / `function` reference is ALSO
> rejected (a name is still a handle). See the "What shipped" header. Imported /
> exported → PFN002; any other named reference → PFN001.

Implementation sketch: in `CheckLiteralFunction`
([comptimeargs.go](../../internal/compiler/comptimeargs/comptimeargs.go)), once the
literal resolves to a same-module declaration, reject it when that declaration
(or its binding) carries an export modifier / participates in an export
statement. Emit a new diagnostic (e.g. **PFN002**, Error severity) with fix
text: "inline the function at the call site, or bind it to a module-private
`const` that nothing exports." Wire the code into
[internal/diagnostics/codes_marker.go](../../internal/diagnostics/codes_marker.go) and the
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
   `registerPureFnFactory`. **Settled: literal-only** — even a non-exported
   `const` / `function` reference is rejected; only an inline arrow / function
   expression is accepted (the strictest option).
3. **Diagnostic code(s).** One new `PFN002` for "exported / externally
   reachable", or reuse PFN001 with a distinct reason. Recommended: a distinct
   code, since the fix differs ("un-export it" vs "make it inline/literal").

## Out of scope

- Changing how imported TYPES resolve (already correct cross-module).
- The enrichment (`FriendlyType` / `MockData`) maps — those are committed files,
  a separate authoring story.

## Test plan

- **Go (`internal/compiler/resolver`)** — two-file overlays for each matrix row;
  convergence asserts (imported vs inline → same id / fnId). New reject tests
  for an exported pure-fn (PFN002) and an imported pure-fn (PFN001/PFN002).
- **Go (`internal/compiler/comptimeargs`)** — reflection-free `CheckLiteralFunction`
  unit tests for the export/import rejection (mirrors
  [internal/compiler/comptimeargs/spread_test.go](../../internal/compiler/comptimeargs/spread_test.go)).
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
