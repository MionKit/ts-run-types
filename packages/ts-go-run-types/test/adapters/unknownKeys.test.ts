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

describe('index-signature & function-typed property cases', () => {
  it('hasUnknownKeys returns false when the schema has an index signature (any key allowed)', () => {
    const has = createHasUnknownKeys<{[key: string]: number}>();
    expect(has({a: 1, b: 2, anyOther: 3})).toBe(false);
  });

  it('stripUnknownKeys is a passthrough when the schema has an index signature', () => {
    const strip = createStripUnknownKeys<{[key: string]: number}>();
    const input = {a: 1, b: 2, anyOther: 3};
    strip(input);
    expect(input).toEqual({a: 1, b: 2, anyOther: 3});
  });

  it('hasUnknownKeys reports unknown keys on a tuple inside an array', () => {
    const has = createHasUnknownKeys<Array<[string, {a: number}]>>();
    expect(
      has([
        ['x', {a: 1}],
        ['y', {a: 2, extra: 1}],
      ])
    ).toBe(true);
  });

  it('unknownKeyErrors collects multiple errors when many unknown keys present', () => {
    const validate = createUnknownKeyErrors<{a: string}>();
    const errors = validate({a: 'x', extra1: 1, extra2: 2});
    expect(errors).toHaveLength(2);
    expect(errors.map((e) => e.path[0]).sort()).toEqual(['extra1', 'extra2']);
    expect(errors.every((e) => e.expected === 'never')).toBe(true);
  });

  it('hasUnknownKeys default ignores the checkNonJitProps option for a JIT-only schema', () => {
    // No function-typed children, so checkNonJitProps has no effect here —
    // verifies the option threading doesn't break the basic case.
    const has = createHasUnknownKeys<{a: string}>();
    expect(has({a: 'x'}, {checkNonJitProps: true})).toBe(false);
    expect(has({a: 'x', extra: 1}, {checkNonJitProps: true})).toBe(true);
  });
});

// ============================================================================
// Union types — the merged-allowlist semantic
// ============================================================================
//
// For a union `{a: string} | {b: number}` the declared key set is the
// UNION of every member's declared property names — `{a, b}`. The four
// functions strip / report / flag anything outside that set.
//
// The "loose" semantic: a key declared on at least one member survives
// even when the runtime value's shape matches a different member that
// doesn't declare it. Matches the flat encoder's existing structural
// identity (which collapsed member-identity at the wire).
//
// REGRESSION GUARD: prior to consolidating the union arm onto
// FlatLayout, the four emitters used naïve per-member CompileChild
// dispatch — concatenating each member's emit produced "delete keys
// not in {a}; delete keys not in {b}", which deleted BOTH declared
// keys. These tests pin the corrected merged-allowlist behaviour.

describe('union types — strip/has/keyErrors', () => {
  type Disjoint = {a: string} | {b: number};

  it('stripUnknownKeys leaves both member-declared keys intact', () => {
    const strip = createStripUnknownKeys<Disjoint>();
    const v: Record<string, unknown> = {a: 'x', b: 5};
    strip(v);
    expect(v).toEqual({a: 'x', b: 5});
  });

  it('stripUnknownKeys deletes only the truly undeclared key', () => {
    const strip = createStripUnknownKeys<Disjoint>();
    const v: Record<string, unknown> = {a: 'x', b: 5, evil: 'sneaky'};
    strip(v);
    expect(v).toEqual({a: 'x', b: 5});
  });

  it('stripUnknownKeys handles overlapping-key unions correctly', () => {
    type Overlap = {a: string; b: number} | {a: bigint; c: boolean};
    const strip = createStripUnknownKeys<Overlap>();
    const v: Record<string, unknown> = {a: 'x', b: 5, c: true, evil: 1};
    strip(v);
    expect(v).toEqual({a: 'x', b: 5, c: true});
  });

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

  it('unknownKeysToUndefined sets undeclared union keys to undefined', () => {
    // Public uku now does the merged-allowlist strip on raw objects.
    // Safe because the decoder pipeline switched to ukuWire (which
    // handles the wire-format wrapper-peel separately) — uku no
    // longer sees wire-shape arrays.
    const uku = createUnknownKeysToUndefined<Disjoint>();
    const v: Record<string, unknown> = {a: 'x', evil: 'e'};
    uku(v);
    expect(v).toEqual({a: 'x', evil: undefined});
  });

  it('discriminated-union: loose semantic — non-discriminated keys survive', () => {
    type DU = {kind: 'a'; x: string} | {kind: 'b'; y: number};
    const strip = createStripUnknownKeys<DU>();
    // y from member-B in a kind:'a' payload survives because y IS in the
    // merged allowlist {kind, x, y}. Documented loose semantic.
    const v: Record<string, unknown> = {kind: 'a', x: 'foo', y: 99};
    strip(v);
    expect(v).toEqual({kind: 'a', x: 'foo', y: 99});
  });

  it('discriminated-union: truly extra keys still get stripped', () => {
    type DU = {kind: 'a'; x: string} | {kind: 'b'; y: number};
    const strip = createStripUnknownKeys<DU>();
    const v: Record<string, unknown> = {kind: 'a', x: 'foo', extra: 'gone'};
    strip(v);
    expect(v).toEqual({kind: 'a', x: 'foo'});
  });

  it('mixed-atomic union: strip is the merged-allowlist on the object branch', () => {
    type Mixed = string | {a: number};
    const strip = createStripUnknownKeys<Mixed>();
    const v: Record<string, unknown> = {a: 5, evil: 'gone'};
    strip(v);
    expect(v).toEqual({a: 5});
  });

  it('union with index-sig member: family is a no-op (carve-out)', () => {
    type IxUnion = {[k: string]: number} | {b: boolean};
    const strip = createStripUnknownKeys<IxUnion>();
    const v: Record<string, unknown> = {b: true, anything: 99};
    strip(v);
    // Carve-out semantic: every key is "declared" via the index pattern
    // of the indexed member, so the merged-allowlist approach is skipped.
    expect(v).toEqual({b: true, anything: 99});
  });
});
