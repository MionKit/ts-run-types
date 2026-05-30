// Temporal format family runtime spec — FormatTemporalX<{min,max}> bound
// constraints. Validates that the emitted `Temporal.X.compare(v, bound)`
// checks accept in-range values and reject out-of-range ones, for both
// absolute Temporal-string bounds and relative `now±P` bounds.
//
// Relative bounds use wide margins (now±P1000Y / now±PT1000000H) so the
// boolean assertions hold regardless of the wall clock — no fake timers.
//
// Temporal is the polyfill global (test/setup.ts); types resolve via the
// ambient test/temporal-ambient.d.ts + the
// @mionjs/ts-go-run-types/formats/temporal subpath.

import {describe, expect, it} from 'vitest';
import {createIsType, createGetTypeErrors} from '@mionjs/ts-go-run-types';
import type {
  FormatTemporalPlainDate,
  FormatTemporalInstant,
  FormatTemporalPlainTime,
  FormatTemporalPlainDateTime,
} from '@mionjs/ts-go-run-types/formats/temporal';

const T = (globalThis as {Temporal: typeof Temporal}).Temporal;

describe('FormatTemporalPlainDate — absolute min/max', () => {
  it('accepts in-range, rejects out-of-range, rejects non-PlainDate', () => {
    const isType = createIsType<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>();
    expect(isType(T.PlainDate.from('2020-01-01'))).toBe(true);
    expect(isType(T.PlainDate.from('2020-06-15'))).toBe(true);
    expect(isType(T.PlainDate.from('2020-12-31'))).toBe(true);
    expect(isType(T.PlainDate.from('2019-12-31'))).toBe(false);
    expect(isType(T.PlainDate.from('2021-01-01'))).toBe(false);
    // base instanceof rejects a non-PlainDate WITHOUT throwing on compare
    expect(isType(T.Instant.from('2020-06-15T00:00:00Z'))).toBe(false);
    expect(isType('2020-06-15')).toBe(false);
  });

  it('getTypeErrors reports the failing bound via formatPath', () => {
    const getErrors = createGetTypeErrors<FormatTemporalPlainDate<{min: '2020-01-01'}>>();
    expect(getErrors(T.PlainDate.from('2020-06-15'))).toEqual([]);
    const errs = getErrors(T.PlainDate.from('2019-01-01'));
    expect(errs.length).toBe(1);
    const fmt = (errs[0] as {format?: {name?: string; formatPath?: string[]}}).format;
    expect(fmt?.name).toBe('temporalPlainDate');
    expect(fmt?.formatPath?.[fmt.formatPath.length - 1]).toBe('min');
  });
});

describe('FormatTemporalInstant — absolute bounds', () => {
  it('accepts in-range instants', () => {
    const isType = createIsType<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>();
    expect(isType(T.Instant.from('2020-06-15T12:00:00Z'))).toBe(true);
    expect(isType(T.Instant.from('2019-06-15T12:00:00Z'))).toBe(false);
    expect(isType(T.Instant.from('2021-06-15T12:00:00Z'))).toBe(false);
  });
});

describe('FormatTemporalPlainTime — absolute bounds', () => {
  it('business hours window', () => {
    const isType = createIsType<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>();
    expect(isType(T.PlainTime.from('12:30:00'))).toBe(true);
    expect(isType(T.PlainTime.from('08:59:59'))).toBe(false);
    expect(isType(T.PlainTime.from('17:00:01'))).toBe(false);
  });
});

describe('FormatTemporalPlainDateTime — absolute bounds', () => {
  it('accepts in-range datetimes', () => {
    const isType = createIsType<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>();
    expect(isType(T.PlainDateTime.from('2020-06-15T12:00:00'))).toBe(true);
    expect(isType(T.PlainDateTime.from('2019-06-15T12:00:00'))).toBe(false);
  });
});

describe('Temporal relative now±P bounds (wide margins, clock-independent)', () => {
  it('PlainDate min:now-P1000Y accepts a recent date, rejects an ancient one', () => {
    const isType = createIsType<FormatTemporalPlainDate<{min: 'now-P1000Y'}>>();
    expect(isType(T.PlainDate.from('2020-06-15'))).toBe(true);
    expect(isType(T.PlainDate.from('0500-01-01'))).toBe(false);
  });

  it('PlainDate max:now-P1000Y rejects any recent date', () => {
    const isType = createIsType<FormatTemporalPlainDate<{max: 'now-P1000Y'}>>();
    expect(isType(T.PlainDate.from('2020-06-15'))).toBe(false);
  });

  it('Instant min:now-PT1000000H accepts recent instants (time-only relative)', () => {
    const isType = createIsType<FormatTemporalInstant<{min: 'now-PT1000000H'}>>();
    expect(isType(T.Instant.from('2020-06-15T12:00:00Z'))).toBe(true);
  });

  it('bare now as max rejects the far future', () => {
    const isType = createIsType<FormatTemporalPlainDate<{max: 'now'}>>();
    expect(isType(T.PlainDate.from('2999-01-01'))).toBe(false);
  });
});
