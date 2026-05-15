// End-to-end acceptance test for the v1 isType precompiler. Drives the
// Go side over the same inline-server pipeline the other vite-plugin
// tests use, then evaluates both rendered modules:
//
//   - virtual:runtypes-cache  → look up the hash assigned to `string`
//   - virtual:runtypes-isType → register the precompiled JitCompiledFn
//     entry into a stubbed JitUtils cache and assert the entry's
//     `.fn(value)` validator behaves correctly for true / false /
//     undefined inputs.
//
// Sibling test packages/ts-go-run-types/test/createIsType.test.ts
// exercises the same module through the public `createIsType<T>()`
// API. This file goes a level lower: it asserts the rendered output
// shape (every `JitCompiledFnData` field is populated, the named
// export and the auto-registered cache entry point at the same
// object), so regressions in the J(...) emitter surface here before
// they break downstream consumers.

import {describe, expect, it} from 'vitest';
import {ISTYPE_VAR_PREFIX, RUNTYPES_VAR_PREFIX, type RunType} from '../src/protocol.ts';
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
      const response = await client.scanFiles(files, {includeCacheSource: true});

      expect(response.sites.length).toBe(1);
      const site = response.sites[0];

      // 1. Evaluate the cache module to find the t_<hash> entry the
      //    resolver assigned to `string`.
      const cacheSource = response.cacheSource;
      if (!cacheSource) throw new Error('expected cacheSource in response');
      const byHash = evalCacheModule(cacheSource);
      const stringRunType = byHash[RUNTYPES_VAR_PREFIX + site.id];
      expect(stringRunType).toBeDefined();
      expect(stringRunType.kind).toBe(5); // ReflectionKind.string

      // 2. Evaluate the isType module against a stub JitUtils. The
      //    module's `J(…)` factory calls `getJitUtils().addToJitCache`
      //    on import — every emitted entry lands in the stub cache as
      //    a side effect, indexed by jitFnHash.
      const isTypeSource = response.isTypeCacheSource;
      if (!isTypeSource) throw new Error('expected isTypeCacheSource in response');
      const {byName, cache} = evalIsTypeModule(isTypeSource);

      // Both the named export and the auto-registered cache entry must
      // point at the same `JitCompiledFn` object — there's no copy.
      const named = byName[ISTYPE_VAR_PREFIX + site.id];
      const cached = cache[site.id];
      expect(named).toBeDefined();
      expect(cached).toBeDefined();
      expect(cached).toBe(named);

      // 3. Every JitCompiledFnData field is populated. Downstream
      //    serialization paths (AOT cache restoration, network handoff)
      //    rely on this shape — assert it explicitly so a regression
      //    surfaces here instead of much later.
      expect(named.jitFnHash).toBe(site.id);
      expect(named.fnID).toBe('isType');
      expect(named.typeName).toBe('string');
      expect(named.args).toEqual({vλl: 'v'});
      expect(named.defaultParamValues).toEqual({vλl: undefined});
      expect(named.code).toBe("return typeof v === 'string'");
      expect(named.isNoop).toBe(false);
      expect(named.jitDependencies).toEqual([]);
      expect(named.pureFnDependencies).toEqual([]);
      expect(named.createJitFn).toBeTypeOf('function');
      expect(named.fn).toBeTypeOf('function');

      // 4. The materialised validator behaves correctly.
      expect(named.fn('abc')).toBe(true);
      expect(named.fn(42)).toBe(false);
      expect(named.fn(undefined)).toBe(false);
    });
  });
});

// evalCacheModule mirrors the regex-rewrite trick evalCacheFor uses in
// helpers/inline.ts (each `export const t_X = …` becomes a `var` binding
// that also writes to a result object so we can enumerate by hash).
function evalCacheModule(source: string): Record<string, RunType> {
  const js = source.replace(/export const (\w+) = /g, 'var $1 = result.$1 = ');
  const factory = new Function(`const result = {}; ${js}; return result;`);
  return factory() as Record<string, RunType>;
}

// evalIsTypeModule evaluates the rendered isType module under a stub
// `getJitUtils()` so the import-time `addToJitCache(entry)` call lands
// in a local cache we can inspect. Two rewrites:
//
//   1. The `import {getJitUtils} from '@mionjs/core';` statement is
//      stripped — `new Function` evaluates in script scope, not module
//      scope, so `import` is a syntax error. The stub is supplied as
//      a positional arg to the generated function instead.
//   2. `export const get_isType_X = J(…);` becomes
//      `byName.get_isType_X = J(…);` so every named entry lands on the
//      `byName` object alongside the auto-registered cache hit.
function evalIsTypeModule(source: string): {byName: Record<string, JitEntry>; cache: Record<string, JitEntry>} {
  const cache: Record<string, JitEntry> = {};
  const stub = () => ({
    addToJitCache(entry: JitEntry) {
      cache[entry.jitFnHash] = entry;
    },
  });
  const js = source.replace(/^import .*from '@mionjs\/core';\s*$/m, '').replace(/export const (\w+) = /g, 'byName.$1 = ');
  const factory = new Function('getJitUtils', 'byName', js);
  const byName: Record<string, JitEntry> = {};
  factory(stub, byName);
  return {byName, cache};
}
