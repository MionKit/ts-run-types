// End-to-end acceptance for CompTimeArgs spread support, driven through the
// real Go binary over the inline-server pipeline.
//
//   - Builder spread: `object({...fragment, extra})` reflects the SAME merged
//     structural id as the fully-inlined `object({...all fields})`, proving the
//     spread merges the fragment rather than dropping it. (The fake d.ts is
//     augmented with the composer builders the plugin harness doesn't carry.)
//   - Option-bag spread: a `createJsonEncoder` call whose options come from a
//     `{...preset}` spread selects the same fnId variant as the inlined
//     equivalent — the Part C soundness guard, verified through the binary.

import {describe, expect, it} from 'vitest';
import {hasBinary, withInlineSources} from './helpers/inline.ts';

// Augments the harness's fake `ts-runtypes` with the composer builders this
// test needs. The marker scanner recognises them off the `ts-runtypes` module
// the same way it recognises the real builders.
const COMPOSERS_DTS = `import 'ts-runtypes';
declare module 'ts-runtypes' {
  export interface RunType<T = unknown> { readonly __rtType?: T }
  export type ObjectType<C> = {[K in keyof C]: C[K] extends RunType<infer T> ? T : C[K]};
  export function number(id?: InjectRunTypeId<number>): RunType<number>;
  export function string(id?: InjectRunTypeId<string>): RunType<string>;
  export function boolean(id?: InjectRunTypeId<boolean>): RunType<boolean>;
  export function object<const C extends Record<string, unknown>>(config: CompTimeArgs<C>, id?: InjectRunTypeId<ObjectType<C>>): RunType<ObjectType<C>>;
}
`;

describe('runtypes-devtools / CompTimeArgs spread', () => {
  const register = hasBinary() ? it : it.skip;

  register('object spread converges on the same structural id as the inlined object', async () => {
    const sources = {
      'composers.d.ts': COMPOSERS_DTS,
      'spread.ts': `import {object, number, string, boolean} from 'ts-runtypes';
export const spread = object({...{id: number(), name: string()}, active: boolean()});
export const inline = object({id: number(), name: string(), active: boolean()});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(['spread.ts'], {includeEntryModules: true});
      // The nested leaf builders are enclosed by each `object(...)` marker and
      // skipped, so exactly two sites survive — one per object() call.
      expect(response.sites.length).toBe(2);
      const [spread, inline] = response.sites;
      expect(spread.id).toBe(inline.id);
    });
  });

  register('option-bag spread selects the same fnId variant as the inlined options', async () => {
    const sources = {
      'opts.ts': `import {createJsonEncoder} from 'ts-runtypes';
const preset = {strategy: 'mutate'} as const;
export const a = createJsonEncoder<{x: number}>(undefined, {...preset});
export const b = createJsonEncoder<{x: number}>(undefined, {strategy: 'mutate'});
export const c = createJsonEncoder<{x: number}>(undefined, {strategy: 'clone'});
`,
    };
    await withInlineSources(sources, async ({client}) => {
      const response = await client.scanFiles(['opts.ts'], {includeEntryModules: true});
      expect(response.sites.length).toBe(3);
      const [spread, inlineMutate, inlineClone] = response.sites;
      // Same type + same effective strategy ('mutate') → identical fnId.
      expect(spread.fnId).toBe(inlineMutate.fnId);
      // A different strategy must differ, proving the spread didn't just match
      // the default.
      expect(spread.fnId).not.toBe(inlineClone.fnId);
    });
  });
});
