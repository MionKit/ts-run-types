// Default string formats adapter test. Alpha / AlphaNumeric / Numeric
// enforce a char class; Lowercase / Uppercase / Capitalize are
// transformer-only and validate as plain strings.

import {describe, expect, it} from 'vitest';
import {createIsType, createGetTypeErrors} from '@mionjs/ts-go-run-types';
import type {
  FormatAlpha,
  FormatAlphaNumeric,
  FormatNumeric,
  FormatLowercase,
} from '@mionjs/ts-go-type-formats';
import '../../src/index.ts';

describe('FormatAlpha', () => {
  it('accepts only letters', () => {
    const isAlpha = createIsType<FormatAlpha>();
    expect(isAlpha('Hello')).toBe(true);
    expect(isAlpha('abcXYZ')).toBe(true);
    expect(isAlpha('hello1')).toBe(false);
    expect(isAlpha('hi there')).toBe(false);
    expect(isAlpha('')).toBe(false);
  });
});

describe('FormatAlphaNumeric', () => {
  it('accepts letters and digits', () => {
    const isAlphaNum = createIsType<FormatAlphaNumeric>();
    expect(isAlphaNum('abc123')).toBe(true);
    expect(isAlphaNum('ABC')).toBe(true);
    expect(isAlphaNum('123')).toBe(true);
    expect(isAlphaNum('a-b')).toBe(false);
    expect(isAlphaNum('a b')).toBe(false);
  });
});

describe('FormatNumeric', () => {
  it('accepts only digits', () => {
    const isNumeric = createIsType<FormatNumeric>();
    expect(isNumeric('12345')).toBe(true);
    expect(isNumeric('007')).toBe(true);
    expect(isNumeric('12.3')).toBe(false);
    expect(isNumeric('12a')).toBe(false);
  });
});

describe('FormatAlpha — combined with length bounds', () => {
  it('applies both the char class and the length bound', () => {
    const isShortAlpha = createIsType<FormatAlpha<{maxLength: 3}>>();
    expect(isShortAlpha('abc')).toBe(true);
    expect(isShortAlpha('abcd')).toBe(false); // too long
    expect(isShortAlpha('a1')).toBe(false); // not alpha
  });
});

describe('FormatLowercase — transformer-only (validates as plain string)', () => {
  it('accepts any string regardless of case (transform not applied at validation)', () => {
    const isLower = createIsType<FormatLowercase>();
    expect(isLower('already lower')).toBe(true);
    expect(isLower('HasUpper')).toBe(true); // transformer doesn't reject
    expect(isLower(42 as unknown as string)).toBe(false); // still must be a string
  });
});

describe('FormatAlpha — typeErrors diagnostics', () => {
  it('non-alpha pushes a pattern TypeFormatError', () => {
    const collect = createGetTypeErrors<FormatAlpha>();
    const errors = collect('abc123');
    const formatErr = errors.find((entry) => 'name' in entry && entry.name === 'stringFormat') as
      | {name: string; val: unknown}
      | undefined;
    expect(formatErr).toBeDefined();
    expect(formatErr?.val).toBe('pattern');
  });

  it('valid alpha yields no errors', () => {
    const collect = createGetTypeErrors<FormatAlpha>();
    expect(collect('Hello')).toEqual([]);
  });
});
