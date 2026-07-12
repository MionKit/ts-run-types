# Tuple labels on canonical runtype nodes are first-intern nondeterministic

## Evidence (found during the mion migration, 2026-07-12)

Structural ids deliberately drop tuple element labels and function param names
(typeid.go: `objectID` tuple branch folds only element ids + optional/rest/variadic flags;
`signatureID` documents "Param NAMES are dropped (replaced by position)"). Dedup then
collapses `[s: string]` and `[name: string]` into ONE canonical node — but the projected
node still carries `children[].name`, populated from whichever call site interned the
type FIRST.

Observed concretely: mion derived route parameter names from the params-tuple runtype
(`getRunType(id).children[].name`); a program containing both `(ctx, s: string)` and
`(ctx, name: string)` handlers returned `['name']` for the `s` handler — which call site
"wins" depends on scan order.

This contradicts the repo's own canonical-node rule (CLAUDE.md → Rewrite mechanics):
"**Never store parent-relative data on a canonical node.**" Tuple labels (and signature
param names) are exactly call-site/parent-scoped data living on a shared singleton.

## Why it matters

Any consumer walking the reflection graph for documentation/metadata (param names, labeled
tuple members) gets silently wrong names in programs with structurally identical tuples —
no diagnostic fires. mion switched to parsing names from the handler function source
(mion `packages/run-types/src/mionAdapter.ts` + regression spec pinning the dedup case),
but the graph API itself keeps exposing unreliable data.

## Fix directions (needs a design decision)

- **(a) strip labels from canonical tuple/param nodes** (honest API: no names rather than
  wrong names) and document it;
- **(b) fold labels into the structural id** (labels become identity — more nodes, bloats
  dedup, diverges from TS assignability where labels are documentation-only);
- **(c) keep labels off the canonical node and expose them parent-side** (per the existing
  rule for `UnionDiscriminators`), e.g. the reflection root records its own label vector.

## Acceptance

- A program with `[s: string]` and `[name: string]` reflection roots either returns the
  correct per-site labels, or none — never the other site's labels.
- Test pinning scan-order independence (both intern orders).
