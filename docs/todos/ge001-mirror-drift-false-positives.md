# GE001 "mirror location drift" false positives right after `gen`

## Status

Open — found 2026-07-18 during the v0.10.0 release gate, while fixing the e2e
enrichment import paths (see `fix(e2e): migrate enrichment mirror imports to the
genDir convention`). Warning-severity only, so it does not fail any lane; filed so it
survives the release.

## Symptom

In the pre-publish e2e matrix (`pnpm rtx release e2e --backend container`), the
`ensureEnrichment()` step runs the published CLI: `ts-runtypes gen` writes 6 mirror
files, then `ts-runtypes gen --check` immediately flags 4 of those same files with
GE001 "mirror location drift — re-run gen to migrate/relocate". `gen` and
`gen --check` disagree about where a mirror belongs, on files `gen` itself just
wrote:

```
gen: wrote /e2e/apps/shared/src/__runtypes/enriched/friendly/stringFormats.ts (friendlyString)
gen --check: /e2e/apps/shared/src/__runtypes/enriched/friendly/stringFormats.ts: [GE001 warning]
  mirror location drift: source maps to the per-family files
  /e2e/node_modules/@ts-runtypes/core/src/formats/string/__runtypes/enriched/friendly/stringFormats.ts + …/mock/stringFormats.ts
  but this file is /e2e/apps/shared/src/__runtypes/enriched/friendly/stringFormats.ts

gen: wrote /e2e/apps/shared/src/__runtypes/enriched/i18n/es/models/enriched-user.ts (es_friendlyEnrichedUser)
gen --check: …/i18n/es/models/enriched-user.ts: [GE001 warning] mirror location drift:
  source maps to the per-family files …/enriched/friendly/models/enriched-user.ts + …/enriched/mock/models/enriched-user.ts
  but this file is …/enriched/i18n/es/models/enriched-user.ts
```

(4 findings total: friendly/mock/i18n-es stringFormats + i18n-es enriched-user.)

## Two failure modes, likely one root cause

GE001's expected-location derivation does not match `gen`'s write-location logic
after the one-genDir convention sweep (3a8357c8, v0.10.0):

1. **node_modules-sourced types** (`stringFormats` — source lives in the installed
   `@ts-runtypes/core/src/formats/string/`): the checker anchors the expected mirror
   to the SOURCE file's own directory (producing a path inside `node_modules/…`),
   while `gen` correctly writes under the consuming project's `<genDir>/enriched/…`.
2. **i18n locale mirrors**: the checker's family model only knows the
   friendly + mock pair, so every `<genDir>/enriched/i18n/<locale>/…` file
   self-flags as drift even though that is exactly the documented convention
   (`<genDir>/enriched/{friendly,mock,i18n/<locale>}`).

## Impact

- Warning noise on every `gen --check` in any project that (a) enriches a type
  imported from a package, or (b) uses `gen --translate <locale>` — i.e. the
  advertised i18n flow always warns.
- The advice ("re-run gen to migrate/relocate") is wrong: re-running changes
  nothing, the loop never converges.
- Risk if GE001 ever drives automated migration/prune tooling: it would relocate or
  delete valid mirrors.

## Fix plan

1. Single source of truth for mirror pathing: `gen --check` must derive the expected
   location through the same resolver `gen` uses to pick write locations
   (project-genDir-anchored, not source-file-anchored), so the two can never drift.
2. Teach the expected-location model the `i18n/<locale>/` subtree: a locale mirror's
   canonical home is `<genDir>/enriched/i18n/<locale>/<rel>.ts`, anchored to the
   friendly mirror it translates.
3. Pin with tests: after `gen` over (a) a type imported from an installed package and
   (b) a `--translate` locale, `gen --check` must report zero GE001 findings. The
   pre-publish e2e's `ensureEnrichment()` output is the integration repro.

## Repro

`pnpm rtx release e2e --backend container` — watch the `ensureEnrichment()` step
(`gen` then `gen --check`); or any host project: enrich a node_modules-imported type
or run `gen --translate es`, then `gen --check`.
