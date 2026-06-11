import {describe, expect} from 'vitest';
import {rewrite} from '../src/rewrite.ts';
import {ReflectionKind, type RunType} from '../src/protocol.ts';
import {evalCacheFor, runTest, withInlineSources} from './helpers/inline.ts';

function findMember(types: RunType[], root: RunType, name: string): RunType | undefined {
  for (const ref of root.children ?? []) {
    const m = types.find((x) => x.id === ref.id);
    if (m && m.name === name) return m;
  }
  return undefined;
}

describe('vite-plugin-runtypes / rewrite', () => {
  runTest(
    'F9 static: rewrites getRunTypeId<User>() to pass a hash site id',
    {
      'user.ts': `import {getRunTypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
getRunTypeId<User>();
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {code: out, sites} = await rewrite('user.ts', sources['user.ts'], client);

        expect(sites.length).toBe(1);
        expect(typeof sites[0].id).toBe('string');
        expect(sites[0].id).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
        // Static form has no preceding arguments — the injected id sits in slot 0.
        expect(out).toContain(`getRunTypeId<User>(${JSON.stringify(sites[0].id)});`);
      });
    }
  );

  runTest(
    'F9 reflect: rewrites reflectRunTypeId(u) to pass a hash site id',
    {
      'user-reflect.ts': `import {reflectRunTypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
reflectRunTypeId(u);
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {code: out, sites} = await rewrite('user-reflect.ts', sources['user-reflect.ts'], client);

        expect(sites.length).toBe(1);
        expect(sites[0].id).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
        // Reflect form: `u` is arg 0, the injected id is arg 1.
        expect(out).toContain(`reflectRunTypeId(u, ${JSON.stringify(sites[0].id)});`);
      });
    }
  );

  runTest(
    'F10 static: cache contains User alias with reflection-shape propertySignatures',
    {
      'user.ts': `import {getRunTypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
getRunTypeId<User>();
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        await rewrite('user.ts', sources['user.ts'], client);
        await assertUserCacheShape(client);
      });
    }
  );

  runTest(
    'F10 reflect: cache contains User alias with reflection-shape propertySignatures',
    {
      'user-reflect.ts': `import {reflectRunTypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
reflectRunTypeId(u);
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        await rewrite('user-reflect.ts', sources['user-reflect.ts'], client);
        await assertUserCacheShape(client);
      });
    }
  );

  async function assertUserCacheShape(client: {dump: () => Promise<{runTypes?: RunType[]}>}) {
    const dump = await client.dump();
    const runTypes = dump.runTypes ?? [];
    const user = runTypes.find((t) => t.typeName === 'User');
    expect(user).toBeDefined();
    expect(user!.kind).toBe(ReflectionKind.objectLiteral);

    const id = findMember(runTypes, user!, 'id');
    const name = findMember(runTypes, user!, 'name');
    expect(id?.kind).toBe(ReflectionKind.propertySignature);
    expect(name?.kind).toBe(ReflectionKind.propertySignature);

    const idType = runTypes.find((t) => t.id === id!.child!.id);
    const nameType = runTypes.find((t) => t.id === name!.child!.id);
    expect(idType?.kind).toBe(ReflectionKind.number);
    expect(nameType?.kind).toBe(ReflectionKind.string);
  }

  runTest(
    'F6 static: getRunTypeId<routes>() carries nested object+function shape',
    {
      'router-static.ts': `import {getRunTypeId} from '@mionjs/ts-go-run-types';
const myAPI = getRunTypeId<{sayHello: (name: string) => string}>();
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {sites} = await rewrite('router-static.ts', sources['router-static.ts'], client);
          expect(sites.length).toBeGreaterThan(0);
          await assertSayHelloRouterShape(client);
        },
        {reset: true}
      );
    }
  );

  runTest(
    'F6 reflect: reflectRunTypeId(routes) infers nested object+function shape',
    {
      'router-reflect.ts': `import {reflectRunTypeId} from '@mionjs/ts-go-run-types';
const sayHello = (name: string): string => 'Hello ' + name;
const routes = {sayHello};
const myAPI = reflectRunTypeId(routes);
`,
    },
    async (sources) => {
      await withInlineSources(
        sources,
        async ({client}) => {
          const {sites} = await rewrite('router-reflect.ts', sources['router-reflect.ts'], client);
          expect(sites.length).toBeGreaterThan(0);
          await assertSayHelloRouterShape(client);
        },
        {reset: true}
      );
    }
  );

  async function assertSayHelloRouterShape(client: {dump: () => Promise<{runTypes?: RunType[]}>}) {
    const dump = await client.dump();
    const runTypes = dump.runTypes ?? [];
    const root = runTypes.find((t) => t.kind === ReflectionKind.objectLiteral && (t.children ?? []).length > 0);
    expect(root).toBeDefined();

    const sayHello = findMember(runTypes, root!, 'sayHello');
    expect(sayHello).toBeDefined();
    let fn: RunType | undefined = sayHello;
    if (sayHello!.kind === ReflectionKind.propertySignature) {
      fn = runTypes.find((t) => t.id === sayHello!.child!.id);
    }
    expect(fn?.parameters?.length).toBe(1);
  }

  runTest(
    'dedup static: re-resolving the same file adds no new types',
    {
      'primitive-static.ts': `import {getRunTypeId} from '@mionjs/ts-go-run-types';
const info = getRunTypeId<string>();
`,
    },
    async (sources) => {
      await assertNoNewTypesOnReResolve(sources, 'primitive-static.ts');
    }
  );

  runTest(
    'dedup reflect: re-resolving the same file adds no new types',
    {
      'primitive-reflect.ts': `import {reflectRunTypeId} from '@mionjs/ts-go-run-types';
const userName: string = 'mario';
const info = reflectRunTypeId(userName);
`,
    },
    async (sources) => {
      await assertNoNewTypesOnReResolve(sources, 'primitive-reflect.ts');
    }
  );

  async function assertNoNewTypesOnReResolve(sources: Record<string, string>, file: string) {
    await withInlineSources(sources, async ({client}) => {
      await rewrite(file, sources[file], client);
      const before = (await client.dump()).runTypes?.length ?? 0;
      await rewrite(file, sources[file], client);
      const after = (await client.dump()).runTypes?.length ?? 0;
      expect(after).toBe(before);
    });
  }
});

describe('vite-plugin-runtypes / generated module', () => {
  runTest(
    'F17 static: rendered cache module exports a knotted reflection RunType graph',
    {
      'router-static.ts': `import {getRunTypeId} from '@mionjs/ts-go-run-types';
const myAPI = getRunTypeId<{sayHello: (name: string) => string}>();
`,
    },
    async (sources) => {
      await assertCacheModuleHasSayHelloRoot(sources, 'router-static.ts');
    }
  );

  runTest(
    'F17 reflect: rendered cache module exports a knotted reflection RunType graph',
    {
      'router-reflect.ts': `import {reflectRunTypeId} from '@mionjs/ts-go-run-types';
const sayHello = (name: string): string => 'Hello ' + name;
const routes = {sayHello};
const myAPI = reflectRunTypeId(routes);
`,
    },
    async (sources) => {
      await assertCacheModuleHasSayHelloRoot(sources, 'router-reflect.ts');
    }
  );

  async function assertCacheModuleHasSayHelloRoot(sources: Record<string, string>, file: string) {
    // Module mode: the knotted graph comes from the per-node `t_<id>` data
    // modules, registered through the production registrar — evalCacheFor
    // wraps exactly that pipeline.
    const cache = await evalCacheFor(sources);
    const site = cache.sites.find((s) => s.file === file);
    expect(site).toBeDefined();
    const entries = Object.values(cache.byHash).filter(
      (t): t is Record<string, any> => t !== null && typeof t === 'object' && 'kind' in t
    );
    expect(entries.length).toBeGreaterThan(0);

    const roots = entries.filter(
      (t) =>
        t.kind === ReflectionKind.objectLiteral && Array.isArray(t.children) && t.children.some((m: any) => m.name === 'sayHello')
    );
    expect(roots.length).toBeGreaterThan(0);
    const root = roots[0];
    const sayHello = root.children.find((m: any) => m.name === 'sayHello');
    expect(sayHello).toBeDefined();
    // Every cached RunType must carry its `id` (the primary cache handle).
    for (const t of entries) {
      expect(typeof t.id).toBe('string');
      expect((t.id as string).length).toBeGreaterThan(0);
    }
  }
});
