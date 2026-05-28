// registerFormatPattern end-to-end: a user-defined pattern bundle used
// as a format's `pattern`. Exercises the Go-side recovery (typeof p →
// the call AST → resolved {source, flags, mockSamples}), the validator,
// the mock round-trip, and the JS-side registration-time sample check.

import {describe, expect, it} from 'vitest';
import {createIsType, createMockType, registerFormatPattern} from '@mionjs/ts-go-run-types';
import type {FormatString} from '@mionjs/ts-go-type-formats';
import '../../src/index.ts';

const slug = registerFormatPattern({
  regexp: /^[a-z0-9-]+$/,
  mockSamples: ['my-slug', 'abc', 'a-b-c'],
  message: 'must be a slug',
});

type Slug = FormatString<{pattern: typeof slug}>;

describe('registerFormatPattern — isType', () => {
  it('validates with the regex recovered from the call site', () => {
    const isSlug = createIsType<Slug>();
    expect(isSlug('my-slug')).toBe(true);
    expect(isSlug('a-b-c')).toBe(true);
    expect(isSlug('Has Capitals')).toBe(false);
    expect(isSlug('UPPER')).toBe(false);
    expect(isSlug('has space')).toBe(false);
    expect(isSlug('')).toBe(false);
  });
});

describe('registerFormatPattern — mock round-trip', () => {
  it('draws from the pattern samples; every mock passes isType', () => {
    const mock = createMockType<Slug>();
    const isSlug = createIsType<Slug>();
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const value = mock() as string;
      seen.add(value);
      expect(isSlug(value)).toBe(true);
    }
    // Mock values come from the declared samples.
    for (const value of seen) expect(['my-slug', 'abc', 'a-b-c']).toContain(value);
  });
});

describe('registerFormatPattern — registration-time sample validation (real engine)', () => {
  it('throws when a mockSample does not match its own regexp', () => {
    expect(() =>
      registerFormatPattern({regexp: /^[0-9]+$/, mockSamples: ['123', 'not-a-number']}),
    ).toThrow(/does not match/);
  });

  it('accepts samples that all match', () => {
    expect(() => registerFormatPattern({regexp: /^[0-9]+$/, mockSamples: ['123', '007']})).not.toThrow();
  });
});
