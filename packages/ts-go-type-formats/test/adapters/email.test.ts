// Email format adapter test. Standard + punycode variants, plus the
// typeErrors shape.

import {describe, expect, it} from 'vitest';
import {createIsType, createGetTypeErrors} from '@mionjs/ts-go-run-types';
import type {FormatEmail, FormatEmailPunycode, FormatEmailStrict} from '@mionjs/ts-go-type-formats';
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

describe('FormatEmailStrict — localPart + domain decomposition', () => {
  it('accepts canonical addresses', () => {
    const isStrict = createIsType<FormatEmailStrict>();
    expect(isStrict('john@example.com')).toBe(true);
    expect(isStrict('jane.doe@mion.io')).toBe(true); // dot allowed in local part
  });

  it('rejects aliasing / structural chars in the local part', () => {
    const isStrict = createIsType<FormatEmailStrict>();
    expect(isStrict('a+b@x.com')).toBe(false); // '+' disallowed (aliasing)
    expect(isStrict('a b@example.com')).toBe(false); // space disallowed
    expect(isStrict('john@@example.com')).toBe(false); // '@' lands in local part
  });

  it('rejects when the domain half is invalid', () => {
    const isStrict = createIsType<FormatEmailStrict>();
    expect(isStrict('john@bad_domain.com')).toBe(false); // underscore in label
    expect(isStrict('john@example')).toBe(false); // no tld → single part
    expect(isStrict('no-at-symbol')).toBe(false);
  });

  it('pushes a TypeFormatError for a disallowed local-part char', () => {
    const collect = createGetTypeErrors<FormatEmailStrict>();
    const errors = collect('a+b@example.com');
    const formatErr = errors.find((entry) => entry.format?.name === 'email')?.format;
    expect(formatErr).toBeDefined();
    expect(formatErr?.val).toBe('Invalid characters in email local part');
  });
});

describe('FormatEmail — typeErrors diagnostics', () => {
  it('invalid email pushes a TypeFormatError named email', () => {
    const collect = createGetTypeErrors<FormatEmail>();
    const errors = collect('not-an-email');
    const formatErr = errors.find((entry) => entry.format?.name === 'email')?.format;
    expect(formatErr).toBeDefined();
  });

  it('valid email yields no errors', () => {
    const collect = createGetTypeErrors<FormatEmail>();
    expect(collect('john@example.com')).toEqual([]);
  });
});
