import type {ValidationCase} from './types.ts';
import {createIsType, createGetTypeErrors, createMockType, type DataOnly} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import {deserializeIsType, deserializeGetTypeErrors} from '../../util/deserializeRTFunctions.ts';

export const ATOMIC = {
  any: {
    title: 'Any type — every value passes',
    isTypeNotes: 'No-op validator — every value passes. Equivalent to `() => true`.',
    isType: () => createIsType<any>(),
    isTypeDataOnly: () => createIsType<DataOnly<any>>(),
    isTypeSchema: () => createIsType(RT.any()),
    deserializeIsType: () => deserializeIsType<any>(),
    isTypeReflect: () => {
      const v: any = null;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: any = null;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<any>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<any>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.any()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<any>(),
    getTypeErrorsReflect: () => {
      const v: any = null;
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: any = null;
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<any>(),
    mockTypeReflect: () => {
      const v: any = null;
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [null, undefined, 42, 'hello'],
      invalid: [],
    }),
    getExpectedErrors: () => [],
  },

  bigint: {
    title: 'BigInt primitive',
    description: 'Infinity and -Infinity rejected (typeof gate)',
    isType: () => createIsType<bigint>(),
    isTypeDataOnly: () => createIsType<DataOnly<bigint>>(),
    isTypeSchema: () => createIsType(RT.bigint()),
    deserializeIsType: () => deserializeIsType<bigint>(),
    isTypeReflect: () => {
      const v: bigint = 1n;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: bigint = 1n;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<bigint>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<bigint>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.bigint()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<bigint>(),
    getTypeErrorsReflect: () => {
      const v: bigint = 1n;
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: bigint = 1n;
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<bigint>(),
    mockTypeReflect: () => {
      const v: bigint = 1n;
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [1n, BigInt(42)],
      invalid: [42, Infinity, -Infinity, 'hello', null, undefined, true],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
    ],
  },

  boolean: {
    title: 'Boolean primitive (strict typeof)',
    isTypeNotes:
      'Strict typeof === "boolean". Truthy/falsy values that are not actual booleans (e.g., 0, 1, "", "true") are rejected.',
    isType: () => createIsType<boolean>(),
    isTypeDataOnly: () => createIsType<DataOnly<boolean>>(),
    isTypeSchema: () => createIsType(RT.boolean()),
    deserializeIsType: () => deserializeIsType<boolean>(),
    isTypeReflect: () => {
      const v: boolean = true;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: boolean = true;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<boolean>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<boolean>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.boolean()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<boolean>(),
    getTypeErrorsReflect: () => {
      const v: boolean = true;
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: boolean = true;
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<boolean>(),
    mockTypeReflect: () => {
      const v: boolean = true;
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [true, false],
      invalid: [42, 'hello', 0, 1, null, undefined],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
    ],
  },

  date: {
    title: 'Date instance (rejects Invalid Date)',
    description: 'Invalid Date instances (getTime() === NaN) rejected',
    isTypeNotes: [
      'Must be an actual Date instance (instanceof Date).',
      'Invalid Date instances are rejected — e.g., `new Date("not-a-date")` or `new Date(NaN)`, whose `.getTime()` returns NaN.',
    ],
    isType: () => createIsType<Date>(),
    isTypeDataOnly: () => createIsType<DataOnly<Date>>(),
    isTypeSchema: () => createIsType(RT.date()),
    deserializeIsType: () => deserializeIsType<Date>(),
    isTypeReflect: () => {
      const v: Date = new Date();
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Date = new Date();
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Date>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<Date>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.date()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Date>(),
    getTypeErrorsReflect: () => {
      const v: Date = new Date();
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Date = new Date();
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<Date>(),
    mockTypeReflect: () => {
      const v: Date = new Date();
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [new Date()],
      invalid: ['hello', new Date('invalid'), new Date(NaN)],
    }),
    getExpectedErrors: () => [[{path: [], expected: 'date'}], [{path: [], expected: 'date'}], [{path: [], expected: 'date'}]],
  },

  enum_mixed: {
    title: 'Enum with mixed numeric and string members',
    description: 'enum Color {Red, Green="green", Blue=2} — numeric reverse-mapping + string values',
    isTypeNotes: [
      'Validator accepts the underlying enum VALUES (0, "green", 2 for Color {Red, Green="green", Blue=2}).',
      'Enum member NAMES as strings ("Red", "Green", "Blue") are NOT accepted — these are TS-only handles, not runtime values.',
    ],
    // The value-first `RT.enum(Color)` carries the enum's value-UNION (kind union),
    // while the type-first `createIsType<Color>()` is the named `KindEnum`: they
    // validate identically but are structurally distinct by design (a value-first
    // builder can't reconstruct the nominal enum's member-name metadata). See the
    // enum builder doc in src/schema/atomic.ts.
    idDivergent: true,
    isType: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createIsType<Color>();
    },
    isTypeDataOnly: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createIsType<DataOnly<Color>>();
    },
    isTypeSchema: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createIsType(RT.enum(Color));
    },
    deserializeIsType: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return deserializeIsType<Color>();
    },
    isTypeReflect: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      const v: Color = Color.Red;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      const v: Color = Color.Red;
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createGetTypeErrors<Color>();
    },
    getTypeErrorsDataOnly: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createGetTypeErrors<DataOnly<Color>>();
    },
    getTypeErrorsSchema: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createGetTypeErrors(RT.enum(Color));
    },
    deserializeGetTypeErrors: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return deserializeGetTypeErrors<Color>();
    },
    getTypeErrorsReflect: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      const v: Color = Color.Red;
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      const v: Color = Color.Red;
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createMockType<Color>();
    },
    mockTypeReflect: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      const v: Color = Color.Red;
      return createMockType(v);
    },
    getSamples: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return {
        valid: [Color.Red, Color.Green, Color.Blue, 0, 'green', 2],
        invalid: ['Red', 'Green', 'Blue', 4, 1, 3, true, null, {}],
      };
    },
    getExpectedErrors: () => [
      [{path: [], expected: 'enum'}],
      [{path: [], expected: 'enum'}],
      [{path: [], expected: 'enum'}],
      [{path: [], expected: 'enum'}],
      [{path: [], expected: 'enum'}],
      [{path: [], expected: 'enum'}],
      [{path: [], expected: 'enum'}],
      [{path: [], expected: 'enum'}],
      [{path: [], expected: 'enum'}],
    ],
  },

  literal_2: {
    title: 'Numeric literal type (strict equality)',
    isTypeNotes: 'Strict === equality with the literal value. The string "2" is not the number 2.',
    isType: () => createIsType<2>(),
    isTypeDataOnly: () => createIsType<DataOnly<2>>(),
    isTypeSchema: () => createIsType(RT.literal(2)),
    deserializeIsType: () => deserializeIsType<2>(),
    isTypeReflect: () => {
      const v = 2 as const;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v = 2 as const;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<2>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<2>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.literal(2)),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<2>(),
    getTypeErrorsReflect: () => {
      const v = 2 as const;
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v = 2 as const;
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<2>(),
    mockTypeReflect: () => {
      const v = 2 as const;
      return createMockType(v);
    },
    getSamples: () => ({valid: [2], invalid: [4, '2', null, undefined]}),
    getExpectedErrors: () => [
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
    ],
  },

  literal_a: {
    title: 'String literal type (case-sensitive)',
    isTypeNotes: 'Case-sensitive — "A" does not satisfy the literal "a".',
    isType: () => createIsType<'a'>(),
    isTypeDataOnly: () => createIsType<DataOnly<'a'>>(),
    isTypeSchema: () => createIsType(RT.literal('a')),
    deserializeIsType: () => deserializeIsType<'a'>(),
    isTypeReflect: () => {
      const v = 'a' as const;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v = 'a' as const;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<'a'>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<'a'>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.literal('a')),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<'a'>(),
    getTypeErrorsReflect: () => {
      const v = 'a' as const;
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v = 'a' as const;
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<'a'>(),
    mockTypeReflect: () => {
      const v = 'a' as const;
      return createMockType(v);
    },
    getSamples: () => ({valid: ['a'], invalid: ['b', 'A', '', null, undefined]}),
    getExpectedErrors: () => [
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
    ],
  },

  literal_true: {
    title: 'Boolean literal type (only true)',
    isTypeNotes:
      'Strict === equality. Truthy values like 1 or "true" do NOT satisfy the literal `true`; only the boolean true does.',
    isType: () => createIsType<true>(),
    isTypeDataOnly: () => createIsType<DataOnly<true>>(),
    isTypeSchema: () => createIsType(RT.literal(true)),
    deserializeIsType: () => deserializeIsType<true>(),
    isTypeReflect: () => {
      const v = true as const;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v = true as const;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<true>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<true>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.literal(true)),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<true>(),
    getTypeErrorsReflect: () => {
      const v = true as const;
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v = true as const;
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<true>(),
    mockTypeReflect: () => {
      const v = true as const;
      return createMockType(v);
    },
    getSamples: () => ({valid: [true], invalid: [false, 1, 'true', null]}),
    getExpectedErrors: () => [
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
    ],
  },

  literal_1n: {
    title: 'BigInt literal type (only 1n)',
    isTypeNotes: 'Strict === equality with the bigint literal. The number 1 and the string "1n" do NOT satisfy 1n.',
    isType: () => createIsType<1n>(),
    isTypeDataOnly: () => createIsType<DataOnly<1n>>(),
    isTypeSchema: () => createIsType(RT.literal(1n)),
    deserializeIsType: () => deserializeIsType<1n>(),
    isTypeReflect: () => {
      const v = 1n as const;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v = 1n as const;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<1n>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<1n>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.literal(1n)),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<1n>(),
    getTypeErrorsReflect: () => {
      const v = 1n as const;
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v = 1n as const;
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<1n>(),
    mockTypeReflect: () => {
      const v = 1n as const;
      return createMockType(v);
    },
    getSamples: () => ({valid: [1n], invalid: [2n, 1, '1n', 0n, null]}),
    getExpectedErrors: () => [
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
    ],
  },

  literal_symbol: {
    title: 'Symbol literal type (matched by description)',
    // DataOnly<unique symbol> collapses to `never` (symbols are non-data), so
    // createIsType<DataOnly<T>>() can't reproduce the symbol validator.
    dataOnlyDivergent: true,
    description: 'symbol identity via description match (mion semantics)',
    isTypeNotes:
      'TS DIVERGENCE: Symbol literal types are matched by `description`, not by unique-symbol identity. A different `Symbol("hello")` instance with the same description WILL satisfy the type. Strict TS treats each `typeof sym` as a unique-symbol referring to that exact value.',
    isType: () => {
      const sym = Symbol('hello');
      return createIsType<typeof sym>();
    },
    isTypeDataOnly: () => {
      const sym = Symbol('hello');
      return createIsType<DataOnly<typeof sym>>();
    },
    // No value-first builder for a unique-symbol literal (matched by description);
    // `RT.symbol()` is the bare-symbol kind, which is unsupported at root anyway.
    isTypeSchema: 'not-supported',
    deserializeIsType: () => {
      const sym = Symbol('hello');
      return deserializeIsType<typeof sym>();
    },
    isTypeReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      const sym = Symbol('hello');
      return createGetTypeErrors<typeof sym>();
    },
    getTypeErrorsDataOnly: () => {
      const sym = Symbol('hello');
      return createGetTypeErrors<DataOnly<typeof sym>>();
    },
    getTypeErrorsSchema: 'not-supported',
    deserializeGetTypeErrors: () => {
      const sym = Symbol('hello');
      return deserializeGetTypeErrors<typeof sym>();
    },
    getTypeErrorsReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      const sym = Symbol('hello');
      return createMockType<typeof sym>();
    },
    mockTypeReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createMockType(v);
    },
    getSamples: () => {
      const sym = Symbol('hello');
      return {
        // identity by description per mion semantics:
        // emit is `typeof === 'symbol' && v.description === 'hello'`
        valid: [sym, Symbol('hello')],
        invalid: [Symbol('nice'), 'hello', null, undefined],
      };
    },
    getExpectedErrors: () => [
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
      [{path: [], expected: 'literal'}],
    ],
  },

  never: {
    title: 'Never — no value passes',
    isTypeNotes: 'No value satisfies `never`. The validator is hard-coded to return `false` for every input.',
    isType: () => createIsType<never>(),
    isTypeDataOnly: () => createIsType<DataOnly<never>>(),
    isTypeSchema: () => createIsType(RT.never()),
    deserializeIsType: () => deserializeIsType<never>(),
    isTypeReflect: () => {
      const v: never = null as never;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: never = null as never;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<never>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<never>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.never()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<never>(),
    getTypeErrorsReflect: () => {
      const v: never = null as never;
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: never = null as never;
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<never>(),
    mockTypeReflect: () => {
      const v: never = null as never;
      return createMockType(v);
    },
    mockTypeExpect: 'throw',
    getSamples: () => ({
      valid: [],
      invalid: [true, false, 1, '3', {}, 'hello', null, undefined, NaN, []],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
      [{path: [], expected: 'never'}],
    ],
  },

  null: {
    title: 'Null primitive (distinct from undefined)',
    description: 'null and undefined are distinct',
    isTypeNotes:
      'Strict === null check. `undefined`, `0`, `""`, `false`, `NaN`, `{}`, `[]` and other "falsy" or "nullish-feeling" values are all rejected.',
    isType: () => createIsType<null>(),
    isTypeDataOnly: () => createIsType<DataOnly<null>>(),
    isTypeSchema: () => createIsType(RT.literal(null)),
    deserializeIsType: () => deserializeIsType<null>(),
    isTypeReflect: () => {
      const v: null = null;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: null = null;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<null>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<null>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.literal(null)),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<null>(),
    getTypeErrorsReflect: () => {
      const v: null = null;
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: null = null;
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<null>(),
    mockTypeReflect: () => {
      const v: null = null;
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [null],
      invalid: [undefined, 42, 'hello', 0, '', false, NaN, {}, []],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'null'}],
      [{path: [], expected: 'null'}],
      [{path: [], expected: 'null'}],
      [{path: [], expected: 'null'}],
      [{path: [], expected: 'null'}],
      [{path: [], expected: 'null'}],
      [{path: [], expected: 'null'}],
      [{path: [], expected: 'null'}],
      [{path: [], expected: 'null'}],
    ],
  },

  number: {
    title: 'Number primitive (rejects NaN and Infinity)',
    description: 'Infinity and -Infinity rejected (Number.isFinite)',
    isTypeNotes: [
      'Uses `Number.isFinite(v)` rather than bare `typeof v === "number"`.',
      '`NaN`, `Infinity`, and `-Infinity` are rejected even though they pass `typeof === "number"`.',
    ],
    isType: () => createIsType<number>(),
    isTypeDataOnly: () => createIsType<DataOnly<number>>(),
    isTypeSchema: () => createIsType(RT.number()),
    deserializeIsType: () => deserializeIsType<number>(),
    isTypeReflect: () => {
      const v: number = 42;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: number = 42;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<number>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<number>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.number()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<number>(),
    getTypeErrorsReflect: () => {
      const v: number = 42;
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: number = 42;
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<number>(),
    mockTypeReflect: () => {
      const v: number = 42;
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [42],
      invalid: [Infinity, -Infinity, NaN, 'hello', null, undefined],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'number'}],
      [{path: [], expected: 'number'}],
      [{path: [], expected: 'number'}],
      [{path: [], expected: 'number'}],
      [{path: [], expected: 'number'}],
      [{path: [], expected: 'number'}],
    ],
  },

  object: {
    title: 'Object type — any non-null non-primitive value',
    description: 'null rejected despite JS typeof null === "object"',
    isTypeNotes: [
      'Emit is `typeof v === "object" && v !== null` — strict TS semantics (any non-primitive non-null value).',
      'Arrays, Date instances, RegExp, Map, Set, and class instances all PASS — they are TS-`object` per the spec.',
      '`null` is explicitly rejected (despite `typeof null === "object"` in JavaScript).',
      '`object` here does NOT mean "plain object literal" — if you need that semantic, use a specific object shape or an index-signature type.',
    ],
    isType: () => createIsType<object>(),
    isTypeDataOnly: () => createIsType<DataOnly<object>>(),
    // No value-first builder for the TS `object` primitive (any non-null
    // non-primitive) — `RT.object(...)` is the shape composer, a different kind.
    isTypeSchema: 'not-supported',
    deserializeIsType: () => deserializeIsType<object>(),
    isTypeReflect: () => {
      const v: object = {};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: object = {};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<object>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<object>>(),
    getTypeErrorsSchema: 'not-supported',
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<object>(),
    getTypeErrorsReflect: () => {
      const v: object = {};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: object = {};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<object>(),
    mockTypeReflect: () => {
      const v: object = {};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{}, {a: 42, b: 'hello'}, [], new Date(), /abc/],
      invalid: [null, undefined, 42, 'hello', true, Symbol()],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  regexp: {
    title: 'RegExp instance',
    isTypeNotes: 'Must be an actual RegExp instance (`instanceof RegExp`). A string like `"/abc/"` does NOT satisfy.',
    isType: () => createIsType<RegExp>(),
    isTypeDataOnly: () => createIsType<DataOnly<RegExp>>(),
    isTypeSchema: () => createIsType(RT.regexp()),
    deserializeIsType: () => deserializeIsType<RegExp>(),
    isTypeReflect: () => {
      const v: RegExp = /abc/;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: RegExp = /abc/;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<RegExp>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<RegExp>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.regexp()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<RegExp>(),
    // Reflect thunks omitted: `const v: RegExp = /abc/` narrows to the
    // literal-regex type T = /abc/, which produces `expected: 'literal'`
    // instead of `'regexp'` and diverges from the static form. The
    // isType validator's body coincides for valid + invalid samples
    // so isType tests pass; typeErrors reports the kindname directly
    // and the divergence surfaces. Cases that DON'T narrow (Date,
    // symbol(...)) keep their reflect form.
    // Reflect thunks omitted for the same narrowing reason as getTypeErrors
    // above — `const v: RegExp = /abc/` narrows to the literal-regex type
    // and would dispatch to the regexp-literal arm instead.
    mockType: () => createMockType<RegExp>(),
    // mockTypeReflect omitted for the same narrowing reason — would
    // resolve to a regexp-literal runtype.
    getSamples: () => ({
      valid: [/abc/, new RegExp('abc')],
      invalid: [undefined, 42, 'hello', null, '/abc/', {}],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'regexp'}],
      [{path: [], expected: 'regexp'}],
      [{path: [], expected: 'regexp'}],
      [{path: [], expected: 'regexp'}],
      [{path: [], expected: 'regexp'}],
      [{path: [], expected: 'regexp'}],
    ],
  },

  string: {
    title: 'String primitive',
    isTypeNotes: 'Strict typeof === "string". The empty string ("") is accepted.',
    isType: () => createIsType<string>(),
    isTypeDataOnly: () => createIsType<DataOnly<string>>(),
    isTypeSchema: () => createIsType(RT.string()),
    deserializeIsType: () => deserializeIsType<string>(),
    isTypeReflect: () => {
      const v: string = 'hello';
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: string = 'hello';
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<string>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<string>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.string()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<string>(),
    getTypeErrorsReflect: () => {
      const v: string = 'hello';
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: string = 'hello';
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<string>(),
    mockTypeReflect: () => {
      const v: string = 'hello';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: ['hello', ''],
      invalid: [2, null, undefined, true],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
    ],
  },

  symbol: {
    title: 'Symbol primitive',
    isTypeNotes:
      'Symbol at root is unsupported — identity does not survive across realms or round-trips, so a `typeof === "symbol"` check would give false confidence. The Go pipeline renders the factory as alwaysThrow (codes IT002 / TE002 / IS002), and the very first `createXxx<symbol>()` call throws. See docs/UNSUPPORTED-KINDS.md.',
    isType: () => createIsType<symbol>(),
    isTypeDataOnly: () => createIsType<DataOnly<symbol>>(),
    // Bare symbol is unsupported at root — the value-first `RT.symbol()` resolves
    // the same alwaysThrow factory, so this thunk throws like the type-first form.
    isTypeSchema: () => createIsType(RT.symbol()),
    deserializeIsType: () => deserializeIsType<symbol>(),
    isTypeReflect: () => {
      const v: symbol = Symbol();
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: symbol = Symbol();
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<symbol>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<symbol>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.symbol()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<symbol>(),
    getTypeErrorsReflect: () => {
      const v: symbol = Symbol();
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: symbol = Symbol();
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<symbol>(),
    mockTypeReflect: () => {
      const v: symbol = Symbol();
      return createMockType(v);
    },
    factoryThrows: true,
    getSamples: () => ({valid: [], invalid: []}),
  },

  undefined: {
    title: 'Undefined primitive (distinct from null)',
    description: 'undefined and null are distinct',
    isTypeNotes: 'Strict === undefined check. `null`, `0`, `""`, `false`, `{}`, `[]` are all rejected.',
    isType: () => createIsType<undefined>(),
    isTypeDataOnly: () => createIsType<DataOnly<undefined>>(),
    isTypeSchema: () => createIsType(RT.literal(undefined)),
    deserializeIsType: () => deserializeIsType<undefined>(),
    isTypeReflect: () => {
      const v: undefined = undefined;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: undefined = undefined;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<undefined>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<undefined>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.literal(undefined)),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<undefined>(),
    getTypeErrorsReflect: () => {
      const v: undefined = undefined;
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: undefined = undefined;
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<undefined>(),
    mockTypeReflect: () => {
      const v: undefined = undefined;
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [undefined],
      invalid: [null, 42, 'hello', 0, '', false, {}, []],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'undefined'}],
      [{path: [], expected: 'undefined'}],
      [{path: [], expected: 'undefined'}],
      [{path: [], expected: 'undefined'}],
      [{path: [], expected: 'undefined'}],
      [{path: [], expected: 'undefined'}],
      [{path: [], expected: 'undefined'}],
      [{path: [], expected: 'undefined'}],
    ],
  },

  void: {
    title: 'Void — accepts undefined, rejects null',
    description: 'void accepts undefined (and bare function return); rejects null',
    isType: () => createIsType<void>(),
    isTypeDataOnly: () => createIsType<DataOnly<void>>(),
    isTypeSchema: () => createIsType(RT.void()),
    deserializeIsType: () => deserializeIsType<void>(),
    isTypeReflect: () => {
      const v: void = undefined;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: void = undefined;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<void>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<void>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.void()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<void>(),
    getTypeErrorsReflect: () => {
      const v: void = undefined;
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: void = undefined;
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<void>(),
    mockTypeReflect: () => {
      const v: void = undefined;
      return createMockType(v);
    },
    getSamples: () => {
      function vd(): void {}
      return {
        valid: [undefined, vd()],
        invalid: [null, 42, 'hello'],
      };
    },
    getExpectedErrors: () => [[{path: [], expected: 'void'}], [{path: [], expected: 'void'}], [{path: [], expected: 'void'}]],
  },

  // noLiterals variants — mirror the `noLiterals: true` block in
  // mion's literal.spec.ts. Each literal degrades to its base-type
  // check: the validator accepts any value of the base type instead
  // of only the exact literal. The Go-side resolver swaps the
  // literal type for its base via Checker_getBaseTypeOfLiteralType
  // before assigning the hash (see internal/resolver/scan.go), so
  // these cases reuse the existing base-kind emit code.

  literal_2_noLiterals: {
    title: 'Numeric literal with noLiterals (degrades to number)',
    description: 'degrades to number — Number.isFinite check',
    isTypeNotes:
      'With `{noLiterals: true}` the literal degrades to its base type (`number`). The exact-literal check is replaced by `Number.isFinite` — same rules as the atomic `number` validator (NaN / Infinity / -Infinity rejected).',
    isType: () => createIsType<2>(undefined, {noLiterals: true}),
    isTypeDataOnly: () => createIsType<DataOnly<2>>(undefined, {noLiterals: true}),
    // Value-first mirror of the type-first form: the SAME literal id carrying the
    // SAME {noLiterals} option — both resolve the `itNL_<literal-2 id>` variant.
    // (noLiterals keeps the literal's structural id and folds into the variant
    // key; it does NOT degrade to `number`'s id before hashing.)
    isTypeSchema: () => createIsType(RT.literal(2), {noLiterals: true}),
    deserializeIsType: () => deserializeIsType<2>(undefined, {noLiterals: true}),
    isTypeReflect: () => {
      const v = 2 as const;
      return createIsType(v, {noLiterals: true});
    },
    deserializeIsTypeReflect: () => {
      const v = 2 as const;
      return deserializeIsType(v, {noLiterals: true});
    },
    getTypeErrors: () => createGetTypeErrors<2>(undefined, {noLiterals: true}),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<2>>(undefined, {noLiterals: true}),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.literal(2), {noLiterals: true}),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<2>(undefined, {noLiterals: true}),
    getTypeErrorsReflect: () => {
      const v = 2 as const;
      return createGetTypeErrors(v, {noLiterals: true});
    },
    deserializeGetTypeErrorsReflect: () => {
      const v = 2 as const;
      return deserializeGetTypeErrors(v, {noLiterals: true});
    },
    mockType: () => createMockType<2>(undefined, undefined),
    mockTypeReflect: () => {
      const v = 2 as const;
      return createMockType(v);
    },
    getSamples: () => ({valid: [4, 0, -1], invalid: ['4', Infinity, NaN, null]}),
    getExpectedErrors: () => [
      [{path: [], expected: 'number'}],
      [{path: [], expected: 'number'}],
      [{path: [], expected: 'number'}],
      [{path: [], expected: 'number'}],
    ],
  },

  literal_a_noLiterals: {
    title: 'String literal with noLiterals (degrades to string)',
    description: 'degrades to string — typeof check',
    isTypeNotes:
      '`{noLiterals: true}` degrades the literal to its base type `string`. Any string passes, including the empty string.',
    isType: () => createIsType<'a'>(undefined, {noLiterals: true}),
    isTypeDataOnly: () => createIsType<DataOnly<'a'>>(undefined, {noLiterals: true}),
    isTypeSchema: () => createIsType(RT.literal('a'), {noLiterals: true}),
    deserializeIsType: () => deserializeIsType<'a'>(undefined, {noLiterals: true}),
    isTypeReflect: () => {
      const v = 'a' as const;
      return createIsType(v, {noLiterals: true});
    },
    deserializeIsTypeReflect: () => {
      const v = 'a' as const;
      return deserializeIsType(v, {noLiterals: true});
    },
    getTypeErrors: () => createGetTypeErrors<'a'>(undefined, {noLiterals: true}),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<'a'>>(undefined, {noLiterals: true}),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.literal('a'), {noLiterals: true}),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<'a'>(undefined, {noLiterals: true}),
    getTypeErrorsReflect: () => {
      const v = 'a' as const;
      return createGetTypeErrors(v, {noLiterals: true});
    },
    deserializeGetTypeErrorsReflect: () => {
      const v = 'a' as const;
      return deserializeGetTypeErrors(v, {noLiterals: true});
    },
    mockType: () => createMockType<'a'>(undefined, undefined),
    mockTypeReflect: () => {
      const v = 'a' as const;
      return createMockType(v);
    },
    getSamples: () => ({valid: ['c', ''], invalid: [1, null, undefined, true]}),
    getExpectedErrors: () => [
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
    ],
  },

  literal_regexp_noLiterals: {
    title: 'RegExp literal with noLiterals (degrades to RegExp)',
    description: 'degrades to RegExp — instanceof check',
    isTypeNotes:
      '`{noLiterals: true}` degrades the literal to its base type `RegExp`. Any RegExp instance passes (constructor form `new RegExp(...)` included); source + flags are no longer matched.',
    isType: () => {
      const reg = /abc/i;
      return createIsType<typeof reg>(undefined, {noLiterals: true});
    },
    isTypeDataOnly: () => {
      const reg = /abc/i;
      return createIsType<DataOnly<typeof reg>>(undefined, {noLiterals: true});
    },
    // Value-first mirror: RegExp base kind + the SAME {noLiterals} option, so both
    // resolve the `itNL_<regexp id>` variant. (No RegExp-literal kind exists since
    // PR #76, so `typeof /abc/i` is plain `RegExp` — `RT.regexp()` is the match.)
    isTypeSchema: () => createIsType(RT.regexp(), {noLiterals: true}),
    deserializeIsType: () => {
      const reg = /abc/i;
      return deserializeIsType<typeof reg>(undefined, {noLiterals: true});
    },
    isTypeReflect: () => {
      const reg = /abc/i;
      const v: typeof reg = reg;
      return createIsType(v, {noLiterals: true});
    },
    deserializeIsTypeReflect: () => {
      const reg = /abc/i;
      const v: typeof reg = reg;
      return deserializeIsType(v, {noLiterals: true});
    },
    getTypeErrors: () => {
      const reg = /abc/i;
      return createGetTypeErrors<typeof reg>(undefined, {noLiterals: true});
    },
    getTypeErrorsDataOnly: () => {
      const reg = /abc/i;
      return createGetTypeErrors<DataOnly<typeof reg>>(undefined, {noLiterals: true});
    },
    getTypeErrorsSchema: () => createGetTypeErrors(RT.regexp(), {noLiterals: true}),
    deserializeGetTypeErrors: () => {
      const reg = /abc/i;
      return deserializeGetTypeErrors<typeof reg>(undefined, {noLiterals: true});
    },
    getTypeErrorsReflect: () => {
      const reg = /abc/i;
      const v: typeof reg = reg;
      return createGetTypeErrors(v, {noLiterals: true});
    },
    deserializeGetTypeErrorsReflect: () => {
      const reg = /abc/i;
      const v: typeof reg = reg;
      return deserializeGetTypeErrors(v, {noLiterals: true});
    },
    mockType: () => {
      const reg = /abc/i;
      return createMockType<typeof reg>(undefined, undefined);
    },
    mockTypeReflect: () => {
      const reg = /abc/i;
      const v: typeof reg = reg;
      return createMockType(v);
    },
    getSamples: () => ({valid: [/otherReg/, new RegExp('foo')], invalid: ['otherReg', null, undefined, {}]}),
    getExpectedErrors: () => [
      [{path: [], expected: 'regexp'}],
      [{path: [], expected: 'regexp'}],
      [{path: [], expected: 'regexp'}],
      [{path: [], expected: 'regexp'}],
    ],
  },

  literal_true_noLiterals: {
    title: 'Boolean literal with noLiterals (degrades to boolean)',
    description: 'degrades to boolean — typeof check',
    isTypeNotes:
      '`{noLiterals: true}` degrades the literal to its base type `boolean`. Either `true` or `false` passes; truthy values like 1 are still rejected.',
    isType: () => createIsType<true>(undefined, {noLiterals: true}),
    isTypeDataOnly: () => createIsType<DataOnly<true>>(undefined, {noLiterals: true}),
    isTypeSchema: () => createIsType(RT.literal(true), {noLiterals: true}),
    deserializeIsType: () => deserializeIsType<true>(undefined, {noLiterals: true}),
    isTypeReflect: () => {
      const v = true as const;
      return createIsType(v, {noLiterals: true});
    },
    deserializeIsTypeReflect: () => {
      const v = true as const;
      return deserializeIsType(v, {noLiterals: true});
    },
    getTypeErrors: () => createGetTypeErrors<true>(undefined, {noLiterals: true}),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<true>>(undefined, {noLiterals: true}),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.literal(true), {noLiterals: true}),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<true>(undefined, {noLiterals: true}),
    getTypeErrorsReflect: () => {
      const v = true as const;
      return createGetTypeErrors(v, {noLiterals: true});
    },
    deserializeGetTypeErrorsReflect: () => {
      const v = true as const;
      return deserializeGetTypeErrors(v, {noLiterals: true});
    },
    mockType: () => createMockType<true>(undefined, undefined),
    mockTypeReflect: () => {
      const v = true as const;
      return createMockType(v);
    },
    getSamples: () => ({valid: [false, true], invalid: [1, 0, 'true', null, undefined]}),
    getExpectedErrors: () => [
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
    ],
  },

  literal_1n_noLiterals: {
    title: 'BigInt literal with noLiterals (degrades to bigint)',
    description: 'degrades to bigint — typeof check',
    isTypeNotes:
      '`{noLiterals: true}` degrades the literal to its base type `bigint`. Any bigint passes; the number `1` does NOT.',
    isType: () => createIsType<1n>(undefined, {noLiterals: true}),
    isTypeDataOnly: () => createIsType<DataOnly<1n>>(undefined, {noLiterals: true}),
    isTypeSchema: () => createIsType(RT.literal(1n), {noLiterals: true}),
    deserializeIsType: () => deserializeIsType<1n>(undefined, {noLiterals: true}),
    isTypeReflect: () => {
      const v = 1n as const;
      return createIsType(v, {noLiterals: true});
    },
    deserializeIsTypeReflect: () => {
      const v = 1n as const;
      return deserializeIsType(v, {noLiterals: true});
    },
    getTypeErrors: () => createGetTypeErrors<1n>(undefined, {noLiterals: true}),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<1n>>(undefined, {noLiterals: true}),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.literal(1n), {noLiterals: true}),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<1n>(undefined, {noLiterals: true}),
    getTypeErrorsReflect: () => {
      const v = 1n as const;
      return createGetTypeErrors(v, {noLiterals: true});
    },
    deserializeGetTypeErrorsReflect: () => {
      const v = 1n as const;
      return deserializeGetTypeErrors(v, {noLiterals: true});
    },
    mockType: () => createMockType<1n>(undefined, undefined),
    mockTypeReflect: () => {
      const v = 1n as const;
      return createMockType(v);
    },
    getSamples: () => ({valid: [3n, 0n, 1n], invalid: [3, null, undefined, 1, '1n']}),
    getExpectedErrors: () => [
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
      [{path: [], expected: 'bigint'}],
    ],
  },

  literal_symbol_noLiterals: {
    title: 'Symbol literal with noLiterals (degrades to symbol)',
    description: 'degrades to bare symbol — unsupported at root',
    isTypeNotes:
      '`{noLiterals: true}` degrades the literal to its base type `symbol`, which is unsupported at root (see the `symbol` case above). The factory is rendered as alwaysThrow; the first `createXxx<typeof sym>()` call throws.',
    isType: () => {
      const sym = Symbol('hello');
      return createIsType<typeof sym>(undefined, {noLiterals: true});
    },
    isTypeDataOnly: () => {
      const sym = Symbol('hello');
      return createIsType<DataOnly<typeof sym>>(undefined, {noLiterals: true});
    },
    // Degrades to bare symbol (unsupported at root) — `RT.symbol()` resolves the
    // same alwaysThrow factory, so the schema thunk throws like the type-first form.
    isTypeSchema: () => createIsType(RT.symbol()),
    deserializeIsType: () => {
      const sym = Symbol('hello');
      return deserializeIsType<typeof sym>(undefined, {noLiterals: true});
    },
    isTypeReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createIsType(v, {noLiterals: true});
    },
    deserializeIsTypeReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return deserializeIsType(v, {noLiterals: true});
    },
    getTypeErrors: () => {
      const sym = Symbol('hello');
      return createGetTypeErrors<typeof sym>(undefined, {noLiterals: true});
    },
    getTypeErrorsDataOnly: () => {
      const sym = Symbol('hello');
      return createGetTypeErrors<DataOnly<typeof sym>>(undefined, {noLiterals: true});
    },
    getTypeErrorsSchema: () => createGetTypeErrors(RT.symbol()),
    deserializeGetTypeErrors: () => {
      const sym = Symbol('hello');
      return deserializeGetTypeErrors<typeof sym>(undefined, {noLiterals: true});
    },
    getTypeErrorsReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createGetTypeErrors(v, {noLiterals: true});
    },
    deserializeGetTypeErrorsReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return deserializeGetTypeErrors(v, {noLiterals: true});
    },
    mockType: () => {
      const sym = Symbol('hello');
      return createMockType<typeof sym>(undefined, undefined);
    },
    mockTypeReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createMockType(v);
    },
    factoryThrows: true,
    getSamples: () => ({valid: [], invalid: []}),
  },

  // `unknown` — like `any`, every value passes. UnknownRunType
  // extends AnyRunType in mion (no isType emit), so both kinds
  // collapse to a noop validator. Mion's own suite skips this; we
  // include it here for full TS keyword coverage so a regression
  // can't silently change the always-pass semantics.
  unknown: {
    title: 'Unknown type — every value passes',
    isTypeNotes: 'No-op validator — `unknown` accepts every value, same as `any`. Equivalent to `() => true`.',
    isType: () => createIsType<unknown>(),
    isTypeDataOnly: () => createIsType<DataOnly<unknown>>(),
    isTypeSchema: () => createIsType(RT.unknown()),
    deserializeIsType: () => deserializeIsType<unknown>(),
    isTypeReflect: () => {
      const v: unknown = null;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: unknown = null;
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<unknown>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<unknown>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.unknown()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<unknown>(),
    getTypeErrorsReflect: () => {
      const v: unknown = null;
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: unknown = null;
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<unknown>(),
    mockTypeReflect: () => {
      const v: unknown = null;
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [null, undefined, 42, 'hello', true, {}, [], Symbol(), () => null, new Date()],
      invalid: [],
    }),
    getExpectedErrors: () => [],
  },
} as const satisfies Record<string, ValidationCase>;
