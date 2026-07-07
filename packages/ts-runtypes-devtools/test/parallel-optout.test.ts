// Pins the parallelism opt-outs: a client built with parallelScan /
// parallelRender set to false spawns the binary with --no-parallel-scan /
// --no-parallel-render and the serial paths still serve a full scan —
// sites for BOTH marker forms (static getRunTypeId<T>() and reflection
// getRunTypeId(value)) plus rendered cache sources.
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {ResolverClient} from '../src/resolver-client.ts';
import {BIN, RUNTYPES_DTS, hasBinary} from './helpers/inline.ts';

const ROOT = path.resolve(__dirname, '../../..');

const SOURCE = `import {createValidate, getRunTypeId} from '@ts-runtypes/core';
export interface User {id: number; name: string}
export const v = createValidate<User>();
export const idStatic = getRunTypeId<User>();
const u: User = {id: 1, name: 'a'};
export const idReflect = getRunTypeId(u);
`;

describe.skipIf(!hasBinary())('parallelism opt-outs', () => {
  it('serves a full scan with both parallel tracks disabled', async () => {
    const client = new ResolverClient(BIN, ROOT, '', {
      serverMode: true,
      parallelScan: false,
      parallelRender: false,
    });
    try {
      await client.setSources({'runtypes.d.ts': RUNTYPES_DTS, 'optout.ts': SOURCE});
      const response = await client.scanFiles(['optout.ts'], {includeEntryModules: true});
      // One site per marker call: createValidate + static + reflect forms.
      expect(response.sites).toHaveLength(3);
      const ids = new Set(response.sites.map((site) => site.id));
      // All three calls resolve the same User shape — one wire id.
      expect(ids.size).toBe(1);
      expect(Object.keys(response.entryModules ?? {}).length).toBeTruthy();
    } finally {
      client.close();
    }
  });
});
