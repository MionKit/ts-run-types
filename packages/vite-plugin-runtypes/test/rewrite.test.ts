import {describe, it, expect} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {rewrite} from '../src/rewrite.ts';
import {renderCacheModule} from '../src/render-cache.ts';
import {ReflectionKind, type Type} from '../src/protocol.ts';
import {BIN, hasBinary, withInlineSources, RUNTYPES_DTS} from './helpers/inline.ts';

function findMember(types: Type[], root: Type, name: string): Type | undefined {
  for (const ref of root.types ?? []) {
    const m = types.find((x) => x.id === ref.id);
    if (m && m.name === name) return m;
  }
  return undefined;
}

describe('vite-plugin-runtypes / rewrite', () => {
  const runMaybe = hasBinary() ? it : it.skip;

  runMaybe('F9 static: rewrites getRuntypeId<User>() to pass a hash site id', async () => {
    const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
getRuntypeId<User>();
`;
    await withInlineSources({'user.ts': code}, async ({client, sources}) => {
      const {code: out, sites} = await rewrite('user.ts', sources['user.ts'], client);

      expect(sites.length).toBe(1);
      expect(typeof sites[0].id).toBe('string');
      expect(sites[0].id).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
      // Static form has no preceding arguments — the injected id sits in slot 0.
      expect(out).toContain(`getRuntypeId<User>(${JSON.stringify(sites[0].id)});`);
    });
  });

  runMaybe('F9 reflect: rewrites reflectRuntypeId(u) to pass a hash site id', async () => {
    const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
reflectRuntypeId(u);
`;
    await withInlineSources({'user-reflect.ts': code}, async ({client, sources}) => {
      const {code: out, sites} = await rewrite('user-reflect.ts', sources['user-reflect.ts'], client);

      expect(sites.length).toBe(1);
      expect(sites[0].id).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
      // Reflect form: `u` is arg 0, the injected id is arg 1.
      expect(out).toContain(`reflectRuntypeId(u, ${JSON.stringify(sites[0].id)});`);
    });
  });

  runMaybe('F10 static: cache contains User alias with reflection-shape propertySignatures', async () => {
    const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
getRuntypeId<User>();
`;
    await withInlineSources({'user.ts': code}, async ({client, sources}) => {
      await rewrite('user.ts', sources['user.ts'], client);
      assertUserCacheShape(client);
    });
  });

  runMaybe('F10 reflect: cache contains User alias with reflection-shape propertySignatures', async () => {
    const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
reflectRuntypeId(u);
`;
    await withInlineSources({'user-reflect.ts': code}, async ({client, sources}) => {
      await rewrite('user-reflect.ts', sources['user-reflect.ts'], client);
      assertUserCacheShape(client);
    });
  });

  async function assertUserCacheShape(client: {dump: () => Promise<{types?: Type[]}>}) {
    const dump = await client.dump();
    const types = dump.types ?? [];
    const user = types.find((t) => t.typeName === 'User');
    expect(user).toBeDefined();
    expect(user!.kind).toBe(ReflectionKind.objectLiteral);

    const id = findMember(types, user!, 'id');
    const name = findMember(types, user!, 'name');
    expect(id?.kind).toBe(ReflectionKind.propertySignature);
    expect(name?.kind).toBe(ReflectionKind.propertySignature);

    const idType = types.find((t) => t.id === id!.type!.id);
    const nameType = types.find((t) => t.id === name!.type!.id);
    expect(idType?.kind).toBe(ReflectionKind.number);
    expect(nameType?.kind).toBe(ReflectionKind.string);
  }

  runMaybe('F6 static: getRuntypeId<routes>() carries nested object+function shape', async () => {
    const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const myAPI = getRuntypeId<{sayHello: (name: string) => string}>();
`;
    await withInlineSources(
      {'router-static.ts': code},
      async ({client, sources}) => {
        const {sites} = await rewrite('router-static.ts', sources['router-static.ts'], client);
        expect(sites.length).toBeGreaterThan(0);
        assertSayHelloRouterShape(client);
      },
      {reset: true}
    );
  });

  runMaybe('F6 reflect: reflectRuntypeId(routes) infers nested object+function shape', async () => {
    const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const sayHello = (name: string): string => 'Hello ' + name;
const routes = {sayHello};
const myAPI = reflectRuntypeId(routes);
`;
    await withInlineSources(
      {'router-reflect.ts': code},
      async ({client, sources}) => {
        const {sites} = await rewrite('router-reflect.ts', sources['router-reflect.ts'], client);
        expect(sites.length).toBeGreaterThan(0);
        assertSayHelloRouterShape(client);
      },
      {reset: true}
    );
  });

  async function assertSayHelloRouterShape(client: {dump: () => Promise<{types?: Type[]}>}) {
    const dump = await client.dump();
    const types = dump.types ?? [];
    const root = types.find((t) => t.kind === ReflectionKind.objectLiteral && (t.types ?? []).length > 0);
    expect(root).toBeDefined();

    const sayHello = findMember(types, root!, 'sayHello');
    expect(sayHello).toBeDefined();
    let fn: Type | undefined = sayHello;
    if (sayHello!.kind === ReflectionKind.propertySignature) {
      fn = types.find((t) => t.id === sayHello!.type!.id);
    }
    expect(fn?.parameters?.length).toBe(1);
  }

  runMaybe('dedup static: re-resolving the same file adds no new types', async () => {
    const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const info = getRuntypeId<string>();
`;
    await assertNoNewTypesOnReResolve(code, 'primitive-static.ts');
  });

  runMaybe('dedup reflect: re-resolving the same file adds no new types', async () => {
    const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const userName: string = 'mario';
const info = reflectRuntypeId(userName);
`;
    await assertNoNewTypesOnReResolve(code, 'primitive-reflect.ts');
  });

  async function assertNoNewTypesOnReResolve(code: string, file: string) {
    await withInlineSources({[file]: code}, async ({client, sources}) => {
      await rewrite(file, sources[file], client);
      const before = (await client.dump()).types?.length ?? 0;
      await rewrite(file, sources[file], client);
      const after = (await client.dump()).types?.length ?? 0;
      expect(after).toBe(before);
    });
  }
});

