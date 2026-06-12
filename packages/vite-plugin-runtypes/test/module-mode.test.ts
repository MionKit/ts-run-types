// moduleMode wiring: allSingle (per-family bundle modules + named-export
// imports at call sites) and allModules (per-node runtype modules — the
// pre-bundle layout). Default-mode shapes are locked by rewrite.test.ts.
// Each mode spawns its own --inline-server resolver (the shared per-worker
// client runs the binary default).

import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ResolverClient} from '../src/resolver-client.ts';
import {rewrite} from '../src/rewrite.ts';
import {BIN, hasBinary, RUNTYPES_DTS} from './helpers/inline.ts';
import {
  ENTRY_BINDING_PREFIX,
  FNS_BUNDLE_DIR,
  MODULE_MODE_ALL_MODULES,
  MODULE_MODE_ALL_SINGLE,
  RUNTYPES_BUNDLE_BASENAME,
  VIRTUAL_MODULE_PREFIX,
} from '../src/runtypes-constants.generated.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const register = hasBinary() ? it : it.skip;

async function withModeClient<T>(
  mode: string,
  sources: Record<string, string>,
  fn: (client: ResolverClient) => Promise<T>
): Promise<T> {
  const client = new ResolverClient(BIN, ROOT, '', {serverMode: true, moduleMode: mode});
  try {
    await client.setSources({'runtypes.d.ts': RUNTYPES_DTS, ...sources});
    return await fn(client);
  } finally {
    client.close();
  }
}

describe('vite-plugin-runtypes / moduleMode', () => {
  register('allSingle static: getRunTypeId<T>() imports its binding as a NAMED export of the runtypes bundle', async () => {
    const code = `import {getRunTypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
export const staticId = getRunTypeId<User>();
`;
    await withModeClient(MODULE_MODE_ALL_SINGLE, {'user.ts': code}, async (client) => {
      const {code: out, sites} = await rewrite('user.ts', code, client);
      expect(sites.length).toBe(1);
      expect(sites[0].module).toBe(RUNTYPES_BUNDLE_BASENAME);
      const binding = ENTRY_BINDING_PREFIX + sites[0].id;
      expect(out).toContain(`import {${binding}} from '${VIRTUAL_MODULE_PREFIX}${RUNTYPES_BUNDLE_BASENAME}.js';`);
      expect(out).toContain(`getRunTypeId<User>(${binding});`);
    });
  });

  register(
    'allSingle reflect: reflectRunTypeId(value) imports its binding as a NAMED export of the runtypes bundle',
    async () => {
      const code = `import {reflectRunTypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
export const reflectedId = reflectRunTypeId(u);
`;
      await withModeClient(MODULE_MODE_ALL_SINGLE, {'user-reflect.ts': code}, async (client) => {
        const {code: out, sites} = await rewrite('user-reflect.ts', code, client);
        expect(sites.length).toBe(1);
        expect(sites[0].module).toBe(RUNTYPES_BUNDLE_BASENAME);
        const binding = ENTRY_BINDING_PREFIX + sites[0].id;
        expect(out).toContain(`import {${binding}} from '${VIRTUAL_MODULE_PREFIX}${RUNTYPES_BUNDLE_BASENAME}.js';`);
        expect(out).toContain(`reflectRunTypeId(u, ${binding});`);
      });
    }
  );

  register('allSingle createX: two validate sites dedupe into ONE family-bundle import statement', async () => {
    const code = `import {createValidate} from '@mionjs/ts-go-run-types';
interface Alpha { alphaProp: string }
interface Beta { betaProp: number }
export const isAlpha = createValidate<Alpha>();
export const isBeta = createValidate<Beta>();
`;
    await withModeClient(MODULE_MODE_ALL_SINGLE, {'pair.ts': code}, async (client) => {
      const {code: out, sites} = await rewrite('pair.ts', code, client);
      expect(sites.length).toBe(2);
      const valSpecifier = `${VIRTUAL_MODULE_PREFIX}${FNS_BUNDLE_DIR}/val.js`;
      for (const site of sites) expect(site.module).toBe(`${FNS_BUNDLE_DIR}/val`);
      // Exactly one import statement for the bundle, carrying both bindings.
      const occurrences = out.split(`from '${valSpecifier}'`).length - 1;
      expect(occurrences).toBe(1);
      const bindings = sites.map((site) => `${ENTRY_BINDING_PREFIX}${site.fnId}_${site.id}`).sort();
      expect(out).toContain(`import {${bindings.join(', ')}} from '${valSpecifier}';`);
      // The bundle itself serves both entries as named exports.
      const scan = await client.scanFiles(['pair.ts'], {includeEntryModules: true});
      const bundle = scan.entryModules?.[`${FNS_BUNDLE_DIR}/val`];
      expect(bundle).toBeDefined();
      for (const binding of bindings) expect(bundle).toContain(`export const ${binding}=[`);
    });
  });

  register('allModules static: getRunTypeId<T>() imports a per-node module (kind 0) with child imports', async () => {
    const code = `import {getRunTypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
export const staticId = getRunTypeId<User>();
`;
    await withModeClient(MODULE_MODE_ALL_MODULES, {'user.ts': code}, async (client) => {
      const {code: out, sites} = await rewrite('user.ts', code, client);
      expect(sites.length).toBe(1);
      expect(sites[0].module ?? '').toBe('');
      // Per-entry form: today's e-rename import of the root node module.
      expect(out).toContain(
        `import {e as ${ENTRY_BINDING_PREFIX}${sites[0].id}} from '${VIRTUAL_MODULE_PREFIX}${sites[0].id}.js';`
      );
      const scan = await client.scanFiles(['user.ts'], {includeEntryModules: true});
      expect(scan.entryModules?.[RUNTYPES_BUNDLE_BASENAME]).toBeUndefined();
      const rootModule = scan.entryModules?.[sites[0].id];
      expect(rootModule).toBeDefined();
      expect(rootModule).toMatch(/export const e=\[0,deps,/);
      expect(rootModule).toContain('import {e as d1}');
    });
  });

  register('allModules reflect: reflectRunTypeId(value) resolves to the same per-node layout', async () => {
    const code = `import {reflectRunTypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
export const reflectedId = reflectRunTypeId(u);
`;
    await withModeClient(MODULE_MODE_ALL_MODULES, {'user-reflect.ts': code}, async (client) => {
      const {code: out, sites} = await rewrite('user-reflect.ts', code, client);
      expect(sites.length).toBe(1);
      expect(out).toContain(`reflectRunTypeId(u, ${ENTRY_BINDING_PREFIX}${sites[0].id});`);
      const scan = await client.scanFiles(['user-reflect.ts'], {includeEntryModules: true});
      const rootModule = scan.entryModules?.[sites[0].id];
      expect(rootModule).toBeDefined();
      expect(rootModule).toMatch(/export const e=\[0,deps,/);
    });
  });
});
