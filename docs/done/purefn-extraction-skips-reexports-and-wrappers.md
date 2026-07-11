# Pure-fn extraction silently skipped renamed imports and branded wrappers

**Status: FIXED — the extraction pre-filter now also accepts calls whose first argument is a
`"<ns>::<name>"`-shaped string literal; the brand check stays the authoritative gate.**

## Corrected findings (2026-07-11, mion migration)

Initial report said "re-export barrels skip extraction" — that was half right. The extraction
walker (`internal/cachegen/purefunctions/walker.go`) pre-filtered on the callee identifier
TEXT being literally `registerPureFnFactory`, so:

- direct import — **extracted** ✓
- re-export barrel, UNRENAMED (`import {registerPureFnFactory} from '@mionjs/run-types'`) —
  **extracted** ✓ (name matches; signature resolves through the alias to the origin brands)
- re-export barrel, RENAMED (`import {registerPureFnFactory as regPF}`) — **silently skipped**
- framework wrapper with the same brands (`mionPureFn('mionjs::x', () => …)`) — **silently
  skipped**

Skipped calls still registered at runtime through the raw-function fallback in `pureFn.ts` —
functional, but with `bodyHash: ''`, no PFE purity checks, no shippable code, and no
diagnostic. The old walker comment even admitted the alias case ("imported under an alias is
missed") while the `registerPureFnFactory` doc comment promised brand-driven discovery
("renaming or reordering parameters does NOT break extraction") — a doc-vs-code contradiction.

## Shipped

- `walker.go`: the cheap pre-filter is now `callee text == registerPureFnFactory` OR
  `firstArgIsPureFnIdLiteral` (first argument is a string / no-substitution-template literal
  containing `::`). Everything that passes still goes through the resolved-signature brand
  verification (`CompTimeArgs` slot 0 + `PureFunction` slot 1), which is where correctness
  lives — a user's own same-named or same-shaped-but-unbranded function is still rejected.
  Wrapper INNER forwards (non-literal args) remain silent pass-throughs.
- Go regressions (`walker_test.go`): `TestExtract_RenamedImport` and
  `TestExtract_BrandedWrapperCallSite` — both verified failing on the old pre-filter.
- FE regression: `packages/ts-runtypes/test/third_party/third-party-pure-fns.test.ts`
  (the folder was renamed from `third_party_markers/` — it now hosts both the marker and the
  pure-fn third-party suites): a node_modules framework package re-exports
  `registerPureFnFactory` and declares a branded `definePureFn` wrapper; the consumer uses a
  RENAMED import + the wrapper, never names `@ts-runtypes/core`, and both call sites get
  their factory argument rewritten to generated `__rt_pf…` bindings.

## Residual (accepted) miss

A call that matches NEITHER cheap filter — renamed callee AND a traced-const id
(`regPF(ID_CONST, …)`) — still skips extraction and takes the runtime lane. Combining a
rename with an id constant is rare enough that paying signature resolution on every call in
the program isn't warranted; revisit if it ever bites.

## Consumer note (mion)

`registerPureFnFactory('mionjs::x', …)` imported from `@mionjs/run-types` (renamed or not)
now gets full build extraction, and mion could ship its own branded wrapper for the same
effect. Name-only conveniences like `registerMionPureFn('x', …)` remain runtime-lane by
construction (the id literal must appear whole at the call site for comptime extraction).
