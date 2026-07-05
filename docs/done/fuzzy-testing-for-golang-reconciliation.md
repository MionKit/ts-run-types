# Fuzzy / property testing for the enrich-mirror reconciler — DONE

**Status: DONE.** All three test layers shipped and are green, the atomic-write
prerequisite landed, and every open question is resolved. The two items that were
once "remaining" are now closed: concurrent races are pinned by a dedicated harness,
and the `@rtKeep` question is decided in favour of the existing (safe) behaviour. The
only thing genuinely deferred is a debounce policy, which cannot exist until the
reconciler is wired into a Vite HMR save-handler (a separate feature, see below).

The reconciler bugs the fuzzers SURFACED were fixed under their own records:
[reconcile-orphan-const-convergence.md](./reconcile-orphan-const-convergence.md),
[reconcile-rename-detection.md](./reconcile-rename-detection.md),
[reconcile-nominal-rename-carry.md](./reconcile-nominal-rename-carry.md),
[reconcile-marker-refresh-convergence.md](./reconcile-marker-refresh-convergence.md).

## What shipped

- **Layer 1 — in-process Go property test**
  ([internal/enrichment/mirror/reconcile_property_test.go](../../internal/enrichment/mirror/reconcile_property_test.go)).
  A seeded harness starts from a real `Scaffold` mirror (every blank authored with a
  unique sentinel) and applies random human-like edits (rename / add / delete / retype
  a field, rename the type, mirror-side comment + reserved-key extras), re-running
  `mirror.Reconcile` after each, asserting parseability, one-step convergence, and that
  every authored value survives (live, carried, or in a carcass). Failures shrink to a
  minimal repro.

- **Layer 2 — E2E reconcile test**
  ([packages/runtypes-devtools/test/enrich-hmr-e2e.test.ts](../../packages/runtypes-devtools/test/enrich-hmr-e2e.test.ts)).
  Drives the real binary's `gen --update` over a temp project across consecutive edits,
  asserting the dev-loop contracts: types flow to the mirror ONLY (source untouched),
  the mirror converges, authored data survives, renames carry.

- **Layer 2b — event-driven, two-actor enrich-sync fuzzer**
  ([packages/ts-runtypes/test/fuzz/enrich/](../../packages/ts-runtypes/test/fuzz/enrich/),
  `pnpm run fuzz:enrich`). One actor edits the source type, the other authors the
  mirror; they interleave in random seed-reproducible sequences, asserting nothing is
  lost, the file converges, and every run is controlled.

- **Layer 2c — type-modification fuzzer**
  ([typeModFuzz.integration.test.ts](../../packages/ts-runtypes/test/fuzz/enrich/typeModFuzz.integration.test.ts),
  `pnpm run fuzz:typemod`). Generates a RANDOM deep type and drives random structural
  operations on it (incl. rename + reshape, mid-edit corruptions), reconciling through
  the real binary after each. Pins NL (nothing lost), RC (root-rename carries to the
  live const), R6 (convergence), R10 (controlled), P (parse-safety), and **CB
  (content-blindness: an empty-valued twin reconciles to identical structure as the
  filled one — filling labels never changes the result)**.

- **Layer 3 — concurrent-CLI race harness**
  ([enrichRace.test.ts](../../packages/ts-runtypes/test/fuzz/enrich/enrichRace.test.ts),
  `pnpm run fuzz:race` / `fuzz:race:soak`). Fires several `gen --update` processes at
  one fixture simultaneously (the save + format-on-save double-fire) and races a source
  rewrite against them, asserting on the SETTLED state: every reconcile exits cleanly,
  the mirror converges, and nothing authored is lost. The atomic write is what keeps
  this safe (a racing reader never sees a torn mirror).

- **Atomic mirror write (open question 4)** — `writeReconciled` / `atomicWriteFile` in
  [cmd/ts-runtypes/enrich_reconcile.go](../../cmd/ts-runtypes/enrich_reconcile.go) write
  to a same-directory temp file then `os.Rename` into place. Covered by
  `TestAtomicWriteFile_ReplacesCleanly` and end-to-end by Layer 3.

## Open-question resolutions

1. **Rename detection — DONE, at field, const, and nominal level.** Field renames pair
   by `@rtIds` child identity; whole-type renames pair by GRAPH PARITY (id fast-path +
   field-overlap scoring, strict mutual-best); nominal types with no field graph (enums)
   pair by a REFERENTIAL signal (the parent field repointing). See the rename-detection
   and nominal-rename done records.
2. **Debounce + concurrent races (open question 2) — RACES DONE, debounce DEFERRED.**
   Concurrent reconciles + a source rewrite racing them are now pinned by Layer 3 and
   stay safe (the atomic write is the enabler). A debounce window (collapsing a
   keystroke burst into one reconcile) is a PERFORMANCE optimisation, not a correctness
   gap (rapid reconciles are content-blind + convergent, so they are safe if redundant),
   and it cannot be built until the reconciler is wired into a Vite HMR save-handler —
   which does not exist today. Deferred with that feature.
3. **Parse-failure policy — conservative (no-op / keep).** An unparseable MIRROR makes
   `Reconcile` error and the CLI fatal WITHOUT writing. An unparseable / half-typed
   SOURCE feeds only the tolerant `SourceDeclaresType` scan, which errs toward KEEP.
4. **Atomic mirror write — DONE** (above).
5. **User-authored extra vs orphan (open question 5) — DECIDED: keep the current
   behaviour, no marker.** Reserved-key extras (a `min` on a mock node) are node meta
   and preserved. An arbitrary non-field key is orphan-childed: preserved verbatim in a
   carcass, never lost, recoverable, and prune-able. The fuzzers confirm nothing is lost.
   A dedicated `@rtKeep` "keep this live" marker is a niche convenience, NOT a safety
   need, so it is intentionally not built; it can be added as a small standalone feature
   if a real use case appears.
6. **Splice granularity — byte-preserve the leaf** (no descent into array-valued
   leaves). Confirmed by the value-preservation oracle.

## Deferred (separate features, not fuzzing work)

- **A Vite HMR save-handler** that auto-runs `gen --update` on save, with a **debounce
  window** (open question 2). Today `gen --update` is a CLI op an agent or CI invokes;
  it is not wired into the plugin's HMR. That wiring (and its debounce) is a feature, not
  a reconciler or fuzzing concern.
- **A `@rtKeep` marker** (open question 5), per the decision above.
