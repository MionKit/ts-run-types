# GE001 "mirror location drift" false positives right after `gen`

## Status

SHIPPED — found 2026-07-18 during the v0.10.0 release gate and fixed in the same PR
(`fix/e2e-gendir-imports`). `gen --check`'s GE001 pass now derives expected mirror
locations the same way `gen`'s write side does, and knows the `i18n/<locale>/`
subtree.

## Symptom (as found)

In the pre-publish e2e matrix (`pnpm rtx release e2e --backend container`), the
`ensureEnrichment()` step ran the published CLI: `ts-runtypes gen` wrote 6 mirror
files, then `ts-runtypes gen --check` immediately flagged 4 of those same files with
GE001 "mirror location drift — re-run gen to migrate/relocate":

```
gen: wrote /e2e/apps/shared/src/__runtypes/enriched/friendly/stringFormats.ts (friendlyString)
gen --check: …/friendly/stringFormats.ts: [GE001 warning] mirror location drift:
  source maps to the per-family files
  /e2e/node_modules/@ts-runtypes/core/src/formats/string/__runtypes/enriched/friendly/stringFormats.ts + …/mock/…
  but this file is /e2e/apps/shared/src/__runtypes/enriched/friendly/stringFormats.ts

gen --check: …/i18n/es/models/enriched-user.ts: [GE001 warning] mirror location drift:
  source maps to the per-family files …/enriched/friendly/models/enriched-user.ts + …/enriched/mock/…
  but this file is …/enriched/i18n/es/models/enriched-user.ts
```

## Root cause — two failure modes, one anchor bug

`checkMirrorFile` (cmd/ts-runtypes/enrich_gencheck.go) resolved the enrich config
from the **resolved source** path, while `gen`'s write side anchors at the
**project** owning the mirror tree:

1. **node_modules-sourced types** (`stringFormats`): anchoring at the source walked
   up inside the installed package and re-derived the config there, producing an
   expected mirror inside `node_modules/…` — while `gen` correctly writes under the
   consuming project's genDir via the out-of-root base-name fallback.
2. **i18n locale mirrors**: `mirrorFamilyOf` only knew the friendly + mock family
   segments, so every `<genDir>/enriched/i18n/<locale>/…` file fell into the
   pre-split "combined mirror" arm and self-flagged.

## What shipped

- `checkMirrorFile` anchors `resolveEnrichConfig` at the **mirror file** (the
  project that owns the mirror tree) — the same anchor as `gen`'s write side, so
  the two derivations can never disagree.
- A `localeMirrorOf` arm recognizes `<I18nDir>/<locale>/…` files and derives their
  canonical home via `translationPathFor(locale, mirrorPath(friendly, source))` —
  real relocations still drift (single-path GE001), canonical locations pass.
- The `gen <source> --check` form now also targets the source's per-locale
  translation mirrors (from tsconfig `i18n.locales`), not just friendly + mock +
  legacy.
- Tests pin all three behaviors (`TestCheckMirrorFile_NodeModulesSourceClean`,
  `TestCheckMirrorFile_I18nLocaleMirrorClean`,
  `TestCheckMirrorFile_I18nRelocatedDrifts`) alongside the pre-existing clean /
  legacy-combined / GE002 / GE003 cases.

## Verification

- `go -C ts-go-runtypes test ./internal/... ./cmd/...` green.
- The pre-publish e2e's `ensureEnrichment()` step (repacked binary) reports zero
  GE001 findings on gen's own output — the integration repro that surfaced the bug.
