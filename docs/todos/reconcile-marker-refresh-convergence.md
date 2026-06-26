# Reconcile: a referenced const's @rtType/@rtIds marker can take TWO passes to stabilize

**Status:** open — a real R6 (convergence) gap, fuzzer-reproduced by the
type-modification soak once type renames carry far enough to reach a long, deeply
reshaped sequence. NOT caused by the graph-parity rename matcher
([docs/done/reconcile-rename-detection.md](../done/reconcile-rename-detection.md)) —
the affected const is matched by NAME and refreshed by `refreshMarker`, never by the
rename matcher. The matcher fix merely makes longer sequences reachable (the old
id-only matcher failed earlier, at the rename + reshape carry, so this state was never
hit).

## Reproduce

`FUZZ_TYPEMOD_REPLAY=0xe31be639 FUZZ_TYPEMOD_MAXSTEPS=16` against
[typeModFuzz.integration.test.ts](../../packages/ts-runtypes/test/fuzz/enrich/typeModFuzz.integration.test.ts)
fails at step 14:

```
[R6] toggleOptional value=true (step 14): a second --update was NOT a byte-identical no-op (not a fixed point)
```

The committed default lane (`FUZZ_TYPEMOD_MAXSTEPS=8`) does NOT reach this — the bug
needs a long (≥ 15 op) sequence that reshapes one field repeatedly, so it is a SOAK
finding (`pnpm run fuzz:typemod:soak`, `MAXSTEPS=20`), not a CI-default failure.

## The symptom

The mirror after the FIRST `--update` and after the SECOND differ only in one const's
marker — a `Map` const referenced by a deeply-reshaped field:

```
// after 1st --update
/** @rtType Map#yeGyAmq @rtIds {$keys: jDvhTdT, $values: zxt3nZt} */
export const friendlyMap: FriendlyType<Map> = { … };

// after 2nd --update  (← the non-convergence: id + $values child id rewritten)
/** @rtType Map#Se8Ygyy @rtIds {$keys: jDvhTdT, $values: P7Lbvfv} */
export const friendlyMap: FriendlyType<Map> = { … };
```

`Se8Ygyy` is the Map's TRUE current id — the parent's `@rtIds` already records
`value.q_ehk6: Se8Ygyy`. So the first pass left `friendlyMap`'s own `@rtType` /
`@rtIds` marker STALE (`yeGyAmq`), and the second pass corrected it. The body is
byte-stable; only the marker churns. (The reproducer's parent const also carries a
deep stack of `@rtOrphanChild value: { … }` carcasses from the repeated field
reshaping — that accretion is the context that drives the id drift, though the
non-convergence itself is the marker, not the carcasses.)

## Why it matters

R6 (a second `--update` is a byte-identical no-op) is a core reconciler contract: a
non-fixed-point means an editor that reconciles on every save would keep rewriting the
file, and a CI "no uncommitted changes" check would flip on an untouched type.

## Fix direction (to investigate)

The const is matched by name (`reconcileOneConst` → `findExistingConst`) and its marker
refreshed by `refreshMarker`
([reconcile.go](../../internal/enrich/mirror/reconcile.go)), which compares the existing
marker block to `MarkerComment(named.TypeName, named.TypeID, named.ChildIDs)` and
splices when they differ. Investigate why the FIRST pass does not refresh
`friendlyMap`'s id to the desired `Se8Ygyy`:

- Does the desired `NamedConst.TypeID` / `ChildIDs` for the `Map` const reaching
  `refreshMarker` lag the parent's recorded `value.q_ehk6` child id within a single
  reconcile (an ordering / staleness issue in how the spec's Map const id is computed
  vs the parent's child-id map)?
- Is the `Map` const a referenced child whose own const id is derived differently from
  the `@rtIds` child id the parent records (the two should agree; here they disagree by
  one pass)?
- Add a Go worked-example test once root-caused: build a mirror whose referenced `Map`
  const marker is stale, reconcile, and assert a single pass converges (a second
  `--update` is byte-identical).

When fixed, the type-modification soak (`MAXSTEPS=20`) should pass this seed; add it to
the convergence coverage.
