# Format pattern mockSamples: dedup collision + length-bound soundness gap — DONE

Two related findings from the mion type-formats migration (2026-07-12), both around
`registerFormatPattern` mockSamples. Both fixed.

## 1. Structural ids excluded pattern `mockSamples`/`message` → first-intern won

Two `String<P>` format types differing ONLY in their pattern's `mockSamples` (or
`message`) collapsed onto one structural id / one cache entry — whichever call site was
interned first supplied the mock samples for BOTH. Same failure family as the
tuple-labels finding: per-site data living on a shared singleton.

**Shipped**: format params are FULLY id-relevant — `typeid/formats.go` no longer
excludes `mockSamples`/`message` from the structural key (the
`structuralKeyIgnoredParams` set is gone). Same-shape formats with different samples are
distinct entries mocking from their OWN samples; identical params still dedup exactly as
before. The two Go tests that pinned the exclusion now pin the inverse
(`TestFormatAnnotation_SamplesFoldIntoKey`, `TestFormatAnnotation_SamplesDistinctEndToEnd`),
and `features/mockSoundness.test.ts` pins it end-to-end through the plugin (distinct
`getRunTypeId`s in both call shapes + per-format samples). This is also what unlocked
surfacing the pattern `message` as the error val (see the companion mocking-gaps doc).

## 2. `createMockData` could emit values that failed their own `createValidate`

`filterSamplesByLength` deliberately fell back to the UNFILTERED sample list when every
sample violated the length bounds — e.g. returning a 4-char sample under `minLength: 5`
with zero warnings, so `validate(mock())` was silently false.

**Shipped**: the unsound fallback is gone — filtering can now return empty, and the
caller either falls through to its bounded synthesizers (allowedChars char-set /
bounded random string, both length-sound) or, for pattern formats whose samples are all
out-of-bounds, THROWS a pointed error ("requires `mockSamples` compatible with the
length bounds"). Pinned in mockSoundness.test.ts: compatible samples survive the filter
(mock validates), incompatible-only samples throw.

## Acceptance shipped

- `createMockData` output satisfies the format's own `createValidate`, or the mock fails
  loudly naming the samples problem.
- Two same-shape formats with different samples mock from their own samples (distinct
  cache entries by construction).
