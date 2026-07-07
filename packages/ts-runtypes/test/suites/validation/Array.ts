import * as TF from '@ts-runtypes/core/formats';
import type {ValidationCase} from './types.ts';
import {createValidate, createGetValidationErrors, createMockType, createStandardSchema, type DataOnly} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

export const ARRAY = {
  string_array: {
    title: 'String array',
    description: '`Array.isArray(v)` then every element validated against the element type `string`; `[]` is valid.',
    validateNotes: [
      'Top-level value must be an actual array (`Array.isArray`).',
      'Every element must satisfy the element type — the empty array `[]` is valid.',
    ],
    validate: () => createValidate<string[]>(),
    standardSchema: () => createStandardSchema<string[]>(),
    // One hand-authored Standard Schema expectation per file. Every other case
    // derives its expected issues from getExpectedErrors via runTypeErrorsToIssues
    // (the same mapping the factory uses), so this single case pins the real
    // consumer-facing {message, path} output independently: it trips if error
    // generation or the issue mapping changes. One case per file covers this
    // file's shapes without the ~265x maintenance of authoring every case.
    getExpectedStandardErrors: () => [
      [{message: 'Expected array', path: [], expected: 'array'}],
      [{message: 'Expected string', path: [1], expected: 'string'}],
      [{message: 'Expected string', path: [2], expected: 'string'}],
      [{message: 'Expected array', path: [], expected: 'array'}],
      [{message: 'Expected array', path: [], expected: 'array'}],
      [{message: 'Expected string', path: [0], expected: 'string'}],
      [{message: 'Expected string', path: [0], expected: 'string'}],
    ],
    validateDataOnly: () => createValidate<DataOnly<string[]>>(),
    validateSchema: () => createValidate(RT.array(TF.string())),
    deserializeValidate: () => deserializeValidate<string[]>(),
    validateReflect: () => {
      const v: string[] = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: string[] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<string[]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<string[]>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(TF.string())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<string[]>(),
    getValidationErrorsReflect: () => {
      const v: string[] = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: string[] = [];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<string[]>(),
    mockTypeReflect: () => {
      const v: string[] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[], ['hello', 'world']],
      // The mixed-types invalid `['hello', 'world', {hello: 'world'}]`
      // is the carry-over from the "simple array hasUnknownKeys on
      // array with non objects" block — the object element fails the
      // string check, so the whole array fails validate.
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
    title: 'Number array',
    description:
      'Each element goes through the atomic `number` check, so `Infinity`, `-Infinity`, and `NaN` are rejected per element.',
    validateNotes:
      'Each element goes through the atomic `number` check (`Number.isFinite`) — `NaN`, `Infinity`, and `-Infinity` are rejected per-element even though they pass `typeof === "number"`.',
    validate: () => createValidate<number[]>(),
    standardSchema: () => createStandardSchema<number[]>(),
    validateDataOnly: () => createValidate<DataOnly<number[]>>(),
    validateSchema: () => createValidate(RT.array(TF.number())),
    deserializeValidate: () => deserializeValidate<number[]>(),
    validateReflect: () => {
      const v: number[] = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: number[] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<number[]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<number[]>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(TF.number())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<number[]>(),
    getValidationErrorsReflect: () => {
      const v: number[] = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: number[] = [];
      return deserializeGetValidationErrors(v);
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
    title: 'Boolean array',
    description: 'Every element passes the atomic strict-`typeof` boolean check; `[]` is valid.',
    validateNotes:
      'Numeric `0` / `1` are rejected per-element — the element check is strict `typeof === "boolean"`, not truthiness.',
    validate: () => createValidate<boolean[]>(),
    standardSchema: () => createStandardSchema<boolean[]>(),
    validateDataOnly: () => createValidate<DataOnly<boolean[]>>(),
    validateSchema: () => createValidate(RT.array(RT.boolean())),
    deserializeValidate: () => deserializeValidate<boolean[]>(),
    validateReflect: () => {
      const v: boolean[] = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: boolean[] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<boolean[]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<boolean[]>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(RT.boolean())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<boolean[]>(),
    getValidationErrorsReflect: () => {
      const v: boolean[] = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: boolean[] = [];
      return deserializeGetValidationErrors(v);
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
    title: 'BigInt array',
    description: 'Every element passes the atomic strict-`typeof` bigint check; `[]` is valid.',
    validateNotes:
      'Plain `number` elements (e.g. `2`, `Infinity`) are rejected — `typeof 2n === "bigint"` but `typeof 2 === "number"`.',
    validate: () => createValidate<bigint[]>(),
    standardSchema: () => createStandardSchema<bigint[]>(),
    validateDataOnly: () => createValidate<DataOnly<bigint[]>>(),
    validateSchema: () => createValidate(RT.array(TF.bigInt())),
    deserializeValidate: () => deserializeValidate<bigint[]>(),
    validateReflect: () => {
      const v: bigint[] = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: bigint[] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<bigint[]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<bigint[]>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(TF.bigInt())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<bigint[]>(),
    getValidationErrorsReflect: () => {
      const v: bigint[] = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: bigint[] = [];
      return deserializeGetValidationErrors(v);
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
    title: 'Date array',
    description: 'Each element goes through the atomic `Date` check, so Invalid Date instances fail per element.',
    validateNotes: 'Each element goes through the atomic `Date` check — Invalid Date instances (`getTime() === NaN`) fail.',
    validate: () => createValidate<Date[]>(),
    standardSchema: () => createStandardSchema<Date[]>(),
    validateDataOnly: () => createValidate<DataOnly<Date[]>>(),
    validateSchema: () => createValidate(RT.array(TF.date())),
    deserializeValidate: () => deserializeValidate<Date[]>(),
    validateReflect: () => {
      const v: Date[] = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Date[] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Date[]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Date[]>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(TF.date())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Date[]>(),
    getValidationErrorsReflect: () => {
      const v: Date[] = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Date[] = [];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<Date[]>(),
    mockTypeReflect: () => {
      const v: Date[] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[], [new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')]],
      // `'2024'` is a bare non-array (a primitive string at root) — exercises the
      // root `isArray` guard, distinct from `['2024']` which is an array whose
      // element fails the per-element Date check at [0].
      invalid: ['2024', ['2024'], [42], [new Date('invalid')], null, undefined],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'array'}],
      [{path: [0], expected: 'date'}],
      [{path: [0], expected: 'date'}],
      [{path: [0], expected: 'date'}],
      [{path: [], expected: 'array'}],
      [{path: [], expected: 'array'}],
    ],
  },

  regexp_array: {
    title: 'RegExp array',
    description: 'Every element passes the atomic builtin-class RegExp check (`instanceof RegExp`); `[]` is valid.',
    validateNotes:
      'A regex *source string* like `"/abc/"` is rejected — the element check is the nominal `instanceof RegExp`, not a string.',
    validate: () => createValidate<RegExp[]>(),
    standardSchema: () => createStandardSchema<RegExp[]>(),
    validateDataOnly: () => createValidate<DataOnly<RegExp[]>>(),
    validateSchema: () => createValidate(RT.array(RT.regexp())),
    deserializeValidate: () => deserializeValidate<RegExp[]>(),
    validateReflect: () => {
      const v: RegExp[] = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: RegExp[] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<RegExp[]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<RegExp[]>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(RT.regexp())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<RegExp[]>(),
    getValidationErrorsReflect: () => {
      const v: RegExp[] = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: RegExp[] = [];
      return deserializeGetValidationErrors(v);
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
    title: 'Undefined array',
    description: 'Every element must strictly `=== undefined`; `null` and other falsy values are rejected per element.',
    validateNotes: 'Every element must strictly === undefined. `null` and other falsy values are rejected per-element.',
    validate: () => createValidate<undefined[]>(),
    standardSchema: () => createStandardSchema<undefined[]>(),
    validateDataOnly: () => createValidate<DataOnly<undefined[]>>(),
    validateSchema: () => createValidate(RT.array(RT.literal(undefined))),
    deserializeValidate: () => deserializeValidate<undefined[]>(),
    validateReflect: () => {
      const v: undefined[] = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: undefined[] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<undefined[]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<undefined[]>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(RT.literal(undefined))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<undefined[]>(),
    getValidationErrorsReflect: () => {
      const v: undefined[] = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: undefined[] = [];
      return deserializeGetValidationErrors(v);
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
    title: 'Null array',
    description: 'Every element validated as strictly `=== null`; `[]` is valid.',
    validateNotes: 'Every element must strictly === null. `undefined` and other falsy values are rejected per-element.',
    validate: () => createValidate<null[]>(),
    standardSchema: () => createStandardSchema<null[]>(),
    validateDataOnly: () => createValidate<DataOnly<null[]>>(),
    validateSchema: () => createValidate(RT.array(RT.literal(null))),
    deserializeValidate: () => deserializeValidate<null[]>(),
    validateReflect: () => {
      const v: null[] = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: null[] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<null[]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<null[]>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(RT.literal(null))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<null[]>(),
    getValidationErrorsReflect: () => {
      const v: null[] = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: null[] = [];
      return deserializeGetValidationErrors(v);
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
    title: 'Generic Array',
    description:
      '`Array<string>` is TypeScript sugar that collapses to the same canonical id as `string[]`, producing an identical validator.',
    validateNotes:
      '`Array<string>` and `string[]` are the same type — they collapse to one canonical id and produce an identical validator.',
    validate: () => createValidate<Array<string>>(),
    standardSchema: () => createStandardSchema<Array<string>>(),
    validateDataOnly: () => createValidate<DataOnly<Array<string>>>(),
    validateSchema: () => createValidate(RT.array(TF.string())),
    deserializeValidate: () => deserializeValidate<Array<string>>(),
    validateReflect: () => {
      const v: Array<string> = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Array<string> = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Array<string>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Array<string>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(TF.string())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Array<string>>(),
    getValidationErrorsReflect: () => {
      const v: Array<string> = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Array<string> = [];
      return deserializeGetValidationErrors(v);
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
    title: 'String array 2D',
    description:
      'First multi-level test, exercising the Go-side dependency-call layer where the outer array invokes its pre-compiled inner validator.',
    validateNotes:
      'getValidationErrors does NOT early-exit: every failing element accumulates its own error (e.g. a two-element outer array of non-arrays yields two `expected: "array"` entries).',
    validate: () => createValidate<string[][]>(),
    standardSchema: () => createStandardSchema<string[][]>(),
    validateDataOnly: () => createValidate<DataOnly<string[][]>>(),
    validateSchema: () => createValidate(RT.array(RT.array(TF.string()))),
    deserializeValidate: () => deserializeValidate<string[][]>(),
    validateReflect: () => {
      const v: string[][] = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: string[][] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<string[][]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<string[][]>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(RT.array(TF.string()))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<string[][]>(),
    getValidationErrorsReflect: () => {
      const v: string[][] = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: string[][] = [];
      return deserializeGetValidationErrors(v);
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
      // Block 5 path-error samples: top-level array-of-string
      // fails validate when the type is string[][], same for plain
      // string. `['hello']` is "first element is `'hello'` which is
      // not an array".
      invalid: [[['hello', 2]], ['hello'], ['hello', 'world'], 'hello', null, undefined, [[null]], [[42]]],
    }),
    getExpectedErrors: () => [
      [{path: [0, 1], expected: 'string'}],
      [{path: [0], expected: 'array'}],
      // `['hello', 'world']` — both elements fail the inner array
      // check; the loop walks every element and accumulates one error
      // per failure (the error emitter emits per-element callRTErr
      // without early-exit).
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
    title: 'String array 3D',
    description: 'Depth stress for the dependency-call layer.',
    validate: () => createValidate<string[][][]>(),
    standardSchema: () => createStandardSchema<string[][][]>(),
    validateDataOnly: () => createValidate<DataOnly<string[][][]>>(),
    validateSchema: () => createValidate(RT.array(RT.array(RT.array(TF.string())))),
    deserializeValidate: () => deserializeValidate<string[][][]>(),
    validateReflect: () => {
      const v: string[][][] = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: string[][][] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<string[][][]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<string[][][]>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(RT.array(RT.array(TF.string())))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<string[][][]>(),
    getValidationErrorsReflect: () => {
      const v: string[][][] = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: string[][][] = [];
      return deserializeGetValidationErrors(v);
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
    title: 'noIsArrayCheck array',
    description:
      '`{noIsArrayCheck: true}` strips the `Array.isArray` guard, producing a distinctly-hashed validator that only walks elements.',
    validateNotes: [
      'With `{noIsArrayCheck: true}`, the `Array.isArray` guard is stripped — non-array inputs may slip through.',
      'Use only when the caller has already verified the value is an array; the validator trusts the shape and only walks elements.',
    ],
    validate: () => createValidate<string[]>(undefined, {noIsArrayCheck: true}),
    standardSchema: () => createStandardSchema<string[]>(undefined, {noIsArrayCheck: true}),
    validateDataOnly: () => createValidate<DataOnly<string[]>>(undefined, {noIsArrayCheck: true}),
    deserializeValidate: () => deserializeValidate<string[]>(undefined, {noIsArrayCheck: true}),
    validateReflect: () => {
      const v: string[] = [];
      return createValidate(v, {noIsArrayCheck: true});
    },
    deserializeValidateReflect: () => {
      const v: string[] = [];
      return deserializeValidate(v, {noIsArrayCheck: true});
    },
    validateSchema: () => createValidate(RT.array(TF.string()), {noIsArrayCheck: true}),
    getValidationErrors: () => createGetValidationErrors<string[]>(undefined, {noIsArrayCheck: true}),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<string[]>>(undefined, {noIsArrayCheck: true}),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<string[]>(undefined, {noIsArrayCheck: true}),
    getValidationErrorsReflect: () => {
      const v: string[] = [];
      return createGetValidationErrors(v, {noIsArrayCheck: true});
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: string[] = [];
      return deserializeGetValidationErrors(v, {noIsArrayCheck: true});
    },
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(TF.string()), {noIsArrayCheck: true}),
    mockType: () => createMockType<string[]>(undefined, undefined),
    mockTypeReflect: () => {
      const v: string[] = [];
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [[], ['hello']],
      // Without the guard, non-array inputs may not be rejected by
      // the validator (the documented trade-off — the caller has
      // pre-verified arrayness). Only sample inputs that the loop
      // itself catches.
      invalid: [[42]],
    }),
    getExpectedErrors: () => [[{path: [0], expected: 'string'}]],
  },

  // ---- DEFERRED — sample payloads carried for future activation ----

  object_array: {
    title: 'Object array',
    description:
      'Array of object literals where extra keys on the elements still pass validate (unknown-key handling is a different adapter).',
    validateNotes:
      'Extra keys on the object elements (e.g. `{a: "hello", extraA: "x"}`) still PASS — validate is structural and ignores undeclared keys.',
    validate: () => createValidate<{a: string}[]>(),
    standardSchema: () => createStandardSchema<{a: string}[]>(),
    validateDataOnly: () => createValidate<DataOnly<{a: string}[]>>(),
    validateSchema: () => createValidate(RT.array(RT.object({a: TF.string()}))),
    deserializeValidate: () => deserializeValidate<{a: string}[]>(),
    validateReflect: () => {
      const v: {a: string}[] = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: {a: string}[] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<{a: string}[]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<{a: string}[]>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(RT.object({a: TF.string()}))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<{a: string}[]>(),
    getValidationErrorsReflect: () => {
      const v: {a: string}[] = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: {a: string}[] = [];
      return deserializeGetValidationErrors(v);
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
    title: 'Union array',
    description: 'Each element validates against the union OR-chain.',
    validateNotes:
      'Elements may mix `string` and `number` freely. The number arm uses `Number.isFinite`, so `Infinity` / `NaN` fail it; `bigint` matches neither arm — both produce `expected: "union"`.',
    validate: () => createValidate<(string | number)[]>(),
    standardSchema: () => createStandardSchema<(string | number)[]>(),
    validateDataOnly: () => createValidate<DataOnly<(string | number)[]>>(),
    validateSchema: () => createValidate(RT.array(RT.union([TF.string(), TF.number()]))),
    deserializeValidate: () => deserializeValidate<(string | number)[]>(),
    validateReflect: () => {
      const v: (string | number)[] = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: (string | number)[] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<(string | number)[]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<(string | number)[]>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(RT.union([TF.string(), TF.number()]))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<(string | number)[]>(),
    getValidationErrorsReflect: () => {
      const v: (string | number)[] = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: (string | number)[] = [];
      return deserializeGetValidationErrors(v);
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
    title: 'Tuple array',
    description: 'Exercises a tuple under the array dependency call.',
    validateNotes:
      'Each element is a fixed-length `[string, number]` tuple: an over-length element (e.g. `["a", 1, "extra"]`) fails the tuple-length check (`expected: "tuple"`), not just an element check.',
    validate: () => createValidate<[string, number][]>(),
    standardSchema: () => createStandardSchema<[string, number][]>(),
    validateDataOnly: () => createValidate<DataOnly<[string, number][]>>(),
    validateSchema: () => createValidate(RT.array(RT.tuple([TF.string(), TF.number()]))),
    deserializeValidate: () => deserializeValidate<[string, number][]>(),
    validateReflect: () => {
      const v: [string, number][] = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: [string, number][] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<[string, number][]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<[string, number][]>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(RT.tuple([TF.string(), TF.number()]))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<[string, number][]>(),
    getValidationErrorsReflect: () => {
      const v: [string, number][] = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: [string, number][] = [];
      return deserializeGetValidationErrors(v);
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
    title: 'Circular array',
    description:
      'Self-referential `CircularArray = CircularArray[]` handled via the always-non-inlined KindArray policy plus the isSelf branch in EmitDependencyCall.',
    validateNotes:
      'Self-referential arrays are validated recursively — depth is bounded only by the caller-supplied value, not the type definition.',
    validate: () => {
      type CircularArray = CircularArray[];
      return createValidate<CircularArray>();
    },
    standardSchema: () => {
      type CircularArray = CircularArray[];
      return createStandardSchema<CircularArray>();
    },
    validateDataOnly: () => {
      type CircularArray = CircularArray[];
      return createValidate<DataOnly<CircularArray>>();
    },
    deserializeValidate: () => {
      type CircularArray = CircularArray[];
      return deserializeValidate<CircularArray>();
    },
    validateReflect: () => {
      type CircularArray = CircularArray[];
      const v: CircularArray = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      type CircularArray = CircularArray[];
      const v: CircularArray = [];
      return deserializeValidate(v);
    },
    validateSchema: () => {
      const ca = RT.circular(RT.array(RT.self()));
      return createValidate(ca);
    },
    getValidationErrors: () => {
      type CircularArray = CircularArray[];
      return createGetValidationErrors<CircularArray>();
    },
    getValidationErrorsDataOnly: () => {
      type CircularArray = CircularArray[];
      return createGetValidationErrors<DataOnly<CircularArray>>();
    },
    getValidationErrorsSchema: () => {
      const ca = RT.circular(RT.array(RT.self()));
      return createGetValidationErrors(ca);
    },
    deserializeGetValidationErrors: () => {
      type CircularArray = CircularArray[];
      return deserializeGetValidationErrors<CircularArray>();
    },
    getValidationErrorsReflect: () => {
      type CircularArray = CircularArray[];
      const v: CircularArray = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type CircularArray = CircularArray[];
      const v: CircularArray = [];
      return deserializeGetValidationErrors(v);
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
    title: 'Circular object via array',
    description:
      'Recursive object whose cycle closes through the array property `d?: ObjectType[]`, using the same dependency-call mechanism as a basic circular interface.',
    validateNotes:
      'The recursive `d` property is optional, so `{a: "hello"}` (no children) is valid; nested children are validated recursively to whatever depth the value supplies.',
    validate: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      return createValidate<ObjectType>();
    },
    standardSchema: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      return createStandardSchema<ObjectType>();
    },
    validateDataOnly: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      return createValidate<DataOnly<ObjectType>>();
    },
    validateSchema: () => {
      const ot = RT.circular(
        RT.object({
          a: TF.string(),
          deep: RT.optional(RT.object({b: TF.string(), c: TF.number()})),
          d: RT.optional(RT.array(RT.self())),
        })
      );
      return createValidate(ot);
    },
    deserializeValidate: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      return deserializeValidate<ObjectType>();
    },
    validateReflect: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      const v: ObjectType = {a: 'hello'};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      const v: ObjectType = {a: 'hello'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      return createGetValidationErrors<ObjectType>();
    },
    getValidationErrorsDataOnly: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      return createGetValidationErrors<DataOnly<ObjectType>>();
    },
    getValidationErrorsSchema: () => {
      const ot = RT.circular(
        RT.object({
          a: TF.string(),
          deep: RT.optional(RT.object({b: TF.string(), c: TF.number()})),
          d: RT.optional(RT.array(RT.self())),
        })
      );
      return createGetValidationErrors(ot);
    },
    deserializeGetValidationErrors: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      return deserializeGetValidationErrors<ObjectType>();
    },
    getValidationErrorsReflect: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      const v: ObjectType = {a: 'hello'};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
      const v: ObjectType = {a: 'hello'};
      return deserializeGetValidationErrors(v);
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
    title: 'Symbol array',
    description:
      'A non-serializable symbol element propagates to the root and renders an alwaysThrow factory, so the first `createValidate<symbol[]>()` call throws.',
    validateNotes:
      'Arrays whose element type is non-serializable (`symbol[]`, `(() => any)[]`, …) cannot be validated: the factory is rendered as alwaysThrow and the first createXxx<symbol[]>() call throws. Use a different shape to carry symbol-like data.',
    validate: () => createValidate<symbol[]>(),
    standardSchema: () => createStandardSchema<symbol[]>(),
    validateDataOnly: () => createValidate<DataOnly<symbol[]>>(),
    // Non-serializable array element (symbol) propagates to the root → alwaysThrow.
    // `RT.array(RT.symbol())` resolves the same factory, so the schema thunk throws.
    validateSchema: () => createValidate(RT.array(RT.symbol())),
    deserializeValidate: () => deserializeValidate<symbol[]>(),
    validateReflect: () => {
      const v: symbol[] = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: symbol[] = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<symbol[]>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<symbol[]>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(RT.symbol())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<symbol[]>(),
    getValidationErrorsReflect: () => {
      const v: symbol[] = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: symbol[] = [];
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<symbol[]>(),
    mockTypeReflect: () => {
      const v: symbol[] = [];
      return createMockType(v);
    },
    // validate/getValidationErrors throw at factory creation (alwaysThrow). The
    // mock can still construct an array of symbols, but there is no
    // validator to check it against.
    mockTypeExpect: 'skip',
    factoryThrows: true,
    getSamples: () => ({valid: [], invalid: []}),
  },

  readonly_string_array: {
    title: 'Readonly array',
    description:
      '`readonly T[]` and `ReadonlyArray<T>` erase the TS-only readonly modifier at emit, producing the same validator as the bare `T[]` shape.',
    validateNotes:
      'Readonly modifier has NO runtime impact — the validator is identical to `T[]`. The compiler enforces readonly at write sites; the validator only checks the value shape.',
    validate: () => createValidate<ReadonlyArray<string>>(),
    standardSchema: () => createStandardSchema<ReadonlyArray<string>>(),
    validateDataOnly: () => createValidate<DataOnly<ReadonlyArray<string>>>(),
    validateSchema: () => createValidate(RT.array(TF.string())),
    deserializeValidate: () => deserializeValidate<ReadonlyArray<string>>(),
    validateReflect: () => {
      const v: ReadonlyArray<string> = [];
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: ReadonlyArray<string> = [];
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<ReadonlyArray<string>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<ReadonlyArray<string>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.array(TF.string())),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<ReadonlyArray<string>>(),
    getValidationErrorsReflect: () => {
      const v: ReadonlyArray<string> = [];
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: ReadonlyArray<string> = [];
      return deserializeGetValidationErrors(v);
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
