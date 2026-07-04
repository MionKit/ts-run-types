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
  [internal/enrich/mirror/hygiene.go](../../internal/enrich/mirror/hygiene.go):
  `orphanBlockPattern` matches restricted to those that START a genuine
  block-comment span (via the existing `commentSpans` scanner). This is the
  extraction of the comment-anchoring logic that previously lived inline in
  `ScanDirtyTags`.
- **`ScanDirtyTags`** (lint) now derives its carcass findings from
  `CarcassMatches` — behaviourally unchanged, just factored through the helper.
- **`PruneOrphanBlocks`** (the engine of `ts-runtypes gen --prune`,
  [reconcile.go](../../internal/enrich/mirror/reconcile.go)) now takes its match
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

- [orphan_test.go](../../internal/enrich/mirror/orphan_test.go) →
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

## Notes / left as-is (still benign, as PR #168 concluded)

The JS pre-filter
([prefilter.ts](../../packages/runtypes-devtools/src/eslint/prefilter.ts)) still
does a raw `includes(MARKER_COMMENT_PREFIX)` — a false positive there only costs
one resolver round trip that returns zero findings. Cheap by design; comment
parsing was deliberately NOT added to the pre-filter.

Grep confirmed at implementation time that `PruneOrphanBlocks` was the only
remaining raw `orphanBlockPattern` consumer; the `cmd/ts-runtypes`
check/translate paths all go through `ScanDirtyTags`. The two non-consumer
references are in tests (`hygiene_test.go`, `todo_test.go`) asserting the
pattern directly.