describe('vite-plugin-runtypes / generated module', () => {
  const runMaybe = hasBinary() ? it : it.skip;

  runMaybe('F17 static: rendered cache module exports a knotted reflection Type graph', async () => {
    const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const myAPI = getRuntypeId<{sayHello: (name: string) => string}>();
`;
    await assertCacheModuleHasSayHelloRoot(code, 'router-static.ts');
  });

  runMaybe('F17 reflect: rendered cache module exports a knotted reflection Type graph', async () => {
    const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const sayHello = (name: string): string => 'Hello ' + name;
const routes = {sayHello};
const myAPI = reflectRuntypeId(routes);
`;
    await assertCacheModuleHasSayHelloRoot(code, 'router-reflect.ts');
  });

  async function assertCacheModuleHasSayHelloRoot(code: string, file: string) {
    const {types, sites} = await withInlineSources({[file]: code}, async ({client, sources}) => {
      await rewrite(file, sources[file], client);
      const dump = await client.dump();
      return {types: dump.types ?? [], sites: dump.sites ?? []};
    });

    const tsModule = renderCacheModule({types, sites});
    expect(tsModule).toContain('export const __runtypes');
    expect(tsModule).toContain('type Type = any;');

    const js = renderCacheModule({types, sites, language: 'js'}).replace(/export const /g, 'result.');
    const factory = new Function(`const result = {}; ${js}; return result;`);
    const result = factory() as {__runtypes: Map<string, any>; __sites: any[]};
    const runtypes = result.__runtypes;
    expect(runtypes).toBeInstanceOf(Map);

    const roots = Array.from(runtypes.values()).filter(
      (t: any) =>
        t.kind === ReflectionKind.objectLiteral && Array.isArray(t.types) && t.types.some((m: any) => m.name === 'sayHello')
    );
    expect(roots.length).toBeGreaterThan(0);
    const root = roots[0];
    const sayHello = root.types.find((m: any) => m.name === 'sayHello');
    expect(sayHello).toBeDefined();
    expect(sayHello.parent).toBe(root);
  }

  // CLI round-trip via spawnSync — kept as a single test (one form is
  // sufficient to verify the binary boundary).
  runMaybe("CLI --out-ts produces a parseable module identical in shape to the plugin's output", async () => {
    const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const sayHello = (name: string): string => 'Hello ' + name;
const routes = {sayHello};
const myAPI = reflectRuntypeId(routes);
`;
    const tmp = path.join(__dirname, '.tmp-cache.ts');
    const handshake = JSON.stringify({sources: {'runtypes.d.ts': RUNTYPES_DTS, 'router.ts': code}}) + '\n';
    const request = JSON.stringify({op: 'scanFile', file: 'router.ts'}) + '\n';
    const out = spawnSync(BIN, ['--cwd', path.resolve(__dirname, '../../..'), '--inline-sources-stdin', '--out-ts', tmp], {
      input: handshake + request,
    });
    expect(out.status).toBe(0);
    const generated = fs.readFileSync(tmp, 'utf8');
    expect(generated).toContain('export const __runtypes');
    expect(generated).toMatch(/const t_[A-Za-z][A-Za-z0-9_]*: any/);
    fs.unlinkSync(tmp);
  });
});
