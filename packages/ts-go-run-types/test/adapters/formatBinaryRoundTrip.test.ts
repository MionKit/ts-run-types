// format binary round-trip adapter — the binary sibling of
// formatSerializationRoundTrip.test.ts. Drives every
// FORMAT_SERIALIZATION_SUITE case through `binaryEncoder` →
// `binaryDecoder`, asserts the decoded value deep-equals the original,
// and (when the case declares `getBinaryByteSizes`) asserts the exact
// encoded byte length — the proof of the number/bigint binary packing.
// Shares the `runBinaryRoundTripCase` helper with binaryRoundTrip.test.ts.
//
// Shape mirrors isType.test.ts: one `describe(...)` per format section,
// one explicit `it(...)` per case (no for-loop registration), and a
// per-section coverage-guard `it(...)`.

import {afterEach, describe, expect, it} from 'vitest';
import {FORMAT_SERIALIZATION_SUITE} from '../suites/format-serialization-suite.ts';
import {runBinaryRoundTripCase as runCase} from '../util/serializationAsserts.ts';

const STRING = FORMAT_SERIALIZATION_SUITE.STRING_FORMAT;
const NUMBER = FORMAT_SERIALIZATION_SUITE.NUMBER_FORMAT;
const BIGINT = FORMAT_SERIALIZATION_SUITE.BIGINT_FORMAT;

describe('format binary round-trip / STRING_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('FormatString<{maxLength: 5}>', () => runCase(STRING.string_maxLength));
  it('FormatUUIDv4', () => runCase(STRING.uuidv4));
  it('FormatStringDate', () => runCase(STRING.date));
  it('FormatEmail', () => runCase(STRING.email));
  it('FormatAlpha', () => runCase(STRING.alpha));
  it('object with format-branded fields {id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}', () =>
    runCase(STRING.object_with_formats));
  it('array of FormatEmail', () => runCase(STRING.email_array));

  it('all STRING_FORMAT binary round-trip tests ran', () => {
    expect(ranTests).toBe(Object.keys(STRING).length);
  });
});

describe('format binary round-trip / NUMBER_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('FormatInt8 — packs into 1 byte', () => runCase(NUMBER.number_int8));
  it('FormatInt16 — packs into 2 bytes', () => runCase(NUMBER.number_int16));
  it('FormatInt32 — packs into 4 bytes', () => runCase(NUMBER.number_int32));
  it('FormatUInt8 — packs into 1 byte', () => runCase(NUMBER.number_uint8));
  it('FormatUInt16 — packs into 2 bytes', () => runCase(NUMBER.number_uint16));
  it('FormatUInt32 — packs into 4 bytes', () => runCase(NUMBER.number_uint32));
  it('FormatInteger — unbounded integer falls back to float64 (8 bytes)', () => runCase(NUMBER.number_integer_8bytes));
  it('FormatFloat — float64 (8 bytes)', () => runCase(NUMBER.number_float_8bytes));
  it('FormatNumber<{min:0; max:1000; integer:true}> — picks uint16 (2 bytes)', () => runCase(NUMBER.number_ranged));

  it('all NUMBER_FORMAT binary round-trip tests ran', () => {
    expect(ranTests).toBe(Object.keys(NUMBER).length);
  });
});

describe('format binary round-trip / BIGINT_FORMAT', () => {
  let ranTests = 0;
  afterEach(() => {
    ranTests++;
  });

  it('FormatBigInt64 — packs into 8 bytes (setBigInt64)', () => runCase(BIGINT.bigint_int64));
  it('FormatBigUInt64 — packs into 8 bytes (setBigUint64)', () => runCase(BIGINT.bigint_uint64));
  it('FormatBigPositive — only min set, falls back to decimal-string serialization', () =>
    runCase(BIGINT.bigint_positive_string));
  it('FormatBigInt<{min:0n; max:255n}> — small range, packs 8 bytes via uint64', () => runCase(BIGINT.bigint_plain_brand));

  it('all BIGINT_FORMAT binary round-trip tests ran', () => {
    expect(ranTests).toBe(Object.keys(BIGINT).length);
  });
});
