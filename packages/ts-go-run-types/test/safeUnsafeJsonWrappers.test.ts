// End-to-end acceptance tests for the four JSON serialise/parse
// wrappers — `createSafeJsonStringify`, `createUnsafeJsonStringify`,
// `createSafeJsonParse`, `createUnsafeJsonParse`. Drives the FULL
// vite-plugin pipeline (transform → precompiled factories → runtime
// dispatch) for both happy-path types and every divergence kind
// documented in serialization-suite.ts EXTRA_PARAMS.
//
// The two paths differ in their extras semantics. The contract:
//
//   - Unsafe: `prepareForJson + JSON.stringify`. Extras pass through
//     prepareForJson untouched; JSON.stringify includes JSON-
//     compatible extras, throws on bigint extras, silently drops
//     symbol-/function-valued extras.
//   - Safe: `stripUnknownKeys + prepareForJson + JSON.stringify`.
//     Extras stripped before serialise — output contains only
//     declared keys regardless of what's on `v`.
//
// Per-test layout: a single round-trip pair invocation per divergence
// kind, asserting both halves of the contract. Smoke tests cover the
// happy path (atomic + simple object) to confirm the compose path
// behaves identically to the underlying primitives when no extras
// are present.

import {describe, test, expect} from 'vitest';
import {
  createSafeJsonStringify,
  createUnsafeJsonStringify,
  createSafeJsonParse,
  createUnsafeJsonParse,
  SafeJsonParseError,
} from '@mionjs/ts-go-run-types';

describe('JSON wrappers — happy path (no extras)', () => {
  test('string round-trips on both paths', () => {
    const safeStr = createSafeJsonStringify<string>();
    const unsafeStr = createUnsafeJsonStringify<string>();
    const safeP = createSafeJsonParse<string>();
    const unsafeP = createUnsafeJsonParse<string>();
    expect(safeP(safeStr('hello'))).toBe('hello');
    expect(unsafeP(unsafeStr('hello'))).toBe('hello');
  });

  test('object with bigint declared field round-trips on both paths', () => {
    type T = {n: string; b: bigint};
    const safeStr = createSafeJsonStringify<T>();
    const unsafeStr = createUnsafeJsonStringify<T>();
    const safeP = createSafeJsonParse<T>();
    const unsafeP = createUnsafeJsonParse<T>();
    const input: T = {n: 'foo', b: 123n};
    expect(safeP(safeStr({...input}))).toEqual(input);
    expect(unsafeP(unsafeStr({...input}))).toEqual(input);
  });

  test('Date is encoded as ISO string and restored as Date on both paths', () => {
    type T = {date: Date};
    const safeStr = createSafeJsonStringify<T>();
    const unsafeStr = createUnsafeJsonStringify<T>();
    const safeP = createSafeJsonParse<T>();
    const unsafeP = createUnsafeJsonParse<T>();
    const date = new Date('2000-08-06T02:13:00.000Z');
    expect(safeP(safeStr({date})).date.toISOString()).toBe(date.toISOString());
    expect(unsafeP(unsafeStr({date})).date.toISOString()).toBe(date.toISOString());
  });
});

describe('JSON wrappers — extras pass-through (JSON-compatible)', () => {
  type T = {declared: string};
  const inputWithExtra = {declared: 'x', extra: 'hello'};

  test('unsafe preserves the extra through round-trip', () => {
    const unsafeStr = createUnsafeJsonStringify<T>();
    const unsafeP = createUnsafeJsonParse<T>();
    const restored = unsafeP(unsafeStr({...inputWithExtra})) as Record<string, unknown>;
    expect(restored).toEqual({declared: 'x', extra: 'hello'});
  });

  test('safe strips the extra before serialise', () => {
    const safeStr = createSafeJsonStringify<T>();
    const safeP = createSafeJsonParse<T>();
    const restored = safeP(safeStr({...inputWithExtra})) as Record<string, unknown>;
    expect(restored).toEqual({declared: 'x'});
  });
});

describe('JSON wrappers — bigint extra divergence', () => {
  type T = {declared: string};
  const inputWithBigintExtra = {declared: 'x', extra: 123n};

  test('unsafe throws at JSON.stringify (bigint extra not serialisable)', () => {
    const unsafeStr = createUnsafeJsonStringify<T>();
    expect(() => unsafeStr({...inputWithBigintExtra})).toThrow(/BigInt/);
  });

  test('safe strips the bigint extra and succeeds', () => {
    const safeStr = createSafeJsonStringify<T>();
    const safeP = createSafeJsonParse<T>();
    const restored = safeP(safeStr({...inputWithBigintExtra})) as Record<string, unknown>;
    expect(restored).toEqual({declared: 'x'});
  });
});

