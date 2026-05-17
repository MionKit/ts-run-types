// End-to-end tests for the unknown-keys jit family. Verifies that the
// four functions ported from mion's emit* methods on InterfaceRunType
// produce correct runtime behavior for the common cases:
//
//   - hasUnknownKeys: boolean predicate
//   - stripUnknownKeys: delete unknown keys in place
//   - unknownKeyErrors: accumulate errors with path tracking
//   - unknownKeysToUndefined: set unknown keys to undefined in place
//
// Mirrors mion's `nodes/collection/__tests__/unknownKeys.spec.ts` shape
// but scoped to the subset of behavior currently exercised.

import {describe, expect, it} from 'vitest';
import {
  createHasUnknownKeys,
  createStripUnknownKeys,
  createUnknownKeyErrors,
  createUnknownKeysToUndefined,
} from '@mionjs/ts-go-run-types';

describe('hasUnknownKeys', () => {
  it('returns false when the value matches the schema', () => {
    const has = createHasUnknownKeys<{a: string; b: number}>();
    expect(has({a: 'x', b: 1})).toBe(false);
  });

  it('returns true when an extra key is present', () => {
    const has = createHasUnknownKeys<{a: string; b: number}>();
    expect(has({a: 'x', b: 1, extra: true})).toBe(true);
  });

  it('returns false on atomic types', () => {
    const has = createHasUnknownKeys<string>();
    expect(has('hello')).toBe(false);
  });

  it('returns false when an optional property is absent', () => {
    const has = createHasUnknownKeys<{a: string; b?: number}>();
    expect(has({a: 'x'})).toBe(false);
  });

  it('returns true for an extra key on an interface with all optional props', () => {
    const has = createHasUnknownKeys<{a?: string; b?: number}>();
    expect(has({extra: true})).toBe(true);
  });
});

describe('stripUnknownKeys', () => {
  it('removes properties not declared in the schema', () => {
    const strip = createStripUnknownKeys<{a: string; b: number}>();
    const input = {a: 'x', b: 1, extra: true, more: 'gone'};
    strip(input);
    expect(input).toEqual({a: 'x', b: 1});
  });

  it('is a passthrough for atomic types', () => {
    const strip = createStripUnknownKeys<string>();
    expect(strip('hello')).toBe('hello');
  });

  it('preserves the original value reference (mutates in place)', () => {
    const strip = createStripUnknownKeys<{a: string}>();
    const input = {a: 'x', extra: 1};
    const result = strip(input);
    expect(result).toBe(input);
    expect(input).toEqual({a: 'x'});
  });
});

describe('unknownKeyErrors', () => {
  it('returns an empty array when the value matches the schema', () => {
    const validate = createUnknownKeyErrors<{a: string; b: number}>();
    expect(validate({a: 'x', b: 1})).toEqual([]);
  });

  it('reports one error per unknown key with path including the key', () => {
    const validate = createUnknownKeyErrors<{a: string}>();
    const errors = validate({a: 'x', extra: 1});
    expect(errors).toEqual([{path: ['extra'], expected: 'never'}]);
  });

  it('returns an empty array for atomic types', () => {
    const validate = createUnknownKeyErrors<string>();
    expect(validate('hello')).toEqual([]);
  });
});

describe('unknownKeysToUndefined', () => {
  it('sets unknown keys to undefined (instead of deleting them)', () => {
    const mutate = createUnknownKeysToUndefined<{a: string}>();
    const input: Record<string, unknown> = {a: 'x', extra: 'gone'};
    mutate(input);
    expect(input.a).toBe('x');
    expect(input.extra).toBe(undefined);
    // The key still exists on the object; only its value is undefined.
    expect('extra' in input).toBe(true);
  });

  it('is a passthrough for atomic types', () => {
    const mutate = createUnknownKeysToUndefined<string>();
    expect(mutate('hello')).toBe('hello');
  });

  it('preserves the original value reference (mutates in place)', () => {
    const mutate = createUnknownKeysToUndefined<{a: string}>();
    const input = {a: 'x', extra: 1};
    const result = mutate(input);
    expect(result).toBe(input);
  });
});

describe('nested unknown-keys cases', () => {
  interface User {
    name: string;
    address: {street: string; city: string};
  }

  it('hasUnknownKeys detects unknowns in nested object', () => {
    const has = createHasUnknownKeys<User>();
    expect(has({name: 'jane', address: {street: '10', city: 'sf', extra: true}})).toBe(true);
  });

  it('stripUnknownKeys removes unknowns from nested object', () => {
    const strip = createStripUnknownKeys<User>();
    const input = {name: 'jane', address: {street: '10', city: 'sf', extra: true}};
    strip(input);
    expect(input).toEqual({name: 'jane', address: {street: '10', city: 'sf'}});
  });

  it('hasUnknownKeys returns false for arrays of objects without extras', () => {
    const has = createHasUnknownKeys<Array<{a: string}>>();
    expect(has([{a: 'x'}, {a: 'y'}])).toBe(false);
  });

  it('hasUnknownKeys returns true when an array element has an extra key', () => {
    const has = createHasUnknownKeys<Array<{a: string}>>();
    expect(has([{a: 'x'}, {a: 'y', extra: 1}])).toBe(true);
  });

  it('stripUnknownKeys removes extras from each element of an array', () => {
    const strip = createStripUnknownKeys<Array<{a: string}>>();
    const input = [
      {a: 'x', extra: 1},
      {a: 'y', extra: 2},
    ];
    strip(input);
    expect(input).toEqual([{a: 'x'}, {a: 'y'}]);
  });
});
