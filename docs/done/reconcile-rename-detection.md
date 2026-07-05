# Reconcile: match renamed consts by GRAPH PARITY, not whole-graph id — DONE

**Status:** DONE for the field-bearing case. The const-level rename matcher now pairs
a dropped const with an added const by their FIELD-GRAPH overlap, so a type that is
renamed AND reshaped in one edit carries its authored tree onto the live const
instead of orphaning it. Proven by worked-example Go tests
([reconcile_examples_test.go](../../internal/enrichment/mirror/reconcile_examples_test.go))
and asserted on every fuzzer run by the new RC oracle
([typeModFuzzRunner.ts](../../packages/ts-runtypes/test/fuzz/enrich/typeModFuzzRunner.ts)).

The sibling case — a NOMINAL rename with no field graph (an enum) — is now also fixed
(a referential signal), see
[reconcile-nominal-rename-carry.md](./reconcile-nominal-rename-carry.md).

## The gap (fixed)

`computeConstRenames` ([reconcile.go](../../internal/enrichment/mirror/reconcile.go))
paired a DROPPED existing const with an ADDED desired const only when they shared a
**unique whole-graph TypeID** (`len(drops) == 1 && len(adds) == 1`). The type-id is an
avalanche hash of the FULL type graph, so ANY reshape (a field added / dropped /
retyped) changes it. A rename that *also* reshaped therefore matched neither by name
(the var name changed) nor by id (the id changed): the old const was orphaned and an
empty twin scaffolded, and the authored tree was lost from the live const (it survived
only in the `@rtOrphan` carcass).

Concretely — `Widget{id,size}` (`@rtType Widget#…`) renamed + grown to
`Gadget{id,size,color}`: the old matcher orphaned `friendlyWidget` and scaffolded an
empty `friendlyGadget`; the authored `id` / `size` labels vanished from the live const.

## The fix

Score each `(drop, add)` pair by GRAPH PARITY and carry only the strict mutual-best
pairs:

- **Score (`constSimilarity`).** `1.0` when the whole-graph `TypeID` matches (the graph
  is identical, only the name moved — a pure rename). Otherwise a 50/50 blend of the
  Sørensen–Dice overlap of the consts' top-level field NAMES (the human-stable skeleton
  that survives a reshape) and their `name#childId` PAIRS (precision: a field counts as
  "the same" only when its child type also matches).
- **Pairing (`pairRenames`).** Carry a pair only when `add` is `drop`'s UNIQUE best AND
  `drop` is `add`'s UNIQUE best, above a `0.5` threshold. A tie at either maximum (two
  same-shape types renamed at once — genuinely ambiguous) has no unique best and falls
  through to the safe orphan + scaffold path: an authored value is never GUESSED onto
  the wrong renamed type.

This generalizes the old `len==1`-by-id rule (it is a strict superset — a unique id
match still scores `1.0`) and mirrors, one level up at the const root, the field-level
graph-parity matcher `computeRenames` already used inside `mergeObject`.

**Soundness comes for free from the existing field merge.** The const matcher only
decides *"is this a rename"* — the per-field carry is still decided independently by
`mergeObject` via each field's child id (`childTypeChanged` → `replaceChildOp`). So
even a generous const match cannot mis-carry a field whose TYPE changed: type-stable
fields carry, type-changed fields re-scaffold with the old value parked in a carcass.
That field-level net is why the `0.5` const threshold is safe.

## What is pinned

- **Go worked examples** ([reconcile_examples_test.go](../../internal/enrichment/mirror/reconcile_examples_test.go)):
  `RenameAndReshape_carriesByGraphParity` (the headline carry + fixed point — it FAILS
  on the old id-only matcher), `TwoSameShapeRenames_ambiguousFallsThrough` (the
  soundness floor: ambiguous renames orphan + scaffold, never mis-carry), plus the
  unchanged `RenameInterface` / `TwoSameShapeTypes_stayDistinct` cases.
- **Fuzzer (default lane)** — type-RENAME ops (`renameRoot` / `renameDecl` /
  `renameRootReshaped`) now run on every run (the `FUZZ_TYPEMOD_RENAMES` gate is gone),
  and the new **RC** oracle asserts that a ROOT rename moves authored labels onto the
  LIVE const, not into a carcass: every label live BEFORE the step is still live
  (carcass-stripped) AFTER — including the rename + reshape `renameRootReshaped` drives.
  This is the bite the older NL oracle lacked (NL passes if a label merely survives in a
  carcass; RC fails unless it carried). RC is scoped to ROOT renames because only there
  is the match a single, unambiguous, non-cascading drop↔add — see "Not covered" for why
  sub-decl / field renames are covered by NL instead.

## Not covered (split out / by design)

RC asserts carry-to-live only for ROOT renames. Three kinds of rename can legitimately
demote a label into a carcass — preserved (NL holds), just not on the live const — so
they are covered by NL, not asserted as a live carry:

- **Nominal types with no field graph (enums).** The id is name-dependent (a pure
  rename changes it) AND there are no fields to score, so neither structural signal
  pairs them. Now carried by a REFERENTIAL signal (the parent field repointing), fixed
  in [reconcile-nominal-rename-carry.md](./reconcile-nominal-rename-carry.md) — but the
  carry is asserted by Go tests, not RC (RC stays root-scoped for the reasons below).
- **Field renames inside a RECURSIVE type.** Renaming a field reshapes the type, so its
  id changes, and a self-referencing field's element type "changes" → it conservatively
  re-scaffolds (the same `childTypeChanged` rule that keeps a real retype safe).
- **Ambiguous same-shape renames.** Two same-id candidates have no unique best, so the
  matcher safely falls through (orphan + scaffold) rather than guess.

The fuzzer's `renameDecl` renames any decl (enums included) — those carries are not
asserted live, but NL still pins that nothing is lost.
