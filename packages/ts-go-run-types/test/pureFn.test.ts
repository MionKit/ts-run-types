/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import type {CompiledPureFunction, ParsedFactoryFn} from '../src/jit/types.ts';
import {JITUtils, getJitUtils} from '../src/jit/jitUtils.ts';
import {registerPureFnFactory} from '../src/jit/pureFn.ts';

const TEST_NAMESPACE = 'test';

function getCompiledPureFn(namespace: string, fnName: string): CompiledPureFunction | undefined {
  return getJitUtils().getCompiledPureFn(namespace, fnName);
}

it('register and get pure function with pre-parsed data', async () => {
  type StringParams = {
    isLowercase?: boolean;
    isNumeric?: boolean;
  };
  /** @reflection never */
  function stringPureFn() {
    const isNumericRegexp = /^[0-9]+$/;
    return function is_s(s: string, p: StringParams): boolean {
      if (p.isLowercase && s !== s.toLowerCase()) return false;
      if (p.isNumeric && !isNumericRegexp.test(s)) return false;
      return true;
    };
  }
  const parsedFn: ParsedFactoryFn = {
    bodyHash: 'stringPureFnHash',
    paramNames: [],
    code: 'const isNumericRegexp = /^[0-9]+$/;\nreturn function is_s(s, p) {\nif (p.isLowercase && s !== s.toLowerCase()) return false;\nif (p.isNumeric && !isNumericRegexp.test(s)) return false;\nreturn true;\n};',
  };
  registerPureFnFactory(TEST_NAMESPACE, 'stringPureFn', stringPureFn, parsedFn);
  const restoredFn = getJitUtils().getPureFn(TEST_NAMESPACE, 'stringPureFn') as ReturnType<typeof stringPureFn>;
  expect(restoredFn).toBeDefined();
  expect(restoredFn).toBeInstanceOf(Function);
  expect(restoredFn?.('a', {isLowercase: true})).toBe(true);
  expect(restoredFn?.('A', {isLowercase: true})).toBe(false);
});

it('throws when parsedFn is not provided', () => {
  /** @reflection never */
  function missingParsedFn() {
    return function noop() {};
  }
  expect(() => (registerPureFnFactory as any)(TEST_NAMESPACE, 'missingParsedFn', missingParsedFn)).toThrow(
    'registerPureFnFactory requires mion vite plugin transform to inject parsedFn'
  );
});

it('uses pre-parsed bodyHash, paramNames, and code from parsedFn', () => {
  /** @reflection never */
  function metadataTestFn() {
    return function test_fn(val: string): string {
      return val.toUpperCase();
    };
  }
  const parsedFn: ParsedFactoryFn = {
    bodyHash: 'myCustomHash123',
    paramNames: [],
    code: 'return function test_fn(val) { return val.toUpperCase(); };',
  };
  registerPureFnFactory(TEST_NAMESPACE, 'metadataTestFn', metadataTestFn, parsedFn);
  const compiled = getCompiledPureFn(TEST_NAMESPACE, 'metadataTestFn');
  expect(compiled).toBeDefined();
  expect(compiled?.bodyHash).toBe('myCustomHash123');
  expect(compiled?.paramNames).toEqual([]);
  expect(compiled?.code).toBe('return function test_fn(val) { return val.toUpperCase(); };');
  expect(compiled?.fnName).toBe('metadataTestFn');
  expect(compiled?.namespace).toBe(TEST_NAMESPACE);
});

