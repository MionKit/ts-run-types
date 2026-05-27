// End-to-end atomic round-trip tests. Each scenario has paired *_static
// and *_reflect tests per the marker test coverage rule (CLAUDE.md):
//   static  uses getRuntypeId<T>() — explicit type, no value
//   reflect uses reflectRuntypeId(v) — T inferred from a runtime value
//
// Per-test sequence is:
//   1. Spawn the Go binary with this test's inline source(s)
//   2. rewrite() to inject the trailing-InjectRuntypeId<T> id
//   3. Render a runtypes-cache JS module from the resolver dump
//   4. Eval the module and assert the resulting reflection-shape RunType
//      contains real runtime values where applicable (BigInt / Symbol /
//      RegExp / globalThis.Date instances)

import {describe, expect} from 'vitest';
import {ReflectionKind} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, runTest} from './helpers/inline.ts';

describe('vite-plugin-runtypes / atomic round-trip', () => {
  // ---- primitives -------------------------------------------------------

  runTest(
    'string static',
    {
      'string.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'string.ts').kind).toBe(ReflectionKind.string);
    }
  );

  runTest(
    'string reflect',
    {
      'string.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: string = 'hello';
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'string.ts').kind).toBe(ReflectionKind.string);
    }
  );

  runTest(
    'number static',
    {
      'number.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<number>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'number.ts').kind).toBe(ReflectionKind.number);
    }
  );

  runTest(
    'number reflect',
    {
      'number.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: number = 42;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'number.ts').kind).toBe(ReflectionKind.number);
    }
  );

  runTest(
    'boolean static',
    {
      'boolean.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<boolean>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'boolean.ts').kind).toBe(ReflectionKind.boolean);
    }
  );

  runTest(
    'boolean reflect',
    {
      'boolean.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const v: boolean;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'boolean.ts').kind).toBe(ReflectionKind.boolean);
    }
  );

  runTest(
    'bigint static',
    {
      'bigint.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<bigint>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'bigint.ts').kind).toBe(ReflectionKind.bigint);
    }
  );

  runTest(
    'bigint reflect',
    {
      'bigint.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: bigint = 1n;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'bigint.ts').kind).toBe(ReflectionKind.bigint);
    }
  );

  runTest(
    'symbol static',
    {
      'symbol.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<symbol>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'symbol.ts').kind).toBe(ReflectionKind.symbol);
    }
  );

  runTest(
    'symbol reflect',
    {
      'symbol.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: symbol = Symbol('x');
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'symbol.ts').kind).toBe(ReflectionKind.symbol);
    }
  );

  runTest(
    'null static',
    {
      'null.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<null>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'null.ts').kind).toBe(ReflectionKind.null);
    }
  );

  runTest(
    'null reflect',
    {
      'null.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: null = null;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'null.ts').kind).toBe(ReflectionKind.null);
    }
  );

  runTest(
    'undefined static',
    {
      'undefined.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<undefined>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'undefined.ts').kind).toBe(ReflectionKind.undefined);
    }
  );

  runTest(
    'undefined reflect',
    {
      'undefined.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: undefined = undefined;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'undefined.ts').kind).toBe(ReflectionKind.undefined);
    }
  );

  runTest(
    'void static',
    {
      'void.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<void>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'void.ts').kind).toBe(ReflectionKind.void);
    }
  );

  runTest(
    'void reflect',
    {
      'void.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const v: void;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'void.ts').kind).toBe(ReflectionKind.void);
    }
  );

  runTest(
    'any static',
    {
      'any.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<any>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'any.ts').kind).toBe(ReflectionKind.any);
    }
  );

  runTest(
    'any reflect',
    {
      'any.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: any = 1;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'any.ts').kind).toBe(ReflectionKind.any);
    }
  );

  runTest(
    'unknown static',
    {
      'unknown.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<unknown>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'unknown.ts').kind).toBe(ReflectionKind.unknown);
    }
  );

  runTest(
    'unknown reflect',
    {
      'unknown.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: unknown = 1;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'unknown.ts').kind).toBe(ReflectionKind.unknown);
    }
  );

  runTest(
    'never static',
    {
      'never.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<never>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'never.ts').kind).toBe(ReflectionKind.never);
    }
  );

  runTest(
    'never reflect',
    {
      'never.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const v: never;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'never.ts').kind).toBe(ReflectionKind.never);
    }
  );

  runTest(
    'object primitive static',
    {
      'object.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<object>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'object.ts').kind).toBe(ReflectionKind.object);
    }
  );

  runTest(
    'object primitive reflect',
    {
      'object.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: object = {};
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'object.ts').kind).toBe(ReflectionKind.object);
    }
  );

  // ---- regexp — instance form (no trace to a regex literal) -----------

  runTest(
    'regexp instance static (explicit RegExp type)',
    {
      'regexp.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<RegExp>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'regexp.ts').kind).toBe(ReflectionKind.regexp);
    }
  );

  runTest(
    'regexp instance reflect (declare const, no initializer)',
    {
      'regexp.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const re: RegExp;
reflectRuntypeId(re);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'regexp.ts').kind).toBe(ReflectionKind.regexp);
    }
  );

  // ---- regexp — literal form (trace harvests source + flags) ----------
  //
  // End-to-end shape proof: the rendered cache must produce a real `RegExp`
  // instance via the emitter's `/source/flags` regex-literal footer expression.

  runTest(
    'regexp literal reflect (direct /abc/i) -> real RegExp',
    {
      'regexp_literal.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
reflectRuntypeId(/abc/i);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'regexp_literal.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(t.literal).toBeInstanceOf(RegExp);
      expect((t.literal as RegExp).source).toBe('abc');
      expect((t.literal as RegExp).flags).toBe('i');
    }
  );

  runTest(
    'regexp literal reflect (as const wrap)',
    {
      'regexp_literal.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
reflectRuntypeId(/abc/i as const);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'regexp_literal.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(t.literal).toBeInstanceOf(RegExp);
    }
  );

  runTest(
    'regexp literal reflect (const binding) -> harvested via trace',
    {
      'regexp_literal.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const re = /abc/i;
reflectRuntypeId(re);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'regexp_literal.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect((t.literal as RegExp).source).toBe('abc');
      expect((t.literal as RegExp).flags).toBe('i');
    }
  );

  runTest(
    'regexp literal static (typeof binding) -> harvested via trace',
    {
      'regexp_literal.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const re = /abc/i;
getRuntypeId<typeof re>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'regexp_literal.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect((t.literal as RegExp).source).toBe('abc');
      expect((t.literal as RegExp).flags).toBe('i');
    }
  );

  // ---- regexp — multi-escape (`\/` × N) ---------------------------------
  //
  // The split-on-last-/ harvest must keep every `\/` inside the source intact
  // so the emitter can reproduce the literal verbatim. We exercise both the
  // reflect (direct literal) and static (typeof binding) forms.

  runTest(
    'regexp literal reflect (multiple \\/ escapes) -> source/flags preserved',
    {
      'regexp_literal.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
reflectRuntypeId(/^https?:\\/\\/example\\/path$/gi);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'regexp_literal.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(t.literal).toBeInstanceOf(RegExp);
      const re = t.literal as RegExp;
      expect(re.source).toBe('^https?:\\/\\/example\\/path$');
      expect(re.flags).toBe('gi');
      expect(re.test('https://example/path')).toBe(true);
      expect(re.test('ftp://example/path')).toBe(false);
    }
  );

  runTest(
    'regexp literal static (typeof binding, multiple \\/ escapes)',
    {
      'regexp_literal.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const re = /^https?:\\/\\/example\\/path$/gi;
getRuntypeId<typeof re>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'regexp_literal.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(t.literal).toBeInstanceOf(RegExp);
      const re = t.literal as RegExp;
      expect(re.source).toBe('^https?:\\/\\/example\\/path$');
      expect(re.flags).toBe('gi');
      expect(re.test('https://example/path')).toBe(true);
    }
  );

  // ---- literals ---------------------------------------------------------

  runTest(
    'literal string "hello" static',
    {
      'literal_string.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<'hello'>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'literal_string.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(t.literal).toBe('hello');
    }
  );

  runTest(
    'literal string "hello" reflect (as const)',
    {
      'literal_string.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 'hello' as const;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'literal_string.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(t.literal).toBe('hello');
    }
  );

  runTest(
    'literal string "hello" reflect (plain const) — widens to string',
    {
      'literal_string.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 'hello';
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'literal_string.ts').kind).toBe(ReflectionKind.string);
    }
  );

  runTest(
    'literal number 42 static',
    {
      'literal_number.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<42>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'literal_number.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(t.literal).toBe(42);
    }
  );

  runTest(
    'literal number 42 reflect (as const)',
    {
      'literal_number.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 42 as const;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'literal_number.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(t.literal).toBe(42);
    }
  );

  runTest(
    'literal number 42 reflect (plain const) — widens to number',
    {
      'literal_number.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 42;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'literal_number.ts').kind).toBe(ReflectionKind.number);
    }
  );

  runTest(
    'literal boolean true static',
    {
      'literal_boolean.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<true>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'literal_boolean.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(t.literal).toBe(true);
    }
  );

  runTest(
    'literal boolean true reflect (as const)',
    {
      'literal_boolean.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = true as const;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'literal_boolean.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(t.literal).toBe(true);
    }
  );

  runTest(
    'literal boolean true reflect (plain const) — widens to boolean',
    {
      'literal_boolean.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = true;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'literal_boolean.ts').kind).toBe(ReflectionKind.boolean);
    }
  );

  runTest(
    'literal bigint 1n -> real BigInt instance, static',
    {
      'literal_bigint.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<1n>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'literal_bigint.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(typeof t.literal).toBe('bigint');
      expect(t.literal).toBe(1n);
    }
  );

  runTest(
    'literal bigint 1n -> real BigInt instance, reflect (as const)',
    {
      'literal_bigint.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 1n as const;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'literal_bigint.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(typeof t.literal).toBe('bigint');
      expect(t.literal).toBe(1n);
    }
  );

  runTest(
    'literal bigint 1n reflect (plain const) — widens to bigint',
    {
      'literal_bigint.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 1n;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      expect(getTypeFor(cache, 'literal_bigint.ts').kind).toBe(ReflectionKind.bigint);
    }
  );

  // Literal symbol: spelling a unique-symbol type still requires a value
  // binding (`typeof sym`); the static form goes through `typeof sym` in
  // the type argument, the reflect form passes the binding directly.
  runTest(
    'literal symbol -> real Symbol instance, static',
    {
      'literal_symbol.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const sym: unique symbol = Symbol('sym');
getRuntypeId<typeof sym>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'literal_symbol.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(typeof t.literal).toBe('symbol');
    }
  );

  runTest(
    'literal symbol -> real Symbol instance, reflect',
    {
      'literal_symbol.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const sym: unique symbol = Symbol('sym');
reflectRuntypeId(sym);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'literal_symbol.ts');
      expect(t.kind).toBe(ReflectionKind.literal);
      expect(typeof t.literal).toBe('symbol');
      expect((t.literal as symbol).description).toBe('sym');
    }
  );

  // ---- enums ------------------------------------------------------------

  runTest(
    'numeric enum static -> values + enum object + indexType=number',
    {
      'enum_numeric.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 0,
  Green = 1,
  Blue = 2,
}
getRuntypeId<Color>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'enum_numeric.ts');
      expect(t.kind).toBe(ReflectionKind.enum);
      expect(t.typeName).toBe('Color');
      expect(t.enumVal).toEqual({Red: 0, Green: 1, Blue: 2});
      expect(t.values).toEqual(expect.arrayContaining([0, 1, 2]));
      expect(t.indexType?.kind).toBe(ReflectionKind.number);
    }
  );

  // `const v = Color.Red` (no annotation) widens to the parent enum `Color`.
  // The trap `const v: Color = …` narrows to the literal `Color.Red` — see
  // docs/atomic-types.md.
  runTest(
    'numeric enum reflect -> values + enum object + indexType=number',
    {
      'enum_numeric.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 0,
  Green = 1,
  Blue = 2,
}
const v = Color.Red;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'enum_numeric.ts');
      expect(t.kind).toBe(ReflectionKind.enum);
      expect(t.typeName).toBe('Color');
      expect(t.enumVal).toEqual({Red: 0, Green: 1, Blue: 2});
      expect(t.values).toEqual(expect.arrayContaining([0, 1, 2]));
      expect(t.indexType?.kind).toBe(ReflectionKind.number);
    }
  );

  runTest(
    'string enum static -> values + indexType=string',
    {
      'enum_string.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
getRuntypeId<Color>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'enum_string.ts');
      expect(t.kind).toBe(ReflectionKind.enum);
      expect(t.enumVal).toEqual({Red: 'red', Green: 'green', Blue: 'blue'});
      expect(t.indexType?.kind).toBe(ReflectionKind.string);
    }
  );

  runTest(
    'string enum reflect -> values + indexType=string',
    {
      'enum_string.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
const v = Color.Red;
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t = getTypeFor(cache, 'enum_string.ts');
      expect(t.kind).toBe(ReflectionKind.enum);
      expect(t.enumVal).toEqual({Red: 'red', Green: 'green', Blue: 'blue'});
      expect(t.indexType?.kind).toBe(ReflectionKind.string);
    }
  );

  // ---- Date — class with classType === globalThis.Date ----------------

  runTest(
    'Date class static -> classType === globalThis.Date',
    {
      'date.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<Date>();
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'date.ts');
      expect(t.kind).toBe(ReflectionKind.class);
      expect(t.typeName).toBe('Date');
      expect(t.classType).toBe(Date);
    }
  );

  runTest(
    'Date class reflect -> classType === globalThis.Date',
    {
      'date.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: Date = new Date();
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const t: any = getTypeFor(cache, 'date.ts');
      expect(t.kind).toBe(ReflectionKind.class);
      expect(t.typeName).toBe('Date');
      expect(t.classType).toBe(Date);
    }
  );

  // ---- structural dedup at the wire level -----------------------------

  // One file uses the static form, the other the reflect form — both
  // produce the same `string` cache entry. This is the cross-form
  // hash-equivalence assertion required by the marker test coverage rule.
  runTest(
    'two `string` queries (mixed forms) in one program share a single cache id',
    {
      'string_a.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`,
      'string_b.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: string = 'b';
reflectRuntypeId(v);
`,
    },
    async (sources) => {
      const cache = await evalCacheFor(sources);
      const stringEntries = Object.values(cache.byHash).filter((t) => t.kind === ReflectionKind.string);
      expect(stringEntries.length).toBe(1);
    }
  );
});
