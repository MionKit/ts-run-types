// Relative-bound runtime spec — the `now±P…` half of the date/time
// min/max feature. The Go matrix (internal/resolver/
// datetime_bound_validation_test.go) proves the build-time validation;
// this spec proves the EMITTED check evaluates the relative bound
// against the runtime clock correctly. `Date.now()` / `new Date()` are
// pinned with fake timers so the comparison is deterministic.
//
// Each scenario is created with createValidate<FormatStringDate<{... min/max}>>()
// — a static form; the relative semantics are identical under the
// reflection form (same emitted body), and the same-form-equivalence is
// covered by the Go resolver fixtures, so we keep one form here.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createValidate, createMockType} from '@mionjs/ts-go-run-types';
import '@mionjs/ts-go-run-types/formats';
import type {FormatStringDate, FormatStringTime, FormatStringDateTime, FormatDate} from '@mionjs/ts-go-run-types/formats';

// Pin "now" to 2026-06-15T12:00:00Z for every test.
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('relative date bounds (now±P, date components only)', () => {
  it('min: now-P1Y — rejects dates more than a year ago, accepts within', () => {
    const validate = createValidate<FormatStringDate<{format: 'YYYY-MM-DD'; min: 'now-P1Y'}>>();
    expect(validate('2025-06-15')).toBe(true); // exactly one year ago — inclusive
    expect(validate('2026-01-01')).toBe(true);
    expect(validate('2025-06-14')).toBe(false); // one day before the bound
    expect(validate('2020-01-01')).toBe(false);
  });

  it('max: now+P1M — accepts up to one calendar month ahead', () => {
    const validate = createValidate<FormatStringDate<{format: 'YYYY-MM-DD'; max: 'now+P1M'}>>();
    expect(validate('2026-07-15')).toBe(true); // exactly one month ahead
    expect(validate('2026-06-15')).toBe(true); // today
    expect(validate('2026-07-16')).toBe(false); // past the bound
  });

  it('min+max window: now-P7D .. now+P7D', () => {
    const validate = createValidate<FormatStringDate<{format: 'YYYY-MM-DD'; min: 'now-P7D'; max: 'now+P7D'}>>();
    expect(validate('2026-06-15')).toBe(true);
    expect(validate('2026-06-08')).toBe(true);
    expect(validate('2026-06-22')).toBe(true);
    expect(validate('2026-06-07')).toBe(false);
    expect(validate('2026-06-23')).toBe(false);
  });

  it('bare now as max — rejects any future date', () => {
    const validate = createValidate<FormatStringDate<{format: 'YYYY-MM-DD'; max: 'now'}>>();
    expect(validate('2026-06-15')).toBe(true); // today still passes (inclusive, same day 00:00 <= now)
    expect(validate('2026-06-16')).toBe(false);
  });
});

describe('relative time bounds (now±P, time components only)', () => {
  // NOW is 12:00:00 UTC → ms-of-day = 43_200_000.
  it('min: now-PT1H — rejects times more than an hour before noon', () => {
    const validate = createValidate<FormatStringTime<{format: 'HH:mm'; min: 'now-PT1H'}>>();
    expect(validate('11:00')).toBe(true); // exactly one hour before — inclusive
    expect(validate('12:00')).toBe(true);
    expect(validate('10:59')).toBe(false);
  });

  it('max: now+PT2H — accepts up to two hours after noon', () => {
    const validate = createValidate<FormatStringTime<{format: 'HH:mm'; max: 'now+PT2H'}>>();
    expect(validate('14:00')).toBe(true);
    expect(validate('14:01')).toBe(false);
  });
});

describe('relative bounds — mock respects them (every generated value is valid)', () => {
  const ITERATIONS = 50;

  it('FormatStringDate min:now-P1Y max:now+P1M — mock stays in range', () => {
    const validate = createValidate<FormatStringDate<{format: 'YYYY-MM-DD'; min: 'now-P1Y'; max: 'now+P1M'}>>();
    const mock = createMockType<FormatStringDate<{format: 'YYYY-MM-DD'; min: 'now-P1Y'; max: 'now+P1M'}>>();
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock();
      expect(validate(value), `iteration ${i}: ${String(value)}`).toBe(true);
    }
  });

  it('FormatStringTime min:now-PT1H max:now+PT2H — mock stays in range', () => {
    const validate = createValidate<FormatStringTime<{format: 'HH:mm'; min: 'now-PT1H'; max: 'now+PT2H'}>>();
    const mock = createMockType<FormatStringTime<{format: 'HH:mm'; min: 'now-PT1H'; max: 'now+PT2H'}>>();
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock();
      expect(validate(value), `iteration ${i}: ${String(value)}`).toBe(true);
    }
  });

  it('FormatStringDate absolute bounds — mock stays in range', () => {
    const validate = createValidate<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>();
    const mock = createMockType<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; max: '2020-12-31'}>>();
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock();
      expect(validate(value), `iteration ${i}: ${String(value)}`).toBe(true);
    }
  });
});

