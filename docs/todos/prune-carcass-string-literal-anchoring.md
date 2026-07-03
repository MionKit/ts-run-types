# Comment-anchor `gen --prune`'s carcass removal (lint/prune asymmetry)

> **Status: TODO.** Residual half of a finding from PR #168 (per-family
> enrichment codes). The LINT side is fixed and shipped there; the PRUNE side
> still matches carcass bytes inside string literals. No user has hit it —
> the trigger needs authored mirror data that embeds the tag syntax — but
> lint and prune now disagree on what a carcass IS, and prune is the
> destructive one.

## The finding

Dogfooding the repo lint in PR #168 caught the generated diagnostic catalog
([diagnosticCatalog.generated.ts](../../packages/runtypes-devtools/src/diagnosticCatalog.generated.ts))
linting itself dirty: its FT021/FT022/MD021/MD022 message strings embed the
very tag syntax they describe (`/* @rtOrphan … */`), and the hygiene scan
matched those bytes INSIDE string literals:

```
packages/runtypes-devtools/src/diagnosticCatalog.generated.ts:167:264: error runtypes(no-orphan-carcass): [FT022] Stale `@rtOrphanChild` field carcass — …
packages/runtypes-devtools/src/diagnosticCatalog.generated.ts:223:256: error runtypes(no-orphan-carcass): [FT022] Stale `@rtOrphanChild` field carcass — …
```

The scan side was fixed structurally in PR #168: `ScanDirtyTags` filters
`orphanBlockPattern` matches to those that START a real comment span, and the
marker-emit guard became [`HasMarkerComment`](../../internal/enrich/mirror/hygiene.go)
(comment-span-anchored). String literals and JSDoc-nested prose never fire.
Pinned by `TestScanDirtyTags_StringLiteralsNeverFire` in
[hygiene_test.go](../../internal/enrich/mirror/hygiene_test.go).

## What is still wrong

[`PruneOrphanBlocks`](../../internal/enrich/mirror/reconcile.go) (the engine
of `ts-runtypes gen --prune`) still runs the RAW `orphanBlockPattern` over the
whole mirror text. Deliberately left untouched in PR #168 — prune rewrites
user files, so it deserves its own change + tests rather than a ride-along.

Consequences:

1. **Prune can corrupt authored data.** A user-authored mirror value that
   embeds the byte sequence — e.g. an rt$errors template or label documenting
   the syntax itself:

   ```ts
   export const friendlyDocs: FriendlyType<Docs> = {
     snippet: {rt$label: 'Example: /* @rtOrphan export const gone = {}; */'},
   };
   ```

   `gen --prune` deletes those bytes from INSIDE the string (the
   `carcassCrossesStatement` malformed-carcass guard does not help here — the
   match is fully contained in one statement). Lint, post-#168, correctly
   reports nothing.

2. **Lint/prune asymmetry, both directions.** The lint rule's promise is
   "reports exactly what prune would fix" (comment in
   [hygiene.go](../../internal/enrich/mirror/hygiene.go)). That is no longer
   literally true: a pattern inside a string (above) is pruned but not
   reported; a carcass-looking sequence inside a `//` line comment is not
   reported (match does not start a comment span) but WOULD be pruned.

Related, benign, no action needed: the JS pre-filter
([prefilter.ts](../../packages/runtypes-devtools/src/eslint/prefilter.ts))
still does a raw `includes(MARKER_COMMENT_PREFIX)` — a false positive there
only costs one resolver round trip that now returns zero findings (exactly
what happens for the generated catalog file). Cheap by design; do not add
comment parsing to the pre-filter.

## Fix plan

1. Extract the comment-anchored matcher from `ScanDirtyTags` into one shared
   helper in [hygiene.go](../../internal/enrich/mirror/hygiene.go) — e.g.
   `CarcassMatches(text string) [][2]int`: `orphanBlockPattern` matches
   filtered to `commentSpans` starts.
2. Use it in BOTH `ScanDirtyTags` and `PruneOrphanBlocks`, so "what lint
   reports" and "what prune removes" share one definition by construction
   (same single-source principle as tags.go). Keep prune's existing
   malformed-carcass (`carcassCrossesStatement`) and indentation/newline
   cleanup logic unchanged on top of the filtered matches.
3. Tests, mirroring the lint-side negatives:
   - prune round-trip: a mirror whose rt$label / rt$errors string embeds
     `/* @rtOrphan … */` comes out byte-identical, count 0;
   - a real carcass in the same file is still removed;
   - a carcass-looking sequence inside a `//` line comment is left alone
     (closes the second asymmetry direction);
   - the existing prune suite stays green (real carcasses always start a
     block comment, so filtered matches are identical on generated mirrors).
4. Grep for any other raw `orphanBlockPattern` consumers when implementing —
   as of PR #168 the only remaining one is `PruneOrphanBlocks`
   (reconcile.go); `cmd/ts-runtypes` check/translate paths all go through
   `ScanDirtyTags`.
