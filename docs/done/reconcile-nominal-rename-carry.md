# Reconcile: carry authored content across a NOMINAL type rename (enums) — DONE

**Status:** DONE. A nominal type (an enum) that is renamed now carries its authored
content onto the live const via a REFERENTIAL signal — the parent field that
referenced it repoints from the old child id to the new one, which is concrete
evidence of the rename. Implemented in `computeConstRenames`
([reconcile.go](../../internal/enrich/mirror/reconcile.go)) and pinned by three Go
worked-example tests ([reconcile_examples_test.go](../../internal/enrich/mirror/reconcile_examples_test.go)).
Sibling of the graph-parity const matcher
([reconcile-rename-detection.md](./reconcile-rename-detection.md)); this closes the
case it could not — a type with NO field graph to score.

## The gap (fixed)

`computeConstRenames` paired a renamed const by whole-graph `TypeID` (fast path) or
FIELD-GRAPH overlap (`constSimilarity`). An enum defeats both:

- Its id is NAME-DEPENDENT (nominal), so a pure rename CHANGES it (`E0#i2yA6s2` →
  `T_9lrw#SqseyC4`) → the `TypeID==TypeID` fast path misses.
- Its const is `{$label, $errors}` with no `@rtIds` → both child-id maps are empty →
  field-overlap score is 0 → below threshold.

So the enum was orphaned and an empty twin scaffolded; the authored `$label` survived
only in the `@rtOrphan` carcass (reproducer `0x4185206a`). A baseline
"one-empty-out-one-empty-in ⇒ rename" guess was rejected as unsound (an unrelated
deleted enum + a new enum would mis-carry).

## The fix — a referential signal

`buildReferentialLinks(index, spec)` builds, once, a map `oldChildId → {newChildId}`:
for every field path present in both an existing const and its desired counterpart
(keyed by the form-independent parent TYPE NAME, so a non-renamed parent matches
across the pass), when the recorded child id CHANGED, record `old → new`. That
repointing is concrete evidence the old child type became the new one.

`constSimilarity` then scores a `(drop, add)` pair `1.0` when `refLinks[drop.id]`
contains `add.id` — composing with the existing strict mutual-best + threshold +
fall-through, so it stays sound:

- **Ambiguous repoint** (one drop linked to two adds via different fields) → both
  score `1.0` → tie → no unique best → falls through (no guess).
- **Parent itself renamed** → its type name differs on each side → key never matches
  → no link → falls through.
- **Retype, not rename** (a field repointed from a deleted type to a genuinely
  different new named type) → indistinguishable at the field level, bounded by
  uniqueness, and `mergeObject` re-scaffolds type-changed fields anyway — the same
  precision as the field-level matcher `computeRenames`. A repoint to an ATOMIC type
  (string) records no link at all (no added const carries that id).

## What is pinned

Go worked examples in [reconcile_examples_test.go](../../internal/enrich/mirror/reconcile_examples_test.go):

- `RenameEnum_carriesByReferentialLink` — enum referenced by a field, renamed, parent
  repointed → the authored label carries onto the live renamed const (FAILS without
  the referential signal: the enum orphans).
- `RenameEnum_noReferentialLink_fallsThrough` — unrelated enums deleted + added, no
  repointing → safe orphan + scaffold, labels preserved in carcasses.
- `RenameEnum_ambiguousRepoint_fallsThrough` — one enum repointed by two fields to two
  different adds → tie → falls through, neither add mis-carries.

## Note on the fuzzer

The carry is asserted by the deterministic Go tests, not by broadening the fuzzer's RC
oracle. RC stays scoped to ROOT renames on purpose: a sub-decl / FIELD rename can still
LEGITIMATELY demote a label (renaming a field inside a recursive type changes that
type's id, so a self-referencing field's element type correctly re-scaffolds; an
ambiguous same-shape rename falls through). Those are correct behaviours covered by NL
(nothing lost), so asserting carry-to-live for every sub-decl rename would be unsound.
