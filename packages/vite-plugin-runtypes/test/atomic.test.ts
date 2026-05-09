// End-to-end atomic round-trip tests. Each test owns its TypeScript source
// inline so the reader can see exactly what shape produces what
// `ReflectionKind`. Per-test sequence is:
//
//   1. Spawn the Go binary with this test's inline source(s)
//   2. rewrite() to inject the trailing-RuntypeId<T> id
//   3. Render a runtypes-cache JS module from the resolver dump
//   4. Eval the module and assert the resulting reflection-shape Type
//      contains real runtime values where applicable (BigInt / Symbol /
//      RegExp / globalThis.Date instances)
//
// This is the "would mion's runType<X>() see what it expects?" gate.

import {describe, it, expect} from 'vitest';
import {ReflectionKind} from '../src/protocol.js';
import {evalCacheFor, getTypeFor, hasBinary} from './helpers/inline.js';

describe('vite-plugin-runtypes / atomic round-trip', () => {
  const runMaybe = hasBinary() ? it : it.skip;

  // ---- primitives -------------------------------------------------------

  runMaybe('string', async () => {
    const cache = await evalCacheFor({
      'string.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const v: string = 'hello';
getRuntypeId(v);
`,
    });
    expect(getTypeFor(cache, 'string.ts').kind).toBe(ReflectionKind.string);
  });

  runMaybe('number', async () => {
    const cache = await evalCacheFor({
      'number.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const v: number = 42;
getRuntypeId(v);
`,
    });
    expect(getTypeFor(cache, 'number.ts').kind).toBe(ReflectionKind.number);
  });

  runMaybe('boolean', async () => {
    const cache = await evalCacheFor({
      'boolean.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
declare const v: boolean;
getRuntypeId<boolean>(v);
`,
    });
    expect(getTypeFor(cache, 'boolean.ts').kind).toBe(ReflectionKind.boolean);
  });

  runMaybe('bigint', async () => {
    const cache = await evalCacheFor({
      'bigint.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const v: bigint = 1n;
getRuntypeId<bigint>(v);
`,
    });
    expect(getTypeFor(cache, 'bigint.ts').kind).toBe(ReflectionKind.bigint);
  });

  runMaybe('symbol', async () => {
    const cache = await evalCacheFor({
      'symbol.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const v: symbol = Symbol('x');
getRuntypeId<symbol>(v);
`,
    });
    expect(getTypeFor(cache, 'symbol.ts').kind).toBe(ReflectionKind.symbol);
  });

  runMaybe('null', async () => {
    const cache = await evalCacheFor({
      'null.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const v: null = null;
getRuntypeId<null>(v);
`,
    });
    expect(getTypeFor(cache, 'null.ts').kind).toBe(ReflectionKind.null);
  });

  runMaybe('undefined', async () => {
    const cache = await evalCacheFor({
      'undefined.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const v: undefined = undefined;
getRuntypeId<undefined>(v);
`,
    });
    expect(getTypeFor(cache, 'undefined.ts').kind).toBe(ReflectionKind.undefined);
  });

  runMaybe('void', async () => {
    const cache = await evalCacheFor({
      'void.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
declare const v: void;
getRuntypeId<void>(v);
`,
    });
    expect(getTypeFor(cache, 'void.ts').kind).toBe(ReflectionKind.void);
  });

  runMaybe('any', async () => {
    const cache = await evalCacheFor({
      'any.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const v: any = 1;
getRuntypeId<any>(v);
`,
    });
    expect(getTypeFor(cache, 'any.ts').kind).toBe(ReflectionKind.any);
  });

  runMaybe('unknown', async () => {
    const cache = await evalCacheFor({
      'unknown.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const v: unknown = 1;
getRuntypeId<unknown>(v);
`,
    });
    expect(getTypeFor(cache, 'unknown.ts').kind).toBe(ReflectionKind.unknown);
  });

  runMaybe('never', async () => {
    const cache = await evalCacheFor({
      'never.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
declare const v: never;
getRuntypeId<never>(v);
`,
    });
    expect(getTypeFor(cache, 'never.ts').kind).toBe(ReflectionKind.never);
  });

  runMaybe('object primitive', async () => {
    const cache = await evalCacheFor({
      'object.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const v: object = {};
getRuntypeId<object>(v);
`,
    });
    expect(getTypeFor(cache, 'object.ts').kind).toBe(ReflectionKind.object);
  });

  runMaybe('regexp instance', async () => {
    const cache = await evalCacheFor({
      'regexp.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const v: RegExp = /abc/i;
getRuntypeId<RegExp>(v);
`,
    });
    expect(getTypeFor(cache, 'regexp.ts').kind).toBe(ReflectionKind.regexp);
  });

  // ---- literals ---------------------------------------------------------

  runMaybe('literal string "hello"', async () => {
    const cache = await evalCacheFor({
      'literal_string.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const v: 'hello' = 'hello';
getRuntypeId<'hello'>(v);
`,
    });
    const t = getTypeFor(cache, 'literal_string.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe('hello');
  });

  runMaybe('literal number 42', async () => {
    const cache = await evalCacheFor({
      'literal_number.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const v: 42 = 42;
getRuntypeId<42>(v);
`,
    });
    const t = getTypeFor(cache, 'literal_number.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe(42);
  });

  runMaybe('literal boolean true', async () => {
    const cache = await evalCacheFor({
      'literal_boolean.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const v: true = true;
getRuntypeId<true>(v);
`,
    });
    const t = getTypeFor(cache, 'literal_boolean.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe(true);
  });

  runMaybe('literal bigint 1n -> real BigInt instance', async () => {
    const cache = await evalCacheFor({
      'literal_bigint.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const v: 1n = 1n;
getRuntypeId<1n>(v);
`,
    });
    const t: any = getTypeFor(cache, 'literal_bigint.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(typeof t.literal).toBe('bigint');
    expect(t.literal).toBe(1n);
  });

  runMaybe('literal symbol -> real Symbol instance', async () => {
    const cache = await evalCacheFor({
      'literal_symbol.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const sym: unique symbol = Symbol('sym');
getRuntypeId<typeof sym>(sym);
`,
    });
    const t: any = getTypeFor(cache, 'literal_symbol.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(typeof t.literal).toBe('symbol');
    expect((t.literal as symbol).description).toBe('sym');
  });

  // ---- enums ------------------------------------------------------------

  runMaybe('numeric enum -> values + enum object + indexType=number', async () => {
    const cache = await evalCacheFor({
      'enum_numeric.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 0,
  Green = 1,
  Blue = 2,
}
const v: Color = Color.Red;
getRuntypeId<Color>(v);
`,
    });
    const t = getTypeFor(cache, 'enum_numeric.ts');
    expect(t.kind).toBe(ReflectionKind.enum);
    expect(t.typeName).toBe('Color');
    expect(t.enum).toEqual({Red: 0, Green: 1, Blue: 2});
    expect(t.values).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(t.indexType?.kind).toBe(ReflectionKind.number);
  });

  runMaybe('string enum -> values + indexType=string', async () => {
    const cache = await evalCacheFor({
      'enum_string.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
const v: Color = Color.Red;
getRuntypeId<Color>(v);
`,
    });
    const t = getTypeFor(cache, 'enum_string.ts');
    expect(t.kind).toBe(ReflectionKind.enum);
    expect(t.enum).toEqual({Red: 'red', Green: 'green', Blue: 'blue'});
    expect(t.indexType?.kind).toBe(ReflectionKind.string);
  });

  // ---- Date — class with classType === globalThis.Date ----------------

  runMaybe('Date class -> classType === globalThis.Date', async () => {
    const cache = await evalCacheFor({
      'date.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const v: Date = new Date();
getRuntypeId<Date>(v);
`,
    });
    const t: any = getTypeFor(cache, 'date.ts');
    expect(t.kind).toBe(ReflectionKind.class);
    expect(t.typeName).toBe('Date');
    expect(t.classType).toBe(Date);
  });

  // ---- structural dedup at the wire level -----------------------------

  runMaybe('two `string` queries in one program share a single cache id', async () => {
    // Two files both annotate `v: string` and call getRuntypeId(v). The
    // resolver should emit only ONE entry of kind=string in the cache —
    // structural dedup by hash id.
    const cache = await evalCacheFor({
      'string_a.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const v: string = 'a';
getRuntypeId(v);
`,
      'string_b.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const v: string = 'b';
getRuntypeId(v);
`,
    });
    const stringEntries = Array.from(cache.__runtypes.values()).filter(
      (t) => t.kind === ReflectionKind.string
    );
    expect(stringEntries.length).toBe(1);
  });
});
