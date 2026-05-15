// End-to-end atomic round-trip tests. Each scenario has paired *_static
// and *_reflect tests per the marker test coverage rule (CLAUDE.md):
//   static  uses getRuntypeId<T>() — explicit type, no value
//   reflect uses reflectRuntypeId(v) — T inferred from a runtime value
//
// Per-test sequence is:
//   1. Spawn the Go binary with this test's inline source(s)
//   2. rewrite() to inject the trailing-RuntypeId<T> id
//   3. Render a runtypes-cache JS module from the resolver dump
//   4. Eval the module and assert the resulting reflection-shape Type
//      contains real runtime values where applicable (BigInt / Symbol /
//      RegExp / globalThis.Date instances)

import {describe, it, expect} from 'vitest';
import {ReflectionKind} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, hasBinary} from './helpers/inline.ts';

describe('vite-plugin-runtypes / atomic round-trip', () => {
  const runMaybe = hasBinary() ? it : it.skip;

  // ---- primitives -------------------------------------------------------

  runMaybe('string static', async () => {
    const cache = await evalCacheFor({
      'string.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`,
    });
    expect(getTypeFor(cache, 'string.ts').kind).toBe(ReflectionKind.string);
  });

  runMaybe('string reflect', async () => {
    const cache = await evalCacheFor({
      'string.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: string = 'hello';
reflectRuntypeId(v);
`,
    });
    expect(getTypeFor(cache, 'string.ts').kind).toBe(ReflectionKind.string);
  });

  runMaybe('number static', async () => {
    const cache = await evalCacheFor({
      'number.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<number>();
`,
    });
    expect(getTypeFor(cache, 'number.ts').kind).toBe(ReflectionKind.number);
  });

  runMaybe('number reflect', async () => {
    const cache = await evalCacheFor({
      'number.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: number = 42;
reflectRuntypeId(v);
`,
    });
    expect(getTypeFor(cache, 'number.ts').kind).toBe(ReflectionKind.number);
  });

  runMaybe('boolean static', async () => {
    const cache = await evalCacheFor({
      'boolean.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<boolean>();
`,
    });
    expect(getTypeFor(cache, 'boolean.ts').kind).toBe(ReflectionKind.boolean);
  });

  runMaybe('boolean reflect', async () => {
    const cache = await evalCacheFor({
      'boolean.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const v: boolean;
reflectRuntypeId(v);
`,
    });
    expect(getTypeFor(cache, 'boolean.ts').kind).toBe(ReflectionKind.boolean);
  });

  runMaybe('bigint static', async () => {
    const cache = await evalCacheFor({
      'bigint.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<bigint>();
`,
    });
    expect(getTypeFor(cache, 'bigint.ts').kind).toBe(ReflectionKind.bigint);
  });

  runMaybe('bigint reflect', async () => {
    const cache = await evalCacheFor({
      'bigint.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: bigint = 1n;
reflectRuntypeId(v);
`,
    });
    expect(getTypeFor(cache, 'bigint.ts').kind).toBe(ReflectionKind.bigint);
  });

  runMaybe('symbol static', async () => {
    const cache = await evalCacheFor({
      'symbol.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<symbol>();
`,
    });
    expect(getTypeFor(cache, 'symbol.ts').kind).toBe(ReflectionKind.symbol);
  });

  runMaybe('symbol reflect', async () => {
    const cache = await evalCacheFor({
      'symbol.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: symbol = Symbol('x');
reflectRuntypeId(v);
`,
    });
    expect(getTypeFor(cache, 'symbol.ts').kind).toBe(ReflectionKind.symbol);
  });

  runMaybe('null static', async () => {
    const cache = await evalCacheFor({
      'null.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<null>();
`,
    });
    expect(getTypeFor(cache, 'null.ts').kind).toBe(ReflectionKind.null);
  });

  runMaybe('null reflect', async () => {
    const cache = await evalCacheFor({
      'null.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: null = null;
reflectRuntypeId(v);
`,
    });
    expect(getTypeFor(cache, 'null.ts').kind).toBe(ReflectionKind.null);
  });

  runMaybe('undefined static', async () => {
    const cache = await evalCacheFor({
      'undefined.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<undefined>();
`,
    });
    expect(getTypeFor(cache, 'undefined.ts').kind).toBe(ReflectionKind.undefined);
  });

  runMaybe('undefined reflect', async () => {
    const cache = await evalCacheFor({
      'undefined.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: undefined = undefined;
reflectRuntypeId(v);
`,
    });
    expect(getTypeFor(cache, 'undefined.ts').kind).toBe(ReflectionKind.undefined);
  });

  runMaybe('void static', async () => {
    const cache = await evalCacheFor({
      'void.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<void>();
`,
    });
    expect(getTypeFor(cache, 'void.ts').kind).toBe(ReflectionKind.void);
  });

  runMaybe('void reflect', async () => {
    const cache = await evalCacheFor({
      'void.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const v: void;
reflectRuntypeId(v);
`,
    });
    expect(getTypeFor(cache, 'void.ts').kind).toBe(ReflectionKind.void);
  });

  runMaybe('any static', async () => {
    const cache = await evalCacheFor({
      'any.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<any>();
`,
    });
    expect(getTypeFor(cache, 'any.ts').kind).toBe(ReflectionKind.any);
  });

  runMaybe('any reflect', async () => {
    const cache = await evalCacheFor({
      'any.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: any = 1;
reflectRuntypeId(v);
`,
    });
    expect(getTypeFor(cache, 'any.ts').kind).toBe(ReflectionKind.any);
  });

  runMaybe('unknown static', async () => {
    const cache = await evalCacheFor({
      'unknown.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<unknown>();
`,
    });
    expect(getTypeFor(cache, 'unknown.ts').kind).toBe(ReflectionKind.unknown);
  });

  runMaybe('unknown reflect', async () => {
    const cache = await evalCacheFor({
      'unknown.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: unknown = 1;
reflectRuntypeId(v);
`,
    });
    expect(getTypeFor(cache, 'unknown.ts').kind).toBe(ReflectionKind.unknown);
  });

  runMaybe('never static', async () => {
    const cache = await evalCacheFor({
      'never.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<never>();
`,
    });
    expect(getTypeFor(cache, 'never.ts').kind).toBe(ReflectionKind.never);
  });

  runMaybe('never reflect', async () => {
    const cache = await evalCacheFor({
      'never.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const v: never;
reflectRuntypeId(v);
`,
    });
    expect(getTypeFor(cache, 'never.ts').kind).toBe(ReflectionKind.never);
  });

  runMaybe('object primitive static', async () => {
    const cache = await evalCacheFor({
      'object.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<object>();
`,
    });
    expect(getTypeFor(cache, 'object.ts').kind).toBe(ReflectionKind.object);
  });

  runMaybe('object primitive reflect', async () => {
    const cache = await evalCacheFor({
      'object.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: object = {};
reflectRuntypeId(v);
`,
    });
    expect(getTypeFor(cache, 'object.ts').kind).toBe(ReflectionKind.object);
  });

  runMaybe('regexp instance static', async () => {
    const cache = await evalCacheFor({
      'regexp.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<RegExp>();
`,
    });
    expect(getTypeFor(cache, 'regexp.ts').kind).toBe(ReflectionKind.regexp);
  });

  runMaybe('regexp instance reflect', async () => {
    const cache = await evalCacheFor({
      'regexp.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: RegExp = /abc/i;
reflectRuntypeId(v);
`,
    });
    expect(getTypeFor(cache, 'regexp.ts').kind).toBe(ReflectionKind.regexp);
  });

  // ---- literals ---------------------------------------------------------

  runMaybe('literal string "hello" static', async () => {
    const cache = await evalCacheFor({
      'literal_string.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<'hello'>();
`,
    });
    const t = getTypeFor(cache, 'literal_string.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe('hello');
  });

  runMaybe('literal string "hello" reflect', async () => {
    const cache = await evalCacheFor({
      'literal_string.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: 'hello' = 'hello';
reflectRuntypeId(v);
`,
    });
    const t = getTypeFor(cache, 'literal_string.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe('hello');
  });

  runMaybe('literal number 42 static', async () => {
    const cache = await evalCacheFor({
      'literal_number.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<42>();
`,
    });
    const t = getTypeFor(cache, 'literal_number.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe(42);
  });

  runMaybe('literal number 42 reflect', async () => {
    const cache = await evalCacheFor({
      'literal_number.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: 42 = 42;
reflectRuntypeId(v);
`,
    });
    const t = getTypeFor(cache, 'literal_number.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe(42);
  });

  runMaybe('literal boolean true static', async () => {
    const cache = await evalCacheFor({
      'literal_boolean.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<true>();
`,
    });
    const t = getTypeFor(cache, 'literal_boolean.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe(true);
  });

  runMaybe('literal boolean true reflect', async () => {
    const cache = await evalCacheFor({
      'literal_boolean.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: true = true;
reflectRuntypeId(v);
`,
    });
    const t = getTypeFor(cache, 'literal_boolean.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe(true);
  });

  runMaybe('literal bigint 1n -> real BigInt instance, static', async () => {
    const cache = await evalCacheFor({
      'literal_bigint.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<1n>();
`,
    });
    const t: any = getTypeFor(cache, 'literal_bigint.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(typeof t.literal).toBe('bigint');
    expect(t.literal).toBe(1n);
  });

  runMaybe('literal bigint 1n -> real BigInt instance, reflect', async () => {
    const cache = await evalCacheFor({
      'literal_bigint.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: 1n = 1n;
reflectRuntypeId(v);
`,
    });
    const t: any = getTypeFor(cache, 'literal_bigint.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(typeof t.literal).toBe('bigint');
    expect(t.literal).toBe(1n);
  });

  // Literal symbol: spelling a unique-symbol type still requires a value
  // binding (`typeof sym`); the static form goes through `typeof sym` in
  // the type argument, the reflect form passes the binding directly.
  runMaybe('literal symbol -> real Symbol instance, static', async () => {
    const cache = await evalCacheFor({
      'literal_symbol.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const sym: unique symbol = Symbol('sym');
getRuntypeId<typeof sym>();
`,
    });
    const t: any = getTypeFor(cache, 'literal_symbol.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(typeof t.literal).toBe('symbol');
  });

  runMaybe('literal symbol -> real Symbol instance, reflect', async () => {
    const cache = await evalCacheFor({
      'literal_symbol.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const sym: unique symbol = Symbol('sym');
reflectRuntypeId(sym);
`,
    });
    const t: any = getTypeFor(cache, 'literal_symbol.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(typeof t.literal).toBe('symbol');
    expect((t.literal as symbol).description).toBe('sym');
  });

  // ---- enums ------------------------------------------------------------

  runMaybe('numeric enum static -> values + enum object + indexType=number', async () => {
    const cache = await evalCacheFor({
      'enum_numeric.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 0,
  Green = 1,
  Blue = 2,
}
getRuntypeId<Color>();
`,
    });
    const t = getTypeFor(cache, 'enum_numeric.ts');
    expect(t.kind).toBe(ReflectionKind.enum);
    expect(t.typeName).toBe('Color');
    expect(t.enum).toEqual({Red: 0, Green: 1, Blue: 2});
    expect(t.values).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(t.indexType?.kind).toBe(ReflectionKind.number);
  });

  runMaybe('numeric enum reflect -> values + enum object + indexType=number', async () => {
    const cache = await evalCacheFor({
      'enum_numeric.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 0,
  Green = 1,
  Blue = 2,
}
declare const v: Color;
reflectRuntypeId(v);
`,
    });
    const t = getTypeFor(cache, 'enum_numeric.ts');
    expect(t.kind).toBe(ReflectionKind.enum);
    expect(t.typeName).toBe('Color');
    expect(t.enum).toEqual({Red: 0, Green: 1, Blue: 2});
    expect(t.values).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(t.indexType?.kind).toBe(ReflectionKind.number);
  });

  runMaybe('string enum static -> values + indexType=string', async () => {
    const cache = await evalCacheFor({
      'enum_string.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
getRuntypeId<Color>();
`,
    });
    const t = getTypeFor(cache, 'enum_string.ts');
    expect(t.kind).toBe(ReflectionKind.enum);
    expect(t.enum).toEqual({Red: 'red', Green: 'green', Blue: 'blue'});
    expect(t.indexType?.kind).toBe(ReflectionKind.string);
  });

  runMaybe('string enum reflect -> values + indexType=string', async () => {
    const cache = await evalCacheFor({
      'enum_string.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
declare const v: Color;
reflectRuntypeId(v);
`,
    });
    const t = getTypeFor(cache, 'enum_string.ts');
    expect(t.kind).toBe(ReflectionKind.enum);
    expect(t.enum).toEqual({Red: 'red', Green: 'green', Blue: 'blue'});
    expect(t.indexType?.kind).toBe(ReflectionKind.string);
  });

  // ---- Date — class with classType === globalThis.Date ----------------

  runMaybe('Date class static -> classType === globalThis.Date', async () => {
    const cache = await evalCacheFor({
      'date.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<Date>();
`,
    });
    const t: any = getTypeFor(cache, 'date.ts');
    expect(t.kind).toBe(ReflectionKind.class);
    expect(t.typeName).toBe('Date');
    expect(t.classType).toBe(Date);
  });

  runMaybe('Date class reflect -> classType === globalThis.Date', async () => {
    const cache = await evalCacheFor({
      'date.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: Date = new Date();
reflectRuntypeId(v);
`,
    });
    const t: any = getTypeFor(cache, 'date.ts');
    expect(t.kind).toBe(ReflectionKind.class);
    expect(t.typeName).toBe('Date');
    expect(t.classType).toBe(Date);
  });

  // ---- structural dedup at the wire level -----------------------------

  runMaybe('two `string` queries (mixed forms) in one program share a single cache id', async () => {
    // One file uses the static form, the other the reflect form — both
    // produce the same `string` cache entry. This is the cross-form
    // hash-equivalence assertion required by the marker test coverage rule.
    const cache = await evalCacheFor({
      'string_a.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`,
      'string_b.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: string = 'b';
reflectRuntypeId(v);
`,
    });
    const stringEntries = Array.from(cache.__runtypes.values()).filter((t) => t.kind === ReflectionKind.string);
    expect(stringEntries.length).toBe(1);
  });
});
