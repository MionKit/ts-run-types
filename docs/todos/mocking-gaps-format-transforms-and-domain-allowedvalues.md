# Mocking gaps: fmt transforms never applied; domain allowedValues ignored; pattern message not surfaced

Three findings from the mion type-formats migration (2026-07-12), all verified against
@ts-runtypes/core 0.9.1 with reproduction tests in mion
(packages/type-formats/src/string/defaultStringFormats.runtype.spec.ts and
domain.runtype.spec.ts carry KNOWN REGRESSION comments).

## 1. `createMockData` never applies lowercase/uppercase/capitalize format transforms

`lookupFormatTransform` in [packages/ts-runtypes/src/mocking/mockType.ts] looks up
`'fmt_' + runType.id`, but compiled formatTransform entries are keyed
`'<fnHash>_<typeId>'` where the actual fmt family fnHash is `LRV` (verified: cache entry
`__rt_LRV_d5RlnhH` with body `v.toLowerCase()` exists and is never found). The lookup can
never hit — even with a `createFormatTransform<T>()` call site present in the program.
Mocks still VALIDATE (case flags are transform-only), but mocked values don't respect the
declared canonical case.

Fix: key the lookup with the real fmt fnHash (same constants the resolver uses), or store
a `'fmt_'`-aliased secondary key at emit time.

## 2. Domain-part `allowedValues` mocks fail their own validator

`mockDomain`/`domainPartSamples` in [packages/ts-runtypes/src/mocking/mockStringFormat.ts]
read only `mockSamples`/`pattern.mockSamples` and fall back to `'example.com'` — ignoring
`allowedValues.val` — so a domain format restricted by allowedValues mocks a value the
emitted validator rejects (`validate(mock())` false). Plain string formats DO mock from
allowedValues; the domain family is inconsistent.

Fix: fall back to `allowedValues.val` before the hardcoded sample, mirroring the plain
string format path.

## 3. `registerFormatPattern`'s `message` is not surfaced as the error `val`

The doc comment in [packages/ts-runtypes/src/runtypes/formatPattern.ts] says the message is
"surfaced in diagnostics/errors", but stringFormat pattern validation errors always emit the
static `'Invalid pattern'` fallback (message lives in the cache-key-excluded field, and the
emitter takes the default — `messageLiteral` in
ts-go-runtypes/internal/cachegen/typefunctions/formats/string/shared.go). Either surface it
(fold message into the emit, not the id) or fix the doc.

## Acceptance

- `validate(createMockData<T>()())` holds for domain formats with allowedValues.
- A `Lowercase<{...}>` mock comes back lowercased when a fmt entry exists.
- Pattern `message` either appears as the error `val` or the formatPattern docs stop
  claiming it does.
