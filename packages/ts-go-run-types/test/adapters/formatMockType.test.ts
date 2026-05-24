// format mockType adapter — for every FORMAT_VALIDATION_SUITE case
// carrying a `mockType` thunk, draws N values from the generator and
// asserts each passes the paired `isType<T>()`. Sibling of mockType.test.ts;
// shares the same `assertMockType` helper.
//
// Shape mirrors isType.test.ts: one `describe(...)` per format section,
// one explicit `it(...)` per case (no for-loop registration). Cases
// without a `mockType` thunk register as `it.todo` (which does not fire
// `afterEach`), so the per-section coverage guard compares against the
// count of mock-bearing cases.

import {afterEach, describe, expect, it} from 'vitest';
import {FORMAT_VALIDATION_SUITE, type FormatValidationCase} from '../suites/format-validation-suite.ts';
import {assertMockType} from '../util/validationAsserts.ts';

const STRING = FORMAT_VALIDATION_SUITE.STRING_FORMAT;
const NUMBER = FORMAT_VALIDATION_SUITE.NUMBER_FORMAT;
const BIGINT = FORMAT_VALIDATION_SUITE.BIGINT_FORMAT;

/** Count of cases in a section carrying a mockType thunk — the
 *  per-section coverage-guard target (it.todo cases don't fire afterEach). */
const withMockType = (section: Record<string, FormatValidationCase>): number =>
  Object.values(section).filter((c) => c.mockType).length;

describe('format mockType / STRING_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('FormatString maxLength — bounds the upper length', () => assertMockType(STRING.string_maxLength));
  it('FormatString minLength — bounds the lower length', () => assertMockType(STRING.string_minLength));
  it('FormatString length — exact length only', () => assertMockType(STRING.string_length));
  it('FormatString minLength + maxLength — bounds both ends', () => assertMockType(STRING.string_range));
  it('FormatString allowedChars — only the allowed set passes', () => assertMockType(STRING.string_allowedChars));
  it('FormatString allowedChars ignoreCase — folds case', () => assertMockType(STRING.string_allowedChars_ignoreCase));
  it('FormatString allowedChars — regex-special chars treated literally', () =>
    assertMockType(STRING.string_allowedChars_literal));
  it('FormatString disallowedChars — rejects any disallowed char', () => assertMockType(STRING.string_disallowedChars));
  it('FormatString allowedValues — enum-like exact match', () => assertMockType(STRING.string_allowedValues));
  it('FormatString allowedValues ignoreCase — folds case across the set', () =>
    assertMockType(STRING.string_allowedValues_ignoreCase));
  it('FormatString allowedValues — regex-special chars matched literally', () =>
    assertMockType(STRING.string_allowedValues_escaped));
  it('FormatString disallowedValues — rejects the listed values', () => assertMockType(STRING.string_disallowedValues));
  it('FormatString allowedValues — custom errorMessage surfaces as format.val', () =>
    assertMockType(STRING.string_customErrorMessage));
  it('FormatAlpha — letters only', () => assertMockType(STRING.alpha));
  it('FormatAlphaNumeric — letters and digits', () => assertMockType(STRING.alphaNumeric));
  it('FormatNumeric — digits only', () => assertMockType(STRING.numeric));
  it('FormatAlpha with maxLength — char class plus length bound', () => assertMockType(STRING.alpha_withLength));
  it('FormatLowercase — transformer-only, validates as a plain string', () => assertMockType(STRING.lowercase_validate));
  it('FormatUUIDv4 — accepts v4, rejects v7 and malformed', () => assertMockType(STRING.uuidv4));
  it('FormatUUIDv7 — accepts v7, rejects v4', () => assertMockType(STRING.uuidv7));
  it('FormatStringDate — ISO / YYYY-MM-DD (default)', () => assertMockType(STRING.date_iso));
  it('FormatStringDate — DD-MM-YYYY layout', () => assertMockType(STRING.date_DMY));
  it('FormatStringDate — YYYY-MM layout (no day)', () => assertMockType(STRING.date_YM));
  it('FormatStringDate — MM-DD layout (no year)', () => assertMockType(STRING.date_MD));
  it('FormatStringTime — ISO (default, tz-aware)', () => assertMockType(STRING.time_iso));
  it('FormatStringTime — HH:mm:ss fixed layout', () => assertMockType(STRING.time_HHmmss));
  it('FormatStringTime — HH:mm:ss[.mmm] optional milliseconds', () => assertMockType(STRING.time_HHmmss_ms));
  it('FormatStringDateTime — default (ISO date T ISO time)', () => assertMockType(STRING.dateTime_default));
  it('FormatStringDateTime — custom nested layouts + splitChar', () => assertMockType(STRING.dateTime_custom));
  it('FormatIPv4 — dotted-quad addresses', () => assertMockType(STRING.ipv4));
  it('FormatIPv6 — colon-separated, loopback allowed', () => assertMockType(STRING.ipv6));
  it('FormatIP — accepts both v4 and v6', () => assertMockType(STRING.ip_any));
  it('FormatIPv4WithPort — v4 with port', () => assertMockType(STRING.ipv4_port));
  it('FormatIPv6WithPort — v6 with bracketed port', () => assertMockType(STRING.ipv6_port));
  it('FormatDomain — standard', () => assertMockType(STRING.domain));
  it('FormatDomainStrict — names/tld decomposition, maxParts, hyphen-edge', () => assertMockType(STRING.domainStrict));
  it('FormatEmail — standard', () => assertMockType(STRING.email));
  it('FormatEmailPunycode — accepts punycode-tld domains', () => assertMockType(STRING.emailPunycode));
  it('FormatEmailStrict — localPart + domain decomposition', () => assertMockType(STRING.emailStrict));
  it('FormatUrl — standard (http/ftp/ws schemes)', () => assertMockType(STRING.url));
  it('FormatUrlHttp — http(s) only', () => assertMockType(STRING.urlHttp));
  it('FormatUrlFile — file URLs', () => assertMockType(STRING.urlFile));
  it('registerFormatPattern — slug regex recovered from the call site', () => assertMockType(STRING.pattern_slug));
  it('registerFormatPattern — {source, flags} overload (case-insensitive)', () => assertMockType(STRING.pattern_hex));

  it('all STRING_FORMAT mockType tests ran', () => {
    expect(ranTests).toBe(withMockType(STRING));
  });
});