describe('JSON wrappers — symbol/function extras (drop on both paths)', () => {
  type T = {declared: string};

  test('symbol-valued extra → both paths produce declared-only output', () => {
    const safeStr = createSafeJsonStringify<T>();
    const unsafeStr = createUnsafeJsonStringify<T>();
    const safeP = createSafeJsonParse<T>();
    const unsafeP = createUnsafeJsonParse<T>();
    const inputSym = {declared: 'x', sym: Symbol('extra')};
    expect(safeP(safeStr({...inputSym}))).toEqual({declared: 'x'});
    expect(unsafeP(unsafeStr({...inputSym}))).toEqual({declared: 'x'});
  });

  test('function-valued extra → both paths produce declared-only output', () => {
    const safeStr = createSafeJsonStringify<T>();
    const unsafeStr = createUnsafeJsonStringify<T>();
    const safeP = createSafeJsonParse<T>();
    const unsafeP = createUnsafeJsonParse<T>();
    const inputFn = {declared: 'x', fn: () => 0};
    expect(safeP(safeStr({...inputFn}))).toEqual({declared: 'x'});
    expect(unsafeP(unsafeStr({...inputFn}))).toEqual({declared: 'x'});
  });
});

describe('JSON wrappers — nested extras in declared child', () => {
  type T = {outer: {declared: string}};
  const nestedInput = {outer: {declared: 'x', extra: 'y'}};

  test('unsafe preserves nested extra through round-trip', () => {
    const unsafeStr = createUnsafeJsonStringify<T>();
    const unsafeP = createUnsafeJsonParse<T>();
    const restored = unsafeP(unsafeStr({outer: {...nestedInput.outer}})) as {outer: Record<string, unknown>};
    expect(restored).toEqual({outer: {declared: 'x', extra: 'y'}});
  });

  test('safe strips nested extra', () => {
    const safeStr = createSafeJsonStringify<T>();
    const safeP = createSafeJsonParse<T>();
    const restored = safeP(safeStr({outer: {...nestedInput.outer}})) as {outer: Record<string, unknown>};
    expect(restored).toEqual({outer: {declared: 'x'}});
  });
});

describe('createSafeJsonParse — onUnknownKeys option', () => {
  type T = {declared: string};

  test("default ('strip') silently removes extras from the parsed value", () => {
    const parse = createSafeJsonParse<T>();
    const restored = parse('{"declared":"x","extra":"y"}') as Record<string, unknown>;
    expect(restored).toEqual({declared: 'x'});
  });

  test("'strip' explicitly behaves the same as the default", () => {
    // Options live in the 2nd positional slot (val? is 1st, id? is
    // 3rd) — mirrors the createIsType signature shape.
    const parse = createSafeJsonParse<T>(undefined, {onUnknownKeys: 'strip'});
    const restored = parse('{"declared":"x","extra":"y"}') as Record<string, unknown>;
    expect(restored).toEqual({declared: 'x'});
  });

  test("'error' throws SafeJsonParseError when an unknown key is present", () => {
    const parse = createSafeJsonParse<T>(undefined, {onUnknownKeys: 'error'});
    let caught: unknown;
    try {
      parse('{"declared":"x","extra":"y"}');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SafeJsonParseError);
    expect((caught as SafeJsonParseError).errors.length).toBeGreaterThan(0);
  });

  test("'error' succeeds when no unknown keys are present", () => {
    const parse = createSafeJsonParse<T>(undefined, {onUnknownKeys: 'error'});
    const restored = parse('{"declared":"x"}') as T;
    expect(restored).toEqual({declared: 'x'});
  });

  test('strip and error modes are cached independently per id', () => {
    // Both factories use the same RuntypeId<T> but different cache
    // keys (id + ':' + onUnknownKeys) — calling them back-to-back
    // must produce DIFFERENT closures with different behavior.
    const stripParse = createSafeJsonParse<T>(undefined, {onUnknownKeys: 'strip'});
    const errorParse = createSafeJsonParse<T>(undefined, {onUnknownKeys: 'error'});
    expect(stripParse).not.toBe(errorParse);
    expect(stripParse('{"declared":"x","extra":"y"}')).toEqual({declared: 'x'});
    expect(() => errorParse('{"declared":"x","extra":"y"}')).toThrow(SafeJsonParseError);
  });
});

describe('JSON wrappers — mutation surface', () => {
  type T = {declared: string};

  test('safe stringify mutates the input (strip + prepare both write through)', () => {
    const safeStr = createSafeJsonStringify<T>();
    const input = {declared: 'x', extra: 'y'};
    safeStr(input);
    // strip ran on the original input, so the extra is gone.
    expect(Object.keys(input)).toEqual(['declared']);
  });

  test('unsafe stringify mutates the input via prepareForJson (extras stay)', () => {
    type B = {n: bigint};
    const unsafeStr = createUnsafeJsonStringify<B>();
    const input: B = {n: 123n};
    unsafeStr(input);
    // prepareForJson rebinds the bigint to its decimal string in place.
    expect(typeof (input as unknown as {n: unknown}).n).toBe('string');
    expect((input as unknown as {n: unknown}).n).toBe('123');
  });
});
