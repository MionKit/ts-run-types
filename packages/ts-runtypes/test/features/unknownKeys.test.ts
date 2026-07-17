// End-to-end tests for the unknown-keys rt family:
//
//   - hasUnknownKeys: boolean predicate (plain + runsAfterValidation variant)
//   - cloneExactShape: non-mutating declared-shape clone (unknown keys dropped
//     by construction) — the replacement for the removed mutating
//     stripUnknownKeys / unknownKeysToUndefined
//   - unknownKeyErrors: accumulate errors with path tracking

import {describe, expect, it} from 'vitest';
import {createHasUnknownKeys, createCloneExactShape, createUnknownKeyErrors, createValidate} from '@ts-runtypes/core';

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

describe('hasUnknownKeys — runsAfterValidation variant', () => {
  // The variant's contract: inputs already PASSED this type's validate. On an
  // all-required shape the emitter swaps the key-array scan for a key-count
  // compare; these tests pin that the fast path answers exactly like the
  // plain variant on validated inputs.
  interface Flat {
    a: string;
    b: number;
  }
  interface Nested {
    name: string;
    address: {street: string; city: string};
  }

  it('agrees with the plain variant on clean validated input', () => {
    const has = createHasUnknownKeys<Flat>(undefined, {runsAfterValidation: true});
    expect(has({a: 'x', b: 1})).toBe(false);
  });

  it('detects a root extra key', () => {
    const has = createHasUnknownKeys<Flat>(undefined, {runsAfterValidation: true});
    expect(has({a: 'x', b: 1, extra: true})).toBe(true);
  });

  it('detects a nested-only extra key', () => {
    const has = createHasUnknownKeys<Nested>(undefined, {runsAfterValidation: true});
    expect(has({name: 'jane', address: {street: '10', city: 'sf', extra: 1}})).toBe(true);
    expect(has({name: 'jane', address: {street: '10', city: 'sf'}})).toBe(false);
  });

  it('optional-prop shapes fall back to the scan and stay correct', () => {
    const has = createHasUnknownKeys<{a: string; b?: number}>(undefined, {runsAfterValidation: true});
    expect(has({a: 'x'})).toBe(false);
    expect(has({a: 'x', b: 2})).toBe(false);
    expect(has({a: 'x', extra: 1})).toBe(true);
  });

  it('array elements use the fast path per element', () => {
    const has = createHasUnknownKeys<Array<{a: string}>>(undefined, {runsAfterValidation: true});
    expect(has([{a: 'x'}, {a: 'y'}])).toBe(false);
    expect(has([{a: 'x'}, {a: 'y', extra: 1}])).toBe(true);
  });

  it('both variants of the same type coexist (distinct cache entries)', () => {
    const plain = createHasUnknownKeys<Flat>();
    const fast = createHasUnknownKeys<Flat>(undefined, {runsAfterValidation: true});
    const clean = {a: 'x', b: 1};
    const dirty = {a: 'x', b: 1, extra: true};
    expect(plain(clean)).toBe(false);
    expect(fast(clean)).toBe(false);
    expect(plain(dirty)).toBe(true);
    expect(fast(dirty)).toBe(true);
  });

  it('composes with validate for the assertStrict flow', () => {
    const validate = createValidate<Nested>();
    const has = createHasUnknownKeys<Nested>(undefined, {runsAfterValidation: true});
    const isStrict = (v: unknown) => validate(v) && !has(v);
    expect(isStrict({name: 'jane', address: {street: '10', city: 'sf'}})).toBe(true);
    expect(isStrict({name: 'jane', address: {street: '10', city: 'sf', extra: 1}})).toBe(false);
    expect(isStrict({name: 'jane'})).toBe(false); // fails validate, huk never runs
  });
});

