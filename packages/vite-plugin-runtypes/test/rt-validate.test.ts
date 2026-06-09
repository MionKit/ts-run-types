// End-to-end acceptance test for the v1 validate precompiler. Drives the
// Go side over the same inline-server pipeline the other vite-plugin
// tests use, then evaluates both rendered modules:
//
//   - virtual:runtypes-cache  → look up the cache entry assigned to `string`
//   - virtual:runtypes-validate → register the precompiled RTCompiledFn
//     entry into a stubbed RTUtils cache and assert the entry's
//     `.fn(value)` validator behaves correctly for true / false /
//     undefined inputs.
//
// Sibling test packages/ts-go-run-types/test/createValidate.test.ts
// exercises the same module through the public `createValidate<T>()`
// API. This file goes a level lower: it asserts the rendered output
// shape (every `RTCompiledFnData` field is populated, the cache map
// and the auto-registered rtUtils cache point at the same object),
// so regressions in the factory(...) emitter surface here before they
// break downstream consumers.

import {describe, expect, it} from 'vitest';
import {type RunType} from '../src/protocol.ts';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

// Subset of mion's RTCompiledFn relevant to this test. Each entry the
// virtual module exports must populate every field listed here (see
// mion/general.types.ts:145 for the full type).
interface RTEntry {
  rtFnHash: string;
  fnID: 'val';
  typeName: string;
  args: {vλl: string};
  defaultParamValues: {vλl: unknown};
  code: string;
  isNoop: boolean;
  rtDependencies: string[];
  pureFnDependencies: string[];
  createRTFn: (utl: unknown) => (value: unknown) => boolean;
  fn: (value: unknown) => boolean;
}

describe('vite-plugin-runtypes / validate precompiler', () => {
  const register = hasBinary() ? it : it.skip;

  register('emits a working RTCompiledFn entry for `string`', async () => {
    // `it` (validate) is demand-scoped — a reflection-only getRunTypeId<string>()
    // would emit ZERO val_ entries. Drive the validate family directly via
    // createValidate<string>() so the demand path renders the `val_<id>` factory
    // this test inspects.
    const sources = {
      'string.ts': `import {createValidate} from '@mionjs/ts-go-run-types';
createValidate<string>();
`,
    };
    await withInlineSources(sources, async ({client, sources: augmented}) => {
      const files = Object.keys(augmented).filter((file) => file !== 'runtypes.d.ts');
      const response = await client.scanFiles(files, {includeCacheSources: ['all']});

      expect(response.sites.length).toBe(1);
      const site = response.sites[0];

      // 1. Evaluate the runtypes-cache module via its initCache()
      //    export; look up the entry by raw site.id.
      const cacheSource = response.runTypeCacheSource;
      if (!cacheSource) throw new Error('expected runTypeCacheSource in response');
      const byHash = evalRunTypesModule(cacheSource);
      const stringRunType = byHash[site.id];
      expect(stringRunType).toBeDefined();
      expect(stringRunType.kind).toBe(5); // ReflectionKind.string

      // 2. Evaluate the validate module via its initCache(rtUtils) export.
      //    The stub records every `addToRTCache` call and the returned
      //    cache map is keyed by the namespaced `rtFnHash`
      //    (`<fnHash>_<id>`) — see internal/compiled/typefns/module.go which
      //    namespaces the cache key per fn so validate / validationErrors /
      //    prepareForJson entries for the same runtype don't collide
      //    in the shared rtFnsCache. Slice 4: the family prefix is the opaque
      //    validate fnHash the scanner injected into this site's `fnId`, not the
      //    readable `it` tag — derive the key from `site.fnId` so the test
      //    stays correct across version-isolated hashes.
      const validateSource = response.validateCacheSource;
      if (!validateSource) throw new Error('expected validateCacheSource in response');
      const {byHash: validateCache, registered} = evalValidateModule(validateSource);

      // Both the returned map entry and the stub-registered cache entry
      // must point at the same `RTCompiledFn` object — there's no copy.
      const fnPrefix = site.fnId;
      if (!fnPrefix) throw new Error('expected an injected fnId (fnHash) on the createValidate site');
      const cacheKey = fnPrefix + '_' + site.id;
      const fromCache = validateCache[cacheKey];
      const fromRegistry = registered[cacheKey];
      expect(fromCache).toBeDefined();
      expect(fromRegistry).toBeDefined();
      expect(fromCache).toBe(fromRegistry);

      // 3. Every RTCompiledFnData field is populated.
      expect(fromCache.rtFnHash).toBe(cacheKey);
      expect(fromCache.fnID).toBe('val');
      expect(fromCache.typeName).toBe('string');
      expect(fromCache.args).toEqual({vλl: 'v'});
      expect(fromCache.defaultParamValues).toEqual({vλl: undefined});
      // `code` carries the factory body (suitable for `new Function('utl', code)(rtUtils)`
      // reconstruction), not just the inner validator body.
      expect(fromCache.code).toBe('return function ' + cacheKey + "(v){return typeof v === 'string'}");
      expect(fromCache.isNoop).toBe(false);
      expect(fromCache.rtDependencies).toEqual([]);
      expect(fromCache.pureFnDependencies).toEqual([]);
      expect(fromCache.createRTFn).toBeTypeOf('function');
      expect(fromCache.fn).toBeTypeOf('function');

      // 4. The materialised validator behaves correctly.
      expect(fromCache.fn('abc')).toBe(true);
      expect(fromCache.fn(42)).toBe(false);
      expect(fromCache.fn(undefined)).toBe(false);
    });
  });
});

