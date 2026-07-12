# Format pattern mockSamples: dedup collision + length-bound soundness gap

Two related findings from the mion type-formats migration (2026-07-12), both around
`registerFormatPattern` mockSamples.

## 1. Structural ids exclude pattern `mockSamples`/`message` → first-intern wins

Two `String<P>` format types differing ONLY in their pattern's `mockSamples` (or `message`)
collapse onto one structural id / one cache entry. Whichever call site is interned first
supplies the mock samples for BOTH — the other site's samples are silently ignored.

Observed directly: a probe type registered with samples `['abcd']` deduped onto an earlier
entry and `createMockData` returned `'abcdefg'` from the OTHER pattern's samples.

Arguably by design for validators (samples don't affect validation semantics), but for
`createMockData` the samples ARE behavior — same family as the canonical-node rule
("never store parent-relative data on a canonical node") and the tuple-labels finding
(docs/todos/tuple-labels-unreliable-on-canonical-nodes.md).

## 2. `createMockData` can emit values that fail their own `createValidate`

`filterSamplesByLength` in [packages/ts-runtypes/src/mocking/mockStringFormat.ts] filters
pattern mockSamples by the format's length bounds, but when EVERY sample violates the
bounds it deliberately falls back to the unfiltered list — e.g. returns a 4-char sample
under `minLength: 5`. No diagnostic covers sample-vs-length (FMT001 is sample-vs-pattern
only), so `validate(mock())` is false with zero warnings.

The old mion implementation threw at registration when a sample violated a sibling
constraint.

## Fix directions

- (2) is a clear soundness gap: extend the registration/build check to validate mockSamples
  against ALL sibling constraints of the format params where they're used (or at minimum
  emit an FMT-series Warning on the fallback path instead of silently returning
  out-of-bounds samples).
- (1) needs the same design decision as tuple labels: either fold mock-relevant pattern
  fields into the structural id (mock entries only?), keep per-site samples parent-side,
  or document that mock samples are first-intern-global.

## Acceptance

- `createMockData` output always satisfies the format's own `createValidate`, or the build
  fails/warns pointing at the offending sample.
- Two same-shape formats with different samples either mock from their own samples or the
  behavior is documented.
