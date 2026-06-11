// End-to-end acceptance test for the validate precompiler in module mode.
// Drives the Go side over the same inline-server pipeline the other
// vite-plugin tests use, then consumes the per-entry virtual modules the
// way production does:
//
//   - the site's `t_<id>` data module (via evalCacheFor) → the RunType
//     node assigned to `string`
//   - the site's `<fnHash>_<id>` validate module → registered through the
//     PRODUCTION registrar into the PRODUCTION rtUtils, then materialised
//     via `getRT(key)` and asserted for true / false / undefined inputs.
//
// Sibling test packages/ts-go-run-types/test/createValidate.test.ts
// exercises the same modules through the public `createValidate<T>()`
// API. This file goes a level lower: it asserts the rendered entry-tuple
// shape (key, family tag, typeName, the `code` body), so regressions in
// the per-entry emitter surface here before they break downstream
// consumers.

import {describe, expect, it} from 'vitest';
import {hasBinary, withInlineSources, evalEntryModule} from './helpers/inline.ts';
import {initDependencies, type EntryTuple} from '../../ts-go-run-types/src/runtypes/registrar.ts';
import {getRTUtils} from '../../ts-go-run-types/src/runtypes/rtUtils.ts';

describe('vite-plugin-runtypes / validate precompiler', () => {
  const register = hasBinary() ? it : it.skip;

  register('emits a working RTCompiledFn entry for `string`', async () => {
    // `it` (validate) is demand-scoped — a reflection-only getRunTypeId<string>()
    // would emit ZERO val_ entries. Drive the validate family directly via
    // createValidate<string>() so the demand path renders the `val_<id>` module
    // this test inspects.
    const sources = {
      'string.ts': `import {createValidate} from '@mionjs/ts-go-run-types';
createValidate<string>();
`,
    };
    await withInlineSources(sources, async ({client, sources: augmented}) => {
      const files = Object.keys(augmented).filter((file) => file !== 'runtypes.d.ts');
      const response = await client.scanFiles(files, {includeModules: true});

      expect(response.sites.length).toBe(1);
      const site = response.sites[0];
      const fnPrefix = site.fnId;
      if (!fnPrefix) throw new Error('expected an injected fnId (fnHash) on the createValidate site');
      const cacheKey = fnPrefix + '_' + site.id;

      // 1. The site's deps closure carries exactly the validate root for a
      //    leaf type, and its module body leads with its own key + family.
      expect(site.deps).toEqual([cacheKey]);
      const moduleSource = response.modules?.[cacheKey];
      if (!moduleSource) throw new Error(`expected a module body for ${cacheKey}`);

      // 2. The entry tuple decodes to the expected positional wire shape.
      const entry = evalEntryModule(moduleSource);
      expect(entry[0]).toBe(cacheKey);
      expect(entry[1]).toBe('val');
      expect(entry[2]).toBe('string');
      // `code` carries the factory body (suitable for `new Function('utl',
      // code)(rtUtils)` reconstruction), not just the inner validator body.
      expect(entry[3]).toBe('return function ' + cacheKey + "(v){return typeof v === 'string'}");
      // The shared test client runs with emitCacheFunctions=true, so the
      // inline createRTFn closure rides slot 7.
      expect(entry[7]).toBeTypeOf('function');

      // 3. Registered through the PRODUCTION registrar + rtUtils, the entry
      //    materialises into a working validator.
      const utl = getRTUtils();
      initDependencies(utl, [entry as unknown as EntryTuple]);
      const materialized = utl.getRT(cacheKey);
      if (!materialized) throw new Error(`expected ${cacheKey} in rtUtils after registration`);
      expect(materialized.rtFnHash).toBe(cacheKey);
      expect(materialized.fnID).toBe('val');
      expect(materialized.typeName).toBe('string');
      expect(materialized.args).toEqual({vλl: 'v'});
      expect(materialized.fn).toBeTypeOf('function');

      // 4. The materialised validator behaves correctly.
      const validate = materialized.fn as (value: unknown) => boolean;
      expect(validate('abc')).toBe(true);
      expect(validate(42)).toBe(false);
      expect(validate(undefined)).toBe(false);
    });
  });
});
