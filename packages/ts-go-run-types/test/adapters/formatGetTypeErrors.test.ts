// format getTypeErrors adapter — for every FORMAT_VALIDATION_SUITE case
// carrying a `getTypeErrors` thunk, asserts valid samples produce no
// errors and each invalid sample produces the expected format-error
// payload.
//
// Unlike the atomic getTypeErrors adapter (which deep-equals the full
// RunTypeError[]), format diagnostics are matched on the `format`
// payload — name, optional `val`, optional tail of `formatPath` — via
// the case's index-parallel `expectedFormatErrors`. This mirrors how
// the old stringFormats.test.ts asserted format diagnostics (find the
// error by format.name, then check val / formatPath) and stays robust
// against incidental fields in the error envelope.
//
// Shape mirrors isType.test.ts: one `describe(...)` per format section,
// one explicit `it(...)` per case (no for-loop registration). Cases
// without a `getTypeErrors` thunk register as `it.todo` (which does not
// fire `afterEach`), so the per-section coverage guard compares against
// the count of getTypeErrors-bearing cases.

import {afterEach, describe, expect, it} from 'vitest';
import {FORMAT_VALIDATION_SUITE, type FormatValidationCase} from '../suites/format-validation-suite.ts';

function assertFormatGetTypeErrors(c: FormatValidationCase): void {
  if (!c.getTypeErrors) throw new Error(`case ${c.title}: missing getTypeErrors thunk`);
  if (!c.expectedFormatErrors) throw new Error(`case ${c.title}: missing expectedFormatErrors thunk`);

  const {valid, invalid} = c.getSamples();
  const expected = c.expectedFormatErrors();
  if (expected.length !== invalid.length) {
    throw new Error(
      `case ${c.title}: expectedFormatErrors length (${expected.length}) must match invalid samples (${invalid.length})`
    );
  }

  const getErr = c.getTypeErrors();

  valid.forEach((v, i) => {
    expect(getErr(v), `${c.title}: valid[${i}] → no errors`).toEqual([]);
  });

  invalid.forEach((v, i) => {
    const errors = getErr(v);
    expect(errors.length, `${c.title}: invalid[${i}] should produce at least one error`).toBeGreaterThan(0);

    const exp = expected[i];
    if (!exp) return;

    const formatErr = errors.find((entry) => entry.format?.name === exp.name)?.format;
    expect(formatErr, `${c.title}: invalid[${i}] should carry a '${exp.name}' format error`).toBeDefined();

    if (exp.val !== undefined) {
      expect(formatErr?.val, `${c.title}: invalid[${i}] format.val`).toEqual(exp.val);
    }
    if (exp.formatPathTail !== undefined) {
      const path = formatErr?.formatPath;
      expect(path?.[path.length - 1], `${c.title}: invalid[${i}] format.formatPath tail`).toBe(exp.formatPathTail);
    }
  });
}

const STRING = FORMAT_VALIDATION_SUITE.STRING_FORMAT;
const NUMBER = FORMAT_VALIDATION_SUITE.NUMBER_FORMAT;
const BIGINT = FORMAT_VALIDATION_SUITE.BIGINT_FORMAT;

/** Count of cases in a section carrying a getTypeErrors thunk — the
 *  per-section coverage-guard target (it.todo cases don't fire afterEach). */
const withGetTypeErrors = (section: Record<string, FormatValidationCase>): number =>
  Object.values(section).filter((c) => c.getTypeErrors).length;

