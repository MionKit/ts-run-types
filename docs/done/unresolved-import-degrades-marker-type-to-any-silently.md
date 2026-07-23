# Marker type silently degrades to `any` when its import doesn't resolve in the scan program — DONE

## Original finding (mion migration, 2026-07-12)

A vitest spec imported its subject type with an extensionless relative path
(`import {User} from './user.runtype'`) under `moduleResolution: NodeNext`. Vite resolved
it at RUNTIME but the resolver's scan program did not — so `User` checked as `any` at the
`createValidateFn<User>()` site: the binary emitted the noop tuple, `createValidateFn` became
the always-true identity, `createGetValidationErrorsFn` returned `[]`, `createMockDataFn`
returned `undefined` — 34 tests failed with ZERO diagnostics. The worst failure shape for
a validation library.

## What shipped

**MKR007 (SeverityError)** — emitted when BOTH signals hold: a marker site's type
argument resolved to `any`, AND the site's file has at least one import whose bindings
fail alias resolution. The diagnostic names the file, the call site, and the unresolved
specifier, with a fix-oriented detail block (extensionless NodeNext imports, tsconfig
skew, missing deps).

- Guard: [ts-go-runtypes/internal/compiler/resolver/unresolved_import_guard.go], wired
  into BOTH injection paths (single-trailing + multi-slot), sibling of the
  Temporal-not-loaded guard. Detection is LAZY (only any-typed sites) and runs entirely
  on the checker the scan already holds (`Checker_getImmediateAliasedSymbol` over the
  file's import bindings) — an earlier draft used program-level semantic diagnostics and
  DEADLOCKED the checker pool mid-scan under the real binary; the alias walk has no such
  hazard. Memoized per file on the Session.
- **Escape hatch**: a written `any`/`unknown` KEYWORD type argument never diagnoses —
  `createValidateFn<any>()` stays legal even in a file with an unrelated failing import
  (it still gets the pre-existing VL021 Warning). Bare side-effect imports are skipped
  (no binding → no type can flow).
- **Surfacing gap fixed along the way**: `scanAllProgramFiles` (the eager whole-program
  scan OpGenerate/OpDump run at buildStart) DISCARDED all marker diagnostics — not just
  MKR007: MKR003/CTA/TMP/PFN never reached the plugin's buildStart. They now persist on
  the session (`programScanDiagnostics`) and ride both responses, so the failOnError
  lane halts on them in every bundler lane.
- JS diagnostic catalog regenerated (`pnpm run gen:diag-catalog`) so the plugin renders
  the MKR007 headline.

## Acceptance shipped

- Go: `unresolved_import_guard_test.go` over `testfixtures/unresolvedimport/` — the
  broken file diagnoses BOTH `getRunTypeId` call shapes (marker rule) with Error
  severity, the specifier, and the call-site position; the explicit `<any>` site stays
  silent; a fully resolved file emits nothing.
- FE: `fail-on-error.test.ts` gained the end-to-end lane — a self-contained program with
  `import {User} from './missing-module'` fails `buildStart` under the strict default,
  naming `error MKR007` and the specifier in the log (dev/test lanes included, per the
  failOnError contract).
