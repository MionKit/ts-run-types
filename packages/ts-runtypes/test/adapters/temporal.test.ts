// Temporal runtime spec — exercises every RT-fn family against real
// Temporal instances (provided by the polyfill global wired in test/setup.ts;
// native on Node 26+). Types resolve via test/temporal-ambient.d.ts.
//
// Covers: validate (instanceof), getValidationErrors, JSON round-trip
// (encode→decode equality via the type's own equals()), binary round-trip,
// and mock validity. One block per Temporal type for the core matrix, plus
// targeted edge cases.

import {describe, expect, it} from 'vitest';
import {
  createValidate,
  createGetValidationErrors,
  createMockType,
  createJsonEncoder,
  createJsonDecoder,
  createBinaryEncoder,
  createBinaryDecoder,
  type DataViewSerializer,
  type BinaryDecoderFn,
} from 'ts-runtypes';

// Temporal is the polyfill global in tests (see test/setup.ts).
const T = (globalThis as {Temporal: typeof Temporal}).Temporal;

// A sample value + an equality fn per type, so round-trip asserts by value.
const samples = {
  Instant: () => T.Instant.from('2020-01-15T10:30:00Z'),
  ZonedDateTime: () => T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]'),
  PlainDate: () => T.PlainDate.from('2020-08-24'),
  PlainTime: () => T.PlainTime.from('19:39:09'),
  PlainDateTime: () => T.PlainDateTime.from('1995-12-07T15:00:00'),
  PlainYearMonth: () => T.PlainYearMonth.from('2020-10'),
  PlainMonthDay: () => T.PlainMonthDay.from('07-14'),
  Duration: () => T.Duration.from('P1Y2M10DT2H30M'),
};

describe('Temporal validate — instanceof', () => {
  it('PlainDate accepts a PlainDate, rejects others', () => {
    const validate = createValidate<Temporal.PlainDate>();
    expect(validate(samples.PlainDate())).toBe(true);
    expect(validate(samples.Instant())).toBe(false);
    expect(validate('2020-08-24')).toBe(false); // a string is not a PlainDate
    expect(validate(null)).toBe(false);
  });

  it('Instant accepts an Instant, rejects a ZonedDateTime', () => {
    const validate = createValidate<Temporal.Instant>();
    expect(validate(samples.Instant())).toBe(true);
    expect(validate(samples.ZonedDateTime())).toBe(false);
  });

  it('Duration accepts a Duration', () => {
    const validate = createValidate<Temporal.Duration>();
    expect(validate(samples.Duration())).toBe(true);
    expect(validate(samples.PlainDate())).toBe(false);
  });
});

describe('Temporal getValidationErrors', () => {
  it('PlainDate — no errors for valid, one error for invalid', () => {
    const getErrors = createGetValidationErrors<Temporal.PlainDate>();
    expect(getErrors(samples.PlainDate())).toEqual([]);
    expect(getErrors('nope').length).toBe(1);
  });
});

// asStr stringifies a round-tripped value for by-value comparison.
const asStr = (v: unknown): string => (v as {toString(): string}).toString();

// The createX<T>() factories MUST be called with a CONCRETE type literally
// at the call site — the vite plugin rewrites each call by injecting the
// resolved type id, and a generic wrapper (createX<T>() inside a helper)
// gives the plugin no concrete T to resolve, so no id is injected. Hence
// each case spells out its own factory inline. (Concrete, not the union
// `samples[name]()` widens to — union-of-Temporal is a separate path.)

