# Rename `FriendlyType<T>` → `FriendlyText<T>`

> **Status: DONE** (decided 2026-07-03, shipped 2026-07-04). `FriendlyText<T>` is
> the only non-deprecated name; the generator emits it; the legacy `FriendlyType`
> spelling still parses through the deprecation window (`gen --update` migrates
> committed mirrors in place). Full Go + JS suites green; compile budgets
> re-measured (unchanged — a rename doesn't move instantiation counts).

## As shipped (deviations from / detail on the plan below)

- **The type file MOVED** to `packages/ts-runtypes/src/enrich/friendlyText.ts`,
  the `#region friendlytype-extract` marker → `friendlytext-extract`, and the
  compile test → `test/types/friendlyText.compile.test.ts`; `enrichHarness.ts`
  slice reference updated in lockstep.
- **Go recognition/emission** ([internal/enrichment/names.go](../../internal/enrichment/names.go)):
  added `FriendlyTextName` (emitted) + kept `FriendlyTypeName` (legacy) +
  `FriendlyWrapperNames` / `IsFriendlyWrapperName` for dual-name parsing. astcheck,
  the hygiene file-guard regex, and the reconcile all accept both; every emitter
  (emit.go, helpers.go, reconcile.go, split.go) writes `FriendlyText`.
- **Lazy `gen --update` migration** (`migrateLegacyFriendlyWrapper` in
  [reconcile.go](../../internal/enrichment/mirror/reconcile.go)): a surviving legacy
  const's annotation wrapper AND the `import type { FriendlyType }` DSL import are
  spliced to `FriendlyText` together; orphaned consts keep their wrapper verbatim
  (the carcass splice would collide). `SplitCombined` preserves the source's
  wrapper spelling so a split file stays internally consistent, then migrates on
  the next update. Covered by `TestExample_LegacyFriendlyTypeAnnotationMigrates`
  and `TestExample_OrphanedLegacyConst_keepsVerbatimWrapper`.
- **Deprecated alias** lives in [src/index.ts](../../packages/ts-runtypes/src/index.ts)
  (`export type FriendlyType<T> = FriendlyText<T>`), so pre-rename files keep
  compiling until the alias is dropped.
- **Generated constants**: `FRIENDLY_TEXT_NAME` added alongside the retained
  `FRIENDLY_TYPE_NAME`; the devtools lint pre-filter accepts both spellings.
- **Historical docs** (`docs/done/`, `docs/talks/`, `docs/maybes/`, `CHANGELOG`)
  were left on the old name as accurate history; a handful of Go/JS tests keep
  legacy `FriendlyType` inputs on purpose as backward-compat parse coverage.
- The Go fixtures overlay (`internal/testfixtures/runtypes.d.ts`) carries no
  enrichment-type declarations, so nothing to change there; enrich tests that
  need an overlay declare their own inline.

---

## Original plan

> Deferred out of the FriendlyType-i18n PR to keep that PR's surface stable; done
> as its own small PR after the i18n work landed.

## Why

The `-Type` suffix misleads: `FriendlyType<User>` reads as a *type transformer*
("a friendly version of the User type"), when the thing it names is a **map of
human-facing text** — field labels (`rt$label`) + error-message templates
(`rt$errors`). `FriendlyText<User>` says what it is: the friendly text for `User`.
It also reads correctly on a translation const (`pl_friendlyUser:
FriendlyText<User>` — "the Polish friendly text for User"), which matters now
that `Translation<T>` is gone and one type annotates every friendly-family file.

Alternatives considered and rejected: `Wording<T>` / `DisplayText<T>` (both
rename the entire family — consts, dirs, renderer APIs — for no extra clarity).

## Scope — the type name ONLY

Everything else keeps the `friendly` brand and does NOT change:

- `friendly*` const naming (`friendlyUser`, `pl_friendlyUser`)
- the `<enrichDir>/friendly/` family directory
- `createFriendly` / `createFriendlyI18n` / `FriendlyRenderer` / `FriendlyMessage`
- the `@rtType`-marker machinery (name-independent ids)

Changes:

1. `packages/ts-runtypes/src/enrich/friendlyType.ts` — rename the exported type
   (file can keep its name or move to `friendlyText.ts`; update the
   `#region friendlytype-extract` marker + `test/types/enrichHarness.ts` slice
   reference together, and re-measure the instantiation-budget compile test).
2. The generator's emitted annotation + import (`friendlyWrapper` in
   [internal/enrichment/mirror/helpers.go](../../internal/enrichment/mirror/helpers.go))
   and the scaffolded `import type { FriendlyText } from 'ts-runtypes'` line.
3. Reconcile/index recognition of the annotation text (grep `FriendlyType` under
   [internal/enrichment/](../../internal/enrichment/)); accept BOTH names when parsing
   existing mirrors so committed files migrate lazily (`--update` rewrites the
   annotation), same pattern as the combined-mirror auto-migration.
4. `packages/ts-runtypes/src/index.ts` — export `FriendlyText`; keep
   `FriendlyType` as a deprecated alias for one release
   (`/** @deprecated use FriendlyText */ export type FriendlyType<T> = FriendlyText<T>;`),
   then drop it.
5. Docs + skills + website (`FriendlyType` appears throughout
   [docs/AI_ENRICHMENT.md](../AI_ENRICHMENT.md), the website ai-integration
   pages, and all three enrichment skills) and the Go fixtures overlay
   ([internal/testfixtures/runtypes.d.ts](../../internal/testfixtures/runtypes.d.ts)).

## Acceptance

- `FriendlyText<T>` is the only non-deprecated name; generator emits it; both
  spellings parse during the deprecation window; full JS + Go suites green; the
  compile-budget test re-measured after the extract-region touch.
