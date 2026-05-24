// FormatStringTime end-to-end adapter test. Covers each layout plus
// the segment-range checks (hours 0-23, minutes/seconds 0-59,
// milliseconds 0-999) and the timezone parsing in the ISO_TZ path.

import {describe, expect, it} from 'vitest';
import {createIsType, createGetTypeErrors} from '@mionjs/ts-go-run-types';
import type {FormatStringTime} from '@mionjs/ts-go-type-formats';
import '../../src/index.ts';

describe('FormatStringTime — ISO (default, tz-aware)', () => {
  it('accepts ISO times with Z and numeric offsets', () => {
    const isTime = createIsType<FormatStringTime>();
    expect(isTime('12:30:45Z')).toBe(true);
    expect(isTime('12:30:45.123Z')).toBe(true);
    expect(isTime('12:30:45+05:30')).toBe(true);
    expect(isTime('00:00:00-08:00')).toBe(true);
  });

  it('rejects ISO times without a timezone or out of range', () => {
    const isTime = createIsType<FormatStringTime>();
    expect(isTime('12:30:45')).toBe(false); // no tz
    expect(isTime('24:00:00Z')).toBe(false); // hours out of range
    expect(isTime('12:60:00Z')).toBe(false); // minutes out of range
  });
});

describe('FormatStringTime — fixed layouts', () => {
  it('HH:mm:ss', () => {
    const isTime = createIsType<FormatStringTime<{format: 'HH:mm:ss'}>>();
    expect(isTime('23:59:59')).toBe(true);
    expect(isTime('23:59')).toBe(false);
    expect(isTime('24:00:00')).toBe(false);
  });

  it('HH:mm:ss[.mmm]', () => {
    const isTime = createIsType<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>();
    expect(isTime('12:30:45')).toBe(true);
    expect(isTime('12:30:45.999')).toBe(true);
    expect(isTime('12:30:45.9999')).toBe(false); // 4-digit ms
  });

  it('HH:mm and mm:ss', () => {
    const isHHmm = createIsType<FormatStringTime<{format: 'HH:mm'}>>();
    expect(isHHmm('23:59')).toBe(true);
    expect(isHHmm('24:00')).toBe(false);

    const isMMss = createIsType<FormatStringTime<{format: 'mm:ss'}>>();
    expect(isMMss('59:59')).toBe(true);
    expect(isMMss('60:00')).toBe(false);
  });

  it('bare HH / mm / ss segments', () => {
    const isHH = createIsType<FormatStringTime<{format: 'HH'}>>();
    expect(isHH('23')).toBe(true);
    expect(isHH('24')).toBe(false);

    const isSS = createIsType<FormatStringTime<{format: 'ss'}>>();
    expect(isSS('59')).toBe(true);
    expect(isSS('60')).toBe(false);
  });
});

describe('FormatStringTime — typeErrors diagnostics', () => {
  it('invalid time pushes a TypeFormatError naming the format', () => {
    const collect = createGetTypeErrors<FormatStringTime<{format: 'HH:mm:ss'}>>();
    const errors = collect('99:99:99');
    const formatErr = errors.find((entry) => entry.format?.name === 'time')?.format;
    expect(formatErr).toBeDefined();
    expect(formatErr?.val).toBe('HH:mm:ss');
  });

  it('valid time yields no errors', () => {
    const collect = createGetTypeErrors<FormatStringTime<{format: 'HH:mm:ss'}>>();
    expect(collect('12:00:00')).toEqual([]);
  });
});
