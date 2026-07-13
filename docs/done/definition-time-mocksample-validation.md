# Definition-time mockSample validation: sibling bounds in Go + JS-engine pattern check for RE2-skipped regexes

**Status:** done — shipped in the PR that carries this file into `docs/done/`.
**Created:** 2026-07-13 · **Completed:** 2026-07-13

Shipped as two new format diagnostics plus one option. **FMT003** (`CodeFMTSampleBounds`)
checks mockSamples against their statically checkable sibling bounds; **FMT004**
(`CodeFMTUncheckedPattern`) fails the build closed when RE2 can't verify a pattern's
samples, and the **`allowUncheckedPatterns`** option delegates that check to the JS
linter (which evaluates the real `RegExp` and reports mismatches as FMT001). The one
substantive change from the original plan: the length check is **all-violate**, not
per-sample, to match the runtime's `filterSamplesByLength` (see the ⚠️ correction under
Part 1). Implementation notes are inline below; the original plan text is preserved so the
before/after is legible.

## Original state (verified 2026-07-13, review discussion on PR #218)

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

New FMT-series Error, **FMT003** (`CodeFMTSampleBounds`), emitted from the string
format's validate walk (alongside FMT001's `validateSamples`, which already has the
`ctx` needed to fan out per-call-site):

The check mirrors the runtime mock's OWN soundness rules
(`mocking/mockStringFormat.ts`) — the two are not the same shape, and getting that
wrong produces false positives (see the "correction" note below):

- **`length` / `minLength` / `maxLength` are a FILTER, not a per-sample gate.** The
  mock runs `filterSamplesByLength` and picks among the survivors, throwing ONLY when
  every sample is filtered out. So a length violation is a build Error **only in the
  all-violate case** — a partial list is valid: `String<{minLength: 5; pattern:
  {source: '^a+$'; mockSamples: ['aa', 'aaaaaa']}}>` is FINE (`'aaaaaa'` survives, the
  mock uses it; `'aa'` is filtered). FMT003 fires only when NO sample survives the
  length filter (the exact condition under which the runtime throws), and names every
  offender. The samples checked are the mock's own draw pool, matching
  `mockStringParams` precedence: `allowedValues.val`, else the first present of
  top-level `mockSamples` / `pattern.mockSamples` / `disallowedValues.mockSamples`.
- **`allowedChars` / `disallowedChars` / `disallowedValues` are NOT filtered at mock
  time** — the generator can pick any surviving sample, so a single violating survivor
  is a latent unsound mock (`validate(mock())` may fail). These are checked over the
  length-surviving subset and flagged **per offending sample** (plain string ops, no
  regex). `allowedValues` is intentionally NOT in the checked set (a sample outside an
  exact-match enum is an odd construction, and the samples usually ARE the enum).
- **⚠️ Correction to the original doctrine.** The first draft said "each violating
  sample is its own Error, not just the all-violate case", modelling FMT003 on FMT001.
  That is WRONG for length: it contradicts `filterSamplesByLength` and flags valid
  partial lists (the implementation surfaced this via the shipped `Alpha<{maxLength:3}>`
  fixture, whose `['abc','Hello','World']` samples mock fine to `'abc'`). Length is
  all-violate; only the unfiltered char/value ops are per-sample. FMT001 (pattern
  match) stays per-sample over ALL samples — the pattern is intrinsic to a sample's
  validity, not a filter.
- **One aggregated diagnostic (composed message), since the pipeline dedups per code
  per walk** (`Walker.diagSeen` keys on the code alone). FMT003 names every offender
  in one message (e.g. "sample(s) 'b', 'bb' are shorter than minLength 5"). FMT001 is
  ALSO aligned to list every mismatching sample in its one message (today it truncates
  to the first).
- **UTF-16 subtlety**: the emitted validators check JS `.length` (UTF-16 code
  units); the Go check counts UTF-16 units (`len(utf16.Encode([]rune(s)))`), not
  bytes or runes, or samples with astral characters mis-validate.
- The runtime mock throw (filterSamplesByLength + the pattern throw) stays as the
  backstop for paths the compiler can't see.
