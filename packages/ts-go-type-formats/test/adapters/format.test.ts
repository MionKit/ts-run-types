// createFormat end-to-end adapter test. Exercises the `format` transform
// RT family: string-format value transforms (lowercase / uppercase /
// capitalize / trim), nested-object recursion, identity for plain and
// non-transforming-format leaves, and a format→isType round-trip.

import {describe, expect, it} from 'vitest';
import {createFormat, createIsType} from '@mionjs/ts-go-run-types';
import type {
  FormatLowercase,
  FormatUppercase,
  FormatCapitalize,
  FormatString,
  FormatUUIDv4,
} from '@mionjs/ts-go-type-formats';
import '../../src/index.ts';

describe('createFormat — string transforms', () => {
  it('lowercases', () => {
    const fmt = createFormat<FormatLowercase>();
    expect(fmt('ABC')).toBe('abc');
    expect(fmt('MixedCase')).toBe('mixedcase');
  });

  it('uppercases', () => {
    const fmt = createFormat<FormatUppercase>();
    expect(fmt('abc')).toBe('ABC');
  });

  it('capitalizes', () => {
    const fmt = createFormat<FormatCapitalize>();
    expect(fmt('hello')).toBe('Hello');
  });

  it('trims', () => {
    const fmt = createFormat<FormatString<{trim: true}>>();
    expect(fmt('  padded  ')).toBe('padded');
  });
});

describe('createFormat — identity for non-transforming types', () => {
  it('plain string passes through unchanged', () => {
    const fmt = createFormat<string>();
    expect(fmt('ABC')).toBe('ABC');
  });

  it('a length-only stringFormat does not transform', () => {
    const fmt = createFormat<FormatString<{maxLength: 10}>>();
    expect(fmt('ABC')).toBe('ABC');
  });

  it('uuid (no transform) passes through unchanged', () => {
    const fmt = createFormat<FormatUUIDv4>();
    expect(fmt('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA')).toBe('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA');
  });
});

describe('createFormat — nested object recursion', () => {
  it('transforms only the format-branded field', () => {
    const fmt = createFormat<{name: FormatLowercase; age: number; tag: string}>();
    const out = fmt({name: 'ALICE', age: 30, tag: 'KEEP'});
    expect(out).toEqual({name: 'alice', age: 30, tag: 'KEEP'});
  });

  it('transforms format-branded array elements', () => {
    const fmt = createFormat<FormatLowercase[]>();
    expect(fmt(['A', 'Bc', 'DEF'])).toEqual(['a', 'bc', 'def']);
  });
});

describe('createFormat — round-trips through isType', () => {
  it('format output satisfies the matching isType', () => {
    const fmt = createFormat<FormatLowercase>();
    const isLower = createIsType<FormatLowercase>();
    const out = fmt('MixedCase');
    expect(isLower(out)).toBe(true);
  });
});