describe('cloneExactShape', () => {
  it('returns a fresh value without undeclared keys (input untouched)', () => {
    const clone = createCloneExactShape<{a: string; b: number}>();
    const input = {a: 'x', b: 1, extra: true, more: 'gone'};
    const out = clone(input as unknown as {a: string; b: number});
    expect(out).toEqual({a: 'x', b: 1});
    expect(out).not.toBe(input);
    // Non-mutating: the input keeps its extra keys.
    expect(input).toEqual({a: 'x', b: 1, extra: true, more: 'gone'});
  });

  it('works on frozen inputs (a mutating strip never could)', () => {
    const clone = createCloneExactShape<{a: string}>();
    const input = Object.freeze({a: 'x', extra: 1});
    expect(clone(input as unknown as {a: string})).toEqual({a: 'x'});
  });

  it('is a passthrough for atomic types', () => {
    const clone = createCloneExactShape<string>();
    expect(clone('hello')).toBe('hello');
  });

  it('absent optional properties stay absent (no key: undefined)', () => {
    const clone = createCloneExactShape<{a: string; b?: number}>();
    const out = clone({a: 'x', extra: 9} as unknown as {a: string; b?: number});
    expect(out).toEqual({a: 'x'});
    expect('b' in out).toBe(false);
  });

  it('rebuilds nested objects and drops nested extras', () => {
    interface User {
      name: string;
      address: {street: string; city: string};
    }
    const clone = createCloneExactShape<User>();
    const input = {name: 'jane', address: {street: '10', city: 'sf', extra: true}};
    const out = clone(input as unknown as User);
    expect(out).toEqual({name: 'jane', address: {street: '10', city: 'sf'}});
    expect(out.address).not.toBe(input.address);
    expect((input.address as Record<string, unknown>).extra).toBe(true);
  });

  it('rebuilds arrays of objects element-wise', () => {
    const clone = createCloneExactShape<Array<{a: string}>>();
    const input = [
      {a: 'x', extra: 1},
      {a: 'y', extra: 2},
    ];
    const out = clone(input as unknown as Array<{a: string}>);
    expect(out).toEqual([{a: 'x'}, {a: 'y'}]);
    expect(input[0]).toEqual({a: 'x', extra: 1});
  });

  it('shares arrays of atomics by reference (nothing strippable inside)', () => {
    const clone = createCloneExactShape<{tags: string[]}>();
    const input = {tags: ['a', 'b']};
    const out = clone(input);
    expect(out.tags).toBe(input.tags);
  });

  it('is a passthrough when the schema is an index signature over atomics', () => {
    const clone = createCloneExactShape<{[key: string]: number}>();
    const input = {a: 1, b: 2, anyOther: 3};
    expect(clone(input)).toBe(input);
  });

  it('index signature over objects: copies every key, stripping inside values', () => {
    const clone = createCloneExactShape<{[key: string]: {a: string}}>();
    const input = {k1: {a: 'x', extra: 1}, k2: {a: 'y'}};
    const out = clone(input as unknown as {[key: string]: {a: string}});
    expect(out).toEqual({k1: {a: 'x'}, k2: {a: 'y'}});
    expect(out).not.toBe(input);
  });

  it('preserves Date instances by reference (no key-tracked positions)', () => {
    const clone = createCloneExactShape<{at: Date; note: string}>();
    const at = new Date('2021-05-06T07:08:09.000Z');
    const out = clone({at, note: 'n', extra: 1} as unknown as {at: Date; note: string});
    expect(out).toEqual({at, note: 'n'});
    expect(out.at).toBe(at);
  });

  it('rebuilds a Map with object values, stripping inside', () => {
    const clone = createCloneExactShape<Map<string, {a: string}>>();
    const m = new Map<string, unknown>([['k1', {a: 'x', extra: 'gone'}]]);
    const out = clone(m as Map<string, {a: string}>);
    expect(out).toBeInstanceOf(Map);
    expect(out).not.toBe(m);
    expect(out.get('k1')).toEqual({a: 'x'});
    // input untouched
    expect(m.get('k1')).toEqual({a: 'x', extra: 'gone'});
  });

  it('shares a Map of atomics by reference', () => {
    const clone = createCloneExactShape<Map<string, number>>();
    const m = new Map([['k', 1]]);
    expect(clone(m)).toBe(m);
  });

  it('clones a class instance preserving its prototype (instanceof + methods survive)', () => {
    class Point {
      x = 0;
      y = 0;
      len(): number {
        return Math.hypot(this.x, this.y);
      }
    }
    const clone = createCloneExactShape<Point>();
    const input = new Point();
    input.x = 3;
    input.y = 4;
    (input as unknown as Record<string, unknown>).extra = 'gone';
    const out = clone(input);
    expect(out).not.toBe(input);
    expect(out).toBeInstanceOf(Point);
    expect(out.x).toBe(3);
    expect(out.y).toBe(4);
    expect(out.len()).toBe(5); // prototype method works on the clone
    expect('extra' in out).toBe(false); // own extra dropped
    expect((input as unknown as Record<string, unknown>).extra).toBe('gone'); // input untouched
  });

  it('rebuilds a Set of objects, stripping elements', () => {
    const clone = createCloneExactShape<Set<{a: string}>>();
    const inner = {a: 'x', extra: 'gone'};
    const s = new Set([inner]) as unknown as Set<{a: string}>;
    const out = clone(s);
    expect(out).toBeInstanceOf(Set);
    expect(out).not.toBe(s);
    expect([...out][0]).toEqual({a: 'x'});
    expect(inner).toEqual({a: 'x', extra: 'gone'});
  });

  it('rebuilds tuples positionally when a slot carries an object', () => {
    const clone = createCloneExactShape<Array<[string, {a: number}]>>();
    const input = [['x', {a: 1, extra: 9}]] as unknown as Array<[string, {a: number}]>;
    const out = clone(input);
    expect(out).toEqual([['x', {a: 1}]]);
  });

  it('composes with validate for the parseSafe flow', () => {
    interface Payload {
      id: number;
      nested: {tag: string};
    }
    const validate = createValidate<Payload>();
    const clone = createCloneExactShape<Payload>();
    const parseSafe = (v: unknown): Payload => {
      if (!validate(v)) throw new Error('wrong type');
      return clone(v as Payload);
    };
    const dirty = {id: 1, nested: {tag: 't', extra: 1}, evil: true};
    expect(parseSafe(dirty)).toEqual({id: 1, nested: {tag: 't'}});
    expect(() => parseSafe({id: 'nope'})).toThrow();
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

  it('collects multiple errors when many unknown keys present', () => {
    const validate = createUnknownKeyErrors<{a: string}>();
    const errors = validate({a: 'x', extra1: 1, extra2: 2});
    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.path[0]).sort()).toEqual(['extra1', 'extra2']);
    expect(errors.every((e) => e.expected === 'never')).toBe(true);
  });
});

