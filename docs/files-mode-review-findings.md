# Files-mode migration (PR #122) — code review findings

> Methodic sectioned review of branch `claude/cool-hypatia-0xfjgf` vs `origin/main`
> (182 files, +5927/−2543, 18 commits). Six read-only reviewers, one per section,
> against the `CLAUDE.md` + `docs/files-mode-migration.md` + `docs/ARCHITECTURE.md`
> rubric. Scope was deliberately narrow: small mistakes, dead/duplicated code,
> half-empty files, stale references, correctness slips — **no structural
> refactors**, and documented-deferred phases (5/6/7) are out of scope.

## Headline

**No correctness bugs or breakage found (0 must-fix).** The heavy new code — the Go
transform port (byte offsets + source maps), the resolver files-mode plumbing, and
the enrichment reconcile-core extraction — is **clean**. The remaining items are a
duplicated-catalog drift, a test-compliance gap against the marker dual-shape rule,
a couple of minor edges, and stale "virtual-module" comments (fixed in this pass).

| Section | Scope | Result |
| --- | --- | --- |
| S1 — Go transform port | `internal/compiled/transform/`, `internal/constants/` | ✅ clean |
| S2 — Go resolver files-mode | `internal/resolver/` | 1 nice-to-have |
| S3 — Enrich extraction + Track A/B | `internal/enrich/` (+mirror), `cmd/`, `ts-runtypes/src` | ✅ clean |
| S4 — JS plugin + Go↔TS parity | `runtypes-devtools/src` + root, `internal/protocol/` | 1 should-fix + comments |
| S5 — Tests | both packages' `test/` | 1 should-fix (2 suites) |
| S6 — Docs + scripts + config | `docs/`, `scripts/`, root config, containers | ✅ clean |

## Findings (consolidated, ranked)

### must-fix — none

### should-fix

**F1 · Duplication · `packages/runtypes-devtools/src/diagnosticCatalog.ts`**
The devtools diagnostic catalog (636 LOC) is a hand-maintained vendored copy of the
marker-package source of truth `packages/ts-runtypes/src/runtypes/diagnosticCatalog.ts`
(593 LOC), and the two have **drifted in both directions**:
- devtools has `FMT002` (L138) + `JCP001` (L466) that the marker package lacks;
- the marker package has `CLS001` (L466) that devtools lacks.
The file header acknowledges the duplication and defers a codegen dedup. Drift means a
diagnostic emitted with one of these codes resolves in one catalog but not the other.
*Recommended (your call — direction is judgmental):* reconcile the three codes by hand
now (decide canonical direction per code), OR land the deferred `gen:diag-catalog`
codegen so there's a single source of truth. Not auto-fixed — needs a decision.

**F2 · Test-gap · `packages/runtypes-devtools/test/modifier-utilities.test.ts` +
`intersection-modifiers.test.ts`**
Both suites exercise the marker API (`getRunTypeId`) and DO cover both call shapes
(each has ≥1 static and ≥1 reflect test), but **neither contains the hash-equivalence
assertion the marker coverage rule mandates** ("at least one paired test per suite must
assert hash equivalence between the two forms"; canonical example: `atomic.test.ts:729`).
Their existing static/reflect pairs check modifier flags independently, not id equality.
Functional behavior is fine (equivalence is covered in `atomic.test.ts`); this is a
compliance gap in two suites.
*Recommended:* add one cross-form equivalence test per suite, mirroring
`atomic.test.ts:729-744` (two files, same type via static + reflect form, assert the
object entry dedups to one in `cache.byHash`). I can apply this on your go-ahead —
held back only because authoring tests is past the "mechanical" line you drew.

### nice-to-have

**F3 · Edge-case · `internal/resolver/generate.go:55-89` (`ensureOutDirAvailable`)**
The collision guard allows top-level entries named `types`/`enriched` by NAME only
(`isIgnorableOutputEntry`), without checking they are directories. A regular *file*
named `types` passes the guard, then `os.MkdirAll(<outDir>/types, …)` fails later with a
generic OS "not a directory" error instead of the guard's actionable message.
*Recommended:* in the guard loop, require the `types`/`enriched` allow-list members to be
directories (`entry.IsDir()`). Small, but it's guard logic and deserves a test → flagged,
not auto-fixed.

**F4 · Doc-drift · `packages/runtypes-devtools/src/runtypes-constants.generated.ts:79`**
The "Per-entry virtual-module settings" comment is slightly misleading post-files-mode
(these name the internal render format, relativized to disk at the boundary). This file is
**generated** (`gen:ts-constants`), so the fix belongs in the generator/Go source, not a
hand-edit. Low priority.

### fixed in this pass (safe, comment-only)

Stale comments claiming the plugin still serves/loads **virtual modules** (the plugin
flipped to writing real files; `virtual:rt` survives only as the internal render format):
- `packages/runtypes-devtools/src/protocol.ts:400` — "serves these verbatim from its
  virtual-module load hook" → files-mode disk-write wording.
- `packages/runtypes-devtools/src/esbuild.ts:3` — "rewrite + virtual modules" → on-disk.
- `packages/runtypes-devtools/src/rollup.ts:2` — "virtual-module scheme (\0-prefixed ids)"
  → native resolution of the real on-disk modules.
- `packages/runtypes-devtools/src/unplugin.ts:197` — "old virtual-module load enforced" →
  files-mode has no virtual fallback.

## Verified-OK (not findings)

- **S1**: UTF-8 byte→char conversion applied at every offset site (ASCII fast-path
  correct); EditBuffer source map matches magic-string `hires:'boundary'`; VLQ correct;
  retained `virtual:rt` constants genuinely in use; MIT credit complete; 22 golden/diff
  cases byte-identical to the JS oracle.
- **S2**: write-only-on-change + stale GC cannot delete live/foreign files; relativization
  POSIX/OS handling sound; outDir inference + `isWithin` rootDir guard correct;
  OpGenerate↔OpTransform consistency pinned by tests.
- **S3**: Track-B extraction airtight — moved helpers exist exactly once, old `cmd` files
  deleted, **zero filesystem I/O in the `mirror` core**, every `fatal()`→error, thin
  shims; Track-A total-contract `-?` flip correct across all node kinds; package.json
  marker gate intact.
- **S4**: files-mode flip complete (no `resolveId`/`load`); single-runtime-dep rule held;
  rename complete; Go↔TS protocol parity matches field-for-field; the unused `resolveId`
  op on the wire is by-design (Phase 3).
- **S5**: build-mode tests run real `vite build`/rollup with fixture cleanup;
  `global-cleanup` teardown wired + scoped; compile budgets are a tracked deferral (NOT
  silently-lost coverage); no stale refs.
- **S6**: `vite-plugin-runtypes`→`runtypes-devtools` rename complete everywhere
  (configs, scripts, lockfile, website, skills); `.gitignore` matches emitted output;
  workspace/lerna lockstep correct; migration doc accurate.

## Notes on method

Severities were recalibrated during consolidation: S4's three "must-fix" comment items
and S5's two "must-fix" coverage items were downgraded — none affect correctness or
break the build; they are doc-drift and test-compliance respectively. Every finding is
grounded in an exact `file:line` (no speculation). Documented-deferred phases (enrich-at-
build, incremental-HMR scoping, esbuild/webpack real-build fixtures) were not re-flagged.