describe('Temporal JSON round-trip (encode → decode → equals)', () => {
  const jrt = (encoded: unknown, decode: (v: never) => unknown, original: unknown): void =>
    expect(asStr(decode(JSON.parse(JSON.stringify(encoded)) as never))).toBe(asStr(original));

  it('Instant', () =>
    jrt(
      createJsonEncoder<Temporal.Instant>()(samples.Instant() as never),
      createJsonDecoder<Temporal.Instant>(),
      samples.Instant()
    ));
  it('ZonedDateTime', () =>
    jrt(
      createJsonEncoder<Temporal.ZonedDateTime>()(samples.ZonedDateTime() as never),
      createJsonDecoder<Temporal.ZonedDateTime>(),
      samples.ZonedDateTime()
    ));
  it('PlainDate', () =>
    jrt(
      createJsonEncoder<Temporal.PlainDate>()(samples.PlainDate() as never),
      createJsonDecoder<Temporal.PlainDate>(),
      samples.PlainDate()
    ));
  it('PlainTime', () =>
    jrt(
      createJsonEncoder<Temporal.PlainTime>()(samples.PlainTime() as never),
      createJsonDecoder<Temporal.PlainTime>(),
      samples.PlainTime()
    ));
  it('PlainDateTime', () =>
    jrt(
      createJsonEncoder<Temporal.PlainDateTime>()(samples.PlainDateTime() as never),
      createJsonDecoder<Temporal.PlainDateTime>(),
      samples.PlainDateTime()
    ));
  it('PlainYearMonth', () =>
    jrt(
      createJsonEncoder<Temporal.PlainYearMonth>()(samples.PlainYearMonth() as never),
      createJsonDecoder<Temporal.PlainYearMonth>(),
      samples.PlainYearMonth()
    ));
  it('PlainMonthDay', () =>
    jrt(
      createJsonEncoder<Temporal.PlainMonthDay>()(samples.PlainMonthDay() as never),
      createJsonDecoder<Temporal.PlainMonthDay>(),
      samples.PlainMonthDay()
    ));
  it('Duration', () =>
    jrt(
      createJsonEncoder<Temporal.Duration>()(samples.Duration() as never),
      createJsonDecoder<Temporal.Duration>(),
      samples.Duration()
    ));
});

describe('Temporal binary round-trip', () => {
  const brt = (ser: DataViewSerializer, decode: BinaryDecoderFn<unknown>, original: unknown): void =>
    expect(asStr(decode(ser))).toBe(asStr(original));

  it('Instant', () =>
    brt(
      createBinaryEncoder<Temporal.Instant>()(samples.Instant() as never),
      createBinaryDecoder<Temporal.Instant>(),
      samples.Instant()
    ));
  it('PlainDate', () =>
    brt(
      createBinaryEncoder<Temporal.PlainDate>()(samples.PlainDate() as never),
      createBinaryDecoder<Temporal.PlainDate>(),
      samples.PlainDate()
    ));
  it('PlainDateTime', () =>
    brt(
      createBinaryEncoder<Temporal.PlainDateTime>()(samples.PlainDateTime() as never),
      createBinaryDecoder<Temporal.PlainDateTime>(),
      samples.PlainDateTime()
    ));
  it('Duration', () =>
    brt(
      createBinaryEncoder<Temporal.Duration>()(samples.Duration() as never),
      createBinaryDecoder<Temporal.Duration>(),
      samples.Duration()
    ));
});

