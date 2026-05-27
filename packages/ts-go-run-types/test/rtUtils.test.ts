/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {getRTFnCaches, getRTUtils} from '../src/runtypes/rtUtils.ts';
import type {RTFunctionsCache, PureFunctionsCache, RunType} from '../src/runtypes/types.ts';

const {rtFnsCache, pureFnsCache} = getRTFnCaches() as {rtFnsCache: RTFunctionsCache; pureFnsCache: PureFunctionsCache};

/**
 * Loads compiled RT and pure functions into the respective caches.
 * Both caches are flat single-key maps now; the helper merges without
 * overwriting existing entries.
 */
function loadRTCachesCaches(caches: {rtFnsCache?: RTFunctionsCache; pureFnsCache?: PureFunctionsCache}) {
  if (caches.rtFnsCache) {
    for (const [key, value] of Object.entries(caches.rtFnsCache)) {
      if (!(key in rtFnsCache)) {
        rtFnsCache[key] = value;
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

describe('rtUtils', () => {
  it('should load compiled RT functions cache from cache data', () => {
    const testRTCache: RTFunctionsCache = {
      testRTFn: {
        typeName: 'TestType',
        fnID: 'isType',
        rtFnHash: 'testRTFn',
        args: {vλl: 'v'},
        defaultParamValues: {vλl: ''},
        code: 'return true;',
        rtDependencies: [],
        pureFnDependencies: [],
        fn: () => true,
        createRTFn: () => () => true,
      },
    };

    const initialCaches = getRTFnCaches();
    const initialRTCacheSize = Object.keys(initialCaches.rtFnsCache).length;

    loadRTCachesCaches({rtFnsCache: testRTCache});

    const updatedCaches = getRTFnCaches();
    const updatedRTCacheSize = Object.keys(updatedCaches.rtFnsCache).length;

    expect(updatedRTCacheSize).toBeGreaterThan(initialRTCacheSize);
    expect(updatedCaches.rtFnsCache).toHaveProperty('testRTFn');
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

    const initialCaches = getRTFnCaches();
    const initialPureCacheSize = Object.keys(initialCaches.pureFnsCache).length;

    loadRTCachesCaches({pureFnsCache: testPureCache});

    const updatedCaches = getRTFnCaches();
    const updatedPureCacheSize = Object.keys(updatedCaches.pureFnsCache).length;

    expect(updatedPureCacheSize).toBeGreaterThan(initialPureCacheSize);
    expect(updatedCaches.pureFnsCache).toHaveProperty('testNamespace::testPureFn');
  });

  it('should handle empty cache data gracefully', () => {
    expect(() => loadRTCachesCaches({})).not.toThrow();
    expect(() => loadRTCachesCaches({rtFnsCache: {}})).not.toThrow();
    expect(() => loadRTCachesCaches({pureFnsCache: {}})).not.toThrow();
  });

  describe('runType registry', () => {
    it('addRunType stores an entry and getRunType reads it back', () => {
      const id = 'rt-test-add-get';
      const entry: RunType = {id, kind: 'object', typeName: 'Foo'};
      const stored = getRTUtils().addRunType(id, entry);
      expect(stored).toBe(entry);
      expect(getRTUtils().getRunType(id)).toBe(entry);
      expect(getRTUtils().hasRunType(id)).toBe(true);
    });

    it('useRunType returns the entry, or throws when missing', () => {
      const id = 'rt-test-use';
      const entry: RunType = {id, kind: 'primitive'};
      getRTUtils().addRunType(id, entry);
      expect(getRTUtils().useRunType(id)).toBe(entry);
      expect(() => getRTUtils().useRunType('rt-test-missing')).toThrow(/Run-type not found/);
    });

    it('addRunType overwrites existing entries (idempotent re-init)', () => {
      const id = 'rt-test-overwrite';
      getRTUtils().addRunType(id, {id, kind: 'a'});
      getRTUtils().addRunType(id, {id, kind: 'b'});
      expect((getRTUtils().getRunType(id) as RunType).kind).toBe('b');
    });

    it('removeRunType clears the entry', () => {
      const id = 'rt-test-remove';
      getRTUtils().addRunType(id, {id, kind: 'gone'});
      getRTUtils().removeRunType(id);
      expect(getRTUtils().hasRunType(id)).toBe(false);
      expect(getRTUtils().getRunType(id)).toBeUndefined();
    });

    it('addRunType rejects empty id', () => {
      expect(() => getRTUtils().addRunType('', {id: '', kind: 'x'})).toThrow(/non-empty/);
    });
  });

  it('should not overwrite existing cache entries', () => {
    const firstCache: RTFunctionsCache = {
      testFn1: {
        typeName: 'TestType1',
        fnID: 'isType',
        rtFnHash: 'testFn1',
        args: {vλl: 'v'},
        defaultParamValues: {vλl: ''},
        code: 'return true;',
        rtDependencies: [],
        pureFnDependencies: [],
        fn: () => true,
        createRTFn: () => () => true,
      },
    };

    const secondCache: RTFunctionsCache = {
      testFn1: {
        // Same key as first cache - should NOT overwrite
        typeName: 'TestType2',
        fnID: 'isType',
        rtFnHash: 'testFn1',
        args: {vλl: 'v'},
        defaultParamValues: {vλl: ''},
        code: 'return false;',
        rtDependencies: [],
        pureFnDependencies: [],
        fn: () => false,
        createRTFn: () => () => false,
      },
      testFn2: {
        // New key - should be added
        typeName: 'TestType2',
        fnID: 'isType',
        rtFnHash: 'testFn2',
        args: {vλl: 'v'},
        defaultParamValues: {vλl: ''},
        code: 'return false;',
        rtDependencies: [],
        pureFnDependencies: [],
        fn: () => false,
        createRTFn: () => () => false,
      },
    };

    // Load first cache
    loadRTCachesCaches({rtFnsCache: firstCache});

    const cachesAfterFirst = getRTFnCaches();
    expect(cachesAfterFirst.rtFnsCache).toHaveProperty('testFn1');
    expect(cachesAfterFirst.rtFnsCache.testFn1?.typeName).toBe('TestType1');

    // Load second cache - should not overwrite testFn1 but should add testFn2
    loadRTCachesCaches({rtFnsCache: secondCache});

    const cachesAfterSecond = getRTFnCaches();
    expect(cachesAfterSecond.rtFnsCache).toHaveProperty('testFn1');
    expect(cachesAfterSecond.rtFnsCache).toHaveProperty('testFn2');
    expect(cachesAfterSecond.rtFnsCache.testFn1?.typeName).toBe('TestType1');
    expect(cachesAfterSecond.rtFnsCache.testFn2?.typeName).toBe('TestType2');
  });
});
