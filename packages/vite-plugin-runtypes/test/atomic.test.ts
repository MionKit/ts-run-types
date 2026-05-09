// End-to-end atomic round-trip tests. Each scenario has paired *_static
// and *_reflect tests per the marker test coverage rule (CLAUDE.md):
//   static  uses getRuntypeId<T>() — explicit type, no value
//   reflect uses reflectRuntypeId(v) — T inferred from a runtime value
//
// Per-test sequence is:
//   1. Spawn the Go binary with this test's inline source(s)
//   2. rewrite() to inject the trailing-RuntypeId<T> id
//   3. Render a runtypes-cache JS module from the resolver dump
//   4. Eval the module and assert the resulting reflection-shape RunType
//      contains real runtime values where applicable (BigInt / Symbol /
//      RegExp / globalThis.Date instances)

import {describe, expect} from 'vitest';
import {ReflectionKind} from '../src/protocol.ts';
import {evalCacheFor, getTypeFor, runTest} from './helpers/inline.ts';

// ---- primitives ---------------------------------------------------------

const stringStaticSrc = {
  'string.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`,
};

const stringReflectSrc = {
  'string.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: string = 'hello';
reflectRuntypeId(v);
`,
};

const numberStaticSrc = {
  'number.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<number>();
`,
};

const numberReflectSrc = {
  'number.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: number = 42;
reflectRuntypeId(v);
`,
};

const booleanStaticSrc = {
  'boolean.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<boolean>();
`,
};

const booleanReflectSrc = {
  'boolean.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const v: boolean;
reflectRuntypeId(v);
`,
};

const bigintStaticSrc = {
  'bigint.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<bigint>();
`,
};

const bigintReflectSrc = {
  'bigint.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: bigint = 1n;
reflectRuntypeId(v);
`,
};

const symbolStaticSrc = {
  'symbol.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<symbol>();
`,
};

const symbolReflectSrc = {
  'symbol.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: symbol = Symbol('x');
reflectRuntypeId(v);
`,
};

const nullStaticSrc = {
  'null.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<null>();
`,
};

const nullReflectSrc = {
  'null.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: null = null;
reflectRuntypeId(v);
`,
};

const undefinedStaticSrc = {
  'undefined.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<undefined>();
`,
};

const undefinedReflectSrc = {
  'undefined.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: undefined = undefined;
reflectRuntypeId(v);
`,
};

const voidStaticSrc = {
  'void.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<void>();
`,
};

const voidReflectSrc = {
  'void.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const v: void;
reflectRuntypeId(v);
`,
};

const anyStaticSrc = {
  'any.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<any>();
`,
};

const anyReflectSrc = {
  'any.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: any = 1;
reflectRuntypeId(v);
`,
};

const unknownStaticSrc = {
  'unknown.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<unknown>();
`,
};

const unknownReflectSrc = {
  'unknown.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: unknown = 1;
reflectRuntypeId(v);
`,
};

const neverStaticSrc = {
  'never.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<never>();
`,
};

const neverReflectSrc = {
  'never.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const v: never;
reflectRuntypeId(v);
`,
};

const objectPrimitiveStaticSrc = {
  'object.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<object>();
`,
};

const objectPrimitiveReflectSrc = {
  'object.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: object = {};
reflectRuntypeId(v);
`,
};

// ---- regexp — instance form (no trace to a regex literal) --------------

const regexpInstanceStaticSrc = {
  'regexp.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<RegExp>();
`,
};

const regexpInstanceReflectSrc = {
  'regexp.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
declare const re: RegExp;
reflectRuntypeId(re);
`,
};

// ---- regexp — literal form (trace harvests source + flags) -------------

const regexpLiteralDirectSrc = {
  'regexp_literal.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
reflectRuntypeId(/abc/i);
`,
};

const regexpLiteralAsConstSrc = {
  'regexp_literal.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
reflectRuntypeId(/abc/i as const);
`,
};

const regexpLiteralBindingReflectSrc = {
  'regexp_literal.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const re = /abc/i;
reflectRuntypeId(re);
`,
};

const regexpLiteralTypeofStaticSrc = {
  'regexp_literal.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const re = /abc/i;
getRuntypeId<typeof re>();
`,
};

// ---- literals -----------------------------------------------------------

const literalStringStaticSrc = {
  'literal_string.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<'hello'>();
`,
};