describe('format getTypeErrors / STRING_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('FormatString maxLength — bounds the upper length', () => assertFormatGetTypeErrors(STRING.string_maxLength));
  it('FormatString minLength — bounds the lower length', () => assertFormatGetTypeErrors(STRING.string_minLength));
  it('FormatString length — exact length only', () => assertFormatGetTypeErrors(STRING.string_length));
  it('FormatString minLength + maxLength — bounds both ends', () => assertFormatGetTypeErrors(STRING.string_range));
  it('FormatString allowedChars — only the allowed set passes', () => assertFormatGetTypeErrors(STRING.string_allowedChars));
  it('FormatString allowedChars ignoreCase — folds case', () => assertFormatGetTypeErrors(STRING.string_allowedChars_ignoreCase));
  it('FormatString allowedChars — regex-special chars treated literally', () =>
    assertFormatGetTypeErrors(STRING.string_allowedChars_literal));
  it('FormatString disallowedChars — rejects any disallowed char', () =>
    assertFormatGetTypeErrors(STRING.string_disallowedChars));
  it('FormatString allowedValues — enum-like exact match', () => assertFormatGetTypeErrors(STRING.string_allowedValues));
  it('FormatString allowedValues ignoreCase — folds case across the set', () =>
    assertFormatGetTypeErrors(STRING.string_allowedValues_ignoreCase));
  it('FormatString allowedValues — regex-special chars matched literally', () =>
    assertFormatGetTypeErrors(STRING.string_allowedValues_escaped));
  it('FormatString disallowedValues — rejects the listed values', () =>
    assertFormatGetTypeErrors(STRING.string_disallowedValues));
  it('FormatString allowedValues — custom errorMessage surfaces as format.val', () =>
    assertFormatGetTypeErrors(STRING.string_customErrorMessage));
  it('FormatAlpha — letters only', () => assertFormatGetTypeErrors(STRING.alpha));
  it('FormatAlphaNumeric — letters and digits', () => assertFormatGetTypeErrors(STRING.alphaNumeric));
  it('FormatNumeric — digits only', () => assertFormatGetTypeErrors(STRING.numeric));
  it('FormatAlpha with maxLength — char class plus length bound', () => assertFormatGetTypeErrors(STRING.alpha_withLength));
  it('FormatLowercase — transformer-only, validates as a plain string', () =>
    assertFormatGetTypeErrors(STRING.lowercase_validate));
  it('FormatUUIDv4 — accepts v4, rejects v7 and malformed', () => assertFormatGetTypeErrors(STRING.uuidv4));
  it('FormatUUIDv7 — accepts v7, rejects v4', () => assertFormatGetTypeErrors(STRING.uuidv7));
  it('FormatStringDate — ISO / YYYY-MM-DD (default)', () => assertFormatGetTypeErrors(STRING.date_iso));
  it('FormatStringDate — DD-MM-YYYY layout', () => assertFormatGetTypeErrors(STRING.date_DMY));
  it('FormatStringDate — YYYY-MM layout (no day)', () => assertFormatGetTypeErrors(STRING.date_YM));
  it('FormatStringDate — MM-DD layout (no year)', () => assertFormatGetTypeErrors(STRING.date_MD));
  it('FormatStringDate — absolute min/max bounds (inclusive)', () => assertFormatGetTypeErrors(STRING.date_minMax_absolute));
  it('FormatStringTime — ISO (default, tz-aware)', () => assertFormatGetTypeErrors(STRING.time_iso));
  it('FormatStringTime — HH:mm:ss fixed layout', () => assertFormatGetTypeErrors(STRING.time_HHmmss));
  it('FormatStringTime — HH:mm:ss[.mmm] optional milliseconds', () => assertFormatGetTypeErrors(STRING.time_HHmmss_ms));
  it('FormatStringTime — absolute min/max bounds (business hours)', () => assertFormatGetTypeErrors(STRING.time_minMax_absolute));
  it('FormatStringDateTime — default (ISO date T ISO time)', () => assertFormatGetTypeErrors(STRING.dateTime_default));
  it('FormatStringDateTime — custom nested layouts + splitChar', () => assertFormatGetTypeErrors(STRING.dateTime_custom));
  it('FormatStringDateTime — absolute min/max bounds', () => assertFormatGetTypeErrors(STRING.dateTime_minMax_absolute));
  it('FormatIPv4 — dotted-quad addresses', () => assertFormatGetTypeErrors(STRING.ipv4));
  it('FormatIPv6 — colon-separated, loopback allowed', () => assertFormatGetTypeErrors(STRING.ipv6));
  it('FormatIP — accepts both v4 and v6', () => assertFormatGetTypeErrors(STRING.ip_any));
  it('FormatIPv4WithPort — v4 with port', () => assertFormatGetTypeErrors(STRING.ipv4_port));
  it('FormatIPv6WithPort — v6 with bracketed port', () => assertFormatGetTypeErrors(STRING.ipv6_port));
  it('FormatDomain — standard', () => assertFormatGetTypeErrors(STRING.domain));
  it('FormatDomainStrict — names/tld decomposition, maxParts, hyphen-edge', () => assertFormatGetTypeErrors(STRING.domainStrict));
  it('FormatEmail — standard', () => assertFormatGetTypeErrors(STRING.email));
  it('FormatEmailPunycode — accepts punycode-tld domains', () => assertFormatGetTypeErrors(STRING.emailPunycode));
  it('FormatEmailStrict — localPart + domain decomposition', () => assertFormatGetTypeErrors(STRING.emailStrict));
  it('FormatUrl — standard (http/ftp/ws schemes)', () => assertFormatGetTypeErrors(STRING.url));
  it('FormatUrlHttp — http(s) only', () => assertFormatGetTypeErrors(STRING.urlHttp));
  it('FormatUrlFile — file URLs', () => assertFormatGetTypeErrors(STRING.urlFile));
  it('registerFormatPattern — slug regex recovered from the call site', () => assertFormatGetTypeErrors(STRING.pattern_slug));
  it('registerFormatPattern — {source, flags} overload (case-insensitive)', () => assertFormatGetTypeErrors(STRING.pattern_hex));

  it('all STRING_FORMAT getTypeErrors tests ran', () => {
    expect(ranTests).toBe(withGetTypeErrors(STRING));
  });
});