describe('nested unknown-keys cases (hasUnknownKeys)', () => {
  interface User {
    name: string;
    address: {street: string; city: string};
  }

  it('detects unknowns in nested object', () => {
    const has = createHasUnknownKeys<User>();
    expect(has({name: 'jane', address: {street: '10', city: 'sf', extra: true}})).toBe(true);
  });

  it('returns false for arrays of objects without extras', () => {
    const has = createHasUnknownKeys<Array<{a: string}>>();
    expect(has([{a: 'x'}, {a: 'y'}])).toBe(false);
  });

  it('returns true when an array element has an extra key', () => {
    const has = createHasUnknownKeys<Array<{a: string}>>();
    expect(has([{a: 'x'}, {a: 'y', extra: 1}])).toBe(true);
  });

  it('returns false when the schema has an index signature (any key allowed)', () => {
    const has = createHasUnknownKeys<{[key: string]: number}>();
    expect(has({a: 1, b: 2, anyOther: 3})).toBe(false);
  });

  it('reports unknown keys on a tuple inside an array', () => {
    const has = createHasUnknownKeys<Array<[string, {a: number}]>>();
    expect(
      has([
        ['x', {a: 1}],
        ['y', {a: 2, extra: 1}],
      ])
    ).toBe(true);
  });

  it('default ignores the checkNonRTProps option for a RT-only schema', () => {
    const has = createHasUnknownKeys<{a: string}>();
    expect(has({a: 'x'}, {checkNonRTProps: true})).toBe(false);
    expect(has({a: 'x', extra: 1}, {checkNonRTProps: true})).toBe(true);
  });
});

// ============================================================================
// Union types — the merged-allowlist semantic (has / keyErrors)
// ============================================================================
//
// For a union `{a: string} | {b: number}` the declared key set is the UNION
// of every object member's declared property names. hasUnknownKeys and
// unknownKeyErrors flag/report anything outside that set.
//
// cloneExactShape deliberately does NOT support object-bearing unions in v1:
// without runtime arm discrimination the emitter cannot know which declared
// shape to rebuild, and silently keeping unknown keys would defeat the strip
// guarantee — so the build diagnoses it (CES001) and the entry always throws.

