// Module-mode rewriting — the per-entry virtual-module pipeline:
// `[id, fnId, [rtN…]]` / `[id, [rtN…]]` tuple shapes, EOF import hoisting,
// per-file binding allocation (dedup + collision fallback), byte-offset
// stability against multibyte sources, and the wire contract (Site.deps +
// Response.modules survive JSON marshalling — guards the hand-written
// Response.MarshalJSON allowlist that silently dropped `modules` once).
//
// Marker coverage rule: fn-entry scenarios pair the static form
// (`createValidate<T>()`) with the reflection form (`createValidate(v)`).
import {describe, expect} from 'vitest';
import {rewrite} from '../src/rewrite.ts';
import {VIRTUAL_RUNTYPES_PREFIX} from '../src/runtypes-constants.generated.ts';
import type {ResolverClient, ScanFilesResult} from '../src/resolver-client.ts';
import type {SiteScanner} from '../src/scan-batcher.ts';
import {runTest, withInlineSources} from './helpers/inline.ts';

// moduleScanner adapts the shared client into the SiteScanner shape the
// rewrite pipeline takes, opting every scan into module mode — what the
// plugin's configResolved batcher callback does in production.
function moduleScanner(client: ResolverClient): SiteScanner & {last?: ScanFilesResult} {
  const scanner: SiteScanner & {last?: ScanFilesResult} = {
    async scanFiles(files: string[]) {
      const result = await client.scanFiles(files, {includeModules: true});
      scanner.last = result;
      return result;
    },
  };
  return scanner;
}

const USER_SOURCE = `import {createValidate} from '@mionjs/ts-go-run-types';
interface Address { city: string }
interface User { name: string; address: Address }
export const isUser = createValidate<User>();
`;