- **String formats only.** `mockSamples` is exclusively a string-format concept — the
  numeric / bigint / datetime formats derive their mocks from `minimum` / `maximum`
  (and the datetime bound grammar) and carry no samples, so there is no
  "numeric/datetime equivalent" to check. This part touches only the string family
  (`formats/string/`).

## Part 2 — RE2-skipped regexes: fail closed, flag to delegate to the JS linter

DECIDED (review ruling, 2026-07-13): the compiler refuses what it cannot verify.
Flag name DECIDED (2026-07-13): `allowUncheckedPatterns`.

The behaviour splits by lane, keyed on whether the scan is a lint-lane scan (the
resolver's unchecked-pattern sink is present) or a build-lane render:

- **Build lane (bundler plugin).** When a pattern CARRIES mockSamples but RE2 cannot
  compile it (JS-only features: lookarounds, backreferences), the resolver emits a
  new FMT-series **Error**, **FMT004** (`CodeFMTUncheckedPattern`) — today it
  silently skips. The message names the RE2 compile failure, the flag below, and the
  linter path. With failOnError this halts the build — fail-closed by default. The
  **`allowUncheckedPatterns`** flag (plugin option + `--allow-unchecked-patterns`
  binary flag + tsconfig plugin key) disables that error; setting it is an explicit
  assertion that a JS-side validator (the linter) owns the check.
- **Lint lane.** The lint lane ALWAYS runs the real validation, independent of the
  flag: the resolver ships the skipped patterns' `{source, flags, samples, site}` on
  the scan response, and the lint plugin evaluates `new RegExp(source, flags)
  .test(sample)`, reporting per-sample failures (as FMT001, the "sample does not
  match its pattern" code) at the definition site (editor + lint CI). It does NOT
  emit FMT004 — the linter CAN verify, so it reports the actual result, not
  "cannot verify". The documented setup for JS-only patterns is therefore: enable the
  flag (silence the build error), wire the linter into CI (get the real check).
- **Why the flag is build-lane-only.** The lint worker spawns the resolver in
  `--inline-server` mode, which does not read tsconfig plugin keys; that is fine
  precisely because the lint lane never consults the flag. The flag's sole job is to
  suppress FMT004 in the bundler/build lane, where the plugin option / tsconfig key
  IS read through the normal build-config path. So the flag threads only as far as
  the build lane; no lint-worker argv change is needed.
- Patterns WITHOUT samples don't trigger the new error (nothing to verify; the
  samples-required rules live elsewhere). RE2-compatible patterns keep the existing
  Go-side FMT001 fast path unchanged — nothing is validated twice.
- Note: the flag is a project-level assertion (plugin/tsconfig options are shared
  config), so enabling it relies on the linter actually being wired into CI — worth
  a docs callout in the configuration guide when implemented.
- Rejected alternatives: embedding regexp2 in the resolver (.NET-ish semantics, still
  not JS, new dependency); reverse-RPC from Go to the Node host mid-scan (protocol
  complexity); unconditional both-hosts deferred validation (superseded by the
  fail-closed default + explicit delegation); the bundler plugin itself running the
  RegExp check (keeps the build lane's "refuse what you can't verify" line clean —
  the check is the linter's job, and doing it in the bundler would blur that and add
  a per-build regex-eval cost every render).

## Acceptance sketch

- `String<{minLength: 5; pattern: {source: '^b+$'; mockSamples: ['b', 'bb']}}>` fails
  the BUILD with one FMT003 naming both offending samples — every sample violates the
  length bound, so the mock would throw (today: builds fine, throws at mock time).
- `String<{minLength: 5; pattern: {source: '^a+$'; mockSamples: ['aa', 'aaaaaa']}}>`
  BUILDS fine — `'aaaaaa'` survives the length filter and the mock uses it. FMT003 is
  all-violate, not per-sample (matching `filterSamplesByLength`).
- A sample containing astral characters validates by UTF-16 length, matching the
  emitted validator's verdict.
- An inline pattern with a lookbehind + samples fails the BUILD with the new FMT004
  cannot-verify Error (today it passes silently). With `allowUncheckedPatterns`
  enabled, the build passes; and the LINTER reports (as FMT001) any sample that fails
  the real JS regex at the definition site — regardless of the flag.
- `registerFormatPattern`'s module-load throw keeps working unchanged (backstop).