// The numeric packing (dataView.ts serTemporal*/desTemporal*) must be
// lossless across the full value range — nanosecond precision, pre-epoch
// (negative) instants, far-past ISO years — and must fall back to the
// lossless toJSON() string for non-ISO calendars. A fresh encoder per call
// allocates its own serializer/buffer, so inline each round-trip.
describe('Temporal binary round-trip — numeric precision & calendar fallback', () => {
  it('Instant — nanosecond precision survives', () => {
    const v = T.Instant.fromEpochNanoseconds(1_579_084_200_123_456_789n);
    const decoded = createBinaryDecoder<Temporal.Instant>()(createBinaryEncoder<Temporal.Instant>()(v as never));
    // epochNanoseconds is authoritative (some polyfill equals() are flaky on
    // reconstructed instances).
    expect(decoded.epochNanoseconds).toBe(v.epochNanoseconds);
  });
  it('Instant — pre-epoch (negative, sub-second) survives', () => {
    const v = T.Instant.fromEpochNanoseconds(-6_857_222_999_999_999n);
    const decoded = createBinaryDecoder<Temporal.Instant>()(createBinaryEncoder<Temporal.Instant>()(v as never));
    expect(decoded.epochNanoseconds).toBe(v.epochNanoseconds);
  });
  it('Instant — epoch zero survives', () => {
    const v = T.Instant.fromEpochNanoseconds(0n);
    const decoded = createBinaryDecoder<Temporal.Instant>()(createBinaryEncoder<Temporal.Instant>()(v as never));
    expect(decoded.epochNanoseconds).toBe(v.epochNanoseconds);
  });

  it('PlainTime — full nanosecond precision', () => {
    const v = T.PlainTime.from('23:59:59.999999999');
    const decoded = createBinaryDecoder<Temporal.PlainTime>()(createBinaryEncoder<Temporal.PlainTime>()(v as never));
    expect(decoded.toString()).toBe(v.toString());
  });
  it('PlainTime — midnight', () => {
    const v = T.PlainTime.from('00:00:00');
    const decoded = createBinaryDecoder<Temporal.PlainTime>()(createBinaryEncoder<Temporal.PlainTime>()(v as never));
    expect(decoded.toString()).toBe(v.toString());
  });

  it('PlainDate — far-past ISO year', () => {
    const v = T.PlainDate.from('-001000-06-15');
    const decoded = createBinaryDecoder<Temporal.PlainDate>()(createBinaryEncoder<Temporal.PlainDate>()(v as never));
    expect(decoded.toString()).toBe(v.toString());
  });
  it('PlainDate — non-ISO calendar falls back to string (lossless)', () => {
    const v = T.PlainDate.from('2024-03-20[u-ca=hebrew]');
    const decoded = createBinaryDecoder<Temporal.PlainDate>()(createBinaryEncoder<Temporal.PlainDate>()(v as never));
    expect(decoded.calendarId).toBe('hebrew');
    expect(decoded.toString()).toBe(v.toString());
  });

  it('PlainDateTime — nanosecond precision (ISO)', () => {
    const v = T.PlainDateTime.from('2020-01-15T10:30:00.123456789');
    const decoded = createBinaryDecoder<Temporal.PlainDateTime>()(createBinaryEncoder<Temporal.PlainDateTime>()(v as never));
    expect(decoded.toString()).toBe(v.toString());
  });
  it('PlainDateTime — non-ISO calendar falls back to string', () => {
    const v = T.PlainDateTime.from('2024-03-20T08:15:30[u-ca=hebrew]');
    const decoded = createBinaryDecoder<Temporal.PlainDateTime>()(createBinaryEncoder<Temporal.PlainDateTime>()(v as never));
    expect(decoded.calendarId).toBe('hebrew');
    expect(decoded.toString()).toBe(v.toString());
  });

  it('PlainYearMonth — ISO round-trips', () => {
    const v = T.PlainYearMonth.from('2020-07');
    const decoded = createBinaryDecoder<Temporal.PlainYearMonth>()(createBinaryEncoder<Temporal.PlainYearMonth>()(v as never));
    expect(decoded.toString()).toBe(v.toString());
  });
});

describe('Temporal mock — every generated value passes validate', () => {
  const ITER = 30;
  it('PlainDate', () => {
    const validate = createValidate<Temporal.PlainDate>();
    const mock = createMockType<Temporal.PlainDate>();
    for (let i = 0; i < ITER; i++) expect(validate(mock())).toBe(true);
  });
  it('Instant', () => {
    const validate = createValidate<Temporal.Instant>();
    const mock = createMockType<Temporal.Instant>();
    for (let i = 0; i < ITER; i++) expect(validate(mock())).toBe(true);
  });
  it('Duration', () => {
    const validate = createValidate<Temporal.Duration>();
    const mock = createMockType<Temporal.Duration>();
    for (let i = 0; i < ITER; i++) expect(validate(mock())).toBe(true);
  });
  it('ZonedDateTime', () => {
    const validate = createValidate<Temporal.ZonedDateTime>();
    const mock = createMockType<Temporal.ZonedDateTime>();
    for (let i = 0; i < ITER; i++) expect(validate(mock())).toBe(true);
  });
});