describe('vite-plugin-runtypes / module-mode rewrite', () => {
  runTest('static createValidate: 3-tuple + EOF import block, leafs first', {'user.ts': USER_SOURCE}, async (sources) => {
    await withInlineSources(sources, async ({client}) => {
      const scanner = moduleScanner(client);
      const {code: out, sites} = await rewrite('user.ts', sources['user.ts'], scanner);
      expect(sites.length).toBe(1);
      const site = sites[0];
      expect(site.deps?.length).toBeGreaterThanOrEqual(2);
      // Tuple shape: [id, fnId, [rt1, …, rtN]] with the root binding LAST
      // (deps are leafs-first, root last).
      const bindings = site.deps!.map((_, index) => `rt${index + 1}`);
      expect(out).toContain(
        `createValidate<User>(undefined, undefined, ["${site.id}", "${site.fnId}", [${bindings.join(', ')}]]);`
      );
      // One EOF import per dep key, in deps order, binding the module's `entry`.
      for (let index = 0; index < site.deps!.length; index++) {
        expect(out).toContain(`import {entry as rt${index + 1}} from '${VIRTUAL_RUNTYPES_PREFIX}${site.deps![index]}.js';`);
      }
      // Imports ride at EOF — after the rewritten call.
      expect(out.indexOf('import {entry as rt1}')).toBeGreaterThan(out.indexOf('createValidate<User>('));
      // The root entry key is the last dep.
      expect(site.deps![site.deps!.length - 1]).toBe(`${site.fnId}_${site.id}`);
    });
  });

  runTest(
    'reflect createValidate: same id and closure as the static form',
    {
      'user-static.ts': USER_SOURCE,
      'user-reflect.ts': `import {createValidate} from '@mionjs/ts-go-run-types';
interface Address { city: string }
interface User { name: string; address: Address }
const u: User = {name: 'x', address: {city: 'y'}};
export const isUser = createValidate(u);
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const scanner = moduleScanner(client);
        const staticOut = await rewrite('user-static.ts', sources['user-static.ts'], scanner);
        const reflectOut = await rewrite('user-reflect.ts', sources['user-reflect.ts'], scanner);
        expect(staticOut.sites[0].id).toBe(reflectOut.sites[0].id);
        expect(staticOut.sites[0].deps).toEqual(reflectOut.sites[0].deps);
        expect(reflectOut.code).toContain(`createValidate(u, undefined, ["${reflectOut.sites[0].id}"`);
      });
    }
  );

  runTest(
    'two sites sharing a dep: one import per key, bindings shared across tuples',
    {
      'two.ts': `import {createValidate} from '@mionjs/ts-go-run-types';
interface Address { city: string }
interface User { name: string; address: Address }
interface Company { hq: Address }
export const isUser = createValidate<User>();
export const isCompany = createValidate<Company>();
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const scanner = moduleScanner(client);
        const {code: out, sites} = await rewrite('two.ts', sources['two.ts'], scanner);
        expect(sites.length).toBe(2);
        const allKeys = new Set(sites.flatMap((site) => site.deps ?? []));
        // Exactly one import line per distinct key.
        const importCount = (out.match(/^import \{entry as /gm) ?? []).length;
        expect(importCount).toBe(allKeys.size);
        // The shared Address validator key appears in both sites' deps.
        const shared = [...allKeys].filter((key) => sites.every((site) => site.deps?.includes(key)));
        expect(shared.length).toBeGreaterThanOrEqual(1);
      });
    }
  );

  runTest(
    'binding collision: user rtN identifiers push allocation to _rtN',
    {
      'clash.ts': `import {createValidate} from '@mionjs/ts-go-run-types';
const rt1 = 'user code owns this name';
interface User { name: string }
export const isUser = createValidate<User>();
export const keep = rt1;
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const scanner = moduleScanner(client);
        const {code: out} = await rewrite('clash.ts', sources['clash.ts'], scanner);
        expect(out).toContain('import {entry as _rt1}');
        expect(out).not.toMatch(/import \{entry as rt1\}/);
      });
    }
  );

  runTest(
    'multibyte source: splices and EOF imports stay byte-aligned',
    {
      'emoji.ts': `import {createValidate} from '@mionjs/ts-go-run-types';
// — em-dash and emoji 🎉🎉🎉 before the call site —
interface User { name: string }
export const isUser = createValidate<User>();
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const scanner = moduleScanner(client);
        const {code: out, sites} = await rewrite('emoji.ts', sources['emoji.ts'], scanner);
        const site = sites[0];
        // The tuple landed inside the call parens (not skewed into the
        // comment), and the emoji line is untouched.
        expect(out).toContain(`createValidate<User>(undefined, undefined, ["${site.id}"`);
        expect(out).toContain('🎉🎉🎉 before the call site');
      });
    }
  );

  runTest(
    'graph-demand site (createMockType): [id, [deps]] with t_ module keys',
    {
      'mock.ts': `import {createMockType} from '@mionjs/ts-go-run-types';
interface Address { city: string }
interface User { name: string; address: Address; created: Date }
export const mockUser = createMockType<User>();
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const scanner = moduleScanner(client);
        const {code: out, sites} = await rewrite('mock.ts', sources['mock.ts'], scanner);
        const site = sites[0];
        expect(site.fnId).toBeUndefined();
        expect(site.deps!.every((key) => key.startsWith('t_'))).toBe(true);
        expect(site.deps![site.deps!.length - 1]).toBe(`t_${site.id}`);
        const bindings = site.deps!.map((_, index) => `rt${index + 1}`);
        expect(out).toContain(`createMockType<User>(undefined, undefined, ["${site.id}", [${bindings.join(', ')}]]);`);
      });
    }
  );

  runTest(
    'bare reflection site (getRunTypeId): id string only, no imports',
    {
      'bare.ts': `import {getRunTypeId} from '@mionjs/ts-go-run-types';
interface User { name: string }
export const id = getRunTypeId<User>();
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const scanner = moduleScanner(client);
        const {code: out, sites} = await rewrite('bare.ts', sources['bare.ts'], scanner);
        expect(sites[0].deps).toBeUndefined();
        expect(out).toContain(`getRunTypeId<User>("${sites[0].id}");`);
        expect(out).not.toContain('import {entry as');
      });
    }
  );

  runTest('wire contract: Site.deps and Response.modules survive JSON marshalling', {'user.ts': USER_SOURCE}, async (sources) => {
    await withInlineSources(sources, async ({client}) => {
      // The shared client IS the wire (JSON-per-line stdio), so asserting on
      // its result covers the Go Response.MarshalJSON allowlist.
      const result = await client.scanFiles(['user.ts'], {includeModules: true});
      const site = result.sites[0];
      expect(site.deps?.length).toBeGreaterThanOrEqual(2);
      for (const key of site.deps!) {
        const source = result.modules?.[key];
        expect(source, `module body for ${key}`).toBeTruthy();
        expect(source).toContain(`export const entry = ['${key}'`);
      }
    });
  });
});