describe('format mockType / NUMBER_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it.todo('FormatNumber<{max: 100}> — inclusive upper bound');
  it.todo('FormatNumber<{min: 0}> — inclusive lower bound');
  it.todo('FormatNumber<{lt: 10}> — exclusive upper bound');
  it.todo('FormatNumber<{gt: 0}> — exclusive lower bound');
  it('FormatInteger — whole numbers only', () => assertMockType(NUMBER.number_integer));
  it.todo('FormatFloat — non-integer only');
  it.todo('FormatNumber<{multipleOf: 5}> — divisible by 5');
  it('FormatNumber<{min:0; max:100; integer:true; multipleOf:5}> — all constraints', () =>
    assertMockType(NUMBER.number_combined));
  it('FormatInt8 — signed 8-bit range', () => assertMockType(NUMBER.number_int8));
  it('FormatUInt8 — unsigned 8-bit range', () => assertMockType(NUMBER.number_uint8));

  it('all NUMBER_FORMAT mockType tests ran', () => {
    expect(ranTests).toBe(withMockType(NUMBER));
  });
});

describe('format mockType / BIGINT_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it.todo('FormatBigInt<{max: 100n}> — inclusive upper bound');
  it.todo('FormatBigInt<{min: 0n}> — inclusive lower bound');
  it.todo('FormatBigInt<{lt: 10n}> — exclusive upper bound');
  it.todo('FormatBigInt<{gt: 0n}> — exclusive lower bound');
  it.todo('FormatBigInt<{multipleOf: 5n}> — divisible by 5');
  it('FormatBigInt<{min:0n; max:1000n; multipleOf:10n}> — all constraints', () => assertMockType(BIGINT.bigint_combined));
  it('FormatBigInt64 — full signed 64-bit range', () => assertMockType(BIGINT.bigint_int64));
  it('FormatBigUInt64 — full unsigned 64-bit range', () => assertMockType(BIGINT.bigint_uint64));

  it('all BIGINT_FORMAT mockType tests ran', () => {
    expect(ranTests).toBe(withMockType(BIGINT));
  });
});
