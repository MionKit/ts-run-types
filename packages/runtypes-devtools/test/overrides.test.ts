// End-to-end acceptance test for `overrideX<T>(pureFn)` over the real
// inline-server pipeline (ResolverClient + the Go binary). Asserts that an
// overrideValidate<string> turns the validate entry for `string` into a cfn
// redirect, and that the cfn module carries the user's body — so a containing
// type's createValidate reaches the override. Goes one level lower than a
// runtime test: it inspects the rendered tuples so an emitter regression
// surfaces here.

import {describe, expect, it} from 'vitest';
import {hasBinary, withInlineSources, evalEntryModules} from './helpers/inline.ts';

describe('runtypes-devtools / overrideX', () => {
  const register = hasBinary() ? it : it.skip;

  register('overrideValidate<string> emits a cfn redirect + cfn module', async () => {
    const sources = {
      'call.ts': `import {createValidate, overrideValidate} from 'ts-runtypes';
overrideValidate<string>((v) => v === 'OK');
export const isString = createValidate<string>();
`,
    };
    await withInlineSources(sources, async ({client, sources: augmented}) => {
      const files = Object.keys(augmented).filter((file) => file !== 'runtypes.d.ts');
      const response = await client.scanFiles(files, {includeEntryModules: true});

      // The createValidate<string>() site carries the (folded) string id + the
      // validate fnId; its cache key names the redirect entry.
      const site = response.sites.find((s) => s.fnId);
      if (!site || !site.fnId) throw new Error('expected a createValidate site with an fnId');
      const cacheKey = site.fnId + '_' + site.id;

      const entryModules = response.entryModules ?? {};
      const tuples = evalEntryModules(entryModules);

      // The validate entry is a redirect: family tag 'val', a real body, and a
      // pureFnDependency on the cfn it forwards to (tuple slot 8).
      const tuple = tuples[cacheKey] as readonly unknown[];
      expect(tuple, `expected redirect entry for ${cacheKey}`).toBeDefined();
      expect(tuple[0]).toBe('val');
      expect(tuple[6]).toBe(false); // never noop
      const pureFnDeps = tuple[8] as string[];
      expect(Array.isArray(pureFnDeps) && pureFnDeps.length).toBeTruthy();
      expect(pureFnDeps[0].startsWith('cfn::')).toBe(true);
      expect(String(tuple[5])).toContain('usePureFn');

      // The cfn module exists and carries the override body.
      const allSources = Object.values(entryModules).join('\n');
      expect(allSources).toContain("v === 'OK'");
    });
  });
});
