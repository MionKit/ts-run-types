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

  it.todo('FormatString maxLength — bounds the upper length');
  it.todo('FormatString minLength — bounds the lower length');
  it.todo('FormatString length — exact length only');
  it.todo('FormatString minLength + maxLength — bounds both ends');
  it.todo('FormatString allowedChars — only the allowed set passes');
  it.todo('FormatString allowedChars ignoreCase — folds case');
  it.todo('FormatString allowedChars — regex-special chars treated literally');
  it('FormatString disallowedChars — rejects any disallowed char', () => assertMockType(STRING.string_disallowedChars));
  it.todo('FormatString allowedValues — enum-like exact match');
  it.todo('FormatString allowedValues ignoreCase — folds case across the set');
  it.todo('FormatString allowedValues — regex-special chars matched literally');
  it('FormatString disallowedValues — rejects the listed values', () => assertMockType(STRING.string_disallowedValues));
  it.todo('FormatString allowedValues — custom errorMessage surfaces as format.val');
  it('FormatAlpha — letters only', () => assertMockType(STRING.alpha));
  it('FormatAlphaNumeric — letters and digits', () => assertMockType(STRING.alphaNumeric));
  it('FormatNumeric — digits only', () => assertMockType(STRING.numeric));
  it.todo('FormatAlpha with maxLength — char class plus length bound');
  it('FormatLowercase — transformer-only, validates as a plain string', () => assertMockType(STRING.lowercase_validate));
  it('FormatUUIDv4 — accepts v4, rejects v7 and malformed', () => assertMockType(STRING.uuidv4));
  it('FormatUUIDv7 — accepts v7, rejects v4', () => assertMockType(STRING.uuidv7));
  it('FormatStringDate — ISO / YYYY-MM-DD (default)', () => assertMockType(STRING.date_iso));
  it.todo('FormatStringDate — DD-MM-YYYY layout');
  it.todo('FormatStringDate — YYYY-MM layout (no day)');
  it.todo('FormatStringDate — MM-DD layout (no year)');
  it.todo('FormatStringTime — ISO (default, tz-aware)');
  it.todo('FormatStringTime — HH:mm:ss fixed layout');
  it.todo('FormatStringTime — HH:mm:ss[.mmm] optional milliseconds');
  it.todo('FormatStringDateTime — default (ISO date T ISO time)');
  it.todo('FormatStringDateTime — custom nested layouts + splitChar');
  it.todo('FormatIPv4 — dotted-quad addresses');
  it.todo('FormatIPv6 — colon-separated, loopback allowed');
  it.todo('FormatIP — accepts both v4 and v6');
  it.todo('FormatIPv4WithPort — v4 with port');
  it.todo('FormatIPv6WithPort — v6 with bracketed port');
  it('FormatDomain — standard', () => assertMockType(STRING.domain));
  it.todo('FormatDomainStrict — names/tld decomposition, maxParts, hyphen-edge');
  it('FormatEmail — standard', () => assertMockType(STRING.email));
  it.todo('FormatEmailPunycode — accepts punycode-tld domains');
  it.todo('FormatEmailStrict — localPart + domain decomposition');
  it('FormatUrl — standard (http/ftp/ws schemes)', () => assertMockType(STRING.url));
  it.todo('FormatUrlHttp — http(s) only');
  it.todo('FormatUrlFile — file URLs');
  it('registerFormatPattern — slug regex recovered from the call site', () => assertMockType(STRING.pattern_slug));
  it.todo('registerFormatPattern — {source, flags} overload (case-insensitive)');

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