// Exclusive bounds (gt/lt) — the strict twins of min/max. gt/lt EXCLUDE the
// bound value itself (`>`/`<`), where min/max include it (`>=`/`<=`). A
// lower edge is min OR gt and an upper edge is max OR lt (the same edge
// can't be both — rejected build-time), but the two DISTINCT edges combine
// freely, e.g. inclusive-lower `min` + exclusive-upper `lt`.
describe('exclusive date/time bounds (gt/lt)', () => {
  it('FormatStringDate gt — excludes the bound day, accepts the next', () => {
    const validate = createValidate<FormatStringDate<{format: 'YYYY-MM-DD'; gt: '2020-01-01'}>>();
    expect(validate('2020-01-01')).toBe(false); // equal to gt — excluded
    expect(validate('2020-01-02')).toBe(true);
    expect(validate('2019-12-31')).toBe(false);
  });

  it('FormatStringDate lt — excludes the bound day, accepts the prior', () => {
    const validate = createValidate<FormatStringDate<{format: 'YYYY-MM-DD'; lt: '2020-12-31'}>>();
    expect(validate('2020-12-31')).toBe(false); // equal to lt — excluded
    expect(validate('2020-12-30')).toBe(true);
  });

  it('FormatStringTime gt/lt window — strict on both edges', () => {
    const validate = createValidate<FormatStringTime<{format: 'HH:mm'; gt: '08:00'; lt: '17:00'}>>();
    expect(validate('08:00')).toBe(false);
    expect(validate('17:00')).toBe(false);
    expect(validate('08:01')).toBe(true);
    expect(validate('16:59')).toBe(true);
  });

  it('FormatStringDate min + lt combine (inclusive lower, exclusive upper)', () => {
    const validate = createValidate<FormatStringDate<{format: 'YYYY-MM-DD'; min: '2020-01-01'; lt: '2020-01-03'}>>();
    expect(validate('2020-01-01')).toBe(true); // min inclusive
    expect(validate('2020-01-02')).toBe(true);
    expect(validate('2020-01-03')).toBe(false); // lt exclusive
    expect(validate('2019-12-31')).toBe(false);
  });

  it('FormatDate (native) gt/lt — strict on both epoch edges', () => {
    const validate = createValidate<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-01-01T00:00:02'}>>();
    expect(validate(new Date('2020-01-01T00:00:00Z'))).toBe(false);
    expect(validate(new Date('2020-01-01T00:00:02Z'))).toBe(false);
    expect(validate(new Date('2020-01-01T00:00:01Z'))).toBe(true);
  });
});

describe('exclusive bounds — mock respects them (every generated value is valid)', () => {
  const ITERATIONS = 50;

  it('FormatStringDate gt/lt — mock stays strictly inside', () => {
    const validate = createValidate<FormatStringDate<{format: 'YYYY-MM-DD'; gt: '2020-01-01'; lt: '2020-12-31'}>>();
    const mock = createMockType<FormatStringDate<{format: 'YYYY-MM-DD'; gt: '2020-01-01'; lt: '2020-12-31'}>>();
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock();
      expect(validate(value), `iteration ${i}: ${String(value)}`).toBe(true);
    }
  });

  it('FormatStringTime gt/lt — mock stays strictly inside', () => {
    const validate = createValidate<FormatStringTime<{format: 'HH:mm'; gt: '08:00'; lt: '17:00'}>>();
    const mock = createMockType<FormatStringTime<{format: 'HH:mm'; gt: '08:00'; lt: '17:00'}>>();
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock();
      expect(validate(value), `iteration ${i}: ${String(value)}`).toBe(true);
    }
  });

  it('FormatStringDateTime gt/lt — mock stays strictly inside', () => {
    const validate = createValidate<
      FormatStringDateTime<{
        date: {format: 'YYYY-MM-DD'};
        time: {format: 'HH:mm:ss'};
        gt: '2020-01-01T08:00:00';
        lt: '2020-12-31T17:00:00';
      }>
    >();
    const mock = createMockType<
      FormatStringDateTime<{
        date: {format: 'YYYY-MM-DD'};
        time: {format: 'HH:mm:ss'};
        gt: '2020-01-01T08:00:00';
        lt: '2020-12-31T17:00:00';
      }>
    >();
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock();
      expect(validate(value), `iteration ${i}: ${String(value)}`).toBe(true);
    }
  });

  // Coarse time layout (HH:mm — no seconds): the bound's time half is parsed
  // as ISO, so the value carries fewer ':' segments than ISO; timeStrToMs
  // must tolerate the missing segment (regression guard for that fix).
  it('FormatStringDateTime gt/lt with HH:mm time — mock stays strictly inside', () => {
    const validate = createValidate<
      FormatStringDateTime<{
        date: {format: 'YYYY-MM-DD'};
        time: {format: 'HH:mm'};
        gt: '2020-01-01T08:00';
        lt: '2020-12-31T17:00';
      }>
    >();
    const mock = createMockType<
      FormatStringDateTime<{
        date: {format: 'YYYY-MM-DD'};
        time: {format: 'HH:mm'};
        gt: '2020-01-01T08:00';
        lt: '2020-12-31T17:00';
      }>
    >();
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock();
      expect(validate(value), `iteration ${i}: ${String(value)}`).toBe(true);
    }
  });

  it('FormatDate (native) gt/lt — mock stays strictly inside', () => {
    const validate = createValidate<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2021-01-01T00:00:00'}>>();
    const mock = createMockType<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2021-01-01T00:00:00'}>>();
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock();
      expect(validate(value), `iteration ${i}: ${String(value)}`).toBe(true);
    }
  });
});
