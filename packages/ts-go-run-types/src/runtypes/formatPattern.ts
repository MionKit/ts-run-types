// FormatPattern — an explicit, pre-validated regex bundle for use in a
// format's `pattern` slot:
//
//   const slug = registerFormatPattern({
//     regexp: /^[a-z0-9-]+$/,
//     mockSamples: ['my-slug', 'abc'],
//     message: 'must be a slug',
//   });
//   type Slug = FormatString<{pattern: typeof slug}>;
//
// Why this exists: the build-time sample check the Go binary does runs
// in RE2, a different engine than the JS runtime — it can't compile
// JS-only regex features and only best-effort-validates. registerFormatPattern
// validates the mockSamples here, at registration, with the SAME engine
// that runs at validation time, throwing immediately on a mismatch. It
// also makes the regex + samples explicit and reusable.
//
// The Go scanner recovers {source, flags, mockSamples, message} from
// this call's AST (a regex's source can't survive at the type level),
// so the returned type is intentionally opaque to type-space.

import type {CompTimeArgs} from '../markers.ts';

// Arguments to registerFormatPattern. `regexp` is a real RegExp;
// `mockSamples` are canonical valid values the mock generator draws
// from; `message` is an optional label surfaced in diagnostics/errors.
export interface FormatPatternArgs {
  regexp: RegExp;
  mockSamples: readonly string[];
  message?: string;
}

declare const formatPatternBrand: unique symbol;

// FormatPattern is the branded result. Carries the resolved fields at
// runtime; the brand keeps it assignable into a format's `pattern` slot
// and distinct from a plain object literal.
export interface FormatPattern {
  readonly source: string;
  readonly flags: string;
  readonly mockSamples: readonly string[];
  readonly message?: string;
  readonly [formatPatternBrand]: true;
}

// registerFormatPattern validates each mockSample against the regexp
// (real JS engine, the same one runtime validators use) and returns a
// frozen FormatPattern. Throws on the first sample that doesn't match —
// a sample is meant to be a canonical valid value, so a mismatch is a
// definition bug worth failing loudly at module load.
export function registerFormatPattern(args: CompTimeArgs<FormatPatternArgs>): FormatPattern {
  const {regexp, mockSamples, message} = args as FormatPatternArgs;
  // Test with a non-stateful copy: `g`/`y` make `.test` advance lastIndex.
  const tester = new RegExp(regexp.source, regexp.flags.replace(/[gy]/g, ''));
  for (const sample of mockSamples) {
    if (!tester.test(sample)) {
      throw new Error(
        `registerFormatPattern: mockSample ${JSON.stringify(sample)} does not match /${regexp.source}/${regexp.flags}` +
          (message ? ` — ${message}` : ''),
      );
    }
  }
  return Object.freeze({
    source: regexp.source,
    flags: regexp.flags,
    mockSamples,
    message,
  }) as unknown as FormatPattern;
}