const literalStringAsConstSrc = {
  'literal_string.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 'hello' as const;
reflectRuntypeId(v);
`,
};

const literalStringPlainConstSrc = {
  'literal_string.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 'hello';
reflectRuntypeId(v);
`,
};

const literalNumberStaticSrc = {
  'literal_number.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<42>();
`,
};

const literalNumberAsConstSrc = {
  'literal_number.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 42 as const;
reflectRuntypeId(v);
`,
};

const literalNumberPlainConstSrc = {
  'literal_number.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 42;
reflectRuntypeId(v);
`,
};

const literalBooleanStaticSrc = {
  'literal_boolean.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<true>();
`,
};

const literalBooleanAsConstSrc = {
  'literal_boolean.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = true as const;
reflectRuntypeId(v);
`,
};

const literalBooleanPlainConstSrc = {
  'literal_boolean.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = true;
reflectRuntypeId(v);
`,
};

const literalBigintStaticSrc = {
  'literal_bigint.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<1n>();
`,
};

const literalBigintAsConstSrc = {
  'literal_bigint.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 1n as const;
reflectRuntypeId(v);
`,
};

const literalBigintPlainConstSrc = {
  'literal_bigint.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v = 1n;
reflectRuntypeId(v);
`,
};

const literalSymbolStaticSrc = {
  'literal_symbol.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
const sym: unique symbol = Symbol('sym');
getRuntypeId<typeof sym>();
`,
};

const literalSymbolReflectSrc = {
  'literal_symbol.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const sym: unique symbol = Symbol('sym');
reflectRuntypeId(sym);
`,
};

// ---- enums --------------------------------------------------------------

const enumNumericStaticSrc = {
  'enum_numeric.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 0,
  Green = 1,
  Blue = 2,
}
getRuntypeId<Color>();
`,
};

const enumNumericReflectSrc = {
  'enum_numeric.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 0,
  Green = 1,
  Blue = 2,
}
const v = Color.Red;
reflectRuntypeId(v);
`,
};

const enumStringStaticSrc = {
  'enum_string.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
getRuntypeId<Color>();
`,
};

const enumStringReflectSrc = {
  'enum_string.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
const v = Color.Red;
reflectRuntypeId(v);
`,
};

// ---- Date — class with classType === globalThis.Date -------------------

const dateStaticSrc = {
  'date.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<Date>();
`,
};

