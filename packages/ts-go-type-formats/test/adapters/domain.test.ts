// Domain-name format adapter test. Covers the standard latin variant,
// length + part-count bounds (strict), and the typeErrors shape.

import {describe, expect, it} from 'vitest';
import {createIsType, createGetTypeErrors} from '@mionjs/ts-go-run-types';
import type {FormatDomain, FormatDomainStrict} from '@mionjs/ts-go-type-formats';
import '../../src/index.ts';

describe('FormatDomain — standard', () => {
  it('accepts valid domains', () => {
    const isDomain = createIsType<FormatDomain>();
    expect(isDomain('mion.io')).toBe(true);
    expect(isDomain('example.com')).toBe(true);
    expect(isDomain('sub.example.co.uk')).toBe(true);
    expect(isDomain('a-b.example.org')).toBe(true);
  });

  it('rejects malformed domains', () => {
    const isDomain = createIsType<FormatDomain>();
    expect(isDomain('no-tld')).toBe(false);
    expect(isDomain('.com')).toBe(false);
    expect(isDomain('example.c')).toBe(false); // tld too short
    expect(isDomain('-bad.com')).toBe(false); // leading hyphen
    expect(isDomain('exa mple.com')).toBe(false); // space
    expect(isDomain('')).toBe(false);
  });
});

describe('FormatDomainStrict — decomposition (names/tld, maxParts, hyphen-edge)', () => {
  it('accepts canonical multi-part domains within the part bound', () => {
    const isStrict = createIsType<FormatDomainStrict>();
    expect(isStrict('mion.io')).toBe(true);
    expect(isStrict('sub.example.com')).toBe(true);
    expect(isStrict('aa.bb.cc.dd.ee.com')).toBe(true); // exactly 6 parts
  });

  it('rejects domains with more than 6 parts', () => {
    const isStrict = createIsType<FormatDomainStrict>();
    expect(isStrict('aa.bb.cc.dd.ee.ff.com')).toBe(false); // 7 parts
  });

  it('rejects labels with a leading or trailing hyphen', () => {
    const isStrict = createIsType<FormatDomainStrict>();
    expect(isStrict('-bad.com')).toBe(false);
    expect(isStrict('bad-.com')).toBe(false);
    expect(isStrict('ok.-bad.com')).toBe(false); // middle label
  });

  it('rejects bad tld and label characters', () => {
    const isStrict = createIsType<FormatDomainStrict>();
    expect(isStrict('example.123')).toBe(false); // tld must be alphabetical
    expect(isStrict('ex_ample.com')).toBe(false); // underscore not allowed in label
    expect(isStrict('localhost')).toBe(false); // single part < minParts 2
  });

  it('pushes a TypeFormatError for a hyphen-edge label', () => {
    const collect = createGetTypeErrors<FormatDomainStrict>();
    const errors = collect('-bad.com');
    const formatErr = errors.find((entry) => entry.format?.name === 'domain')?.format;
    expect(formatErr).toBeDefined();
  });
});

describe('FormatDomain — typeErrors diagnostics', () => {
  it('invalid domain pushes a TypeFormatError named domain', () => {
    const collect = createGetTypeErrors<FormatDomain>();
    const errors = collect('not-a-domain');
    const formatErr = errors.find((entry) => entry.format?.name === 'domain')?.format;
    expect(formatErr).toBeDefined();
  });

  it('valid domain yields no errors', () => {
    const collect = createGetTypeErrors<FormatDomain>();
    expect(collect('mion.io')).toEqual([]);
  });
});
