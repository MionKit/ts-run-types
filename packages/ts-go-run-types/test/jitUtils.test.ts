/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {getJitFnCaches} from '../src/jit/jitUtils.ts';
import type {JitFunctionsCache, PureFunctionsCache} from '../src/jit/types.ts';

const {jitFnsCache, pureFnsCache} = getJitFnCaches() as {jitFnsCache: JitFunctionsCache; pureFnsCache: PureFunctionsCache};

/**
 * Loads compiled JIT and pure functions into the respective caches.
 * Both caches are flat single-key maps now; the helper merges without
 * overwriting existing entries.
 */
function loadJitCachesCaches(caches: {jitFnsCache?: JitFunctionsCache; pureFnsCache?: PureFunctionsCache}) {
  if (caches.jitFnsCache) {
    for (const [key, value] of Object.entries(caches.jitFnsCache)) {
      if (!(key in jitFnsCache)) {
        jitFnsCache[key] = value;
      }
    }
  }
  if (caches.pureFnsCache) {
    for (const [key, value] of Object.entries(caches.pureFnsCache)) {
      if (!(key in pureFnsCache)) {
        pureFnsCache[key] = value;
      }
    }
  }
}

describe('jitUtils', () => {
  it('should load compiled JIT functions cache from cache data', () => {
    const testJitCache: JitFunctionsCache = {
      testJitFn: {
        typeName: 'TestType',
        fnID: 'isType',
        jitFnHash: 'testJitFn',
        args: {vλl: 'v'},
        defaultParamValues: {vλl: ''},
        code: 'return true;',
        jitDependencies: [],
        pureFnDependencies: [],
        fn: () => true,
        createJitFn: () => () => true,
      },
    };

    const initialCaches = getJitFnCaches();
    const initialJitCacheSize = Object.keys(initialCaches.jitFnsCache).length;

    loadJitCachesCaches({jitFnsCache: testJitCache});

    const updatedCaches = getJitFnCaches();
    const updatedJitCacheSize = Object.keys(updatedCaches.jitFnsCache).length;

    expect(updatedJitCacheSize).toBeGreaterThan(initialJitCacheSize);
    expect(updatedCaches.jitFnsCache).toHaveProperty('testJitFn');
  });

  it('should load compiled pure functions cache from cache data', () => {
    // Flat cache: keys are composite `"<namespace>::<fnName>"` strings.
    const testPureCache: PureFunctionsCache = {
      'testNamespace::testPureFn': {
        namespace: 'testNamespace',
        paramNames: ['a', 'b'],
        fnName: 'testPureFn',
        bodyHash: 'testPureFn_hash',
        code: 'return (a, b) => a + b;',
        pureFnDependencies: [],
        createPureFn: () => (a: number, b: number) => a + b,
        fn: (a: number, b: number) => a + b,
      },
    };

    const initialCaches = getJitFnCaches();
    const initialPureCacheSize = Object.keys(initialCaches.pureFnsCache).length;

    loadJitCachesCaches({pureFnsCache: testPureCache});

    const updatedCaches = getJitFnCaches();
    const updatedPureCacheSize = Object.keys(updatedCaches.pureFnsCache).length;

    expect(updatedPureCacheSize).toBeGreaterThan(initialPureCacheSize);
    expect(updatedCaches.pureFnsCache).toHaveProperty('testNamespace::testPureFn');
  });

  it('should handle empty cache data gracefully', () => {
    expect(() => loadJitCachesCaches({})).not.toThrow();
    expect(() => loadJitCachesCaches({jitFnsCache: {}})).not.toThrow();
    expect(() => loadJitCachesCaches({pureFnsCache: {}})).not.toThrow();
  });

  it('should not overwrite existing cache entries', () => {
    const firstCache: JitFunctionsCache = {
      testFn1: {
        typeName: 'TestType1',
        fnID: 'isType',
        jitFnHash: 'testFn1',
        args: {vλl: 'v'},
        defaultParamValues: {vλl: ''},
        code: 'return true;',
        jitDependencies: [],
        pureFnDependencies: [],
        fn: () => true,
        createJitFn: () => () => true,
      },
    };

    const secondCache: JitFunctionsCache = {
      testFn1: {
        // Same key as first cache - should NOT overwrite
        typeName: 'TestType2',
        fnID: 'isType',
        jitFnHash: 'testFn1',
        args: {vλl: 'v'},
        defaultParamValues: {vλl: ''},
        code: 'return false;',
        jitDependencies: [],
        pureFnDependencies: [],
        fn: () => false,
        createJitFn: () => () => false,
      },
      testFn2: {
        // New key - should be added
        typeName: 'TestType2',
        fnID: 'isType',
        jitFnHash: 'testFn2',
        args: {vλl: 'v'},
        defaultParamValues: {vλl: ''},
        code: 'return false;',
        jitDependencies: [],
        pureFnDependencies: [],
        fn: () => false,
        createJitFn: () => () => false,
      },
    };

    // Load first cache
    loadJitCachesCaches({jitFnsCache: firstCache});

    const cachesAfterFirst = getJitFnCaches();
    expect(cachesAfterFirst.jitFnsCache).toHaveProperty('testFn1');
    expect(cachesAfterFirst.jitFnsCache.testFn1?.typeName).toBe('TestType1');

    // Load second cache - should not overwrite testFn1 but should add testFn2
    loadJitCachesCaches({jitFnsCache: secondCache});

    const cachesAfterSecond = getJitFnCaches();
    expect(cachesAfterSecond.jitFnsCache).toHaveProperty('testFn1');
    expect(cachesAfterSecond.jitFnsCache).toHaveProperty('testFn2');
    expect(cachesAfterSecond.jitFnsCache.testFn1?.typeName).toBe('TestType1');
    expect(cachesAfterSecond.jitFnsCache.testFn2?.typeName).toBe('TestType2');
  });
});
