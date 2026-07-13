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

## Part 2 — RE2-skipped regexes: fail closed, flag to delegate to the JS linter

DECIDED (review ruling, 2026-07-13): the compiler refuses what it cannot verify.

- When a pattern CARRIES mockSamples but RE2 cannot compile it (JS-only features:
  lookarounds, backreferences), the resolver emits a new FMT-series **Error** (today
  it silently skips): "this pattern's samples cannot be verified at build time". The
  message names the RE2 compile failure, the flag below, and the linter path. With
  failOnError this halts every lane — fail-closed by default.
- A **flag** (plugin option + binary flag + tsconfig plugin key, naming open — e.g.
  `allowUncheckedPatterns`) disables that error. Setting it is an explicit assertion
  that a JS-side validator owns the check.
- **The JS linter runs the real validation for those patterns**: the resolver ships
  the skipped patterns' `{source, flags, samples, site}` on the lint-lane scan
  response, and the lint plugin evaluates `new RegExp(source, flags).test(sample)`,
  reporting per-sample failures at the definition site (editor + lint CI). The
  documented setup for JS-only patterns is therefore: enable the flag, use the
  linter.
- Patterns WITHOUT samples don't trigger the new error (nothing to verify; the
  samples-required rules live elsewhere). RE2-compatible patterns keep the existing
  Go-side FMT001 fast path unchanged — nothing is validated twice.
- Note: the flag is a project-level assertion (plugin/tsconfig options are shared
  config), so enabling it relies on the linter actually being wired into CI — worth
  a docs callout in the configuration guide when implemented.
- Rejected alternatives: embedding regexp2 in the resolver (.NET-ish semantics, still
  not JS, new dependency); reverse-RPC from Go to the Node host mid-scan (protocol
  complexity); unconditional both-hosts deferred validation (superseded by the
  fail-closed default + explicit delegation).

## Acceptance sketch

- `String<{minLength: 5; pattern: {source: '^b+$'; mockSamples: ['b', 'bb']}}>` fails
  the BUILD naming both offending samples (today: builds fine, throws at mock time).
- A sample containing astral characters validates by UTF-16 length, matching the
  emitted validator's verdict.
- An inline pattern with a lookbehind + samples fails the BUILD with the new
  cannot-verify Error (today it passes silently). With the flag enabled, the build
  passes and the LINTER reports any sample that fails the real JS regex at the
  definition site.
- `registerFormatPattern`'s module-load throw keeps working unchanged (backstop).