it('auto-detect dependencies via proxy when factory calls getPureFn', async () => {
  type Params = {
    isA?: boolean;
    isB?: boolean;
  };
  /** @reflection never */
  function pureFunctionA(_jUtils: JITUtils) {
    return function is_a(s: string, p: Params): boolean {
      if (p.isA) return s.includes('a');
      return true;
    };
  }
  /** @reflection never */
  function pureFunctionB(jUtils: JITUtils) {
    const isA = jUtils.getPureFn(TEST_NAMESPACE, 'pureFunctionA') as ReturnType<typeof pureFunctionA>;
    return function is_b(s: string, p: Params): boolean {
      const isAResult = isA(s, p);
      if (p.isB) return isAResult && s.includes('b');
      return isAResult;
    };
  }
  const parsedA: ParsedFactoryFn = {
    bodyHash: 'pureFnAHash',
    paramNames: ['jUtils'],
    code: 'return function is_a(s, p) { if (p.isA) return s.includes("a"); return true; };',
  };
  const parsedB: ParsedFactoryFn = {
    bodyHash: 'pureFnBHash',
    paramNames: ['jUtils'],
    code: 'const isA = jUtils.getPureFn("test", "pureFunctionA"); return function is_b(s, p) { const isAResult = isA(s, p); if (p.isB) return isAResult && s.includes("b"); return isAResult; };',
  };
  registerPureFnFactory(TEST_NAMESPACE, 'pureFunctionA', pureFunctionA, parsedA);
  registerPureFnFactory(TEST_NAMESPACE, 'pureFunctionB', pureFunctionB, parsedB);
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
    /** @reflection never */
    const arrowWithParens = (_jUtils: JITUtils) => {
      return function is_s(s: string, p: StringParams): boolean {
        if (p.isLowercase) return s === s.toLowerCase();
        return true;
      };
    };
    const parsedFn: ParsedFactoryFn = {
      bodyHash: 'arrowParensHash',
      paramNames: ['jUtils'],
      code: 'return function is_s(s, p) { if (p.isLowercase) return s === s.toLowerCase(); return true; };',
    };
    registerPureFnFactory(TEST_NAMESPACE, 'arrowWithParens', arrowWithParens, parsedFn);
    const restoredFn = getJitUtils().getPureFn(TEST_NAMESPACE, 'arrowWithParens') as ReturnType<typeof arrowWithParens>;
    expect(restoredFn).toBeDefined();
    expect(restoredFn).toBeInstanceOf(Function);
    expect(restoredFn?.('abc', {isLowercase: true})).toBe(true);
    expect(restoredFn?.('ABC', {isLowercase: true})).toBe(false);
  });

  it('should register arrow function with expression body', () => {
    type NumParams = {
      multiplier?: number;
    };
    /** @reflection never */
    const arrowExpression = (_jUtils: JITUtils) =>
      function multiply(n: number, p: NumParams): number {
        return n * (p.multiplier ?? 1);
      };
    const parsedFn: ParsedFactoryFn = {
      bodyHash: 'arrowExprHash',
      paramNames: ['jUtils'],
      code: 'return function multiply(n, p) { return n * (p.multiplier ?? 1); };',
    };
    registerPureFnFactory(TEST_NAMESPACE, 'arrowExpression', arrowExpression, parsedFn);
    const restoredFn = getJitUtils().getPureFn(TEST_NAMESPACE, 'arrowExpression') as ReturnType<typeof arrowExpression>;
    expect(restoredFn).toBeDefined();
    expect(restoredFn).toBeInstanceOf(Function);
    expect(restoredFn?.(5, {multiplier: 3})).toBe(15);
    expect(restoredFn?.(5, {})).toBe(5);
  });

  it('should auto-detect dependencies for arrow functions', () => {
    type Params = {
      isA?: boolean;
      isB?: boolean;
    };
    /** @reflection never */
    const arrowFnA = (_jUtils: JITUtils) => {
      return function is_a(s: string, p: Params): boolean {
        if (p.isA) return s.includes('a');
        return true;
      };
    };
    /** @reflection never */
    const arrowFnB = (jUtils: JITUtils) => {
      const isA = jUtils.getPureFn(TEST_NAMESPACE, 'arrowFnA') as ReturnType<typeof arrowFnA>;
      return function is_b(s: string, p: Params): boolean {
        const isAResult = isA(s, p);
        if (p.isB) return isAResult && s.includes('b');
        return isAResult;
      };
    };
    const parsedA: ParsedFactoryFn = {
      bodyHash: 'arrowFnAHash',
      paramNames: ['jUtils'],
      code: 'return function is_a(s, p) { if (p.isA) return s.includes("a"); return true; };',
    };
    const parsedB: ParsedFactoryFn = {
      bodyHash: 'arrowFnBHash',
      paramNames: ['jUtils'],
      code: 'const isA = jUtils.getPureFn("test", "arrowFnA"); return function is_b(s, p) { const isAResult = isA(s, p); if (p.isB) return isAResult && s.includes("b"); return isAResult; };',
    };
    registerPureFnFactory(TEST_NAMESPACE, 'arrowFnA', arrowFnA, parsedA);
    registerPureFnFactory(TEST_NAMESPACE, 'arrowFnB', arrowFnB, parsedB);
    const compiledA = getCompiledPureFn(TEST_NAMESPACE, 'arrowFnA');
    const compiledB = getCompiledPureFn(TEST_NAMESPACE, 'arrowFnB');
    expect(compiledA).toBeDefined();
    expect(compiledB).toBeDefined();
    expect(compiledB?.pureFnDependencies?.includes('arrowFnA')).toBeTruthy();
    expect(compiledA?.pureFnDependencies).toBeUndefined();
  });
});
