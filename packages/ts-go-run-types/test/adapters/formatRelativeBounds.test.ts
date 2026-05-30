// Relative-bound runtime spec — the `now±P…` half of the date/time
// min/max feature. The Go matrix (internal/resolver/
// datetime_bound_validation_test.go) proves the build-time validation;
// this spec proves the EMITTED check evaluates the relative bound
// against the runtime clock correctly. `Date.now()` / `new Date()` are
// pinned with fake timers so the comparison is deterministic.
//
// Each scenario is created with createIsType<FormatStringDate<{... min/max}>>()
// — a static form; the relative semantics are identical under the
// reflection form (same emitted body), and the same-form-equivalence is
// covered by the Go resolver fixtures, so we keep one form here.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createIsType} from '@mionjs/ts-go-run-types';
import '@mionjs/ts-go-run-types/formats';
import type {FormatStringDate, FormatStringTime} from '@mionjs/ts-go-run-types/formats';

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
    const isType = createIsType<FormatStringDate<{format: 'YYYY-MM-DD'; min: 'now-P1Y'}>>();
    expect(isType('2025-06-15')).toBe(true); // exactly one year ago — inclusive
    expect(isType('2026-01-01')).toBe(true);
    expect(isType('2025-06-14')).toBe(false); // one day before the bound
    expect(isType('2020-01-01')).toBe(false);
  });

  it('max: now+P1M — accepts up to one calendar month ahead', () => {
    const isType = createIsType<FormatStringDate<{format: 'YYYY-MM-DD'; max: 'now+P1M'}>>();
    expect(isType('2026-07-15')).toBe(true); // exactly one month ahead
    expect(isType('2026-06-15')).toBe(true); // today
    expect(isType('2026-07-16')).toBe(false); // past the bound
  });

  it('min+max window: now-P7D .. now+P7D', () => {
    const isType = createIsType<FormatStringDate<{format: 'YYYY-MM-DD'; min: 'now-P7D'; max: 'now+P7D'}>>();
    expect(isType('2026-06-15')).toBe(true);
    expect(isType('2026-06-08')).toBe(true);
    expect(isType('2026-06-22')).toBe(true);
    expect(isType('2026-06-07')).toBe(false);
    expect(isType('2026-06-23')).toBe(false);
  });

  it('bare now as max — rejects any future date', () => {
    const isType = createIsType<FormatStringDate<{format: 'YYYY-MM-DD'; max: 'now'}>>();
    expect(isType('2026-06-15')).toBe(true); // today still passes (inclusive, same day 00:00 <= now)
    expect(isType('2026-06-16')).toBe(false);
  });
});

describe('relative time bounds (now±P, time components only)', () => {
  // NOW is 12:00:00 UTC → ms-of-day = 43_200_000.
  it('min: now-PT1H — rejects times more than an hour before noon', () => {
    const isType = createIsType<FormatStringTime<{format: 'HH:mm'; min: 'now-PT1H'}>>();
    expect(isType('11:00')).toBe(true); // exactly one hour before — inclusive
    expect(isType('12:00')).toBe(true);
    expect(isType('10:59')).toBe(false);
  });

  it('max: now+PT2H — accepts up to two hours after noon', () => {
    const isType = createIsType<FormatStringTime<{format: 'HH:mm'; max: 'now+PT2H'}>>();
    expect(isType('14:00')).toBe(true);
    expect(isType('14:01')).toBe(false);
  });
});
