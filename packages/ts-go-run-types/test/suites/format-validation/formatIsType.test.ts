// format isType adapter — runs every FORMAT_VALIDATION_SUITE case through
// the precompiled validator the Go binary emits for format-branded types.
// Sibling of isType.test.ts; shares the same `assertIsType` helper.
//
// Shape mirrors isType.test.ts exactly: one `describe(...)` per format
// section, one explicit `it(...)` per case (no for-loop registration —
// keeps the failure surface readable and lets the IDE jump to each test),
// a per-section `afterEach` counter, and a final coverage-guard `it(...)`
// that fails if a case lands in the suite without a matching `it()` here.
//
// To add a new case: declare it in the matching group file under test/suites/format-validation/
// AND add a one-line `it(<title>, …)` in suite-declaration order inside
// the matching `describe(...)` block below.

import {afterEach, describe, expect, it} from 'vitest';
import {STRING_FORMAT} from './StringFormat.ts';
import {NUMBER_FORMAT} from './NumberFormat.ts';
import {BIGINT_FORMAT} from './BigintFormat.ts';
import {assertIsType} from '../../util/validationAsserts.ts';

const STRING = STRING_FORMAT;
const NUMBER = NUMBER_FORMAT;
const BIGINT = BIGINT_FORMAT;

describe('format isType / STRING_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('FormatString maxLength — bounds the upper length', () => assertIsType(STRING.string_maxLength));
  it('FormatString minLength — bounds the lower length', () => assertIsType(STRING.string_minLength));
  it('FormatString length — exact length only', () => assertIsType(STRING.string_length));
  it('FormatString minLength + maxLength — bounds both ends', () => assertIsType(STRING.string_range));
  it('FormatString allowedChars — only the allowed set passes', () => assertIsType(STRING.string_allowedChars));
  it('FormatString allowedChars ignoreCase — folds case', () => assertIsType(STRING.string_allowedChars_ignoreCase));
  it('FormatString allowedChars — regex-special chars treated literally', () => assertIsType(STRING.string_allowedChars_literal));
  it('FormatString disallowedChars — rejects any disallowed char', () => assertIsType(STRING.string_disallowedChars));
  it('FormatString allowedValues — enum-like exact match', () => assertIsType(STRING.string_allowedValues));
  it('FormatString allowedValues ignoreCase — folds case across the set', () =>
    assertIsType(STRING.string_allowedValues_ignoreCase));
  it('FormatString allowedValues — regex-special chars matched literally', () =>
    assertIsType(STRING.string_allowedValues_escaped));
  it('FormatString disallowedValues — rejects the listed values', () => assertIsType(STRING.string_disallowedValues));
  it('FormatString allowedValues — custom errorMessage surfaces as format.val', () =>
    assertIsType(STRING.string_customErrorMessage));
  it('FormatAlpha — letters only', () => assertIsType(STRING.alpha));
  it('FormatAlphaNumeric — letters and digits', () => assertIsType(STRING.alphaNumeric));
  it('FormatNumeric — digits only', () => assertIsType(STRING.numeric));
  it('FormatAlpha with maxLength — char class plus length bound', () => assertIsType(STRING.alpha_withLength));
  it('FormatLowercase — transformer-only, validates as a plain string', () => assertIsType(STRING.lowercase_validate));
  it('FormatUUIDv4 — accepts v4, rejects v7 and malformed', () => assertIsType(STRING.uuidv4));
  it('FormatUUIDv7 — accepts v7, rejects v4', () => assertIsType(STRING.uuidv7));
  it('FormatStringDate — ISO / YYYY-MM-DD (default)', () => assertIsType(STRING.date_iso));
  it('FormatStringDate — DD-MM-YYYY layout', () => assertIsType(STRING.date_DMY));
  it('FormatStringDate — YYYY-MM layout (no day)', () => assertIsType(STRING.date_YM));
  it('FormatStringDate — MM-DD layout (no year)', () => assertIsType(STRING.date_MD));
  it('FormatStringDate — absolute min/max bounds (inclusive)', () => assertIsType(STRING.date_minMax_absolute));
  it('FormatStringTime — ISO (default, tz-aware)', () => assertIsType(STRING.time_iso));
  it('FormatStringTime — HH:mm:ss fixed layout', () => assertIsType(STRING.time_HHmmss));
  it('FormatStringTime — HH:mm:ss[.mmm] optional milliseconds', () => assertIsType(STRING.time_HHmmss_ms));
  it('FormatStringTime — absolute min/max bounds (business hours)', () => assertIsType(STRING.time_minMax_absolute));
  it('FormatStringDateTime — default (ISO date T ISO time)', () => assertIsType(STRING.dateTime_default));
  it('FormatStringDateTime — custom nested layouts + splitChar', () => assertIsType(STRING.dateTime_custom));
  it('FormatStringDateTime — absolute min/max bounds', () => assertIsType(STRING.dateTime_minMax_absolute));
  it('FormatIPv4 — dotted-quad addresses', () => assertIsType(STRING.ipv4));
  it('FormatIPv6 — colon-separated, loopback allowed', () => assertIsType(STRING.ipv6));
  it('FormatIP — accepts both v4 and v6', () => assertIsType(STRING.ip_any));
  it('FormatIPv4WithPort — v4 with port', () => assertIsType(STRING.ipv4_port));
  it('FormatIPv6WithPort — v6 with bracketed port', () => assertIsType(STRING.ipv6_port));
  it('FormatDomain — standard', () => assertIsType(STRING.domain));
  it('FormatDomainStrict — names/tld decomposition, maxParts, hyphen-edge', () => assertIsType(STRING.domainStrict));
  it('FormatEmail — standard', () => assertIsType(STRING.email));
  it('FormatEmailPunycode — accepts punycode-tld domains', () => assertIsType(STRING.emailPunycode));
  it('FormatEmailStrict — localPart + domain decomposition', () => assertIsType(STRING.emailStrict));
  it('FormatUrl — standard (http/ftp/ws schemes)', () => assertIsType(STRING.url));
  it('FormatUrlHttp — http(s) only', () => assertIsType(STRING.urlHttp));
  it('FormatUrlFile — file URLs', () => assertIsType(STRING.urlFile));
  it('registerFormatPattern — slug regex recovered from the call site', () => assertIsType(STRING.pattern_slug));
  it('registerFormatPattern — {source, flags} overload (case-insensitive)', () => assertIsType(STRING.pattern_hex));

  it('all STRING_FORMAT isType tests ran', () => {
    expect(ranTests).toBe(Object.keys(STRING).length);
  });
});

