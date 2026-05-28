// FormatStringDateTime end-to-end adapter test. Validates the
// split-and-delegate composition: date half + time half joined by
// splitChar.

import {describe, expect, it} from 'vitest';
import {createIsType, createGetTypeErrors} from '@mionjs/ts-go-run-types';
import type {FormatStringDateTime} from '@mionjs/ts-go-type-formats';
import '../../src/index.ts';

describe('FormatStringDateTime — default (ISO date T ISO time)', () => {
  it('accepts full ISO datetimes', () => {
    const isDateTime = createIsType<FormatStringDateTime>();
    expect(isDateTime('2024-02-29T12:30:45Z')).toBe(true);
    expect(isDateTime('2026-05-28T00:00:00.500+02:00')).toBe(true);
  });

  it('rejects when either half is invalid or the split char is missing', () => {
    const isDateTime = createIsType<FormatStringDateTime>();
    expect(isDateTime('2023-02-29T12:30:45Z')).toBe(false); // bad date (not leap)
    expect(isDateTime('2024-02-29T25:30:45Z')).toBe(false); // bad time (hours)
    expect(isDateTime('2024-02-29T12:30:45')).toBe(false); // time has no tz
    expect(isDateTime('2024-02-29 12:30:45Z')).toBe(false); // wrong split char
    expect(isDateTime('not-a-datetime')).toBe(false);
  });
});

describe('FormatStringDateTime — custom layouts + split char', () => {
  it('honours nested date / time formats and a custom splitChar', () => {
    const isDateTime = createIsType<
      FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>
    >();
    expect(isDateTime('29-02-2024 23:59')).toBe(true);
    expect(isDateTime('2024-02-29 23:59')).toBe(false); // ISO date rejected
    expect(isDateTime('29-02-2024T23:59')).toBe(false); // wrong split char
    expect(isDateTime('29-02-2024 24:00')).toBe(false); // bad time
  });
});

describe('FormatStringDateTime — typeErrors diagnostics', () => {
  it('missing split char reports the splitChar param', () => {
    const collect = createGetTypeErrors<FormatStringDateTime>();
    const errors = collect('2024-02-29 12:30:45Z');
    const formatErr = errors.find((entry) => 'name' in entry && entry.name === 'dateTime') as
      | {name: string; formatPath?: unknown[]}
      | undefined;
    expect(formatErr).toBeDefined();
    expect(formatErr?.formatPath?.[formatErr.formatPath.length - 1]).toBe('splitChar');
  });

  it('valid datetime yields no errors', () => {
    const collect = createGetTypeErrors<FormatStringDateTime>();
    expect(collect('2024-02-29T12:30:45Z')).toEqual([]);
  });
});
