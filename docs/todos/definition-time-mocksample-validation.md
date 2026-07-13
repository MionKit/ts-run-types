# Definition-time mockSample validation: sibling bounds in Go + JS-engine pattern check for RE2-skipped regexes

## Current state (verified 2026-07-13, review discussion on PR #218)

Three layers exist today; the gaps are precise:

1. **FMT002 param invariants (Go, Error)** — implemented. `ValidateParams`
   (formats/string/stringformat.go and family siblings) checks length
   mutual-exclusivity, bound ordering, value-set caps, single-complex-param, and the
   disallowed\* mockSamples requirement. Halts every lane since failOnError.
2. **FMT001 sample-vs-pattern (Go, Error, best-effort)** — implemented for the
   RE2-compatible subset. `validateSamples` (formats/string/pattern.go) translates the
   JS pattern to RE2 (`i`/`m`/`s` inline; `u`/`g`/`y`/`d` irrelevant to a match test)
   and tests every sample; **patterns using JS-only features (lookarounds,
   backreferences) fail RE2 compilation and the check silently SKIPS** to avoid false
   positives. `registerFormatPattern` additionally validates with the real JS engine
   at module load and throws — but only when registration code actually runs, and
   inline type-level pattern objects have no runtime existence, so RE2-skipped inline
   patterns currently get NO sample check anywhere.
3. **Sample-vs-sibling-bounds — NOT validated at definition time.** FMT002 checks
   bounds against each other, never samples against bounds. The only guard is the
   runtime one this PR added (mock throws when no sample survives the length filter).

## Part 1 — Go check: samples must satisfy statically checkable sibling params

New FMT-series Error (FMT003?), emitted from the same ValidateParams pass:

- EVERY mockSample (param-level and pattern-level) must satisfy `length` /
  `minLength` / `maxLength`, and the other statically checkable siblings
  (`allowedChars` / `disallowedChars` / `disallowedValues` — plain string ops, no
  regex). Per FMT001's doctrine (a sample is a canonical valid value), each violating
  sample is its own Error, not just the all-violate case.
- **UTF-16 subtlety**: the emitted validators check JS `.length` (UTF-16 code
  units); the Go check must count UTF-16 units, not bytes, or samples with astral
  characters mis-validate.
- The runtime mock throw (filterSamplesByLength + the pattern throw) stays as the
  backstop for paths the compiler can't see.
- Applies across format families that carry samples + bounds (string, and the
  numeric/datetime equivalents where samples exist).

## Part 2 — JS-engine pattern check for RE2-skipped regexes

Direction from review: move the un-checkable-in-Go validation to JS. Refinement: the
LINTER and the VITE PLUGIN are both JS hosts with the real regex engine, so both
should consume ONE deferred-validation payload rather than making this lint-only:

- The resolver, on RE2 compilation failure, emits a "deferred pattern validation"
  entry on the scan/generate response: `{source, flags, samples, site}` (instead of
  skipping silently).
- The lint plugin (already a transport over the resolver's scan flags) evaluates
  `new RegExp(source, flags).test(sample)` and reports failures at the definition
  site — editor + lint-CI coverage.
- The vite plugin does the same at buildStart and routes failures through the normal
  diagnostic surfacing, so failOnError halts builds — full lane coverage, not just
  lint runs.
- RE2-validated patterns keep the existing Go-side FMT001 fast path; deferred entries
  are only the skipped ones, so nothing is validated twice.
- Rejected alternatives: embedding regexp2 in the resolver (.NET-ish semantics, still
  not JS, new dependency); reverse-RPC from Go to the Node host mid-scan (protocol
  complexity, no coverage gain over the plugin check).

## Acceptance sketch

- `String<{minLength: 5; pattern: {source: '^b+$'; mockSamples: ['b', 'bb']}}>` fails
  the BUILD naming both offending samples (today: builds fine, throws at mock time).
- A sample containing astral characters validates by UTF-16 length, matching the
  emitted validator's verdict.
- An inline pattern with a lookbehind and a non-matching sample fails the build (via
  the plugin's JS-engine check) and shows in the linter — today it passes silently.
- `registerFormatPattern`'s module-load throw keeps working unchanged (backstop).
