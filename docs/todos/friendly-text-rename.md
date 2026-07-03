# Rename `FriendlyType<T>` → `FriendlyText<T>`

> **Status: TODO** (decided 2026-07-03, deferred out of the FriendlyType-i18n PR
> to keep that PR's surface stable). Blocked on nothing; do as its own small PR
> after the i18n work lands.

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
   [internal/enrich/mirror/helpers.go](../../internal/enrich/mirror/helpers.go))
   and the scaffolded `import type { FriendlyText } from 'ts-runtypes'` line.
3. Reconcile/index recognition of the annotation text (grep `FriendlyType` under
   [internal/enrich/](../../internal/enrich/)); accept BOTH names when parsing
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
