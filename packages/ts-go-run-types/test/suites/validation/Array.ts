import type {ValidationCase} from './types.ts';
import {createIsType, createGetTypeErrors, createMockType} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import {deserializeIsType, deserializeGetTypeErrors} from '../../util/deserializeRTFunctions.ts';

export const ARRAY = {
  string_array: {
    title: 'Array of strings',
    isTypeNotes: [
      'Top-level value must be an actual array (`Array.isArray`).',
      'Every element must satisfy the element type — the empty array `[]` is valid.',
    ],
    isType: () => createIsType<string[]>(),
    isTypeSchema: () => createIsType(RT.array(RT.string())),
    deserializeIsType: () => deserializeIsType<string[]>(),
    isTypeReflect: () => {
      const v: string[] = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: string[] = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<string[]>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.string())),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<string[]>(),
    getTypeErrorsReflect: () => {
      const v: string[] = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: string[] = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<string[]>(),
    mockTypeReflect: () => {
      const v: string[] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[], ['hello', 'world']],
      // The mixed-types invalid `['hello', 'world', {hello: 'world'}]`
      // is the carry-over from mion's "simple array hasUnknownKeys on
      // array with non objects" block — the object element fails the
      // string check, so the whole array fails isType.
      invalid: ['hello', ['hello', 2], ['hello', 'world', {hello: 'world'}], null, undefined, [42], [null]],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'array'}],
      [{path: [1], expected: 'string'}],
      [{path: [2], expected: 'string'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [0], expected: 'string'}],
      [{path: [0], expected: 'string'}],
    ],
  },

  number_array: {
    title: 'Array of numbers (rejects Infinity / NaN per element)',
    description: 'Infinity / -Infinity / NaN rejected per atomic-number port',
    isType: () => createIsType<number[]>(),
    isTypeSchema: () => createIsType(RT.array(RT.number())),
    deserializeIsType: () => deserializeIsType<number[]>(),
    isTypeReflect: () => {
      const v: number[] = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: number[] = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<number[]>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.number())),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<number[]>(),
    getTypeErrorsReflect: () => {
      const v: number[] = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: number[] = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<number[]>(),
    mockTypeReflect: () => {
      const v: number[] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[], [1, 2, 3], [42]],
      invalid: [[1, '2'], 'not-array', [Infinity], [-Infinity], [NaN], null, undefined, [null], [BigInt(1)]],
    }),
    getExpectedErrors: () => [
      [{path: [1], expected: 'number'}],
      [{path: [], expected: 'array'}],
      [{path: [0], expected: 'number'}],
      [{path: [0], expected: 'number'}],
      [{path: [0], expected: 'number'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [0], expected: 'number'}],
      [{path: [0], expected: 'number'}],
    ],
  },

  boolean_array: {
    title: 'Array of booleans',
    isType: () => createIsType<boolean[]>(),
    isTypeSchema: () => createIsType(RT.array(RT.boolean())),
    deserializeIsType: () => deserializeIsType<boolean[]>(),
    isTypeReflect: () => {
      const v: boolean[] = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: boolean[] = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<boolean[]>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.boolean())),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<boolean[]>(),
    getTypeErrorsReflect: () => {
      const v: boolean[] = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: boolean[] = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<boolean[]>(),
    mockTypeReflect: () => {
      const v: boolean[] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[], [true, false]],
      invalid: [[true, 42], 'nope', null, undefined, [0], [1], [null]],
    }),
    getExpectedErrors: () => [
      [{path: [1], expected: 'boolean'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [0], expected: 'boolean'}],
      [{path: [0], expected: 'boolean'}],
      [{path: [0], expected: 'boolean'}],
    ],
  },

  bigint_array: {
    title: 'Array of bigints',
    isType: () => createIsType<bigint[]>(),
    isTypeSchema: () => createIsType(RT.array(RT.bigint())),
    deserializeIsType: () => deserializeIsType<bigint[]>(),
    isTypeReflect: () => {
      const v: bigint[] = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: bigint[] = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<bigint[]>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.bigint())),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<bigint[]>(),
    getTypeErrorsReflect: () => {
      const v: bigint[] = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: bigint[] = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<bigint[]>(),
    mockTypeReflect: () => {
      const v: bigint[] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[], [1n, 2n]],
      invalid: [[1n, 2], 'nope', null, undefined, [null], [Infinity]],
    }),
    getExpectedErrors: () => [
      [{path: [1], expected: 'bigint'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [0], expected: 'bigint'}],
      [{path: [0], expected: 'bigint'}],
    ],
  },

  date_array: {
    title: 'Array of Dates (rejects Invalid Date per element)',
    description: 'from mion serialization-suite ARRAYS.array_date',
    isTypeNotes: 'Each element goes through the atomic `Date` check — Invalid Date instances (`getTime() === NaN`) fail.',
    isType: () => createIsType<Date[]>(),
    isTypeSchema: () => createIsType(RT.array(RT.date())),
    deserializeIsType: () => deserializeIsType<Date[]>(),
    isTypeReflect: () => {
      const v: Date[] = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Date[] = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Date[]>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.date())),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Date[]>(),
    getTypeErrorsReflect: () => {
      const v: Date[] = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Date[] = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<Date[]>(),
    mockTypeReflect: () => {
      const v: Date[] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[], [new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')]],
      invalid: [['2024'], [42], [new Date('invalid')], null, undefined],
    }),
    getExpectedErrors: () => [
      [{path: [0], expected: 'date'}],
      [{path: [0], expected: 'date'}],
      [{path: [0], expected: 'date'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
    ],
  },

  regexp_array: {
    title: 'Array of RegExps',
    isType: () => createIsType<RegExp[]>(),
    isTypeSchema: () => createIsType(RT.array(RT.regexp())),
    deserializeIsType: () => deserializeIsType<RegExp[]>(),
    isTypeReflect: () => {
      const v: RegExp[] = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: RegExp[] = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<RegExp[]>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.regexp())),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<RegExp[]>(),
    getTypeErrorsReflect: () => {
      const v: RegExp[] = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: RegExp[] = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<RegExp[]>(),
    mockTypeReflect: () => {
      const v: RegExp[] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[], [/abc/, new RegExp('abc')]],
      invalid: [['/abc/'], [42], null, undefined, [null], [{}]],
    }),
    getExpectedErrors: () => [
      [{path: [0], expected: 'regexp'}],
      [{path: [0], expected: 'regexp'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [0], expected: 'regexp'}],
      [{path: [0], expected: 'regexp'}],
    ],
  },

  undefined_array: {
    title: 'Array of undefined values',
    description: 'from mion serialization-suite ARRAYS.undefined_in_array',
    isTypeNotes: 'Every element must strictly === undefined. `null` and other falsy values are rejected per-element.',
    isType: () => createIsType<undefined[]>(),
    isTypeSchema: () => createIsType(RT.array(RT.literal(undefined))),
    deserializeIsType: () => deserializeIsType<undefined[]>(),
    isTypeReflect: () => {
      const v: undefined[] = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: undefined[] = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<undefined[]>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.literal(undefined))),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<undefined[]>(),
    getTypeErrorsReflect: () => {
      const v: undefined[] = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: undefined[] = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<undefined[]>(),
    mockTypeReflect: () => {
      const v: undefined[] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[], [undefined, undefined]],
      invalid: [[null], [42], null, undefined, [0], [''], [false]],
    }),
    getExpectedErrors: () => [
      [{path: [0], expected: 'undefined'}],
      [{path: [0], expected: 'undefined'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [0], expected: 'undefined'}],
      [{path: [0], expected: 'undefined'}],
      [{path: [0], expected: 'undefined'}],
    ],
  },

  null_array: {
    title: 'Array of nulls',
    isTypeNotes: 'Every element must strictly === null. `undefined` and other falsy values are rejected per-element.',
    isType: () => createIsType<null[]>(),
    isTypeSchema: () => createIsType(RT.array(RT.literal(null))),
    deserializeIsType: () => deserializeIsType<null[]>(),
    isTypeReflect: () => {
      const v: null[] = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: null[] = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<null[]>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.literal(null))),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<null[]>(),
    getTypeErrorsReflect: () => {
      const v: null[] = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: null[] = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<null[]>(),
    mockTypeReflect: () => {
      const v: null[] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[], [null]],
      invalid: [[undefined], [42], null, undefined, [0], [''], [false]],
    }),
    getExpectedErrors: () => [
      [{path: [0], expected: 'null'}],
      [{path: [0], expected: 'null'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [0], expected: 'null'}],
      [{path: [0], expected: 'null'}],
      [{path: [0], expected: 'null'}],
    ],
  },

  array_generic: {
    title: 'Generic Array<T> form (same emit as T[])',
    description: 'TypeScript sugar — resolves identically to string[]; carried as a regression check on canonical-id collapse',
    isType: () => createIsType<Array<string>>(),
    isTypeSchema: () => createIsType(RT.array(RT.string())),
    deserializeIsType: () => deserializeIsType<Array<string>>(),
    isTypeReflect: () => {
      const v: Array<string> = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Array<string> = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Array<string>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.string())),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Array<string>>(),
    getTypeErrorsReflect: () => {
      const v: Array<string> = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Array<string> = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<Array<string>>(),
    mockTypeReflect: () => {
      const v: Array<string> = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[], ['hello']],
      invalid: ['hello', [42], null, undefined],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'array'}],
      [{path: [0], expected: 'string'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
    ],
  },

  string_array_2d: {
    title: 'Two-dimensional string array (multi-level dependency call)',
    description:
      'first multi-level test — exercises the Go-side dependency-call layer (outer array invokes pre-compiled inner via utl.getRT(...).fn(v[i0]))',
    isType: () => createIsType<string[][]>(),
    isTypeSchema: () => createIsType(RT.array(RT.array(RT.string()))),
    deserializeIsType: () => deserializeIsType<string[][]>(),
    isTypeReflect: () => {
      const v: string[][] = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: string[][] = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<string[][]>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.array(RT.string()))),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<string[][]>(),
    getTypeErrorsReflect: () => {
      const v: string[][] = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: string[][] = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<string[][]>(),
    mockTypeReflect: () => {
      const v: string[][] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        [],
        [[]],
        [
          ['hello', 'world'],
          ['a', 'b'],
        ],
      ],
      // mion Block 5 path-error samples: top-level array-of-string
      // fails isType when the type is string[][], same for plain
      // string. `['hello']` is "first element is `'hello'` which is
      // not an array".
      invalid: [[['hello', 2]], ['hello'], ['hello', 'world'], 'hello', null, undefined, [[null]], [[42]]],
    }),
    getExpectedErrors: () => [
      [{path: [0, 1], expected: 'string'}],
      [{path: [0], expected: 'array'}],
      // `['hello', 'world']` — both elements fail the inner array
      // check; the loop walks every element and accumulates one error
      // per failure (mirror of mion's emitTypeErrors emitting per-
      // element callRTErr without early-exit).
      [
        {path: [0], expected: 'array'},
        {path: [1], expected: 'array'},
      ],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [0, 0], expected: 'string'}],
      [{path: [0, 0], expected: 'string'}],
    ],
  },

  string_array_3d: {
    title: 'Three-dimensional string array (depth stress)',
    description: 'depth stress for the dependency-call layer',
    isType: () => createIsType<string[][][]>(),
    isTypeSchema: () => createIsType(RT.array(RT.array(RT.array(RT.string())))),
    deserializeIsType: () => deserializeIsType<string[][][]>(),
    isTypeReflect: () => {
      const v: string[][][] = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: string[][][] = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<string[][][]>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.array(RT.array(RT.string())))),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<string[][][]>(),
    getTypeErrorsReflect: () => {
      const v: string[][][] = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: string[][][] = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<string[][][]>(),
    mockTypeReflect: () => {
      const v: string[][][] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[], [[[]]], [[['a', 'b'], ['c']]]],
      invalid: [[[['a', 2]]], [['a']], ['a'], null, undefined, [[[null]]], [[[42]]]],
    }),
    getExpectedErrors: () => [
      // [[['a', 2]]] — inner-of-inner index 1 is non-string at [0,0,1]
      [{path: [0, 0, 1], expected: 'string'}],
      // [['a']] — second-level 'a' is not an array at [0,0]
      [{path: [0, 0], expected: 'array'}],
      // ['a'] — first-level 'a' is not an array at [0]
      [{path: [0], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [0, 0, 0], expected: 'string'}],
      [{path: [0, 0, 0], expected: 'string'}],
    ],
  },

  string_array_noIsArrayCheck: {
    title: 'Array with noIsArrayCheck (Array.isArray guard stripped)',
    description:
      'noIsArrayCheck strips the Array.isArray guard; hashes distinctly from plain string_array — same samples, different validator',
    isTypeNotes: [
      'With `{noIsArrayCheck: true}`, the `Array.isArray` guard is stripped — non-array inputs may slip through.',
      'Use only when the caller has already verified the value is an array; the validator trusts the shape and only walks elements.',
    ],
    isType: () => createIsType<string[]>(undefined, {noIsArrayCheck: true}),
    deserializeIsType: () => deserializeIsType<string[]>(undefined, {noIsArrayCheck: true}),
    isTypeReflect: () => {
      const v: string[] = [];
      return createIsType(v, {noIsArrayCheck: true});
    },
    deserializeIsTypeReflect: () => {
      const v: string[] = [];
      return deserializeIsType(v, {noIsArrayCheck: true});
    },
    isTypeSchema: () => createIsType(RT.array(RT.string()), {noIsArrayCheck: true}),
    getTypeErrors: () => createGetTypeErrors<string[]>(undefined, {noIsArrayCheck: true}),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<string[]>(undefined, {noIsArrayCheck: true}),
    getTypeErrorsReflect: () => {
      const v: string[] = [];
      return createGetTypeErrors(v, {noIsArrayCheck: true});
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: string[] = [];
      return deserializeGetTypeErrors(v, {noIsArrayCheck: true});
    },
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.string()), {noIsArrayCheck: true}),
    mockType: () => createMockType<string[]>(undefined, undefined),
    mockTypeReflect: () => {
      const v: string[] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[], ['hello']],
      // Without the guard, non-array inputs may not be rejected by
      // the validator (mion's documented trade-off — the caller has
      // pre-verified arrayness). Only sample inputs that the loop
      // itself catches.
      invalid: [[42]],
    }),
    getExpectedErrors: () => [[{path: [0], expected: 'string'}]],
  },

  // ---- DEFERRED — sample payloads carried for future activation ----

  object_array: {
    title: 'Array of object literals',
    description:
      "mion array.spec.ts 'test array strict modes' — array of objects. Extra keys on object elements still pass isType (unknown-key handling is a different adapter).",
    isType: () => createIsType<{a: string}[]>(),
    isTypeSchema: () => createIsType(RT.array(RT.object({a: RT.string()}))),
    deserializeIsType: () => deserializeIsType<{a: string}[]>(),
    isTypeReflect: () => {
      const v: {a: string}[] = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: {a: string}[] = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<{a: string}[]>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.object({a: RT.string()}))),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a: string}[]>(),
    getTypeErrorsReflect: () => {
      const v: {a: string}[] = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: {a: string}[] = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<{a: string}[]>(),
    mockTypeReflect: () => {
      const v: {a: string}[] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[], [{a: 'hello'}, {a: 'world'}], [{a: 'hello', extraA: 'extraA'}, {a: 'world'}]],
      invalid: ['not-an-array', [{a: 42}], [{}], [null], null, undefined, [{a: null}], [{a: undefined}]],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'array'}],
      [{path: [0, 'a'], expected: 'string'}],
      [{path: [0, 'a'], expected: 'string'}],
      [{path: [0], expected: 'objectLiteral'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [0, 'a'], expected: 'string'}],
      [{path: [0, 'a'], expected: 'string'}],
    ],
  },

  union_array: {
    title: 'Array of unions (OR-chain per element)',
    description: 'array of union — each element validates against the union OR-chain.',
    isType: () => createIsType<(string | number)[]>(),
    isTypeSchema: () => createIsType(RT.array(RT.union([RT.string(), RT.number()]))),
    deserializeIsType: () => deserializeIsType<(string | number)[]>(),
    isTypeReflect: () => {
      const v: (string | number)[] = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: (string | number)[] = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<(string | number)[]>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.union([RT.string(), RT.number()]))),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<(string | number)[]>(),
    getTypeErrorsReflect: () => {
      const v: (string | number)[] = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: (string | number)[] = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<(string | number)[]>(),
    mockTypeReflect: () => {
      const v: (string | number)[] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[], ['a', 1, 'b', 2], [1], ['a']],
      invalid: [[true], 'a', [null], ['a', true], null, undefined, [BigInt(1)], [Infinity]],
    }),
    getExpectedErrors: () => [
      // [true] — element 0 fails union (boolean not in string|number).
      [{path: [0], expected: 'union'}],
      // 'a' — not an array.
      [{path: [], expected: 'array'}],
      // [null] — element 0 fails union.
      [{path: [0], expected: 'union'}],
      // ['a', true] — element 1 (true) fails union; element 0 ('a') OK.
      [{path: [1], expected: 'union'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      // [BigInt(1)] — bigint not in union.
      [{path: [0], expected: 'union'}],
      // [Infinity] — Number.isFinite fails for Infinity (number arm
      // rejects it), bigint arm also fails → union fails.
      [{path: [0], expected: 'union'}],
    ],
  },

  tuple_array: {
    title: 'Array of tuples',
    description: 'array of tuples — exercises tuple under array dependency call.',
    isType: () => createIsType<[string, number][]>(),
    isTypeSchema: () => createIsType(RT.array(RT.tuple([RT.string(), RT.number()]))),
    deserializeIsType: () => deserializeIsType<[string, number][]>(),
    isTypeReflect: () => {
      const v: [string, number][] = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: [string, number][] = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<[string, number][]>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.tuple([RT.string(), RT.number()]))),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<[string, number][]>(),
    getTypeErrorsReflect: () => {
      const v: [string, number][] = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: [string, number][] = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<[string, number][]>(),
    mockTypeReflect: () => {
      const v: [string, number][] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        [],
        [
          ['a', 1],
          ['b', 2],
        ],
      ],
      invalid: [[['a']], [['a', 'b']], 'not-array', [[1, 'a']], null, undefined, [['a', 1, 'extra']]],
    }),
    getExpectedErrors: () => [
      // [['a']] — outer at 0 is tuple ['a']. Slot 0 'a' OK; slot 1 undefined fails number → [0, 1].
      [{path: [0, 1], expected: 'number'}],
      // [['a', 'b']] — slot 1 'b' not number → [0, 1].
      [{path: [0, 1], expected: 'number'}],
      [{path: [], expected: 'array'}],
      // [[1, 'a']] — slot 0 1 not string, slot 1 'a' not number.
      [
        {path: [0, 0], expected: 'string'},
        {path: [0, 1], expected: 'number'},
      ],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      // [['a', 1, 'extra']] — length 3 > 2 → outer tuple check fails for element 0 → [0].
      [{path: [0], expected: 'tuple'}],
    ],
  },

  circular_array: {
    title: 'Self-referential array (CircularArray = CircularArray[])',
    description:
      "mion array.spec.ts 'Array circular ref'. Self-referential array — handled via the always-non-inlined KindArray policy plus the isSelf branch in EmitDependencyCall (emits the inner-function-name directly, no .fn).",
    isTypeNotes:
      'Self-referential arrays are validated recursively — depth is bounded only by the caller-supplied value, not the type definition.',
    isType: () => {
      type CircularArray = CircularArray[];
      return createIsType<CircularArray>();
    },
    deserializeIsType: () => {
      type CircularArray = CircularArray[];
      return deserializeIsType<CircularArray>();
    },
    isTypeReflect: () => {
      type CircularArray = CircularArray[];
      const v: CircularArray = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      type CircularArray = CircularArray[];
      const v: CircularArray = [];
      return deserializeIsType(v);
    },
    isTypeSchema: () => {
      const ca = RT.circular((self) => RT.array(self));
      return createIsType(ca);
    },
    getTypeErrors: () => {
      type CircularArray = CircularArray[];
      return createGetTypeErrors<CircularArray>();
    },
    getTypeErrorsSchema: () => {
      const ca = RT.circular((self) => RT.array(self));
      return createGetTypeErrors(ca);
    },
    deserializeGetTypeErrors: () => {
      type CircularArray = CircularArray[];
      return deserializeGetTypeErrors<CircularArray>();
    },
    getTypeErrorsReflect: () => {
      type CircularArray = CircularArray[];
      const v: CircularArray = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      type CircularArray = CircularArray[];
      const v: CircularArray = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      type CircularArray = CircularArray[];
      return createMockType<CircularArray>();
    },
    mockTypeReflect: () => {
      type CircularArray = CircularArray[];
      const v: CircularArray = [];
      return createMockType(v);
    },
    getSamples: () => {
      // type CircularArray = CircularArray[]; const arr: CircularArray = [[[[]]], [[]], []];
      const arrA: any = [];
      arrA.push([[[]]], [[]], []);
      return {
        valid: [[], arrA],
        invalid: [[[[]], 'A'], 'not array', null, undefined, [42], [[42]]],
      };
    },
    getExpectedErrors: () => [
      // [[[]], 'A'] — index 0 is a valid nested array; index 1 is 'A'
      // which fails the self-recurse array check at path [1].
      [{path: [1], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      // [42] — outer is array; element at index 0 is 42, which fails
      // the self-recurse array check at path [0].
      [{path: [0], expected: 'array'}],
      // [[42]] — outer is array; element at index 0 is [42] (still
      // array); inner-of-inner index 0 is 42 which fails at [0, 0].
      [{path: [0, 0], expected: 'array'}],
    ],
  },

  circular_object_with_array: {
    title: 'Recursive object whose cycle closes via an array property',
    description:
      'type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]} — same dependency-call mechanism as the basic circular interface; the array property d?: ObjectType[] closes the cycle via Array → Object.',
    isType: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      return createIsType<ObjectType>();
    },
    isTypeSchema: () => {
      const ot = RT.circular((self) =>
        RT.object({
          a: RT.string(),
          deep: RT.optional(RT.object({b: RT.string(), c: RT.number()})),
          d: RT.optional(RT.array(self)),
        })
      );
      return createIsType(ot);
    },
    deserializeIsType: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      return deserializeIsType<ObjectType>();
    },
    isTypeReflect: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      const v: ObjectType = {a: 'hello'};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      const v: ObjectType = {a: 'hello'};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      return createGetTypeErrors<ObjectType>();
    },
    getTypeErrorsSchema: () => {
      const ot = RT.circular((self) =>
        RT.object({
          a: RT.string(),
          deep: RT.optional(RT.object({b: RT.string(), c: RT.number()})),
          d: RT.optional(RT.array(self)),
        })
      );
      return createGetTypeErrors(ot);
    },
    deserializeGetTypeErrors: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      return deserializeGetTypeErrors<ObjectType>();
    },
    getTypeErrorsReflect: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      const v: ObjectType = {a: 'hello'};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      const v: ObjectType = {a: 'hello'};
      return deserializeGetTypeErrors(v);
    },
    mockType: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      return createMockType<ObjectType>();
    },
    mockTypeReflect: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      const v: ObjectType = {a: 'hello'};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {a: 'hello'},
        {a: 'hello', deep: {b: 'world', c: 123}},
        {a: 'hello', d: [{a: 'world'}]},
        {a: 'hello', d: [{a: 'world', d: [{a: 'deep'}]}]},
      ],
      invalid: [
        {a: 42},
        'not-an-object',
        {a: 'hello', deep: {b: 1, c: 1}},
        {a: 'hello', d: 'not-array'},
        null,
        undefined,
        {a: 'hello', d: [null]},
        {a: 'hello', d: [{a: 42}]},
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['a'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['deep', 'b'], expected: 'string'}],
      [{path: ['d'], expected: 'array'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['d', 0], expected: 'objectLiteral'}],
      [{path: ['d', 0, 'a'], expected: 'string'}],
    ],
  },

  symbol_array: {
    title: 'Array of symbols (non-serializable — factory throws)',
    description:
      'mion ARRAYS.non_serializable_in_array — `Arrays can not have non serializable types` (nodes/member/array.ts:148): mion throws at RT-compile. The port propagates CodeNS from the symbol element to the root, rendering an alwaysThrow factory (T3), so createIsType<symbol[]>() / createGetTypeErrors<symbol[]>() throw on first call — consistent with the unified rule (non-property positions throw). As a *property* child a non-serializable array drops the property instead.',
    isTypeNotes:
      'Arrays whose element type is non-serializable (`symbol[]`, `(() => any)[]`, …) cannot be validated: the factory is rendered as alwaysThrow and the first createXxx<symbol[]>() call throws. Use a different shape to carry symbol-like data.',
    isType: () => createIsType<symbol[]>(),
    // Non-serializable array element (symbol) propagates to the root → alwaysThrow.
    // `RT.array(RT.symbol())` resolves the same factory, so the schema thunk throws.
    isTypeSchema: () => createIsType(RT.array(RT.symbol())),
    deserializeIsType: () => deserializeIsType<symbol[]>(),
    isTypeReflect: () => {
      const v: symbol[] = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: symbol[] = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<symbol[]>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.symbol())),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<symbol[]>(),
    getTypeErrorsReflect: () => {
      const v: symbol[] = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: symbol[] = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<symbol[]>(),
    mockTypeReflect: () => {
      const v: symbol[] = [];
      return createMockType(v);
    },
    // isType/getTypeErrors throw at factory creation (alwaysThrow). The
    // mock can still construct an array of symbols, but there is no
    // validator to check it against.
    mockTypeExpect: 'skip',
    factoryThrows: true,
    getSamples: () => ({valid: [], invalid: []}),
  },

  readonly_string_array: {
    title: 'Readonly array (ReadonlyArray<T> / readonly T[])',
    description:
      '`readonly T[]` and `ReadonlyArray<T>` are the same type at runtime — the readonly bit is a TS-only modifier erased at emit. Regression check that both forms produce the same validator as the bare `T[]` shape.',
    isTypeNotes:
      'Readonly modifier has NO runtime impact — the validator is identical to `T[]`. The compiler enforces readonly at write sites; the validator only checks the value shape.',
    isType: () => createIsType<ReadonlyArray<string>>(),
    isTypeSchema: () => createIsType(RT.array(RT.string())),
    deserializeIsType: () => deserializeIsType<ReadonlyArray<string>>(),
    isTypeReflect: () => {
      const v: ReadonlyArray<string> = [];
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: ReadonlyArray<string> = [];
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<ReadonlyArray<string>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.array(RT.string())),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<ReadonlyArray<string>>(),
    getTypeErrorsReflect: () => {
      const v: ReadonlyArray<string> = [];
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: ReadonlyArray<string> = [];
      return deserializeGetTypeErrors(v);
    },
    mockType: () => createMockType<ReadonlyArray<string>>(),
    mockTypeReflect: () => {
      const v: ReadonlyArray<string> = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[], ['hello'], ['a', 'b', 'c']],
      invalid: ['not array', null, undefined, [42], [null]],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
      [{path: [0], expected: 'string'}],
      [{path: [0], expected: 'string'}],
    ],
  },
} as const satisfies Record<string, ValidationCase>;
