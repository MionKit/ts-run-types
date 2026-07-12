# FMT002 param-invariant errors don't halt the vitest/transform lane

## Evidence (found during the mion migration, 2026-07-12)

Contradictory format params — `Number<{min: 10; gt: 5}>`, `min > max`, `multipleOf <= 0`,
`float` + `multipleOf`, … — are validated at build time in Go and reported as FMT002 with
SeverityError. But in the vitest/dev-transform lane the plugin only forwards diagnostics via
`ctx.warn`, so `createValidate<Number<{min: 10, gt: 5}>>()` silently returns a working (but
semantically contradictory) validator; nothing fails until a full `vite build`.

The old mion runtime threw from the factory for these invariants, so tests could pin the
rejection; that coverage is now unreachable in the test lane (mion deleted 7 such tests
during the spec migration — packages/type-formats/src/number/numberFormat.runtype.spec.ts
has the explanatory comment).

## Why it matters

Error-severity diagnostics are the build-halt contract ("Error = will throw at runtime,
build must fail") — but the dev/test lane, where developers actually iterate, reduces them
to warnings that vitest output swallows by default. A contradictory format can sit in a
codebase with green tests.

## Fix directions

- Make the plugin throw (fail the transform) for SeverityError diagnostics in ALL lanes,
  not just `vite build` — matching the documented Warning/Error line; or
- add a plugin option (`failOnError: true` default) so test lanes can opt out explicitly.

## Acceptance

- A vitest run whose program contains an FMT002-class error fails loudly (transform error
  naming the offending type/param), with a documented opt-out.
