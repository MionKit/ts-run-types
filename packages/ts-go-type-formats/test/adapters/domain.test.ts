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

describe('FormatDomainStrict — part-count bounds', () => {
  it('rejects domains with more parts than maxParts (6)', () => {
    const isDomain = createIsType<FormatDomainStrict>();
    expect(isDomain('a.b.example.com')).toBe(true);
    expect(isDomain('a.b.c.d.e.example.com')).toBe(false); // 7 parts > 6
  });
});

describe('FormatDomain — typeErrors diagnostics', () => {
  it('invalid domain pushes a TypeFormatError named domain', () => {
    const collect = createGetTypeErrors<FormatDomain>();
    const errors = collect('not-a-domain');
    const formatErr = errors.find((entry) => 'name' in entry && entry.name === 'domain') as
      | {name: string}
      | undefined;
    expect(formatErr).toBeDefined();
  });

  it('valid domain yields no errors', () => {
    const collect = createGetTypeErrors<FormatDomain>();
    expect(collect('mion.io')).toEqual([]);
  });
});
