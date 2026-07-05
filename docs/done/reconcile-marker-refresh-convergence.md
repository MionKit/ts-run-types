# Reconcile: a restored carcass kept a stale @rtType/@rtIds marker (R6) — DONE

**Status:** DONE. Restoring a type from its `@rtOrphan` carcass now REFRESHES its
marker to the current id in the same pass, so the reconcile is a single-pass fixed
point. Root-caused by instrumenting the reconciler (not a guess), fixed in
`reconcileOneConst` / new `refreshRestoredMarker`
([reconcile.go](../../internal/enrichment/mirror/reconcile.go)), pinned by a Go
worked-example test ([reconcile_examples_test.go](../../internal/enrichment/mirror/reconcile_examples_test.go))
and the fuzzer R6 reproducer seed.

## The bug (root cause, proven)

R6 (a second `--update` is a byte-identical no-op) is a core reconciler contract: a
non-fixed-point means an editor reconciling on every save would keep rewriting the
file, and a CI "no uncommitted changes" check would flip on an untouched type.

A fuzzer soak found a case (seed `0xe31be639`, step 14) where it took TWO passes to
stabilize. Instrumentation pinned it exactly: a `Map` const referenced by a
deeply-reshaped field was orphaned (its element type churned) and reappeared. In
PASS 1, `reconcileOneConst` found no LIVE `friendlyMap` (`existingID=<nil>`), so it
took the restore-on-reappear branch — which un-commented the carcass **verbatim**,
bringing back its STALE `@rtType Map#<old>` marker, and returned without refreshing.
The parent's `@rtIds` already recorded the NEW id (so PASS 1 was internally
inconsistent: parent says `<new>`, the Map const says `<old>`). In PASS 2 the now-live
`friendlyMap` was found and `refreshMarker` corrected it to `<new>` — the
non-convergence. The desired id was identical across both passes, so it was purely the
restore path (the cache/closure-nondeterminism hypotheses were ruled out by the
instrumented run).

## The fix

The restore branch now rewrites the carcass's leading marker to the desired
`MarkerComment(...)` before splicing:

```go
restored := refreshRestoredMarker(unsanitizeFromComment(carcass.inner), named)
*ops = append(*ops, spliceOp{start: carcass.start, end: carcass.end, text: restored + "\n"})
```

`refreshRestoredMarker` is the in-string analogue of `refreshMarker` (the const is
spliced whole, not yet indexed, so the offset-based path cannot run): it locates the
leading `@rtType` block with `markerBlockRange` (bounded to before the `export`/`const`
keyword) and swaps it for the desired marker. A SAME-id reappear leaves the marker
unchanged, so the restore stays byte-identical (the existing
`DeletedTypeReappears_restoresByName` test still holds).

## What is pinned

- `RestoreCarcass_refreshesStaleMarker`
  ([reconcile_examples_test.go](../../internal/enrichment/mirror/reconcile_examples_test.go)) —
  a const orphaned with `oldId` and re-introduced with `newId` restores with the
  refreshed marker AND a second `--update` is byte-identical (fixed point). FAILS on
  the old verbatim restore (stale `oldId`, not a fixed point).
- The fuzzer R6 reproducer `0xe31be639` now converges.
