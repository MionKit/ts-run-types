// FormatStringDate end-to-end adapter test. Exercises each layout and
// the leap-year handling baked into the cpf_isDateString base pure fn
// (reached transitively by the format-specific wrapper fns).

import {describe, expect, it} from 'vitest';
import {createIsType, createGetTypeErrors} from '@mionjs/ts-go-run-types';
import type {FormatStringDate} from '@mionjs/ts-go-type-formats';
import '../../src/index.ts';

describe('FormatStringDate — ISO / YYYY-MM-DD (default)', () => {
  it('accepts valid ISO dates', () => {
    const isDate = createIsType<FormatStringDate>();
    expect(isDate('2024-02-29')).toBe(true); // leap year
    expect(isDate('2026-05-28')).toBe(true);
    expect(isDate('0001-01-01')).toBe(true);
  });

  it('rejects invalid ISO dates', () => {
    const isDate = createIsType<FormatStringDate>();
    expect(isDate('2023-02-29')).toBe(false); // not a leap year
    expect(isDate('2024-13-01')).toBe(false); // month out of range
    expect(isDate('2024-00-10')).toBe(false); // month zero
    expect(isDate('2024-04-31')).toBe(false); // April has 30 days
    expect(isDate('2024-1-1')).toBe(false); // wrong segment widths
    expect(isDate('not-a-date')).toBe(false);
  });
});

describe('FormatStringDate — alternate layouts', () => {
  it('DD-MM-YYYY', () => {
    const isDate = createIsType<FormatStringDate<{format: 'DD-MM-YYYY'}>>();
    expect(isDate('29-02-2024')).toBe(true);
    expect(isDate('2024-02-29')).toBe(false); // ISO order rejected
    expect(isDate('31-04-2024')).toBe(false); // April has 30 days
  });

  it('MM-DD-YYYY', () => {
    const isDate = createIsType<FormatStringDate<{format: 'MM-DD-YYYY'}>>();
    expect(isDate('02-29-2024')).toBe(true);
    expect(isDate('13-01-2024')).toBe(false);
  });

  it('YYYY-MM (no day)', () => {
    const isDate = createIsType<FormatStringDate<{format: 'YYYY-MM'}>>();
    expect(isDate('2024-02')).toBe(true);
    expect(isDate('2024-13')).toBe(false);
    expect(isDate('2024-02-29')).toBe(false); // day present, layout has none
  });

  it('MM-DD and DD-MM (no year)', () => {
    const isMonthDay = createIsType<FormatStringDate<{format: 'MM-DD'}>>();
    expect(isMonthDay('02-29')).toBe(true);
    expect(isMonthDay('13-01')).toBe(false);

    const isDayMonth = createIsType<FormatStringDate<{format: 'DD-MM'}>>();
    expect(isDayMonth('29-02')).toBe(true);
    expect(isDayMonth('31-04')).toBe(false);
  });
});

describe('FormatStringDate — typeErrors diagnostics', () => {
  it('invalid date pushes a TypeFormatError naming the format', () => {
    const collect = createGetTypeErrors<FormatStringDate>();
    const errors = collect('2023-02-29');
    const formatErr = errors.find((entry) => entry.format?.name === 'date')?.format;
    expect(formatErr).toBeDefined();
    expect(formatErr?.val).toBe('ISO');
  });

  it('valid date yields no errors', () => {
    const collect = createGetTypeErrors<FormatStringDate>();
    expect(collect('2024-02-29')).toEqual([]);
  });
});