describe('union types — has/keyErrors merged allowlist', () => {
  type Disjoint = {a: string} | {b: number};

  it('hasUnknownKeys returns false when only union-declared keys are present', () => {
    const has = createHasUnknownKeys<Disjoint>();
    expect(has({a: 'x', b: 5})).toBe(false);
  });

  it('hasUnknownKeys returns true when any undeclared key is present', () => {
    const has = createHasUnknownKeys<Disjoint>();
    expect(has({a: 'x', evil: true})).toBe(true);
  });

  it('unknownKeyErrors reports one error per undeclared key', () => {
    const errs = createUnknownKeyErrors<Disjoint>();
    const out = errs({a: 'x', evil: 'e1', stranger: 'e2'});
    expect(out).toHaveLength(2);
    expect(out.every((e) => e.expected === 'never')).toBe(true);
    const paths = out.map((e) => e.path?.[0]).sort();
    expect(paths).toEqual(['evil', 'stranger']);
  });

  it('cloneExactShape on an object-bearing union throws at factory creation (CES001 build stance)', () => {
    // Same alwaysThrow convention as e.g. `createJsonEncoder<symbol>()` — the
    // factory materializes the CES001 throwing entry instead of a clone that
    // could silently keep unknown keys.
    expect(() => createCloneExactShape<Disjoint>()).toThrow(/CES001/);
  });

  it('cloneExactShape passes atomic-only unions through by reference', () => {
    const clone = createCloneExactShape<string | number>();
    expect(clone('hello')).toBe('hello');
    expect(clone(42)).toBe(42);
  });
});

// ============================================================================
// Map<K, V> and Set<T> — iterable unknown-keys (has / keyErrors)
// ============================================================================

interface SmallObject {
  a: string;
  b: number;
}

describe('iterables — Map<K, V> unknown-keys', () => {
  it('hasUnknownKeys: false when no inner object carries extras', () => {
    const has = createHasUnknownKeys<Map<string, SmallObject>>();
    const m = new Map<string, SmallObject>([
      ['k1', {a: 'x', b: 1}],
      ['k2', {a: 'y', b: 2}],
    ]);
    expect(has(m)).toBe(false);
  });

  it('hasUnknownKeys: true when an inner value object has an extra key', () => {
    const has = createHasUnknownKeys<Map<string, SmallObject>>();
    const m = new Map<string, unknown>([
      ['k1', {a: 'x', b: 1, extra: 'gone'}],
      ['k2', {a: 'y', b: 2}],
    ]);
    expect(has(m as Map<string, SmallObject>)).toBe(true);
  });

  it('unknownKeyErrors: empty when no inner extras', () => {
    const errs = createUnknownKeyErrors<Map<string, SmallObject>>();
    const m = new Map<string, SmallObject>([['k1', {a: 'x', b: 1}]]);
    expect(errs(m)).toEqual([]);
  });

  it('unknownKeyErrors: reports per-entry unknown key with path', () => {
    const errs = createUnknownKeyErrors<Map<string, SmallObject>>();
    const m = new Map<string, unknown>([['k1', {a: 'x', b: 1, extra: 'gone'}]]);
    const out = errs(m as Map<string, SmallObject>);
    expect(out).toHaveLength(1);
    expect(out[0].expected).toBe('never');
    expect(out[0].path).toContain('extra');
  });
});

describe('iterables — Set<T> unknown-keys', () => {
  it('hasUnknownKeys: false when no element object carries extras', () => {
    const has = createHasUnknownKeys<Set<SmallObject>>();
    const s = new Set<SmallObject>([{a: 'x', b: 1}]);
    expect(has(s)).toBe(false);
  });

  it('hasUnknownKeys: true when an element object has an extra key', () => {
    const has = createHasUnknownKeys<Set<SmallObject>>();
    const s: Set<SmallObject> = new Set([{a: 'x', b: 1, extra: 'gone'} as SmallObject]);
    expect(has(s)).toBe(true);
  });

  it('unknownKeyErrors: reports unknown keys on elements', () => {
    const errs = createUnknownKeyErrors<Set<SmallObject>>();
    const s = new Set([{a: 'x', b: 1, extra: 'gone'} as SmallObject]);
    const out = errs(s);
    expect(out).toHaveLength(1);
    expect(out[0].expected).toBe('never');
    expect(out[0].path).toContain('extra');
  });
});
