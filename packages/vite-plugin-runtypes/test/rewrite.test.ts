import {describe, expect} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {rewrite} from '../src/rewrite.ts';
import {ReflectionKind, type RunType} from '../src/protocol.ts';
import {BIN, runTest, withInlineSources, RUNTYPES_DTS} from './helpers/inline.ts';

function findMember(types: RunType[], root: RunType, name: string): RunType | undefined {
  for (const ref of root.children ?? []) {
    const m = types.find((x) => x.id === ref.id);
    if (m && m.name === name) return m;
  }
  return undefined;
}

describe('vite-plugin-runtypes / rewrite', () => {
  runTest(
    'F9 static: rewrites getRuntypeId<User>() to pass a hash site id',
    {
      'user.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
getRuntypeId<User>();
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {code: out, sites} = await rewrite('user.ts', sources['user.ts'], client);

        expect(sites.length).toBe(1);
        expect(typeof sites[0].id).toBe('string');
        expect(sites[0].id).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
        // Static form has no preceding arguments — the injected id sits in slot 0.
        expect(out).toContain(`getRuntypeId<User>(${JSON.stringify(sites[0].id)});`);
      });
    }
  );

  runTest(
    'F9 reflect: rewrites reflectRuntypeId(u) to pass a hash site id',
    {
      'user-reflect.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
reflectRuntypeId(u);
`,
    },
    async (sources) => {
      await withInlineSources(sources, async ({client}) => {
        const {code: out, sites} = await rewrite('user-reflect.ts', sources['user-reflect.ts'], client);

        expect(sites.length).toBe(1);
        expect(sites[0].id).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
        // Reflect form: `u` is arg 0, the injected id is arg 1.
        expect(out).toContain(`reflectRuntypeId(u, ${JSON.stringify(sites[0].id)});`);
      });
    }
  );

  runTest(
    'F10 static: cache contains User alias with reflection-shape propertySignatures',
    {
      'user.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
getRuntypeId<User>();
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
      'user-reflect.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
reflectRuntypeId(u);
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
    'F6 static: getRuntypeId<routes>() carries nested object+function shape',
    {
      'router-static.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const myAPI = getRuntypeId<{sayHello: (name: string) => string}>();
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
    'F6 reflect: reflectRuntypeId(routes) infers nested object+function shape',
    {
      'router-reflect.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const sayHello = (name: string): string => 'Hello ' + name;
const routes = {sayHello};
const myAPI = reflectRuntypeId(routes);
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
      'primitive-static.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const info = getRuntypeId<string>();
`,
    },
    async (sources) => {
      await assertNoNewTypesOnReResolve(sources, 'primitive-static.ts');
    }
  );

  runTest(
    'dedup reflect: re-resolving the same file adds no new types',
    {
      'primitive-reflect.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const userName: string = 'mario';
const info = reflectRuntypeId(userName);
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
      'router-static.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const myAPI = getRuntypeId<{sayHello: (name: string) => string}>();
`,
    },
    async (sources) => {
      await assertCacheModuleHasSayHelloRoot(sources, 'router-static.ts');
    }
  );

  runTest(
    'F17 reflect: rendered cache module exports a knotted reflection RunType graph',
    {
      'router-reflect.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const sayHello = (name: string): string => 'Hello ' + name;
const routes = {sayHello};
const myAPI = reflectRuntypeId(routes);
`,
    },
    async (sources) => {
      await assertCacheModuleHasSayHelloRoot(sources, 'router-reflect.ts');
    }
  );

  async function assertCacheModuleHasSayHelloRoot(sources: Record<string, string>, file: string) {
    const cacheSource = await withInlineSources(sources, async ({client}) => {
      await rewrite(file, sources[file], client);
      const dump = await client.dump();
      return dump.runTypeCacheSource ?? '';
    });

    expect(cacheSource).toContain('export const t_');

    // Same rewrite as inline.ts/evalCacheFor — see the comment there.
    const js = cacheSource.replace(/export const (\w+) = /g, 'var $1 = result.$1 = ');
    const factory = new Function(`const result = {}; ${js}; return result;`);
    const result = factory() as Record<string, any>;
    const entries = Object.values(result).filter(
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
      expect(t.id.length).toBeGreaterThan(0);
    }
  }

  // CLI round-trip via spawnSync — kept as a single test (one form is
  // sufficient to verify the binary boundary). Uses runTest for the source
  // hoist + skip gate; the body short-circuits to a raw spawnSync since this
  // test bypasses the in-process ResolverClient entirely.
  runTest(
    "CLI --out-ts produces a parseable module identical in shape to the plugin's output",
    {
      'router.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const sayHello = (name: string): string => 'Hello ' + name;
const routes = {sayHello};
const myAPI = reflectRuntypeId(routes);
`,
    },
    async (sources) => {
      const tmp = path.join(__dirname, '.tmp-cache.ts');
      const handshake = JSON.stringify({sources: {'runtypes.d.ts': RUNTYPES_DTS, 'router.ts': sources['router.ts']}}) + '\n';
      const request = JSON.stringify({op: 'scanFiles', files: ['router.ts']}) + '\n';
      const out = spawnSync(BIN, ['--cwd', path.resolve(__dirname, '../../..'), '--inline-sources-stdin', '--out-ts', tmp], {
        input: handshake + request,
      });
      expect(out.status).toBe(0);
      const generated = fs.readFileSync(tmp, 'utf8');
      expect(generated).toMatch(/export const t_[A-Za-z][A-Za-z0-9_]*\s*=/);
      // Output is now plain JS — no TypeScript annotations to assert against.
      expect(generated).not.toContain(': any');
      fs.unlinkSync(tmp);
    }
  );
});
