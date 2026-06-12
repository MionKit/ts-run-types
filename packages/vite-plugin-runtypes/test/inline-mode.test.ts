// Inlining policy, end to end. DEFAULT mode applies the name rule: UNNAMED
// compounds (arrays, tuples, object literals, unions, classes) inline into
// their parents — no per-child cache entry; the child's statement block
// hoists to a per-factory context fn. NAMED types (alias or interface) and
// circular types keep the external dependency-call path as dedupe-worthy
// shared entries. `inlineMode: 'allInternal'` is name-blind — everything
// except circular inlines. This file also MATERIALIZES the inlined factory
// to prove it validates correctly at runtime.

import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ResolverClient} from '../src/resolver-client.ts';
import {BIN, hasBinary, RUNTYPES_DTS, evalEntryModules} from './helpers/inline.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const register = hasBinary() ? it : it.skip;

async function withClient<T>(
  inlineMode: 'default' | 'allInternal' | undefined,
  sources: Record<string, string>,
  fn: (client: ResolverClient) => Promise<T>
): Promise<T> {
  const client = new ResolverClient(BIN, ROOT, '', {
    serverMode: true,
    ...(inlineMode ? {inlineMode} : {}),
    emitMode: 'both', // ship the live factory so tests can run the validator
  });
  try {
    await client.setSources({'runtypes.d.ts': RUNTYPES_DTS, ...sources});
    return await fn(client);
  } finally {
    client.close();
  }
}

async function valKeysFor(client: ResolverClient, file: string) {
  const scan = await client.scanFiles([file], {includeEntryModules: true});
  const site = scan.sites.find((s) => s.fnId);
  if (!site?.fnId) throw new Error('expected a createValidate site');
  const keys = Object.keys(scan.entryModules ?? {}).filter((k) => k.startsWith(site.fnId + '_'));
  return {scan, site, keys};
}

describe('vite-plugin-runtypes / inlining policy', () => {
  register('DEFAULT: interface A {a: number; b: string[]} emits ONE validation module', async () => {
    // The headline contract: the unnamed string[] member rides the
    // interface's own module as a context fn — no separate array module.
    const code = `import {createValidate} from '@mionjs/ts-go-run-types';
interface A {a: number; b: string[]}
export const isA = createValidate<A>();
`;
    await withClient(undefined, {'iface.ts': code}, async (client) => {
      const {scan, keys} = await valKeysFor(client, 'iface.ts');
      expect(keys.length, 'ONE validation module for the whole interface').toBe(1);
      const source = scan.entryModules![keys[0]];
      expect(source, 'string[] loop rides the parent context').toContain('ctxFn0(');
      expect(source, 'no per-call IIFE').not.toContain('(function(){');

      // And the single-module validator behaves at runtime.
      const tuples = evalEntryModules(scan.entryModules!);
      const tuple = tuples[keys[0]] as readonly unknown[];
      const createRTFn = tuple[tuple.length - 1] as (utl: unknown) => (v: unknown) => boolean;
      const isA = createRTFn({});
      expect(isA({a: 1, b: ['x', 'y']})).toBe(true);
      expect(isA({a: 1, b: []})).toBe(true);
      expect(isA({a: 1, b: ['x', 2]})).toBe(false);
      expect(isA({a: 'no', b: ['x']})).toBe(false);
      expect(isA({a: 1})).toBe(false);
    });
  });

  register('DEFAULT reflect: reflectRunTypeId over the same parent keeps the single-module layout', async () => {
    const code = `import {createValidate, reflectRunTypeId} from '@mionjs/ts-go-run-types';
type Parent = {tags: string[]};
export const isParent = createValidate<Parent>();
const p = {tags: ['a']} as Parent;
export const reflectedId = reflectRunTypeId(p);
`;
    await withClient(undefined, {'parent-reflect.ts': code}, async (client) => {
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

  register('DEFAULT: a NAMED alias array stays an external shared module (dedupe)', async () => {
    const code = `import {createValidate} from '@mionjs/ts-go-run-types';
type Tags = string[];
type Parent = {tags: Tags};
export const isParent = createValidate<Parent>();
`;
    await withClient(undefined, {'named.ts': code}, async (client) => {
      const {keys} = await valKeysFor(client, 'named.ts');
      expect(keys.length, 'parent + named Tags entry').toBe(2);
    });
  });

  register('allInternal: name-blind — even the NAMED alias array inlines', async () => {
    const code = `import {createValidate} from '@mionjs/ts-go-run-types';
type Tags = string[];
type Parent = {tags: Tags};
export const isParent = createValidate<Parent>();
`;
    await withClient('allInternal', {'named-internal.ts': code}, async (client) => {
      const {keys} = await valKeysFor(client, 'named-internal.ts');
      expect(keys.length, 'one module — names ignored under allInternal').toBe(1);
    });
  });
});
