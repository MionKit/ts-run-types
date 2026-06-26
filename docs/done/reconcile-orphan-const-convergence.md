# Whole-const `@rtOrphan` carcasses mishandled across reconcile — FIXED

**Status:** DONE. Found by the type-modification enrich fuzzer
([packages/ts-runtypes/test/fuzz/enrich/typeModFuzz.integration.test.ts](../../packages/ts-runtypes/test/fuzz/enrich/typeModFuzz.integration.test.ts)),
fixed in the reconciler. The fuzzer's default lane now asserts convergence (R6),
nothing-lost (NL), no-crash (R10) and parse-safety (P) over the full named type space
plus mid-edit corruptions, and is green. The separate rename-disambiguation gap this
work surfaced is tracked in
[reconcile-rename-detection.md](../todos/reconcile-rename-detection.md).

## The bug (root cause)

A whole-const `@rtOrphan` carcass — a `/* @rtOrphan /** @rtType … *​/ … */` block
wrapping a previously-orphaned type's entire `friendly*` / `mock*` const — was not
treated as an inert, position-stable span. When another const changed in the same
reconcile pass it produced three symptoms, all from the same mishandling:

1. **Crash** — `gen --update: overlapping splice ops [X,Y) and [X,Y) — internal error`.
2. **Churn** — a second `--update` was not a byte-identical no-op (non-convergence).
3. **Data loss** — a later reconcile DELETED a carcass, taking its authored value.

## The fix (three coordinated changes)

1. **Key carcasses by VAR NAME, not structural id**
   ([index.go](../../internal/enrich/mirror/index.go) `indexOrphanCarcasses`,
   [orphan.go](../../internal/enrich/mirror/orphan.go) `findCarcass`). Restore-on-
   reappear now means "the SAME named type came back", not "a same-shape type
   appeared". Id-keying let a different same-shape type revive the carcass's old-named
   const (re-orphaned next pass → churn) and let two same-shape desired consts both
   restore one carcass → two splices on one byte range → the crash.

2. **A const's own marker detection starts AFTER any preceding carcass**
   ([index.go](../../internal/enrich/mirror/index.go) `ownTriviaStart`). The first
   live const after a carcass was adopting the carcass's `@rtType` as its OWN marker
   (the carcass is leading trivia of that const), so a marker refresh overwrote the
   carcass → data loss. The const's own trivia (and its orphan-fold) now begin past
   the carcass.

3. **`queueNewConst` dedups by var-name PAIR, not TypeID**
   ([reconcile.go](../../internal/enrich/mirror/reconcile.go)). Two distinct named
   types that share a structural id are distinct consts and must both append; the id
   dedup silently dropped the second.

## Tests

Worked-example tests in
[reconcile_examples_test.go](../../internal/enrich/mirror/reconcile_examples_test.go):
`TestExample_SameShapeNewTypes_noDoubleRestoreCrash`,
`TestExample_NewTypeSameShapeAsCarcass_doesNotReviveOldConst` (incl. fixed-point),
`TestExample_DeletedTypeReappears_restoresByName`. Plus the fuzzer's default lane as
the ongoing regression guard.