const dateReflectSrc = {
  'date.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: Date = new Date();
reflectRuntypeId(v);
`,
};

// ---- structural dedup at the wire level --------------------------------

const stringDedupSrc = {
  'string_a.ts': `import {getRuntypeId} from '@mionjs/ts-go-run-types';
getRuntypeId<string>();
`,
  'string_b.ts': `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
const v: string = 'b';
reflectRuntypeId(v);
`,
};

describe('vite-plugin-runtypes / atomic round-trip', () => {
  // ---- primitives -------------------------------------------------------

  runTest('string static', stringStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'string.ts').kind).toBe(ReflectionKind.string);
  });

  runTest('string reflect', stringReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'string.ts').kind).toBe(ReflectionKind.string);
  });

  runTest('number static', numberStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'number.ts').kind).toBe(ReflectionKind.number);
  });

  runTest('number reflect', numberReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'number.ts').kind).toBe(ReflectionKind.number);
  });

  runTest('boolean static', booleanStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'boolean.ts').kind).toBe(ReflectionKind.boolean);
  });

  runTest('boolean reflect', booleanReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'boolean.ts').kind).toBe(ReflectionKind.boolean);
  });

  runTest('bigint static', bigintStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'bigint.ts').kind).toBe(ReflectionKind.bigint);
  });

  runTest('bigint reflect', bigintReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'bigint.ts').kind).toBe(ReflectionKind.bigint);
  });

  runTest('symbol static', symbolStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'symbol.ts').kind).toBe(ReflectionKind.symbol);
  });

  runTest('symbol reflect', symbolReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'symbol.ts').kind).toBe(ReflectionKind.symbol);
  });

  runTest('null static', nullStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'null.ts').kind).toBe(ReflectionKind.null);
  });

  runTest('null reflect', nullReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'null.ts').kind).toBe(ReflectionKind.null);
  });

  runTest('undefined static', undefinedStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'undefined.ts').kind).toBe(ReflectionKind.undefined);
  });

  runTest('undefined reflect', undefinedReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'undefined.ts').kind).toBe(ReflectionKind.undefined);
  });

  runTest('void static', voidStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'void.ts').kind).toBe(ReflectionKind.void);
  });

  runTest('void reflect', voidReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'void.ts').kind).toBe(ReflectionKind.void);
  });

  runTest('any static', anyStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'any.ts').kind).toBe(ReflectionKind.any);
  });

  runTest('any reflect', anyReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'any.ts').kind).toBe(ReflectionKind.any);
  });

  runTest('unknown static', unknownStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'unknown.ts').kind).toBe(ReflectionKind.unknown);
  });

  runTest('unknown reflect', unknownReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'unknown.ts').kind).toBe(ReflectionKind.unknown);
  });

  runTest('never static', neverStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'never.ts').kind).toBe(ReflectionKind.never);
  });

  runTest('never reflect', neverReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'never.ts').kind).toBe(ReflectionKind.never);
  });

  runTest('object primitive static', objectPrimitiveStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'object.ts').kind).toBe(ReflectionKind.object);
  });

  runTest('object primitive reflect', objectPrimitiveReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'object.ts').kind).toBe(ReflectionKind.object);
  });

  // ---- regexp — instance form (no trace to a regex literal) -----------

  runTest('regexp instance static (explicit RegExp type)', regexpInstanceStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'regexp.ts').kind).toBe(ReflectionKind.regexp);
  });

  runTest('regexp instance reflect (declare const, no initializer)', regexpInstanceReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'regexp.ts').kind).toBe(ReflectionKind.regexp);
  });

  // ---- regexp — literal form (trace harvests source + flags) ----------
  //
  // End-to-end shape proof: the rendered cache must produce a real `RegExp`
  // instance via the emitter's `new RegExp(source, flags)` footer expression.

  runTest('regexp literal reflect (direct /abc/i) -> real RegExp', regexpLiteralDirectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t: any = getTypeFor(cache, 'regexp_literal.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBeInstanceOf(RegExp);
    expect((t.literal as RegExp).source).toBe('abc');
    expect((t.literal as RegExp).flags).toBe('i');
  });

  runTest('regexp literal reflect (as const wrap)', regexpLiteralAsConstSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t: any = getTypeFor(cache, 'regexp_literal.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBeInstanceOf(RegExp);
  });

  runTest('regexp literal reflect (const binding) -> harvested via trace', regexpLiteralBindingReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t: any = getTypeFor(cache, 'regexp_literal.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect((t.literal as RegExp).source).toBe('abc');
    expect((t.literal as RegExp).flags).toBe('i');
  });

  runTest('regexp literal static (typeof binding) -> harvested via trace', regexpLiteralTypeofStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t: any = getTypeFor(cache, 'regexp_literal.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect((t.literal as RegExp).source).toBe('abc');
    expect((t.literal as RegExp).flags).toBe('i');
  });

  // ---- literals ---------------------------------------------------------

  runTest('literal string "hello" static', literalStringStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t = getTypeFor(cache, 'literal_string.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe('hello');
  });

  runTest('literal string "hello" reflect (as const)', literalStringAsConstSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t = getTypeFor(cache, 'literal_string.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe('hello');
  });

  runTest('literal string "hello" reflect (plain const) — widens to string', literalStringPlainConstSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'literal_string.ts').kind).toBe(ReflectionKind.string);
  });

  runTest('literal number 42 static', literalNumberStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t = getTypeFor(cache, 'literal_number.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe(42);
  });

  runTest('literal number 42 reflect (as const)', literalNumberAsConstSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t = getTypeFor(cache, 'literal_number.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe(42);
  });

  runTest('literal number 42 reflect (plain const) — widens to number', literalNumberPlainConstSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'literal_number.ts').kind).toBe(ReflectionKind.number);
  });

  runTest('literal boolean true static', literalBooleanStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t = getTypeFor(cache, 'literal_boolean.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe(true);
  });

  runTest('literal boolean true reflect (as const)', literalBooleanAsConstSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t = getTypeFor(cache, 'literal_boolean.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(t.literal).toBe(true);
  });

  runTest('literal boolean true reflect (plain const) — widens to boolean', literalBooleanPlainConstSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'literal_boolean.ts').kind).toBe(ReflectionKind.boolean);
  });

  runTest('literal bigint 1n -> real BigInt instance, static', literalBigintStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t: any = getTypeFor(cache, 'literal_bigint.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(typeof t.literal).toBe('bigint');
    expect(t.literal).toBe(1n);
  });

  runTest('literal bigint 1n -> real BigInt instance, reflect (as const)', literalBigintAsConstSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t: any = getTypeFor(cache, 'literal_bigint.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(typeof t.literal).toBe('bigint');
    expect(t.literal).toBe(1n);
  });

  runTest('literal bigint 1n reflect (plain const) — widens to bigint', literalBigintPlainConstSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    expect(getTypeFor(cache, 'literal_bigint.ts').kind).toBe(ReflectionKind.bigint);
  });

  // Literal symbol: spelling a unique-symbol type still requires a value
  // binding (`typeof sym`); the static form goes through `typeof sym` in
  // the type argument, the reflect form passes the binding directly.
  runTest('literal symbol -> real Symbol instance, static', literalSymbolStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t: any = getTypeFor(cache, 'literal_symbol.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(typeof t.literal).toBe('symbol');
  });

  runTest('literal symbol -> real Symbol instance, reflect', literalSymbolReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t: any = getTypeFor(cache, 'literal_symbol.ts');
    expect(t.kind).toBe(ReflectionKind.literal);
    expect(typeof t.literal).toBe('symbol');
    expect((t.literal as symbol).description).toBe('sym');
  });

  // ---- enums ------------------------------------------------------------

  runTest('numeric enum static -> values + enum object + indexType=number', enumNumericStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t = getTypeFor(cache, 'enum_numeric.ts');
    expect(t.kind).toBe(ReflectionKind.enum);
    expect(t.typeName).toBe('Color');
    expect(t.enum).toEqual({Red: 0, Green: 1, Blue: 2});
    expect(t.values).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(t.indexType?.kind).toBe(ReflectionKind.number);
  });

  // `const v = Color.Red` (no annotation) widens to the parent enum `Color`.
  // The trap `const v: Color = …` narrows to the literal `Color.Red` — see
  // docs/atomic-types.md.
  runTest('numeric enum reflect -> values + enum object + indexType=number', enumNumericReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t = getTypeFor(cache, 'enum_numeric.ts');
    expect(t.kind).toBe(ReflectionKind.enum);
    expect(t.typeName).toBe('Color');
    expect(t.enum).toEqual({Red: 0, Green: 1, Blue: 2});
    expect(t.values).toEqual(expect.arrayContaining([0, 1, 2]));
    expect(t.indexType?.kind).toBe(ReflectionKind.number);
  });

  runTest('string enum static -> values + indexType=string', enumStringStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t = getTypeFor(cache, 'enum_string.ts');
    expect(t.kind).toBe(ReflectionKind.enum);
    expect(t.enum).toEqual({Red: 'red', Green: 'green', Blue: 'blue'});
    expect(t.indexType?.kind).toBe(ReflectionKind.string);
  });

  runTest('string enum reflect -> values + indexType=string', enumStringReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t = getTypeFor(cache, 'enum_string.ts');
    expect(t.kind).toBe(ReflectionKind.enum);
    expect(t.enum).toEqual({Red: 'red', Green: 'green', Blue: 'blue'});
    expect(t.indexType?.kind).toBe(ReflectionKind.string);
  });

  // ---- Date — class with classType === globalThis.Date ----------------

  runTest('Date class static -> classType === globalThis.Date', dateStaticSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t: any = getTypeFor(cache, 'date.ts');
    expect(t.kind).toBe(ReflectionKind.class);
    expect(t.typeName).toBe('Date');
    expect(t.classType).toBe(Date);
  });

  runTest('Date class reflect -> classType === globalThis.Date', dateReflectSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const t: any = getTypeFor(cache, 'date.ts');
    expect(t.kind).toBe(ReflectionKind.class);
    expect(t.typeName).toBe('Date');
    expect(t.classType).toBe(Date);
  });

  // ---- structural dedup at the wire level -----------------------------

  // One file uses the static form, the other the reflect form — both
  // produce the same `string` cache entry. This is the cross-form
  // hash-equivalence assertion required by the marker test coverage rule.
  runTest('two `string` queries (mixed forms) in one program share a single cache id', stringDedupSrc, async (sources) => {
    const cache = await evalCacheFor(sources);
    const stringEntries = Array.from(cache.__runtypes.values()).filter((t) => t.kind === ReflectionKind.string);
    expect(stringEntries.length).toBe(1);
  });
});
