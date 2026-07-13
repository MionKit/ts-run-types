# Tuple labels on canonical runtype nodes are first-intern nondeterministic — DONE

## Original finding (mion migration, 2026-07-12)

Structural ids deliberately dropped tuple element labels and function param names
(typeid.go), so dedup collapsed `[s: string]` and `[name: string]` into ONE canonical
node — whose projected `children[].name` came from whichever call site interned the type
FIRST. Observed concretely: mion derived route parameter names from the `Parameters<H>`
tuple and a program containing both `(ctx, s: string)` and `(ctx, name: string)` handlers
returned `['name']` for the `s` handler, depending on scan order. This contradicted the
repo's own canonical-node rule ("never store parent-relative data on a canonical node") —
labels/param names are node data, so they must be part of node identity.

## What shipped (review direction: names are id-relevant — option (b))

[ts-go-runtypes/internal/cachegen/runtype/typeid/typeid.go]:

- **Tuple element labels fold into the structural id**: `[s: string]` → `Tuple[s:5]`;
  unlabeled `[string]` keeps its historical `Tuple[5]` id (no churn for unlabeled types).
  Same-shape/different-label tuples intern as different canonical nodes, each carrying
  its OWN `children[].name`.
- **Signature param names fold into the id** alongside the position (`18{0:a|…}`):
  same-shape signatures differing only in param names are different nodes with reliable
  `parameters[].name`.
- **Value-first `func` expansion maps through tuple LABELS**: a labeled rest-tuple param
  (`(...args: [a: A, b: B])`, the shape `RT.func` brands) expands each element with its
  label as the param name, so a LABELED value-first tuple still converges with the
  equivalent written `(a: A, b: B)`. An UNLABELED value-first tuple expands with empty
  names and converges only with other unlabeled forms.

## Deliberate consequence — value-first fn convergence narrows

TS function-type syntax REQUIRES param names, while the `RT.func`/`RT.tuple` builders
express unnamed/unlabeled shapes — so value-first schemas for fn-bearing and labeled
types no longer share cache entries with their type-first twins (identical behavior,
distinct ids). The affected suite cases (`tuple_named_labels`, `interface_callable`,
the three `Parameters<F>` cases) are flagged `idDivergent` with in-place comments, and
`callableBuilder.test.ts` now PINS the divergence + behavior parity. Label-capable
builders would restore convergence and are possible future work.

## Acceptance shipped

- Go: `ts-go-runtypes/internal/compiler/resolver/tuple_labels_test.go` over new fixtures
  (`internal/testfixtures/tuplelabels/`): distinct ids for `[s: string]` /
  `[name: string]` / `[string]` with each node's own label; scan-order independence
  (both intern orders, two sessions); fn param names distinct + reliable; every fixture
  covers BOTH `getRunTypeId` call shapes with a form-equivalence assert (marker rule).
- FE: `packages/ts-runtypes/test/features/tupleLabels.test.ts` — same guarantees through
  the real plugin + runtime graph (`children[].name` / `parameters[].name`).
- mion follow-up (documented, not in this repo): its adapter parses handler source for
  param names as a workaround and its regression spec pins the OLD collapse behavior —
  on the next @ts-runtypes upgrade it can read names from the graph again and update
  that spec.
