// End-to-end acceptance tests for `overrideX<T>(pureFn)` over the real
// inline-server pipeline (ResolverClient + the Go binary). One test inspects the
// rendered redirect tuple + cfn module (structure); the rest MATERIALIZE the
// two-hop redirect→cfn and CALL it, asserting the custom behavior at runtime —
// including recursive types. Isolated per test (withInlineSources resets the
// Program) with unique per-test types, so whole-program overrides never leak
// across tests.

import {describe, expect, it} from 'vitest';
import {hasBinary, withInlineSources, evalEntryModules} from './helpers/inline.ts';
import type {ResolverClient} from '../src/resolver-client.ts';
import type {Site} from '../src/protocol.ts';

type AnyFn = (...args: any[]) => any;

// scanResponse runs scanFiles(includeEntryModules) over the inline sources.
async function scanResponse(client: ResolverClient, augmented: Record<string, string>) {
  const files = Object.keys(augmented).filter((file) => file !== 'runtypes.d.ts');
  return client.scanFiles(files, {includeEntryModules: true});
}

// materializeOverrideFn resolves the createX site's redirect entry and returns
// the live override function by following the redirect → cfn hop with a minimal
// rtUtils whose `usePureFn` reads the evaluated cfn tuple's factory (slot 8). The
// override is self-contained (pure), so no runtype/getRT wiring is needed.
function materializeOverrideFn(response: {sites: Site[]; entryModules?: Record<string, string>}): AnyFn {
  const site = response.sites.find((s) => s.fnId);
  if (!site || !site.fnId) throw new Error('expected a createX site with an fnId');
  const tuples = evalEntryModules(response.entryModules ?? {});
  const redirect = tuples[site.fnId + '_' + site.id] as readonly unknown[];
  if (!redirect) throw new Error(`no redirect entry for ${site.fnId}_${site.id}`);

  const cfnByKey: Record<string, readonly unknown[]> = {};
  for (const tuple of Object.values(tuples)) {
    if (Array.isArray(tuple) && tuple[0] === 2) cfnByKey[String(tuple[3])] = tuple; // KIND_PURE_FN
  }
  const utl: {usePureFn(key: string): AnyFn} = {
    usePureFn(key: string): AnyFn {
      const cfn = cfnByKey[key];
      if (!cfn) throw new Error(`no cfn module for ${key}`);
      return (cfn[8] as (u: unknown) => AnyFn)(utl); // override factory ignores utl, returns the fn
    },
  };
  return (redirect[9] as (u: unknown) => AnyFn)(utl); // createRTFn(utl) → the override fn
}

describe('runtypes-devtools / overrideX', () => {
  const register = hasBinary() ? it : it.skip;

  register('overrideValidate<string> emits a cfn redirect + cfn module', async () => {
    await withInlineSources(
      {
        'call.ts': `import {createValidate, overrideValidate} from 'ts-runtypes';
overrideValidate<string>((v) => v === 'OK');
export const isString = createValidate<string>();
`,
      },
      async ({client, sources}) => {
        const response = await scanResponse(client, sources);
        const site = response.sites.find((s) => s.fnId);
        if (!site || !site.fnId) throw new Error('expected a createValidate site with an fnId');
        const tuples = evalEntryModules(response.entryModules ?? {});
        const tuple = tuples[site.fnId + '_' + site.id] as readonly unknown[];
        expect(tuple, 'expected redirect entry').toBeDefined();
        expect(tuple[0]).toBe('val');
        expect(tuple[6]).toBe(false); // never noop
        const pureFnDeps = tuple[8] as string[];
        expect(Array.isArray(pureFnDeps) && pureFnDeps.length).toBeTruthy();
        expect(pureFnDeps[0].startsWith('cfn::')).toBe(true);
        expect(String(tuple[5])).toContain('usePureFn');
        expect(Object.values(response.entryModules ?? {}).join('\n')).toContain("v === 'OK'");
      }
    );
  });

  register('overrideValidate runtime — calls the custom validator', async () => {
    await withInlineSources(
      {
        'call.ts': `import {createValidate, overrideValidate} from 'ts-runtypes';
type VTarget = {kind: 'vt'; value: number};
overrideValidate<VTarget>((v) => (v as any)?.value === 42);
export const isVt = createValidate<VTarget>();
`,
      },
      async ({client, sources}) => {
        const fn = materializeOverrideFn(await scanResponse(client, sources));
        expect(fn({kind: 'vt', value: 42})).toBe(true);
        expect(fn({kind: 'vt', value: 7})).toBe(false);
        expect(fn(null)).toBe(false);
      }
    );
  });

  register('overrideJsonEncoder runtime — returns the hand-tuned string', async () => {
    await withInlineSources(
      {
        'call.ts': `import {createJsonEncoder, overrideJsonEncoder} from 'ts-runtypes';
type JTarget = {tag: 'jt'; id: number};
overrideJsonEncoder<JTarget>((v) => '{"id":' + (v as any).id + '}');
export const enc = createJsonEncoder<JTarget>();
`,
      },
      async ({client, sources}) => {
        const fn = materializeOverrideFn(await scanResponse(client, sources));
        expect(fn({tag: 'jt', id: 7})).toBe('{"id":7}');
      }
    );
  });

  register('override runtime — recursive type, the override walks the chain', async () => {
    await withInlineSources(
      {
        'call.ts': `type RNode = {label: string; child: RNode | null};
import {createValidate, overrideValidate} from 'ts-runtypes';
overrideValidate<RNode>((v) => {
  let n = v as any;
  while (n !== null && typeof n === 'object') {
    if (typeof n.label !== 'string') return false;
    n = n.child;
  }
  return n === null;
});
export const isRNode = createValidate<RNode>();
`,
      },
      async ({client, sources}) => {
        const fn = materializeOverrideFn(await scanResponse(client, sources));
        // The override handles the recursion itself; it must walk the whole chain.
        expect(fn({label: 'a', child: {label: 'b', child: {label: 'c', child: null}}})).toBe(true);
        expect(fn({label: 'a', child: {label: 42, child: null}})).toBe(false);
        expect(fn({label: 'a', child: {label: 'b', child: {}}})).toBe(false); // tail not null-terminated
      }
    );
  });
});
