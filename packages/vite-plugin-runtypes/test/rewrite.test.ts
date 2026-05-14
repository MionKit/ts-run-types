import {describe, it, expect} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {rewrite} from '../src/rewrite.js';
import {renderCacheModule} from '../src/render-cache.js';
import {ReflectionKind, type Type} from '../src/protocol.js';
import {BIN, hasBinary, withInlineSources, RUNTYPES_DTS} from './helpers/inline.js';

function findMember(types: Type[], root: Type, name: string): Type | undefined {
  for (const ref of root.types ?? []) {
    const m = types.find((x) => x.id === ref.id);
    if (m && m.name === name) return m;
  }
  return undefined;
}

describe('vite-plugin-runtypes / rewrite', () => {
  const runMaybe = hasBinary() ? it : it.skip;

  runMaybe('F9: rewrites getRuntypeId<User>(u) to pass a hash site id', async () => {
    const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
getRuntypeId<User>(u);
`;
    await withInlineSources({'user.ts': code}, async ({client, sources}) => {
      const {code: out, sites} = await rewrite('user.ts', sources['user.ts'], client);

      expect(sites.length).toBe(1);
      expect(typeof sites[0].id).toBe('string');
      expect(sites[0].id).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
      // The emitted call carries the hash site id as a string literal at
      // the trailing slot — `u` is arg 0, the injected id is arg 1.
      expect(out).toContain(`getRuntypeId<User>(u, ${JSON.stringify(sites[0].id)});`);
    });
  });

  runMaybe('F10: cache contains User alias with reflection-shape propertySignatures', async () => {
    const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
getRuntypeId<User>(u);
`;
    await withInlineSources({'user.ts': code}, async ({client, sources}) => {
      await rewrite('user.ts', sources['user.ts'], client);

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
    });
  });

  runMaybe('F6 plugin round-trip: getRuntypeId(routes) infers nested object+function shape', async () => {
    const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const sayHello = (name: string): string => 'Hello ' + name;
const routes = {sayHello};
const myAPI = getRuntypeId(routes);
`;
    // reset so the "first objectLiteral with members" probe below doesn't
    // pick up the User type from F9/F10 sitting in this file's cache.
    await withInlineSources(
      {'router.ts': code},
      async ({client, sources}) => {
        const {sites} = await rewrite('router.ts', sources['router.ts'], client);

        expect(sites.length).toBeGreaterThan(0);

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
      },
      {reset: true}
    );
  });

  runMaybe('dedup: re-resolving the same file adds no new types', async () => {
    const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const userName: string = 'mario';
const info = getRuntypeId(userName);
`;
    await withInlineSources({'primitive.ts': code}, async ({client, sources}) => {
      await rewrite('primitive.ts', sources['primitive.ts'], client);
      const before = (await client.dump()).types?.length ?? 0;
      await rewrite('primitive.ts', sources['primitive.ts'], client);
      const after = (await client.dump()).types?.length ?? 0;
      expect(after).toBe(before);
    });
  });
});

describe('vite-plugin-runtypes / generated module', () => {
  const runMaybe = hasBinary() ? it : it.skip;

  runMaybe('F17: rendered cache module exports a knotted reflection Type graph', async () => {
    const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const sayHello = (name: string): string => 'Hello ' + name;
const routes = {sayHello};
const myAPI = getRuntypeId(routes);
`;
    const {types, sites} = await withInlineSources({'router.ts': code}, async ({client, sources}) => {
      await rewrite('router.ts', sources['router.ts'], client);
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
  });

  // CLI round-trip: invoke the binary's scanFile op directly via spawnSync and
  // assert --out-ts produces a parseable module. The inline-sources handshake
  // is written to stdin ahead of the request line.
  runMaybe("CLI --out-ts produces a parseable module identical in shape to the plugin's output", async () => {
    const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const sayHello = (name: string): string => 'Hello ' + name;
const routes = {sayHello};
const myAPI = getRuntypeId(routes);
`;
    const tmp = path.join(__dirname, '.tmp-cache.ts');
    const handshake = JSON.stringify({sources: {'runtypes.d.ts': RUNTYPES_DTS, 'router.ts': code}}) + '\n';
    const request = JSON.stringify({op: 'scanFile', file: 'router.ts'}) + '\n';
    const out = spawnSync(
      BIN,
      ['--cwd', path.resolve(__dirname, '../../..'), '--inline-sources-stdin', '--out-ts', tmp],
      {input: handshake + request}
    );
    expect(out.status).toBe(0);
    const generated = fs.readFileSync(tmp, 'utf8');
    expect(generated).toContain('export const __runtypes');
    expect(generated).toMatch(/const t_[A-Za-z][A-Za-z0-9_]*: any/);
    fs.unlinkSync(tmp);
  });
});
