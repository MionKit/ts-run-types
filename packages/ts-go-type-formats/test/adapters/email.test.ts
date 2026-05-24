// Email format adapter test. Standard + punycode variants, plus the
// typeErrors shape.

import {describe, expect, it} from 'vitest';
import {createIsType, createGetTypeErrors} from '@mionjs/ts-go-run-types';
import type {FormatEmail, FormatEmailPunycode} from '@mionjs/ts-go-type-formats';
import '../../src/index.ts';

describe('FormatEmail — standard', () => {
  it('accepts valid emails', () => {
    const isEmail = createIsType<FormatEmail>();
    expect(isEmail('john@example.com')).toBe(true);
    expect(isEmail('jane.doe@mion.io')).toBe(true);
    expect(isEmail('ab@cd.co')).toBe(true); // 8 chars — above the 7-char default minLength
    expect(isEmail('user+tag@sub.example.org')).toBe(true);
  });

  it('rejects emails shorter than the 7-char default minLength', () => {
    const isEmail = createIsType<FormatEmail>();
    expect(isEmail('a@b.co')).toBe(false); // 6 chars
  });

  it('rejects malformed emails', () => {
    const isEmail = createIsType<FormatEmail>();
    expect(isEmail('no-at-symbol')).toBe(false);
    expect(isEmail('@example.com')).toBe(false); // empty local part
    expect(isEmail('john@')).toBe(false); // empty domain
    expect(isEmail('john@example')).toBe(false); // no tld
    expect(isEmail('john doe@example.com')).toBe(false); // space
    expect(isEmail('')).toBe(false);
  });
});

describe('FormatEmailPunycode', () => {
  it('accepts punycode-tld domains the standard variant rejects', () => {
    const isPuny = createIsType<FormatEmailPunycode>();
    expect(isPuny('john@example.xn--fiqs8s')).toBe(true);
    const isStandard = createIsType<FormatEmail>();
    expect(isStandard('john@example.xn--fiqs8s')).toBe(false);
  });
});

describe('FormatEmail — typeErrors diagnostics', () => {
  it('invalid email pushes a TypeFormatError named email', () => {
    const collect = createGetTypeErrors<FormatEmail>();
    const errors = collect('not-an-email');
    const formatErr = errors.find((entry) => 'name' in entry && entry.name === 'email') as
      | {name: string}
      | undefined;
    expect(formatErr).toBeDefined();
  });

  it('valid email yields no errors', () => {
    const collect = createGetTypeErrors<FormatEmail>();
    expect(collect('john@example.com')).toEqual([]);
  });
});
