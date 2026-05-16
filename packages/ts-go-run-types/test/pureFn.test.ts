/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import type {CompiledPureFunction} from '../src/jit/types.ts';
import {JITUtils, getJitUtils, pureFnKey} from '../src/jit/jitUtils.ts';
import {registerPureFnFactory} from '../src/jit/pureFn.ts';

const TEST_NAMESPACE = 'test';

function getCompiledPureFn(namespace: string, fnName: string): CompiledPureFunction | undefined {
  return getJitUtils().getCompiledPureFn(pureFnKey(namespace, fnName));
}

// 14-char base64url — what the Go binary's BodyHash emits.
const BODY_HASH_REGEX = /^[A-Za-z0-9_-]{14}$/;

it('register and get pure function with extracted data', () => {
  type StringParams = {
    isLowercase?: boolean;
    isNumeric?: boolean;
  };
  registerPureFnFactory(TEST_NAMESPACE, 'stringPureFn', function () {
    const isNumericRegexp = /^[0-9]+$/;
    return function is_s(s: string, p: StringParams): boolean {
      if (p.isLowercase && s !== s.toLowerCase()) return false;
      if (p.isNumeric && !isNumericRegexp.test(s)) return false;
      return true;
    };
  });
  const restoredFn = getJitUtils().getPureFn(pureFnKey(TEST_NAMESPACE, 'stringPureFn')) as (
    s: string,
    p: StringParams
  ) => boolean;
  expect(restoredFn).toBeDefined();
  expect(restoredFn).toBeInstanceOf(Function);
  expect(restoredFn('a', {isLowercase: true})).toBe(true);
  expect(restoredFn('A', {isLowercase: true})).toBe(false);
});

it('throws when no parsed-fn entry is found', () => {
  // The Go binary only emits entries for source files it walks. Tests like
  // this one — which dynamically constructs a key the binary never saw —
  // should throw on lookup.
  expect(() =>
    registerPureFnFactory(TEST_NAMESPACE + '_unscanned_' + Math.random(), 'noSuchFn', function () {
      return function noop() {};
    })
  ).toThrow(/no parsed-fn data/);
});

it('populates bodyHash, paramNames, and code from extracted data', () => {
  registerPureFnFactory(TEST_NAMESPACE, 'metadataTestFn', function () {
    return function test_fn(val: string): string {
      return val.toUpperCase();
    };
  });
  const compiled = getCompiledPureFn(TEST_NAMESPACE, 'metadataTestFn');
  expect(compiled).toBeDefined();
  expect(compiled?.bodyHash).toMatch(BODY_HASH_REGEX);
  expect(compiled?.paramNames).toEqual([]);
  expect(typeof compiled?.code).toBe('string');
  expect(compiled?.code.length).toBeGreaterThan(0);
  expect(compiled?.fnName).toBe('metadataTestFn');
  expect(compiled?.namespace).toBe(TEST_NAMESPACE);
});

it('auto-detects dependencies via proxy when factory calls getPureFn', () => {
  type Params = {
    isA?: boolean;
    isB?: boolean;
  };
  registerPureFnFactory(TEST_NAMESPACE, 'pureFunctionA', function (_jUtils: JITUtils) {
    return function is_a(s: string, p: Params): boolean {
      if (p.isA) return s.includes('a');
      return true;
    };
  });
  registerPureFnFactory(TEST_NAMESPACE, 'pureFunctionB', function (jUtils: JITUtils) {
    const isA = jUtils.getPureFn('test::pureFunctionA') as (s: string, p: Params) => boolean;
    return function is_b(s: string, p: Params): boolean {
      const isAResult = isA(s, p);
      if (p.isB) return isAResult && s.includes('b');
      return isAResult;
    };
  });
  const compiledIsA = getCompiledPureFn(TEST_NAMESPACE, 'pureFunctionA');
  const compiledIsB = getCompiledPureFn(TEST_NAMESPACE, 'pureFunctionB');
  expect(compiledIsA).toBeDefined();
  expect(compiledIsB).toBeDefined();
  expect(compiledIsA?.fn).toBeDefined();
  expect(compiledIsB?.fn).toBeDefined();
  expect(compiledIsB?.pureFnDependencies?.includes('pureFunctionA')).toBeTruthy();
  expect(compiledIsA?.pureFnDependencies).toBeUndefined();
  expect(compiledIsA?.namespace).toBe(TEST_NAMESPACE);
  expect(compiledIsB?.namespace).toBe(TEST_NAMESPACE);
});

describe('arrow function factory functions', () => {
  it('should register and get arrow function pure factory with parentheses', () => {
    type StringParams = {
      isLowercase?: boolean;
    };
    registerPureFnFactory(TEST_NAMESPACE, 'arrowWithParens', (_jUtils: JITUtils) => {
      return function is_s(s: string, p: StringParams): boolean {
        if (p.isLowercase) return s === s.toLowerCase();
        return true;
      };
    });
    const restoredFn = getJitUtils().getPureFn(pureFnKey(TEST_NAMESPACE, 'arrowWithParens')) as (
      s: string,
      p: StringParams
    ) => boolean;
    expect(restoredFn).toBeDefined();
    expect(restoredFn).toBeInstanceOf(Function);
    expect(restoredFn('abc', {isLowercase: true})).toBe(true);
    expect(restoredFn('ABC', {isLowercase: true})).toBe(false);
  });

  it('should register arrow function with expression body', () => {
    type NumParams = {
      multiplier?: number;
    };
    registerPureFnFactory(
      TEST_NAMESPACE,
      'arrowExpression',
      (_jUtils: JITUtils) =>
        function multiply(n: number, p: NumParams): number {
          return n * (p.multiplier ?? 1);
        }
    );
    const restoredFn = getJitUtils().getPureFn(pureFnKey(TEST_NAMESPACE, 'arrowExpression')) as (
      n: number,
      p: NumParams
    ) => number;
    expect(restoredFn).toBeDefined();
    expect(restoredFn).toBeInstanceOf(Function);
    expect(restoredFn(5, {multiplier: 3})).toBe(15);
    expect(restoredFn(5, {})).toBe(5);
  });

  it('should auto-detect dependencies for arrow functions', () => {
    type Params = {
      isA?: boolean;
      isB?: boolean;
    };
    registerPureFnFactory(TEST_NAMESPACE, 'arrowFnA', (_jUtils: JITUtils) => {
      return function is_a(s: string, p: Params): boolean {
        if (p.isA) return s.includes('a');
        return true;
      };
    });
    registerPureFnFactory(TEST_NAMESPACE, 'arrowFnB', (jUtils: JITUtils) => {
      const isA = jUtils.getPureFn('test::arrowFnA') as (s: string, p: Params) => boolean;
      return function is_b(s: string, p: Params): boolean {
        const isAResult = isA(s, p);
        if (p.isB) return isAResult && s.includes('b');
        return isAResult;
      };
    });
    const compiledA = getCompiledPureFn(TEST_NAMESPACE, 'arrowFnA');
    const compiledB = getCompiledPureFn(TEST_NAMESPACE, 'arrowFnB');
    expect(compiledA).toBeDefined();
    expect(compiledB).toBeDefined();
    expect(compiledB?.pureFnDependencies?.includes('arrowFnA')).toBeTruthy();
    expect(compiledA?.pureFnDependencies).toBeUndefined();
  });
});
