// End-to-end acceptance test for the v1 isType precompiler. Drives the
// Go side over the same inline-server pipeline the other vite-plugin
// tests use, then evaluates both rendered modules:
//
//   - virtual:runtypes-cache  → look up the cache entry assigned to `string`
//   - virtual:runtypes-isType → register the precompiled JitCompiledFn
//     entry into a stubbed JitUtils cache and assert the entry's
//     `.fn(value)` validator behaves correctly for true / false /
//     undefined inputs.
//
// Sibling test packages/ts-go-run-types/test/createIsType.test.ts
// exercises the same module through the public `createIsType<T>()`
// API. This file goes a level lower: it asserts the rendered output
// shape (every `JitCompiledFnData` field is populated, the cache map
// and the auto-registered jitUtils cache point at the same object),
// so regressions in the factory(...) emitter surface here before they
// break downstream consumers.

import {describe, expect, it} from 'vitest';
import {type RunType} from '../src/protocol.ts';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

// Subset of mion's JitCompiledFn relevant to this test. Each entry the
// virtual module exports must populate every field listed here (see
// mion/general.types.ts:145 for the full type).
interface JitEntry {
  jitFnHash: string;
  fnID: 'isType';
  typeName: string;
  args: {vλl: string};
  defaultParamValues: {vλl: unknown};
  code: string;
  isNoop: boolean;
  jitDependencies: string[];
  pureFnDependencies: string[];
  createJitFn: (utl: unknown) => (value: unknown) => boolean;
  fn: (value: unknown) => boolean;
}

describe('vite-plugin-runtypes / isType precompiler', () => {
  const register = hasBinary() ? it : it.skip;

  register('emits a working JitCompiledFn entry for `string`', async () => {
    const sources = {
      'string.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
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

      // 2. Evaluate the isType module via its initCache(jitUtils) export.
      //    The stub records every `addToJitCache` call and the returned
      //    cache map is keyed by raw `jitFnHash` (no prefix).
      const isTypeSource = response.isTypeCacheSource;
      if (!isTypeSource) throw new Error('expected isTypeCacheSource in response');
      const {byHash: isTypeCache, registered} = evalIsTypeModule(isTypeSource);

      // Both the returned map entry and the stub-registered cache entry
      // must point at the same `JitCompiledFn` object — there's no copy.
      const fromCache = isTypeCache[site.id];
      const fromRegistry = registered[site.id];
      expect(fromCache).toBeDefined();
      expect(fromRegistry).toBeDefined();
      expect(fromCache).toBe(fromRegistry);

      // 3. Every JitCompiledFnData field is populated.
      expect(fromCache.jitFnHash).toBe(site.id);
      expect(fromCache.fnID).toBe('isType');
      expect(fromCache.typeName).toBe('string');
      expect(fromCache.args).toEqual({vλl: 'v'});
      expect(fromCache.defaultParamValues).toEqual({vλl: undefined});
      expect(fromCache.code).toBe("return typeof v === 'string'");
      expect(fromCache.isNoop).toBe(false);
      expect(fromCache.jitDependencies).toEqual([]);
      expect(fromCache.pureFnDependencies).toEqual([]);
      expect(fromCache.createJitFn).toBeTypeOf('function');
      expect(fromCache.fn).toBeTypeOf('function');

      // 4. The materialised validator behaves correctly.
      expect(fromCache.fn('abc')).toBe(true);
      expect(fromCache.fn(42)).toBe(false);
      expect(fromCache.fn(undefined)).toBe(false);
    });
  });
});

// stripExports rewrites `export function …` to `function …` and removes
// `export {cache};` so the skeleton body evaluates inside a
// `new Function` script body.
function stripExports(source: string): string {
  return source.replace(/^\s*export\s+function\s+/gm, 'function ').replace(/^\s*export\s*\{[^}]*\};\s*$/gm, '');
}

// evalRunTypesModule strips `export`s, evaluates the body, and calls
// `initCache()` to obtain the populated runtypes cache.
function evalRunTypesModule(source: string): Record<string, RunType> {
  const stripped = stripExports(source);
  const factory = new Function(`${stripped}\nreturn initCache;`);
  const initCache = factory() as (jitUtils?: unknown) => Record<string, RunType>;
  return initCache({});
}

// evalIsTypeModule evaluates the rendered isType module, calls its
// `initCache(jitUtils)` export against a stub jitUtils, and returns
// both:
//   - `byHash`: the module-local cache object (returned by initCache);
//   - `registered`: the stub's record of every `addToJitCache(entry)`
//     call.
// Both must end up pointing at the same entry objects.
function evalIsTypeModule(source: string): {byHash: Record<string, JitEntry>; registered: Record<string, JitEntry>} {
  const registered: Record<string, JitEntry> = {};
  const stub = {
    addToJitCache(entry: JitEntry) {
      registered[entry.jitFnHash] = entry;
    },
  };
  const stripped = stripExports(source);
  const factory = new Function(`${stripped}\nreturn initCache;`);
  const initCache = factory() as (jitUtils: typeof stub) => Record<string, JitEntry>;
  const byHash = initCache(stub);
  return {byHash, registered};
}
