// End-to-end acceptance test for the v1 isType precompiler. Drives the
// Go side over the same inline-server pipeline the other vite-plugin
// tests use, then evaluates both rendered modules:
//
//   - virtual:runtypes-cache  → look up the hash assigned to `string`
//   - virtual:runtypes-isType → import the precompiled get_isType_<hash>
//     factory, invoke it, and assert the returned validator's runtime
//     behaviour for true / false / undefined inputs.
//
// Success bar (from plans/the-idea-is-to-groovy-rainbow.md):
//   isType('abc')      === true
//   isType(42)         === false
//   isType(undefined)  === false

import {describe, expect, it} from 'vitest';
import {ISTYPE_VAR_PREFIX, RUNTYPES_VAR_PREFIX, type RunType} from '../src/protocol.ts';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

describe('vite-plugin-runtypes / isType precompiler', () => {
  const register = hasBinary() ? it : it.skip;

  register('emits a working isType validator for `string`', async () => {
    const sources = {
      'string.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`,
    };
    await withInlineSources(sources, async ({client, sources: augmented}) => {
      // Pull every projected slot in one scanFiles call (mirrors what
      // evalCacheFor does for the metadata module; we also need the
      // sibling isTypeCacheSource).
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

      // 2. Evaluate the isType module to extract the factory.
      const isTypeSource = response.isTypeCacheSource;
      if (!isTypeSource) throw new Error('expected isTypeCacheSource in response');
      const factories = evalIsTypeModule(isTypeSource);
      const factory = factories[ISTYPE_VAR_PREFIX + site.id];
      expect(factory).toBeTypeOf('function');

      // 3. Invoke the factory and exercise the validator.
      //    v1 has no closure-context dependencies, so passing `undefined`
      //    as utl is fine — the body never reads it.
      const isType = factory(undefined);
      expect(isType('abc')).toBe(true);
      expect(isType(42)).toBe(false);
      expect(isType(undefined)).toBe(false);
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

// evalIsTypeModule rewrites `export function get_isType_X(utl){…}` into
// a `var get_isType_X = result.get_isType_X = function (utl) {…};` so
// every factory lands on the result object for lookup-by-hash. The
// function-declaration → expression rewrite matches the cache module's
// approach for `const`.
function evalIsTypeModule(source: string): Record<string, (utl: unknown) => (value: unknown) => boolean> {
  const js = source.replace(/export function (\w+)\(([^)]*)\)\{/g, 'var $1 = result.$1 = function($2){');
  const factory = new Function(`const result = {}; ${js}; return result;`);
  return factory() as Record<string, (utl: unknown) => (value: unknown) => boolean>;
}