// stripExports rewrites `export function …` to `function …` so the
// skeleton body evaluates inside a `new Function` script body.
function stripExports(source: string): string {
  return source.replace(/^\s*export\s+function\s+/gm, 'function ');
}

// evalRunTypesModule strips `export`s, evaluates the body, and calls
// `initCache(rtUtils)` against a minimal stub that records every
// `addRunType` call. Returns the per-id map of entries the rendered
// body emitted.
function evalRunTypesModule(source: string): Record<string, RunType> {
  const registered: Record<string, RunType> = {};
  const stub = {
    addRunType(id: string, runType: RunType) {
      registered[id] = runType;
    },
    useRunType(id: string): RunType {
      const entry = registered[id];
      if (!entry) throw new Error(`stub useRunType: no entry for ${id}`);
      return entry;
    },
  };
  const stripped = stripExports(source);
  const factory = new Function(`${stripped}\nreturn initCache;`);
  const initCache = factory() as (rtUtils: typeof stub) => void;
  initCache(stub);
  return registered;
}

// evalValidateModule evaluates the rendered validate module, calls its
// `initCache(rtUtils)` export against a stub rtUtils, and returns
// the stub's record of every `addToRTCache(entry)` call keyed by
// `rtFnHash`. With cache state now living in rtUtils only, the
// stub's table IS the cache.
function evalValidateModule(source: string): {byHash: Record<string, RTEntry>; registered: Record<string, RTEntry>} {
  const registered: Record<string, RTEntry> = {};
  // The cache module no longer materialises `entry.fn` eagerly — the
  // real rtUtils does it lazily on first `getRT(hash)` call (see
  // packages/ts-go-run-types/src/runtypes/rtUtils.ts:materializeRTFn).
  // This test stub mimics that: after each addToRTCache, invoke
  // createRTFn(stub) so `entry.fn` is populated for the assertions
  // below that check `fn` is a function.
  const stub = {
    addToRTCache(entry: RTEntry) {
      registered[entry.rtFnHash] = entry;
      if (entry.createRTFn && !entry.fn) {
        entry.fn = entry.createRTFn(stub);
      }
    },
    getRT(hash: string): RTEntry | undefined {
      return registered[hash];
    },
    getPureFn(_key: string): unknown {
      return undefined;
    },
  };
  const stripped = stripExports(source);
  const factory = new Function(`${stripped}\nreturn initCache;`);
  const initCache = factory() as (rtUtils: typeof stub) => void;
  initCache(stub);
  return {byHash: registered, registered};
}
