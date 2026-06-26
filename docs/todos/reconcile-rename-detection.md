# Reconcile: more robust type-rename detection when types share a structural id

**Status:** open — the remaining reconciler gap after the whole-const `@rtOrphan`
carcass handling was made stable (docs/done/reconcile-orphan-const-convergence.md).
Surfaced by the type-modification fuzzer with `FUZZ_TYPEMOD_RENAMES=1`.

## The gap

A whole-type rename (e.g. `interface User` → `Account`) keeps the type's
NAME-INDEPENDENT structural id, so the reconciler carries the authored tree and just
rewrites the name. `computeConstRenames`
([internal/enrich/mirror/reconcile.go](../../internal/enrich/mirror/reconcile.go))
pairs a DROPPED existing const (var name no longer desired) with an ADDED desired
const (var name not present) by their **unique shared structural id**, per form:

```go
for id, drops := range dropByID {
    if adds := addByID[id]; len(drops) == 1 && len(adds) == 1 {
        renames = append(renames, constRename{existing: drops[0], desired: adds[0], ...})
    }
}
```

The `len(drops) == 1 && len(adds) == 1` guard is the limit. When **several types
share a structural id** (two same-shape interfaces, or a rename that coincides with
another same-shape type appearing/disappearing in the same pass), the pairing is
ambiguous — more than one drop or add for that id — so it falls through to the safe
but lossy path: the old const is orphaned and the new one scaffolded fresh, and the
authored content does not carry across the rename (it survives only in the orphan
carcass, recoverable but not on the live const).

This is the "advanced rename detection" follow-up: the 1:1-by-id rule is correct and
safe but conservative; the ambiguous case needs a real disambiguation strategy.

## Reproduce

```
FUZZ_TYPEMOD_RENAMES=1 FUZZ_TYPEMOD_SEQUENCES=300 FUZZ_TYPEMOD_DEBUG=1 pnpm run fuzz:typemod
```

`RENAMES` enables the `renameRoot` / `renameDecl` ops. Most renames now carry (the
carcass-stability fixes cleared the common failures); the residual failures are the
same-shape-ambiguity ones. A failing seed prints a shrunk, replayable reproducer;
`FUZZ_TYPEMOD_REPLAY=<seed>` replays it and `FUZZ_TYPEMOD_DEBUG=1` dumps the mirrors.

## Fix directions (to design)

Disambiguate which dropped const became which added const when an id is shared:

- **Field-name / child-id overlap.** Among the same-id candidates, pair the drop and
  add whose `@rtIds` child maps (or live field names) overlap most — a rename keeps
  the field set, an unrelated same-shape type need not.
- **Authored-content signal.** Prefer pairing a drop that HAS authored values with an
  add, so the carry preserves the most content; never pair two empties over a
  content-bearing one.
- **Positional / breadcrumb order.** Use declaration order in the source breadcrumb as
  a weak tiebreaker when the structural signals tie.
- **Bounded ambiguity, else fall through.** Keep the safe orphan+scaffold path when no
  confident pairing exists — never guess a carry that could mis-attribute authored
  content to the wrong type.

When implemented, fold `renameRoot` / `renameDecl` back into the fuzzer's default lane
(drop the `renames` gate in typeModify.ts and the `FUZZ_TYPEMOD_RENAMES` switch in
typeModFuzzRunner.ts) so the rename carry is asserted on every run.
