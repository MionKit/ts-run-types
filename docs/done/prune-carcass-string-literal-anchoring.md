# Comment-anchor `gen --prune`'s carcass removal (lint/prune asymmetry)

Status: **implemented** on branch `claude/fervent-mestorf-b8fc12` (2026-07-04).
Scope: Go-only, enrichment mirror hygiene/prune. No JS, CLI-flag, or wire
change. Residual half of a finding from PR #168 (per-family enrichment codes);
the LINT side shipped there, this is the PRUNE side.

## What shipped

Lint and prune now share ONE definition of "what a carcass IS", so the lint
rule's promise — "reports exactly what prune would fix" — is literally true
again in BOTH directions.

- **New shared helper `CarcassMatches`** in
  [internal/enrichment/mirror/hygiene.go](../../internal/enrichment/mirror/hygiene.go):
  `orphanBlockPattern` matches restricted to those that START a genuine
  block-comment span (via the existing `commentSpans` scanner). This is the
  extraction of the comment-anchoring logic that previously lived inline in
  `ScanDirtyTags`.
- **`ScanDirtyTags`** (lint) now derives its carcass findings from
  `CarcassMatches` — behaviourally unchanged, just factored through the helper.
- **`PruneOrphanBlocks`** (the engine of `ts-runtypes gen --prune`,
  [reconcile.go](../../internal/enrichment/mirror/reconcile.go)) now takes its match
  set from `CarcassMatches` instead of running the RAW `orphanBlockPattern` over
  the whole mirror text. Its malformed-carcass (`carcassCrossesStatement`) and
  indentation/newline cleanup logic sit unchanged on top of the filtered
  matches.

### The two asymmetries this closes

1. **Prune can no longer corrupt authored data.** A user-authored mirror value
   that embeds the byte sequence — e.g. an `rt$errors` template or `rt$label`
   documenting the syntax itself:

   ```ts
   export const friendlyDocs: FriendlyType<Docs> = {
     snippet: {rt$label: 'Example: /* @rtOrphan export const gone = {}; */'},
   };
   ```

   was previously deleted from INSIDE the string by `gen --prune` (the match is
   fully contained in one statement, so the `carcassCrossesStatement` guard did
   not help). It now comes out byte-identical, matching lint, which already
   reported nothing post-#168.

2. **A carcass-looking sequence inside a `//` line comment** — the match starts
   mid-line, not at the `//`, so it never begins a block-comment span — is now
   left alone by BOTH lint and prune (previously prune removed it, lint did
   not).

On generated mirrors the filtered set is identical to the raw pattern (a real
carcass always starts a block comment), so the existing prune/reconcile suites
are unchanged.

## Tests

- [orphan_test.go](../../internal/enrichment/mirror/orphan_test.go) →
  `TestPruneOrphanBlocks_StringLiteralsNeverPruned`: the destructive twin of the
  lint-side `TestScanDirtyTags_StringLiteralsNeverFire`. Pins that (a) authored
  `rt$label`/`rt$errors` strings and a `//`-line-comment carcass come out
  byte-identical with count 0, (b) lint agrees (reports nothing), and (c) a REAL
  carcass in the same file is still removed while the surrounding authored
  strings survive. Verified to FAIL against the pre-fix raw-pattern prune
  (removed=3, strings corrupted).
- The existing prune suite (`TestPruneOrphanBlocks`,
  `TestPruneOrphanBlocks_MalformedCarcassSkipped`, `TestCarcassCrossesStatement`)
  and the lint suite stay green — real carcasses always start a block comment,
  so filtered matches are identical on generated mirrors.

## Follow-up (same branch): parse-oracle comment spans — `mirror.Scan`

The hand-rolled `commentSpans` lexer was then replaced wholesale by a
parse-derived one ([internal/enrichment/mirror/scanTags.go](../../internal/enrichment/mirror/scanTags.go)),
upgrading the anchoring from "good lexical approximation" to parser-grade:

