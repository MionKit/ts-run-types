// format transform adapter — drives every FORMAT_TRANSFORM_SUITE case
// through `createFormatTransform<T>()` and asserts each input maps to its
// expected output (value-transform for lowercase / uppercase / capitalize
// / trim; identity for non-transforming types — number / bigint formats
// have no transform).
//
// Shape mirrors isType.test.ts: one `describe(...)` per format section,
// one explicit `it(...)` per case (no for-loop registration), and a
// per-section coverage-guard `it(...)`.

import {afterEach, describe, expect, it} from 'vitest';
import {STRING_FORMAT} from './StringFormat.ts';
import {NUMBER_FORMAT} from './NumberFormat.ts';
import {BIGINT_FORMAT} from './BigintFormat.ts';
import type {FormatTransformCase} from './types.ts';

const FORMAT_TRANSFORM_SUITE = {STRING_FORMAT, NUMBER_FORMAT, BIGINT_FORMAT};

function assertFormatTransform(c: FormatTransformCase): void {
  const transform = c.formatTransform();
  c.getCases().forEach(({input, expected}, i) => {
    expect(transform(input), `${c.title}: case[${i}] transform output`).toEqual(expected);
  });
}

const STRING = FORMAT_TRANSFORM_SUITE.STRING_FORMAT;
const NUMBER = FORMAT_TRANSFORM_SUITE.NUMBER_FORMAT;
const BIGINT = FORMAT_TRANSFORM_SUITE.BIGINT_FORMAT;

describe('format transform / STRING_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('FormatLowercase — lowercases the value', () => assertFormatTransform(STRING.lowercase));
  it('FormatUppercase — uppercases the value', () => assertFormatTransform(STRING.uppercase));
  it('FormatCapitalize — capitalizes the first letter', () => assertFormatTransform(STRING.capitalize));
  it('FormatString trim — trims surrounding whitespace', () => assertFormatTransform(STRING.trim));
  it('FormatString replace — replaces the first match only', () => assertFormatTransform(STRING.replace));
  it('FormatString replaceAll — replaces every match', () => assertFormatTransform(STRING.replaceAll));
  it('FormatEmail — lowercases the value (case-insensitive emails)', () => assertFormatTransform(STRING.email_lowercase));
  it('plain string — passes through unchanged', () => assertFormatTransform(STRING.identity_plain_string));
  it('length-only FormatString — no transform', () => assertFormatTransform(STRING.identity_length_only));
  it('FormatUUIDv4 — no transform, passes through unchanged', () => assertFormatTransform(STRING.identity_uuid));
  it('nested object — transforms only the format-branded field', () => assertFormatTransform(STRING.nested_object));
  it('array of FormatLowercase — transforms each element', () => assertFormatTransform(STRING.branded_array_elements));

  it('all STRING_FORMAT transform tests ran', () => {
    expect(ranTests).toBe(Object.keys(STRING).length);
  });
});

describe('format transform / NUMBER_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('FormatInteger — no transform, passes through unchanged', () => assertFormatTransform(NUMBER.identity_integer));
  it('FormatInt8 — no transform', () => assertFormatTransform(NUMBER.identity_int8));
  it('FormatNumber<{min:0; max:100}> — no transform', () => assertFormatTransform(NUMBER.identity_ranged));
  it('nested object — number-branded field passes through unchanged', () => assertFormatTransform(NUMBER.nested_number_field));

  it('all NUMBER_FORMAT transform tests ran', () => {
    expect(ranTests).toBe(Object.keys(NUMBER).length);
  });
});

describe('format transform / BIGINT_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('FormatBigInt64 — no transform, passes through unchanged', () => assertFormatTransform(BIGINT.identity_int64));
  it('FormatBigInt<{min:0n; max:1000n}> — no transform', () => assertFormatTransform(BIGINT.identity_ranged));

  it('all BIGINT_FORMAT transform tests ran', () => {
    expect(ranTests).toBe(Object.keys(BIGINT).length);
  });
});