describe('format getTypeErrors / NUMBER_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('FormatNumber<{max: 100}> — inclusive upper bound', () => assertFormatGetTypeErrors(NUMBER.number_max));
  it('FormatNumber<{min: 0}> — inclusive lower bound', () => assertFormatGetTypeErrors(NUMBER.number_min));
  it('FormatNumber<{lt: 10}> — exclusive upper bound', () => assertFormatGetTypeErrors(NUMBER.number_lt));
  it('FormatNumber<{gt: 0}> — exclusive lower bound', () => assertFormatGetTypeErrors(NUMBER.number_gt));
  it('FormatInteger — whole numbers only', () => assertFormatGetTypeErrors(NUMBER.number_integer));
  it('FormatFloat — non-integer only', () => assertFormatGetTypeErrors(NUMBER.number_float));
  it('FormatNumber<{multipleOf: 5}> — divisible by 5', () => assertFormatGetTypeErrors(NUMBER.number_multipleOf));
  it('FormatNumber<{min:0; max:100; integer:true; multipleOf:5}> — all constraints', () =>
    assertFormatGetTypeErrors(NUMBER.number_combined));
  it('FormatInt8 — signed 8-bit range', () => assertFormatGetTypeErrors(NUMBER.number_int8));
  it('FormatUInt8 — unsigned 8-bit range', () => assertFormatGetTypeErrors(NUMBER.number_uint8));

  it('all NUMBER_FORMAT getTypeErrors tests ran', () => {
    expect(ranTests).toBe(withGetTypeErrors(NUMBER));
  });
});

describe('format getTypeErrors / BIGINT_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('FormatBigInt<{max: 100n}> — inclusive upper bound', () => assertFormatGetTypeErrors(BIGINT.bigint_max));
  it('FormatBigInt<{min: 0n}> — inclusive lower bound', () => assertFormatGetTypeErrors(BIGINT.bigint_min));
  it('FormatBigInt<{lt: 10n}> — exclusive upper bound', () => assertFormatGetTypeErrors(BIGINT.bigint_lt));
  it('FormatBigInt<{gt: 0n}> — exclusive lower bound', () => assertFormatGetTypeErrors(BIGINT.bigint_gt));
  it('FormatBigInt<{multipleOf: 5n}> — divisible by 5', () => assertFormatGetTypeErrors(BIGINT.bigint_multipleOf));
  it('FormatBigInt<{min:0n; max:1000n; multipleOf:10n}> — all constraints', () =>
    assertFormatGetTypeErrors(BIGINT.bigint_combined));
  it('FormatBigInt64 — full signed 64-bit range', () => assertFormatGetTypeErrors(BIGINT.bigint_int64));
  it('FormatBigUInt64 — full unsigned 64-bit range', () => assertFormatGetTypeErrors(BIGINT.bigint_uint64));

  it('all BIGINT_FORMAT getTypeErrors tests ran', () => {
    expect(ranTests).toBe(withGetTypeErrors(BIGINT));
  });
});
