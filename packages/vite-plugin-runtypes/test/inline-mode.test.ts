// inlineMode wiring: 'allInternal' inlines unnamed, non-circular compounds
// into their parents — no per-child cache entry; the child's statement block
// hoists to a per-factory context fn. Named types and circular types keep the
// external dependency-call path. Default-mode shapes are locked by the rest
// of the suite; this file spawns a dedicated --inline-mode resolver and also
// MATERIALIZES the inlined factory to prove it validates correctly at
// runtime (the inlined loop rides a ctxFn, not a per-call IIFE).

import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ResolverClient} from '../src/resolver-client.ts';
import {BIN, hasBinary, RUNTYPES_DTS, evalEntryModules} from './helpers/inline.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const register = hasBinary() ? it : it.skip;

async function withAllInternalClient<T>(sources: Record<string, string>, fn: (client: ResolverClient) => Promise<T>): Promise<T> {
  const client = new ResolverClient(BIN, ROOT, '', {
    serverMode: true,
    inlineMode: 'allInternal',
    emitMode: 'both', // ship the live factory so the test can run the validator
  });
  try {
    await client.setSources({'runtypes.d.ts': RUNTYPES_DTS, ...sources});
    return await fn(client);
  } finally {
    client.close();
  }
}

describe('vite-plugin-runtypes / inlineMode allInternal', () => {
  register('static: createValidate over an unnamed array inlines — one entry, working validator', async () => {
    const code = `import {createValidate} from '@mionjs/ts-go-run-types';
type Parent = {tags: string[]};
export const isParent = createValidate<Parent>();
`;
    await withAllInternalClient({'parent.ts': code}, async (client) => {
      const scan = await client.scanFiles(['parent.ts'], {includeEntryModules: true});
      const site = scan.sites.find((s) => s.fnId);
      if (!site?.fnId) throw new Error('expected a createValidate site');
      const parentKey = `${site.fnId}_${site.id}`;
      const valKeys = Object.keys(scan.entryModules ?? {}).filter((k) => k.startsWith(site.fnId + '_'));
      // The unnamed string[] child has NO entry of its own.
      expect(valKeys).toEqual([parentKey]);
      const source = scan.entryModules![parentKey];
      expect(source, 'inlined loop should ride a context fn').toContain('ctxFn0(');
      expect(source, 'no per-call IIFE').not.toContain('(function(){');

      // Materialize the live factory (emitMode both → trailing tuple slot)
      // and prove the inlined validator behaves.
      const tuples = evalEntryModules(scan.entryModules!);
      const tuple = tuples[parentKey] as readonly unknown[];
      const createRTFn = tuple[tuple.length - 1] as (utl: unknown) => (v: unknown) => boolean;
      expect(createRTFn).toBeTypeOf('function');
      const isParent = createRTFn({});
      expect(isParent({tags: []})).toBe(true);
      expect(isParent({tags: ['a', 'b']})).toBe(true);
      expect(isParent({tags: ['a', 1]})).toBe(false);
      expect(isParent({tags: 'nope'})).toBe(false);
      expect(isParent({})).toBe(false);
    });
  });

  register('reflect: reflectRunTypeId over the same unnamed-array parent keeps the inlined layout', async () => {
    const code = `import {createValidate, reflectRunTypeId} from '@mionjs/ts-go-run-types';
type Parent = {tags: string[]};
export const isParent = createValidate<Parent>();
const p = {tags: ['a']} as Parent;
export const reflectedId = reflectRunTypeId(p);
`;
    await withAllInternalClient({'parent-reflect.ts': code}, async (client) => {
      const scan = await client.scanFiles(['parent-reflect.ts'], {includeEntryModules: true});
      const create = scan.sites.find((s) => s.fnId);
      const reflect = scan.sites.find((s) => !s.fnId && s.id);
      if (!create?.fnId || !reflect) throw new Error('expected both marker forms');
      // Both forms resolve the same root type id (form equivalence).
      expect(reflect.id).toBe(create.id);
      const valKeys = Object.keys(scan.entryModules ?? {}).filter((k) => k.startsWith(create.fnId + '_'));
      expect(valKeys).toEqual([`${create.fnId}_${create.id}`]);
    });
  });

  register('named alias array stays an external shared entry', async () => {
    const code = `import {createValidate} from '@mionjs/ts-go-run-types';
type Tags = string[];
type Parent = {tags: Tags};
export const isParent = createValidate<Parent>();
`;
    await withAllInternalClient({'named.ts': code}, async (client) => {
      const scan = await client.scanFiles(['named.ts'], {includeEntryModules: true});
      const site = scan.sites.find((s) => s.fnId);
      if (!site?.fnId) throw new Error('expected a createValidate site');
      const valKeys = Object.keys(scan.entryModules ?? {}).filter((k) => k.startsWith(site.fnId + '_'));
      expect(valKeys.length, 'parent + named Tags entry').toBe(2);
    });
  });
});
