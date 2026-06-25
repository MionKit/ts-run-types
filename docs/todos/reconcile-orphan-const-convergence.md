# Whole-const `@rtOrphan` carcasses are mishandled across reconcile (churn, data loss, crash)

**Status:** open — found by the type-modification enrich fuzzer
([packages/ts-runtypes/test/fuzz/enrich/typeModFuzz.integration.test.ts](../../packages/ts-runtypes/test/fuzz/enrich/typeModFuzz.integration.test.ts)).
Captured under the fuzzer's **pin-what-holds, document gaps** policy: the default lane
stays on ORPHAN-FREE terrain (it never drops a type's last reference or renames a
non-root decl) and there pins NL (nothing-lost) + R10 (no-crash), which HOLD, and is
green. Opt-in switches (`FUZZ_TYPEMOD_STRICT=1`, `FUZZ_TYPEMOD_INVALID=1`) re-enable the
orphan-creating / corrupting operations and reproduce the three symptoms below.

## Root cause

A whole-const `@rtOrphan` carcass — a `/* @rtOrphan /** @rtType … *​/ … */` block
wrapping an entire `friendly*` / `mock*` const — is treated as reconcilable content
(re-matched and re-spliced) instead of an opaque, position-stable span. When the
same reconcile pass also touches another const (adds one, or rewrites one whose
range overlaps the carcass), the carcass region is re-derived and two splice ops
can land on it. Depending on the shape this shows up as churn or a hard crash.

A carcass should be **inert**: matched once, never re-spliced, until `gen --prune`
removes it. `@rtOrphanChild` carcasses (a single dropped FIELD parked inside a live
const) do NOT have this problem — they converge fine and stay fully covered by the
fuzzer. Only the WHOLE-CONST `@rtOrphan` form is unstable.

## How a whole-const `@rtOrphan` arises

Whenever a previously-mirrored named type leaves the desired set, its entire
`friendly*/mock*` const is wrapped as a whole-const `@rtOrphan` carcass. The natural
trigger is **removing the last reference to a named type**: e.g. a root field
`value: SomeEnum` is deleted, `SomeEnum` becomes unreachable, and its
`friendlySomeEnum` / `mockSomeEnum` consts orphan. A mid-edit corruption that tsgo
error-recovers into a stray type then fixes is another route to the same state.

## Symptom 1 — churn (non-convergence, R6)

`gen --update` is normally idempotent: a second run is a byte-identical no-op (R6).
With a whole-const `@rtOrphan` carcass present AND a const added in the same pass,
the orphan block reorders between the first and second `--update`, so the file never
settles — under HMR it rewrites on every save, and the carcass region can be left
malformed (a `/** @rtType … */` annotation split from its const). A neighbouring
`@rtOrphanChild` carcass can also ACCRETE another copy of itself across passes.

## Symptom 2 — data loss (NL)

Worse: a LATER reconcile can DELETE a whole-const `@rtOrphan` carcass outright,
taking any authored value inside it with it. Observed: a root field of enum type is
renamed (`renameDecl E0→…`), which orphans `friendlyE0` (carrying an authored
`$label`) into a whole-const carcass; a subsequent unrelated edit (`toggleOptional`)
then drops the `friendlyE0` carcass entirely while keeping `mockE0` — the label is
gone, not carcassed. This is real authored-content loss, the blast-radius case the
fuzzer exists to catch.

Relatedly, a TYPE rename does not reliably carry on complex types: across repeated
`renameRoot` / `renameDecl` (with carcass churn present), the mirror's const can keep
its OLD name for several passes and then re-scaffold fresh under the new name,
dropping the authored labels it should have carried. The single-rename carry that
`226d3fa` pinned holds; the repeated-rename-under-churn case does not.

Reproduce symptoms 1 & 2 (`STRICT` authors EVERY label — including those on
orphan-prone Map / Set / enum / named sub-consts — and asserts R6 convergence):

```
FUZZ_TYPEMOD_STRICT=1 FUZZ_TYPEMOD_SEQUENCES=200 FUZZ_TYPEMOD_DEBUG=1 pnpm run fuzz:typemod
```

The minimal sequence is typically a `deleteProp` that drops the last reference to a
named type (or a `renameDecl`), followed by another const-touching edit.
`FUZZ_TYPEMOD_DEBUG=1` dumps the diverging / lossy mirrors; `FUZZ_TYPEMOD_REPLAY=<seed>`
replays one.

## Symptom 3 — overlapping-splice crash (`internal error`)

In other shapes the two splice ops land on the SAME byte range and `gen --update`
aborts:

```
gen --update: overlapping splice ops [1944,2146) and [1944,2146) — internal error
```

This is the SAME error class as the whole-type-rename crash fixed in `226d3fa`
(name-first matching + a const-rename pre-pass); that fix did not cover the
orphan-carcass path. The fuzzer reaches it with corruptions ON the full named space
(tsgo error-recovers a corruption into a stray type, whose const later orphans, then
a reconcile re-splices it):

```
FUZZ_TYPEMOD_INVALID=1 FUZZ_TYPEMOD_STRICT=1 FUZZ_TYPEMOD_SEQUENCES=200 pnpm run fuzz:typemod
```

It also occurs on purely VALID edits: a `deleteProp` that drops a type's last
reference while an orphan carcass is present has been seen to abort with the same
overlapping-splice error.

## Fix sketch (out of scope for the fuzzer PR)

- Treat a whole-const `@rtOrphan` block as an immovable, opaque span during reconcile:
  skip it in BOTH the match pass and the descending splice assembler in
  [internal/enrich/mirror/orphan.go](../../internal/enrich/mirror/orphan.go) /
  [internal/enrich/mirror/reconcile.go](../../internal/enrich/mirror/reconcile.go),
  so adding / removing / rewriting OTHER consts never reorders it or double-splices it.
- Add focused Go tests in [internal/enrich/mirror/](../../internal/enrich/mirror/): a
  mirror with one `@rtOrphan` carcass + a fresh desired const must (a) reconcile to a
  fixed point in one pass and (b) never produce overlapping splice ops.
- Re-check `PruneOrphanBlocks` still strips the (now position-stable) carcass.

When fixed, in `typeModFuzzRunner.ts` remove the R6 carve-out (search
`reconcile-orphan-const-convergence`: the `wholeConstOrphan` branch + the `sentinels`
re-baseline) and fold the corruptions into the default lane (drop the
`FUZZ_TYPEMOD_INVALID` / `FUZZ_TYPEMOD_STRICT` gates), so the fuzzer asserts R6 / NL /
R10 universally on every run.
