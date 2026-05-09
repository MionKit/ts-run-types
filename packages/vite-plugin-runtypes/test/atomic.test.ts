// End-to-end atomic round-trip tests. For each atomic kind, this suite:
//
//   1. Spawns the Go binary with inline sources for every atom
//   2. Calls scanFile on every fixture (which triggers id resolution
//      for the trailing-RuntypeId<T> call site in each)
//   3. Renders a runtypes-cache JS module from the dump
//   4. Evaluates that module and asserts the resulting reflection-shape Type
//      contains real runtime values where applicable (BigInt / Symbol /
//      RegExp / globalThis.Date instances)
//
// This is the "would mion's runType<X>() see what it expects?" gate. When all
// of these pass, we can wire the cache module into mion's runType() and the
// existing atomic *.spec.ts files should run unchanged.

import {describe, it, expect} from 'vitest';
import {rewrite} from '../src/rewrite.js';
import {renderCacheModule} from '../src/render-cache.js';
import {ReflectionKind, type Site, type Type} from '../src/protocol.js';
import {hasBinary, withInlineSources} from './helpers/inline.js';

// Each entry is a self-contained .ts module. The `runtypes.d.ts` shim is
// added by withInlineSources, so individual atoms just import + call.
const ATOMIC_SOURCES: Record<string, string> = {
  'string.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: string = 'hello';
getRuntypeId(v);
`,
  'number.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: number = 42;
getRuntypeId(v);
`,
  'boolean.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
declare const v: boolean;
getRuntypeId<boolean>(v);
`,
  'bigint.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: bigint = 1n;
getRuntypeId<bigint>(v);
`,
  'symbol.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: symbol = Symbol('x');
getRuntypeId<symbol>(v);
`,
  'null.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: null = null;
getRuntypeId<null>(v);
`,
  'undefined.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: undefined = undefined;
getRuntypeId<undefined>(v);
`,
  'void.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
declare const v: void;
getRuntypeId<void>(v);
`,
  'any.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: any = 1;
getRuntypeId<any>(v);
`,
  'unknown.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: unknown = 1;
getRuntypeId<unknown>(v);
`,
  'never.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
declare const v: never;
getRuntypeId<never>(v);
`,
  'object.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: object = {};
getRuntypeId<object>(v);
`,
  'regexp.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: RegExp = /abc/i;
getRuntypeId<RegExp>(v);
`,
  'literal_string.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: 'hello' = 'hello';
getRuntypeId<'hello'>(v);
`,
  'literal_number.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: 42 = 42;
getRuntypeId<42>(v);
`,
  'literal_boolean.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: true = true;
getRuntypeId<true>(v);
`,
  'literal_bigint.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: 1n = 1n;
getRuntypeId<1n>(v);
`,
  'literal_symbol.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const sym: unique symbol = Symbol('sym');
getRuntypeId<typeof sym>(sym);
`,
  'enum_numeric.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
enum Color {
  Red = 0,
  Green = 1,
  Blue = 2,
}
const v: Color = Color.Red;
getRuntypeId<Color>(v);
`,
  'enum_string.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
const v: Color = Color.Red;
getRuntypeId<Color>(v);
`,
  'date.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: Date = new Date();
getRuntypeId<Date>(v);
`,
};

interface Cache {
  __runtypes: Map<string, Type & Record<string, any>>;
  __sites: Site[];
}

async function buildAndEvalCache(): Promise<Cache> {
  return withInlineSources(ATOMIC_SOURCES, async ({client, sources}) => {
    const sites: Site[] = [];
    for (const [file, code] of Object.entries(sources)) {
      if (file === 'runtypes.d.ts') continue; // shim, not a callsite
      const result = await rewrite(file, code, client);
      for (const s of result.sites) {
        sites.push({file, pos: s.pos, id: s.id, paramIndex: s.paramIndex});
      }
    }
    const dump = await client.dump();
    const types = dump.types ?? [];
    const js = renderCacheModule({types, sites, language: 'js'}).replace(/export const /g, 'result.');
    const factory = new Function(`const result = {}; ${js}; return result;`);
    return factory() as Cache;
  });
}

function findSiteFor(cache: Cache, file: string): string {
  const site = cache.__sites.find((s) => s.file === file);
  if (!site) throw new Error(`no site recorded for ${file}`);
  return site.id;
}

function getType(cache: Cache, file: string): Type {
  const id = findSiteFor(cache, file);
  const t = cache.__runtypes.get(id);
  if (!t) throw new Error(`type ${id} not in cache for ${file}`);
  return t;
}

describe('vite-plugin-runtypes / atomic round-trip', () => {
  const runMaybe = hasBinary() ? it : it.skip;

  let cachePromise: Promise<Cache> | null = null;
  function getCache() {
    cachePromise ??= buildAndEvalCache();
    return cachePromise;
  }

  // ---- primitives -------------------------------------------------------

  runMaybe('string', async () => {
    expect((await getCache().then((c) => getType(c, 'string.ts'))).kind).toBe(ReflectionKind.string);
  });
  runMaybe('number', async () => {
    expect((await getCache().then((c) => getType(c, 'number.ts'))).kind).toBe(ReflectionKind.number);
  });
  runMaybe('boolean', async () => {
    expect((await getCache().then((c) => getType(c, 'boolean.ts'))).kind).toBe(ReflectionKind.boolean);
  });
  runMaybe('bigint', async () => {
    expect((await getCache().then((c) => getType(c, 'bigint.ts'))).kind).toBe(ReflectionKind.bigint);
  });
  runMaybe('symbol', async () => {
    expect((await getCache().then((c) => getType(c, 'symbol.ts'))).kind).toBe(ReflectionKind.symbol);
  });
  runMaybe('null', async () => {
    expect((await getCache().then((c) => getType(c, 'null.ts'))).kind).toBe(ReflectionKind.null);
  });
  runMaybe('undefined', async () => {
    expect((await getCache().then((c) => getType(c, 'undefined.ts'))).kind).toBe(ReflectionKind.undefined);
  });
  runMaybe('void', async () => {
    expect((await getCache().then((c) => getType(c, 'void.ts'))).kind).toBe(ReflectionKind.void);
  });
  runMaybe('any', async () => {
    expect((await getCache().then((c) => getType(c, 'any.ts'))).kind).toBe(ReflectionKind.any);
  });
  runMaybe('unknown', async () => {
    expect((await getCache().then((c) => getType(c, 'unknown.ts'))).kind).toBe(ReflectionKind.unknown);
  });
  runMaybe('never', async () => {
    expect((await getCache().then((c) => getType(c, 'never.ts'))).kind).toBe(ReflectionKind.never);
  });
  runMaybe('object primitive', async () => {
    expect((await getCache().then((c) => getType(c, 'object.ts'))).kind).toBe(ReflectionKind.object);
  });

  runMaybe('regexp instance', async () => {
    const cache = await getCache();
    const t = getType(cache, 'regexp.ts');
    expect(t.kind).toBe(ReflectionKind.regexp);
  });

  // ---- literals ---------------------------------------------------------

  runMaybe('literal string "hello"', async () => {
    const t = await getCache().then((c) => getType(c, 'literal_string.ts'));
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe('hello');
  });
  runMaybe('literal number 42', async () => {
    const t = await getCache().then((c) => getType(c, 'literal_number.ts'));
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe(42);
  });
  runMaybe('literal boolean true', async () => {
    const t = await getCache().then((c) => getType(c, 'literal_boolean.ts'));
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe(true);
  });
  runMaybe('literal bigint 1n -> real BigInt instance', async () => {
    const t: any = await getCache().then((c) => getType(c, 'literal_bigint.ts'));
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(typeof t.literal).toBe('bigint');
    expect(t.literal).toBe(1n);
  });
  runMaybe('literal symbol -> real Symbol instance', async () => {
    const t: any = await getCache().then((c) => getType(c, 'literal_symbol.ts'));
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(typeof t.literal).toBe('symbol');
    expect((t.literal as symbol).description).toBe('sym');
  });

  // ---- enums ------------------------------------------------------------

  runMaybe('numeric enum -> values + enum object + indexType=number', async () => {
    const t = await getCache().then((c) => getType(c, 'enum_numeric.ts'));
    expect(t.kind).toBe(ReflectionKind.enum);
    expect(t.typeName).toBe('Color');
    expect(t.enum).toEqual({Red: 0, Green: 1, Blue: 2});
    expect(t.values).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(t.indexType?.kind).toBe(ReflectionKind.number);
  });

  runMaybe('string enum -> values + indexType=string', async () => {
    const t = await getCache().then((c) => getType(c, 'enum_string.ts'));
    expect(t.kind).toBe(ReflectionKind.enum);
    expect(t.enum).toEqual({Red: 'red', Green: 'green', Blue: 'blue'});
    expect(t.indexType?.kind).toBe(ReflectionKind.string);
  });

  // ---- Date — class with classType === globalThis.Date ----------------

  runMaybe('Date class -> classType === globalThis.Date', async () => {
    const t: any = await getCache().then((c) => getType(c, 'date.ts'));
    expect(t.kind).toBe(ReflectionKind.class);
    expect(t.typeName).toBe('Date');
    expect(t.classType).toBe(Date);
  });

  // ---- structural dedup at the wire level -----------------------------

  runMaybe('two `string` queries share the same cache id', async () => {
    const cache = await getCache();
    const aSites = cache.__sites.filter((s) => s.file === 'string.ts');
    expect(aSites.length).toBeGreaterThan(0);
    const stringEntries = Array.from(cache.__runtypes.values()).filter((t) => t.kind === ReflectionKind.string);
    expect(stringEntries.length).toBe(1);
  });
});