- **`Scan` type** — one per-file lexical view (text + comment spans + literal
  token ranges), built once and shared by every probe. `NewScan(text)` parses;
  `NewScanForSourceFile(sf)` reuses an EXISTING parse — both the resolver's
  checkEnrich pass and `ts-runtypes check` already hold the Program's parse, so
  the oracle costs one AST walk and no re-parse on the hot paths (previously
  the hand-rolled lexer re-ran up to ~6× per file across the probes).
- **Literal-token oracle** — the parser reports where string / template-part /
  regex / JSX-text TOKENS are; comments fall out of one linear pass over
  everything else. Comments are trivia (never AST nodes), and tsgo's lean AST
  materializes no punctuation tokens, so per-node trivia enumeration
  (`GetLeadingCommentRanges`) would miss a carcass parked before `};` — the
  linear pass gets completeness for free (pinned by the existing prune suite,
  whose orphan-child fixture sits exactly there).
- **Two lexical blind spots fixed**, both directions of lint/prune symmetry
  preserved by construction:
  - a comment inside a template `${…}` interpolation is now SEEN — a carcass
    there is reported and pruned (`TestScan_TemplateInterpolationComments`);
  - `/*` bytes inside a regex literal no longer open a phantom comment — under
    the old lexer, `pattern: /a\/* @rtOrphan x/` plus any later real comment
    made the raw pattern "match" across LIVE code, which lint reported and
    prune DELETED (the malformed-carcass guard only counts `export` statements
    and a plain const slipped under it). Verified against the extracted old
    lexer; pinned by `TestScan_RegexLiteralNeverPhantomComment`.
- **Third raw-pattern consumer found and fixed:** `indexOrphanCarcasses`
  ([index.go](../../internal/enrichment/mirror/index.go)) — the restore-on-reappear
  index — matched carcass bytes inside string literals too, so an authored
  value documenting the syntax could be spliced back in AS LIVE CODE when the
  named type reappeared. Now anchored through the same Scan
  (`TestIndexOrphanCarcasses_StringEmbeddedNeverIndexed`). The todo's original
  grep missed it because it uses a sibling pattern (`orphanCarcassPattern`),
  not `orphanBlockPattern`. (`ownTriviaStart`'s use of the same sibling
  pattern is safe as-is: it scans a `[fullStart, tokenStart)` region the
  parser already guarantees is trivia-only.)
- **Prune refuses unparseable files** — `PruneOrphanBlocks` gained an error
  return: text with syntax errors comes back untouched with an error, and the
  `gen --prune` CLI warns and skips that file (the same stance `ParseMirror`
  takes for `gen --update`; prune is destructive and never rewrites bytes it
  cannot confidently lex). Lint stays best-effort on broken files (recovered
  parse), matching astcheck.
- **Structural mask hardened:** the const-annotation probes
  (`IsEnrichmentFile`, `FamilyClassifier`) now mask literal bodies as well as
  comments, so a multiline template embedding a mirror-shaped line can't make
  ordinary source read as a mirror; the DSL-import fallback keeps the
  comments-only mask (it must see the quoted 'ts-runtypes' specifier).

## Notes / left as-is (still benign, as PR #168 concluded)

The JS pre-filter
([prefilter.ts](../../packages/ts-runtypes-devtools/src/eslint/prefilter.ts)) still
does a raw `includes(MARKER_COMMENT_PREFIX)` — a false positive there only costs
one resolver round trip that returns zero findings. Cheap by design; comment
parsing was deliberately NOT added to the pre-filter.

Grep confirmed at implementation time that `PruneOrphanBlocks` was the only
remaining raw `orphanBlockPattern` consumer; the `cmd/ts-runtypes`
check/translate paths all go through `ScanDirtyTags`. The two non-consumer
references are in tests (`hygiene_test.go`, `todo_test.go`) asserting the
pattern directly. (The follow-up above later found `orphanCarcassPattern` — a
sibling pattern this grep could not catch — and anchored it too.)
