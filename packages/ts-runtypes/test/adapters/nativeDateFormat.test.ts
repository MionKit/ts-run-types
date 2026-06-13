// Native Date format runtime spec — FormatDate<P> validates actual JS
// `Date` objects (not strings), so it can't ride the string-sample
// FORMAT_VALIDATION_SUITE; it gets its own spec exercising validate +
// getValidationErrors with real Date values. Relative `now±P` bounds run under
// fake timers for determinism (same approach as formatRelativeBounds).
//
// Static form only (createValidate<FormatDate<…>>()) — the reflection form
// emits the identical body, and same-form equivalence for the brand-lift
// is covered Go-side (native_date_format_test.go).

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createValidate, createGetValidationErrors, createMockType} from 'ts-runtypes';
import 'ts-runtypes/formats';
import type {FormatDate} from 'ts-runtypes/formats';

const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('FormatDate — base Date check (no bounds)', () => {
  it('accepts a valid Date, rejects non-Date and Invalid Date', () => {
    const validate = createValidate<FormatDate>();
    expect(validate(new Date('2020-01-01T00:00:00Z'))).toBe(true);
    expect(validate(new Date('not a date'))).toBe(false); // Invalid Date (NaN)
    expect(validate('2020-01-01')).toBe(false); // a string is not a Date
    expect(validate(123)).toBe(false);
  });
});

describe('FormatDate — absolute min/max bounds', () => {
  it('min/max inclusive window', () => {
    const validate = createValidate<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>();
    expect(validate(new Date(Date.UTC(2020, 0, 1, 0, 0, 0)))).toBe(true);
    expect(validate(new Date(Date.UTC(2020, 5, 15)))).toBe(true);
    expect(validate(new Date(Date.UTC(2019, 11, 31, 23, 59, 59)))).toBe(false);
    expect(validate(new Date(Date.UTC(2021, 0, 1)))).toBe(false);
  });

  it('getValidationErrors reports the failing bound via formatPath', () => {
    const getErrors = createGetValidationErrors<FormatDate<{min: '2020-01-01T00:00:00'}>>();
    expect(getErrors(new Date(Date.UTC(2020, 5, 1)))).toEqual([]);
    const errs = getErrors(new Date(Date.UTC(2019, 0, 1)));
    expect(errs.length).toBe(1);
    const fmt = (errs[0] as {format?: {name?: string; formatPath?: string[]}}).format;
    expect(fmt?.name).toBe('nativeDate');
    expect(fmt?.formatPath?.[fmt.formatPath.length - 1]).toBe('min');
  });
});

describe('FormatDate — relative now±P bounds (date + time components)', () => {
  it('max: now — rejects future Dates', () => {
    const validate = createValidate<FormatDate<{max: 'now'}>>();
    expect(validate(new Date(NOW))).toBe(true);
    expect(validate(new Date(NOW - 1000))).toBe(true);
    expect(validate(new Date(NOW + 1000))).toBe(false);
  });

  it('min: now-P1DT12H — a day-and-a-half window using both component kinds', () => {
    const validate = createValidate<FormatDate<{min: 'now-P1DT12H'}>>();
    expect(validate(new Date(NOW))).toBe(true);
    expect(validate(new Date(NOW - 36 * 3600 * 1000))).toBe(true); // exactly the bound
    expect(validate(new Date(NOW - 36 * 3600 * 1000 - 1000))).toBe(false);
  });
});

describe('FormatDate — mock respects bounds (every generated value is valid)', () => {
  const ITERATIONS = 50;

  it('absolute min/max — mock stays in range', () => {
    const validate = createValidate<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>();
    const mock = createMockType<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>();
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock();
      expect(value, `iteration ${i}`).toBeInstanceOf(Date);
      expect(validate(value), `iteration ${i}: ${String(value)}`).toBe(true);
    }
  });

  it('relative max: now — mock never produces a future Date', () => {
    const validate = createValidate<FormatDate<{max: 'now'}>>();
    const mock = createMockType<FormatDate<{max: 'now'}>>();
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock();
      expect(validate(value), `iteration ${i}: ${String(value)}`).toBe(true);
    }
  });

  it('relative window now-P1Y .. now — mock stays inside', () => {
    const validate = createValidate<FormatDate<{min: 'now-P1Y'; max: 'now'}>>();
    const mock = createMockType<FormatDate<{min: 'now-P1Y'; max: 'now'}>>();
    for (let i = 0; i < ITERATIONS; i++) {
      const value = mock();
      expect(validate(value), `iteration ${i}: ${String(value)}`).toBe(true);
    }
  });
});
