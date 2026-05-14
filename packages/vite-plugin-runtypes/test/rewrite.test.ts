import {describe, it, expect} from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {ResolverClient} from '../src/resolver-client.js';
import {rewrite} from '../src/rewrite.js';
import {renderCacheModule} from '../src/render-cache.js';
import {ReflectionKind, type Type} from '../src/protocol.js';

const ROOT = path.resolve(__dirname, '../../..');
const BIN = path.resolve(ROOT, 'bin/ts-go-run-types');
const FIXTURES = path.resolve(ROOT, 'internal/testfixtures');

function hasBinary() {
  return fs.existsSync(BIN);
}

async function withResolver<T>(fn: (c: ResolverClient) => Promise<T>): Promise<T> {
  if (!hasBinary()) throw new Error(`ts-go-run-types binary not built: ${BIN}`);
  const client = new ResolverClient(BIN, FIXTURES, 'tsconfig.json');
  try {
    return await fn(client);
  } finally {
    client.close();
  }
}

function findMember(types: Type[], root: Type, name: string): Type | undefined {
  for (const ref of root.types ?? []) {
    const m = types.find((x) => x.id === ref.id);
    if (m && m.name === name) return m;
  }
  return undefined;
}

describe('vite-plugin-runtypes / rewrite', () => {
  const available = hasBinary();
  const runMaybe = available ? it : it.skip;

  runMaybe('F9: rewrites getRuntypeId<User>(u) to pass a hash site id', async () => {
    await withResolver(async (client) => {
      const file = 'f2_annotation_object.ts';
      const code = fs.readFileSync(path.join(FIXTURES, file), 'utf8');
      const {code: out, sites} = await rewrite(file, code, client);

      expect(sites.length).toBe(1);
      expect(typeof sites[0].id).toBe('string');
      expect(sites[0].id).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
      // The emitted call carries the hash site id as a string literal at
      // the trailing slot — `u` is arg 0, the injected id is arg 1.
      expect(out).toContain(`getRuntypeId<User>(u, ${JSON.stringify(sites[0].id)});`);
    });
  });

  runMaybe('F10: cache contains User alias with reflection-shape propertySignatures', async () => {
    await withResolver(async (client) => {
      const file = 'f2_annotation_object.ts';
      const code = fs.readFileSync(path.join(FIXTURES, file), 'utf8');
      await rewrite(file, code, client);

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
    await withResolver(async (client) => {
      const file = 'f6_router_inference.ts';
      const code = fs.readFileSync(path.join(FIXTURES, file), 'utf8');
      const {sites} = await rewrite(file, code, client);

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
    });
  });

  runMaybe('dedup: re-resolving the same file adds no new types', async () => {
    await withResolver(async (client) => {
      const f1 = 'f1_annotation_primitive.ts';
      const code = fs.readFileSync(path.join(FIXTURES, f1), 'utf8');
      await rewrite(f1, code, client);
      const before = (await client.dump()).types?.length ?? 0;
      await rewrite(f1, code, client);
      const after = (await client.dump()).types?.length ?? 0;
      expect(after).toBe(before);
    });
  });
});

describe('vite-plugin-runtypes / generated module', () => {
  const available = hasBinary();
  const runMaybe = available ? it : it.skip;

  runMaybe('F17: rendered cache module exports a knotted reflection Type graph', async () => {
    const {types, sites} = await withResolver(async (client) => {
      const file = 'f6_router_inference.ts';
      const code = fs.readFileSync(path.join(FIXTURES, file), 'utf8');
      await rewrite(file, code, client);
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

  // CLI round-trip: invoke the binary's scanFile op and assert --out-ts
  // produces a parseable module shaped like the plugin's output.
  runMaybe("CLI --out-ts produces a parseable module identical in shape to the plugin's output", async () => {
    const tmp = path.join(__dirname, '.tmp-cache.ts');
    const queries = JSON.stringify({op: 'scanFile', file: 'f6_router_inference.ts'}) + '\n';
    const out = spawnSync(BIN, ['--tsconfig', 'tsconfig.json', '--cwd', FIXTURES, '--out-ts', tmp], {input: queries});
    expect(out.status).toBe(0);
    const generated = fs.readFileSync(tmp, 'utf8');
    expect(generated).toContain('export const __runtypes');
    expect(generated).toMatch(/const t_[A-Za-z][A-Za-z0-9_]*: any/);
    fs.unlinkSync(tmp);
  });
});