describe('format isType / NUMBER_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('FormatNumber<{max: 100}> — inclusive upper bound', () => assertIsType(NUMBER.number_max));
  it('FormatNumber<{min: 0}> — inclusive lower bound', () => assertIsType(NUMBER.number_min));
  it('FormatNumber<{lt: 10}> — exclusive upper bound', () => assertIsType(NUMBER.number_lt));
  it('FormatNumber<{gt: 0}> — exclusive lower bound', () => assertIsType(NUMBER.number_gt));
  it('FormatInteger — whole numbers only', () => assertIsType(NUMBER.number_integer));
  it('FormatFloat — non-integer only', () => assertIsType(NUMBER.number_float));
  it('FormatNumber<{multipleOf: 5}> — divisible by 5', () => assertIsType(NUMBER.number_multipleOf));
  it('FormatNumber<{min:0; max:100; integer:true; multipleOf:5}> — all constraints', () => assertIsType(NUMBER.number_combined));
  it('FormatInt8 — signed 8-bit range', () => assertIsType(NUMBER.number_int8));
  it('FormatUInt8 — unsigned 8-bit range', () => assertIsType(NUMBER.number_uint8));

  it('all NUMBER_FORMAT isType tests ran', () => {
    expect(ranTests).toBe(Object.keys(NUMBER).length);
  });
});

describe('format isType / BIGINT_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('FormatBigInt<{max: 100n}> — inclusive upper bound', () => assertIsType(BIGINT.bigint_max));
  it('FormatBigInt<{min: 0n}> — inclusive lower bound', () => assertIsType(BIGINT.bigint_min));
  it('FormatBigInt<{lt: 10n}> — exclusive upper bound', () => assertIsType(BIGINT.bigint_lt));
  it('FormatBigInt<{gt: 0n}> — exclusive lower bound', () => assertIsType(BIGINT.bigint_gt));
  it('FormatBigInt<{multipleOf: 5n}> — divisible by 5', () => assertIsType(BIGINT.bigint_multipleOf));
  it('FormatBigInt<{min:0n; max:1000n; multipleOf:10n}> — all constraints', () => assertIsType(BIGINT.bigint_combined));
  it('FormatBigInt64 — full signed 64-bit range', () => assertIsType(BIGINT.bigint_int64));
  it('FormatBigUInt64 — full unsigned 64-bit range', () => assertIsType(BIGINT.bigint_uint64));

  it('all BIGINT_FORMAT isType tests ran', () => {
    expect(ranTests).toBe(Object.keys(BIGINT).length);
  });
});
