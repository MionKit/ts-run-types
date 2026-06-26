# Reconcile: carry authored content across a NOMINAL type rename (enums)

**Status:** open — a real, fuzzer-reproduced gap, surfaced by the RC (rename-carry)
oracle the moment type renames were folded into the type-modification fuzzer's
default lane. It is a SIBLING of, and distinct from, the now-shipped graph-parity
const matcher ([docs/done/reconcile-rename-detection.md](../done/reconcile-rename-detection.md)):
that matcher carries an interface rename + reshape by FIELD-GRAPH overlap; this gap
is the case where there is **no field graph to score**.

## Reproduce

`FUZZ_TYPEMOD_REPLAY=0x4185206a` against
[typeModFuzz.integration.test.ts](../../packages/ts-runtypes/test/fuzz/enrich/typeModFuzz.integration.test.ts)
fails at step 6 with:

```
[RC] renameDecl E0→T_9lrw (step 6): rename demoted 1 live label(s) into a carcass: LBL_0_x
```

`E0` is an **enum**. The minimal before/after:

```ts
// BEFORE — friendlyE0 holds the authored label, T_af5a references it
/** @rtType E0#i2yA6s2 */
export const friendlyE0: FriendlyType<E0> = {$label: 'LBL_0_x', $errors: {type: ''}};
/** @rtType T_af5a#qg4auEs @rtIds {…, q_5vxx: i2yA6s2, …} */
export const friendlyT_af5a: FriendlyType<T_af5a> = { …, q_5vxx: friendlyE0, … };

// AFTER renaming enum E0 → T_9lrw — friendlyE0 ORPHANED, label lost from the live const
/* @rtOrphan /** @rtType E0#i2yA6s2 *​/
export const friendlyE0: FriendlyType<E0> = {$label: 'LBL_0_x', …}; */
/** @rtType T_af5a#WiMS48Y @rtIds {…, q_5vxx: SqseyC4, …} */
export const friendlyT_af5a: FriendlyType<T_af5a> = { …, /* @rtOrphanChild q_5vxx: friendlyE0, */ q_5vxx: friendlyT_9lrw, … };
/** @rtType T_9lrw#SqseyC4 */
export const friendlyT_9lrw: FriendlyType<T_9lrw> = {$label: '', …}; // scaffolded EMPTY
```

The authored `LBL_0_x` survives only in the `@rtOrphan` carcass (recoverable, but
gone from the live const). This is PRE-EXISTING: the old id-only matcher loses it
identically — the RC oracle just made it visible (the older NL oracle accepts a
label preserved in a carcass).

## Why the graph-parity matcher cannot pair it

Two properties combine, neither of which the const matcher handles:

1. **The id is NOMINAL.** An enum's structural id is name-dependent, so a *pure*
   rename changes it (`E0#i2yA6s2` → `T_9lrw#SqseyC4`). The whole-graph-id fast path
   (`existing.typeID == desired.TypeID`) therefore does not fire — unlike an
   interface, whose id is name-independent and a pure rename keeps.
2. **There is no field graph.** An enum's const is `{$label, $errors}` with no
   `@rtIds` — `constSimilarity`'s top-level field sets are both empty, so the
   field-overlap score is 0. There is nothing structural to match on.

A baseline "one empty-graph drop + one empty-graph add ⇒ rename" guess is **unsound**
(an unrelated deleted enum + a new enum would mis-carry — exactly the
mis-attribution the soundness rule forbids), so it is deliberately NOT done.

## The fix direction — a REFERENTIAL rename signal

The carry is recoverable from how the type is USED, not its own shape. When `E0` was
renamed, the parent field `T_af5a.q_5vxx` kept its NAME but switched its child id
from `i2yA6s2` (dropped `E0`) to `SqseyC4` (added `T_9lrw`). That same-position
rewiring is concrete evidence `E0` became `T_9lrw`.

Sketch (in `computeConstRenames`,
[reconcile.go](../../internal/enrich/mirror/reconcile.go)):

- Build `existingFieldChild` and `desiredFieldChild`: maps from
  `"<parentTypeName>|<fieldPath>"` → child type id, over every const's child-id map
  (existing `constEntry.childIDs`, desired `NamedConst.ChildIDs`).
- A drop `D` (id_d) and add `A` (id_a) are **referentially linked** when some key `K`
  has `existingFieldChild[K] == id_d` AND `desiredFieldChild[K] == id_a` — the same
  named field in the same (non-renamed) parent repointed from D to A.
- Feed that as a high-confidence signal into the existing strict mutual-best pairing
  (it composes with graph parity; keep the threshold + uniqueness + fall-through, so
  an ambiguous repoint — D referenced by fields that now point at different adds —
  still falls through rather than guessing).

Edge cases to design for: the parent ALSO renamed in the same pass (key won't match —
fall through); D referenced by multiple parents that disagree (ambiguous — fall
through); retype-not-rename where a field is repointed from a deleted type to a
genuinely different new type (indistinguishable from rename at the field level — the
referential signal will pair them; acceptable, bounded by uniqueness, and no worse
than the interface same-name case).

## Status in the fuzzer today

The type-modification fuzzer DOES rename enums (`renameDecl` renames any decl), and
the NL oracle pins that nothing is lost — the enum's label is preserved in the
`@rtOrphan` carcass. What is NOT asserted is the *live* carry: the RC oracle is scoped
to ROOT renames (the only renames that are guaranteed unambiguous + non-cascading), so
it does not flag this enum demotion. The reproducer above (`0x4185206a`) is the record
of the gap.

## When done

Add a worked-example Go test next to
[reconcile_examples_test.go](../../internal/enrich/mirror/reconcile_examples_test.go)
(rename an enum referenced by a field → its authored label carries onto the live
const), and broaden the fuzzer's RC oracle
([typeModFuzzRunner.ts](../../packages/ts-runtypes/test/fuzz/enrich/typeModFuzzRunner.ts))
beyond root renames to assert the nominal carry on every run.
