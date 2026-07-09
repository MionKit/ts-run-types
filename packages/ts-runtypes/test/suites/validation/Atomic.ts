import * as TF from '@ts-runtypes/core/formats';
import type {ValidationCase} from './types.ts';
import {createValidate, createGetValidationErrors, createMockData, createStandardSchema, type DataOnly} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

export const ATOMIC = {
  any: {
    title: 'Any',
    description: 'The `any` keyword produces a no-op validator that accepts every value.',
    validateNotes: 'No-op validator — every value passes. Equivalent to `() => true`.',
    validate: () => createValidate<any>(),
    standardSchema: () => createStandardSchema<any>(),
    validateDataOnly: () => createValidate<DataOnly<any>>(),
    validateSchema: () => createValidate(RT.any()),
    deserializeValidate: () => deserializeValidate<any>(),
    validateReflect: () => {
      const v: any = null;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: any = null;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<any>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<any>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.any()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<any>(),
    getValidationErrorsReflect: () => {
      const v: any = null;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: any = null;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockData<any>(),
    mockTypeReflect: () => {
      const v: any = null;
      return createMockData(v);
    },
    getSamples: () => ({
      valid: [null, undefined, 42, 'hello'],
      invalid: [],
    }),
    getExpectedErrors: () => [],
  },

  bigint: {
    title: 'BigInt',
    description:
      'The `bigint` primitive uses a strict typeof gate, so plain numbers including Infinity and -Infinity are rejected.',
    validateNotes:
      'Strict `typeof === "bigint"`. Plain `number` values (including `Infinity` / `-Infinity`) are rejected — `42` is not `42n`.',
    validate: () => createValidate<bigint>(),
    standardSchema: () => createStandardSchema<bigint>(),
    // One hand-authored Standard Schema expectation per file. Every other case
    // derives its expected issues from getExpectedErrors via runTypeErrorsToIssues
    // (the same mapping the factory uses), so this single case pins the real
    // consumer-facing {message, path} output independently: it trips if error
    // generation or the issue mapping changes. One case per file covers this
    // file's shapes without the ~265x maintenance of authoring every case.
    getExpectedStandardErrors: () => [
      [{message: 'Expected bigint', path: [], expected: 'bigint'}],
      [{message: 'Expected bigint', path: [], expected: 'bigint'}],
      [{message: 'Expected bigint', path: [], expected: 'bigint'}],
      [{message: 'Expected bigint', path: [], expected: 'bigint'}],
      [{message: 'Expected bigint', path: [], expected: 'bigint'}],
      [{message: 'Expected bigint', path: [], expected: 'bigint'}],
      [{message: 'Expected bigint', path: [], expected: 'bigint'}],
    ],
    validateDataOnly: () => createValidate<DataOnly<bigint>>(),
    validateSchema: () => createValidate(TF.bigInt()),
    deserializeValidate: () => deserializeValidate<bigint>(),
    validateReflect: () => {
      const v: bigint = 1n;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: bigint = 1n;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<bigint>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<bigint>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.bigInt()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<bigint>(),
    getValidationErrorsReflect: () => {
      const v: bigint = 1n;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: bigint = 1n;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockData<bigint>(),
    mockTypeReflect: () => {
      const v: bigint = 1n;
      return createMockData(v);
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
    title: 'Boolean',
    description: 'The `boolean` primitive uses strict `typeof === "boolean"`.',
    validateNotes:
      'Strict typeof === "boolean". Truthy/falsy values that are not actual booleans (e.g., 0, 1, "", "true") are rejected.',
    validate: () => createValidate<boolean>(),
    standardSchema: () => createStandardSchema<boolean>(),
    validateDataOnly: () => createValidate<DataOnly<boolean>>(),
    validateSchema: () => createValidate(RT.boolean()),
    deserializeValidate: () => deserializeValidate<boolean>(),
    validateReflect: () => {
      const v: boolean = true;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: boolean = true;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<boolean>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<boolean>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.boolean()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<boolean>(),
    getValidationErrorsReflect: () => {
      const v: boolean = true;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: boolean = true;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockData<boolean>(),
    mockTypeReflect: () => {
      const v: boolean = true;
      return createMockData(v);
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
    title: 'Date',
    description: 'A `Date` instance is required, and Invalid Date instances whose `getTime()` is NaN are rejected.',
    validateNotes: [
      'Must be an actual Date instance (instanceof Date).',
      'Invalid Date instances are rejected — e.g., `new Date("not-a-date")` or `new Date(NaN)`, whose `.getTime()` returns NaN.',
    ],
    validate: () => createValidate<Date>(),
    standardSchema: () => createStandardSchema<Date>(),
    validateDataOnly: () => createValidate<DataOnly<Date>>(),
    validateSchema: () => createValidate(TF.date()),
    deserializeValidate: () => deserializeValidate<Date>(),
    validateReflect: () => {
      const v: Date = new Date();
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Date = new Date();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Date>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Date>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.date()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Date>(),
    getValidationErrorsReflect: () => {
      const v: Date = new Date();
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Date = new Date();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockData<Date>(),
    mockTypeReflect: () => {
      const v: Date = new Date();
      return createMockData(v);
    },
    getSamples: () => ({
      valid: [new Date()],
      invalid: ['hello', new Date('invalid'), new Date(NaN)],
    }),
    getExpectedErrors: () => [[{path: [], expected: 'date'}], [{path: [], expected: 'date'}], [{path: [], expected: 'date'}]],
  },

  enum_mixed: {
    title: 'Mixed enum',
    description:
      'An `enum Color {Red, Green="green", Blue=2}` validates its underlying numeric and string values, not the member names.',
    validateNotes: [
      'Validator accepts the underlying enum VALUES (0, "green", 2 for Color {Red, Green="green", Blue=2}).',
      'Enum member NAMES as strings ("Red", "Green", "Blue") are NOT accepted — these are TS-only handles, not runtime values.',
    ],
    // The value-first `RT.enum(Color)` carries the enum's value-UNION (kind union),
    // while the type-first `createValidate<Color>()` is the named `KindEnum`: they
    // validate identically but are structurally distinct by design (a value-first
    // builder can't reconstruct the nominal enum's member-name metadata). See the
    // enum builder doc in src/schema/atomic.ts.
    idDivergent: true,
    validate: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createValidate<Color>();
    },
    standardSchema: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createStandardSchema<Color>();
    },
    validateDataOnly: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createValidate<DataOnly<Color>>();
    },
    validateSchema: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createValidate(RT.enum(Color));
    },
    deserializeValidate: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return deserializeValidate<Color>();
    },
    validateReflect: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      const v: Color = Color.Red;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      const v: Color = Color.Red;
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createGetValidationErrors<Color>();
    },
    getValidationErrorsDataOnly: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createGetValidationErrors<DataOnly<Color>>();
    },
    getValidationErrorsSchema: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createGetValidationErrors(RT.enum(Color));
    },
    deserializeGetValidationErrors: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return deserializeGetValidationErrors<Color>();
    },
    getValidationErrorsReflect: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      const v: Color = Color.Red;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      const v: Color = Color.Red;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      return createMockData<Color>();
    },
    mockTypeReflect: () => {
      enum Color {
        Red,
        Green = 'green',
        Blue = 2,
      }
      const v: Color = Color.Red;
      return createMockData(v);
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
    title: 'Numeric literal',
    description: 'The numeric literal type `2` is matched by strict `===`, so the string "2" fails.',
    validateNotes: 'Strict === equality with the literal value. The string "2" is not the number 2.',
    validate: () => createValidate<2>(),
    standardSchema: () => createStandardSchema<2>(),
    validateDataOnly: () => createValidate<DataOnly<2>>(),
    validateSchema: () => createValidate(RT.literal(2)),
    deserializeValidate: () => deserializeValidate<2>(),
    validateReflect: () => {
      const v = 2 as const;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v = 2 as const;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<2>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<2>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.literal(2)),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<2>(),
    getValidationErrorsReflect: () => {
      const v = 2 as const;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v = 2 as const;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockData<2>(),
    mockTypeReflect: () => {
      const v = 2 as const;
      return createMockData(v);
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
    title: 'String literal',
    description: "The string literal type `'a'` is matched by strict, case-sensitive `===`.",
    validateNotes: 'Case-sensitive — "A" does not satisfy the literal "a".',
    validate: () => createValidate<'a'>(),
    standardSchema: () => createStandardSchema<'a'>(),
    validateDataOnly: () => createValidate<DataOnly<'a'>>(),
    validateSchema: () => createValidate(RT.literal('a')),
    deserializeValidate: () => deserializeValidate<'a'>(),
    validateReflect: () => {
      const v = 'a' as const;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v = 'a' as const;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<'a'>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<'a'>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.literal('a')),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<'a'>(),
    getValidationErrorsReflect: () => {
      const v = 'a' as const;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v = 'a' as const;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockData<'a'>(),
    mockTypeReflect: () => {
      const v = 'a' as const;
      return createMockData(v);
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
    title: 'Boolean literal',
    description: 'The boolean literal type `true` accepts only the value `true` via strict `===`.',
    validateNotes:
      'Strict === equality. Truthy values like 1 or "true" do NOT satisfy the literal `true`; only the boolean true does.',
    validate: () => createValidate<true>(),
    standardSchema: () => createStandardSchema<true>(),
    validateDataOnly: () => createValidate<DataOnly<true>>(),
    validateSchema: () => createValidate(RT.literal(true)),
    deserializeValidate: () => deserializeValidate<true>(),
    validateReflect: () => {
      const v = true as const;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v = true as const;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<true>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<true>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.literal(true)),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<true>(),
    getValidationErrorsReflect: () => {
      const v = true as const;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v = true as const;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockData<true>(),
    mockTypeReflect: () => {
      const v = true as const;
      return createMockData(v);
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
    title: 'BigInt literal',
    description: 'The bigint literal type `1n` is matched by strict `===`, so the number 1 fails.',
    validateNotes: 'Strict === equality with the bigint literal. The number 1 and the string "1n" do NOT satisfy 1n.',
    validate: () => createValidate<1n>(),
    standardSchema: () => createStandardSchema<1n>(),
    validateDataOnly: () => createValidate<DataOnly<1n>>(),
    validateSchema: () => createValidate(RT.literal(1n)),
    deserializeValidate: () => deserializeValidate<1n>(),
    validateReflect: () => {
      const v = 1n as const;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v = 1n as const;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<1n>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<1n>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.literal(1n)),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<1n>(),
    getValidationErrorsReflect: () => {
      const v = 1n as const;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v = 1n as const;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockData<1n>(),
    mockTypeReflect: () => {
      const v = 1n as const;
      return createMockData(v);
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
    title: 'Symbol literal',
    // DataOnly<unique symbol> collapses to `never` (symbols are non-data), so
    // createValidate<DataOnly<T>>() can't reproduce the symbol validator.
    dataOnlyDivergent: true,
    description:
      'A symbol literal is matched by its `description` rather than unique-symbol identity, per the reference semantics.',
    validateNotes:
      'TS DIVERGENCE: Symbol literal types are matched by `description`, not by unique-symbol identity. A different `Symbol("hello")` instance with the same description WILL satisfy the type. Strict TS treats each `typeof sym` as a unique-symbol referring to that exact value.',
    validate: () => {
      const sym = Symbol('hello');
      return createValidate<typeof sym>();
    },
    standardSchema: () => {
      const sym = Symbol('hello');
      return createStandardSchema<typeof sym>();
    },
    validateDataOnly: () => {
      const sym = Symbol('hello');
      return createValidate<DataOnly<typeof sym>>();
    },
    // No value-first builder for a unique-symbol literal (matched by description);
    // `RT.symbol()` is the bare-symbol kind, which is unsupported at root anyway.
    validateSchema: 'not-supported',
    deserializeValidate: () => {
      const sym = Symbol('hello');
      return deserializeValidate<typeof sym>();
    },
    validateReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      const sym = Symbol('hello');
      return createGetValidationErrors<typeof sym>();
    },
    getValidationErrorsDataOnly: () => {
      const sym = Symbol('hello');
      return createGetValidationErrors<DataOnly<typeof sym>>();
    },
    getValidationErrorsSchema: 'not-supported',
    deserializeGetValidationErrors: () => {
      const sym = Symbol('hello');
      return deserializeGetValidationErrors<typeof sym>();
    },
    getValidationErrorsReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      const sym = Symbol('hello');
      return createMockData<typeof sym>();
    },
    mockTypeReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createMockData(v);
    },
    getSamples: () => {
      const sym = Symbol('hello');
      return {
        // identity by description per the reference semantics:
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
    title: 'Never',
    description: 'The `never` keyword rejects every value, and mockType throws.',
    validateNotes: 'No value satisfies `never`. The validator is hard-coded to return `false` for every input.',
    validate: () => createValidate<never>(),
    standardSchema: () => createStandardSchema<never>(),
    validateDataOnly: () => createValidate<DataOnly<never>>(),
    validateSchema: () => createValidate(RT.never()),
    deserializeValidate: () => deserializeValidate<never>(),
    validateReflect: () => {
      const v: never = null as never;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: never = null as never;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<never>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<never>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.never()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<never>(),
    getValidationErrorsReflect: () => {
      const v: never = null as never;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: never = null as never;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockData<never>(),
    mockTypeReflect: () => {
      const v: never = null as never;
      return createMockData(v);
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
    title: 'Null',
    description: 'A strict `=== null` check treats null as distinct from undefined and other falsy values.',
    validateNotes:
      'Strict === null check. `undefined`, `0`, `""`, `false`, `NaN`, `{}`, `[]` and other "falsy" or "nullish-feeling" values are all rejected.',
    validate: () => createValidate<null>(),
    standardSchema: () => createStandardSchema<null>(),
    validateDataOnly: () => createValidate<DataOnly<null>>(),
    validateSchema: () => createValidate(RT.literal(null)),
    deserializeValidate: () => deserializeValidate<null>(),
    validateReflect: () => {
      const v: null = null;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: null = null;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<null>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<null>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.literal(null)),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<null>(),
    getValidationErrorsReflect: () => {
      const v: null = null;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: null = null;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockData<null>(),
    mockTypeReflect: () => {
      const v: null = null;
      return createMockData(v);
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
    title: 'Number',
    description: 'The `number` primitive uses `Number.isFinite`, so NaN, Infinity, and -Infinity are rejected.',
    validateNotes: [
      'Uses `Number.isFinite(v)` rather than bare `typeof v === "number"`.',
      '`NaN`, `Infinity`, and `-Infinity` are rejected even though they pass `typeof === "number"`.',
    ],
    validate: () => createValidate<number>(),
    standardSchema: () => createStandardSchema<number>(),
    validateDataOnly: () => createValidate<DataOnly<number>>(),
    validateSchema: () => createValidate(TF.number()),
    deserializeValidate: () => deserializeValidate<number>(),
    validateReflect: () => {
      const v: number = 42;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: number = 42;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<number>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<number>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.number()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<number>(),
    getValidationErrorsReflect: () => {
      const v: number = 42;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: number = 42;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockData<number>(),
    mockTypeReflect: () => {
      const v: number = 42;
      return createMockData(v);
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
    title: 'Object',
    description:
      'The `object` type accepts any non-null non-primitive value, rejecting null despite JS `typeof null === "object"`.',
    validateNotes: [
      'Emit is `typeof v === "object" && v !== null` — strict TS semantics (any non-primitive non-null value).',
      'Arrays, Date instances, RegExp, Map, Set, and class instances all PASS — they are TS-`object` per the spec.',
      '`null` is explicitly rejected (despite `typeof null === "object"` in JavaScript).',
      '`object` here does NOT mean "plain object literal" — if you need that semantic, use a specific object shape or an index-signature type.',
    ],
    validate: () => createValidate<object>(),
    standardSchema: () => createStandardSchema<object>(),
    validateDataOnly: () => createValidate<DataOnly<object>>(),
    // No value-first builder for the TS `object` primitive (any non-null
    // non-primitive) — `RT.object(...)` is the shape composer, a different kind.
    validateSchema: 'not-supported',
    deserializeValidate: () => deserializeValidate<object>(),
    validateReflect: () => {
      const v: object = {};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: object = {};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<object>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<object>>(),
    getValidationErrorsSchema: 'not-supported',
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<object>(),
    getValidationErrorsReflect: () => {
      const v: object = {};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: object = {};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockData<object>(),
    mockTypeReflect: () => {
      const v: object = {};
      return createMockData(v);
    },
    getSamples: () => ({
      valid: [{}, {a: 42, b: 'hello'}, [], new Date(), /abc/],
      invalid: [null, undefined, 42, 'hello', true, Symbol()],
    }),
    // The bare `object` primitive (protocol.KindObject) reuses the `objectLiteral`
    // emit token — there is NO distinct `object`/`nonNullObject` token. The gate
    // `typeof v === 'object' && v !== null` lives at nodes/atomic/object.ts and the
    // failure surfaces as `objectLiteral` (see internal/cachegen/typefunctions/validationerrors.go
    // KindObject case). Do not "fix" this to `object`.
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
    title: 'RegExp',
    description: 'The `RegExp` builtin uses an `instanceof RegExp` check.',
    validateNotes: [
      'Must be an actual RegExp instance (`instanceof RegExp`). A string like `"/abc/"` does NOT satisfy.',
      'The getValidationErrors and mockType REFLECT forms are not supported: a reflect value `const v: RegExp = /abc/` narrows to the literal-regex type `/abc/`, dispatching to the regexp-literal arm — getValidationErrors would then report `expected: "literal"` instead of `"regexp"`, and mockType would resolve a regexp-literal runtype. The validate reflect forms survive because the validator body coincides on the samples; only the kindname-reporting paths diverge.',
    ],
    validate: () => createValidate<RegExp>(),
    standardSchema: () => createStandardSchema<RegExp>(),
    validateDataOnly: () => createValidate<DataOnly<RegExp>>(),
    validateSchema: () => createValidate(RT.regexp()),
    deserializeValidate: () => deserializeValidate<RegExp>(),
    validateReflect: () => {
      const v: RegExp = /abc/;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: RegExp = /abc/;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<RegExp>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<RegExp>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.regexp()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<RegExp>(),
    // Reflect forms for the kindname-reporting paths are deliberately opted out
    // (see validateNotes): `const v: RegExp = /abc/` narrows to the literal-regex
    // type and dispatches to the regexp-literal arm, diverging from the static form.
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
    mockType: () => createMockData<RegExp>(),
    mockTypeReflect: 'not-supported',
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
    title: 'String',
    description: 'The `string` primitive uses strict `typeof === "string"`, accepting the empty string.',
    validateNotes: 'Strict typeof === "string". The empty string ("") is accepted.',
    validate: () => createValidate<string>(),
    standardSchema: () => createStandardSchema<string>(),
    validateDataOnly: () => createValidate<DataOnly<string>>(),
    validateSchema: () => createValidate(TF.string()),
    deserializeValidate: () => deserializeValidate<string>(),
    validateReflect: () => {
      const v: string = 'hello';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: string = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<string>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<string>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.string()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<string>(),
    getValidationErrorsReflect: () => {
      const v: string = 'hello';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: string = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockData<string>(),
    mockTypeReflect: () => {
      const v: string = 'hello';
      return createMockData(v);
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
    title: 'Symbol',
    description: 'The bare `symbol` primitive is unsupported at root, so the factory throws on first call.',
    validateNotes:
      'Symbol at root is unsupported — identity does not survive across realms or round-trips, so a `typeof === "symbol"` check would give false confidence. The Go pipeline renders the factory as alwaysThrow (codes VL002 / VE002 / IS002), and the very first `createXxx<symbol>()` call throws. See docs/UNSUPPORTED-KINDS.md.',
    validate: () => createValidate<symbol>(),
    standardSchema: () => createStandardSchema<symbol>(),
    validateDataOnly: () => createValidate<DataOnly<symbol>>(),
    // Bare symbol is unsupported at root — the value-first `RT.symbol()` resolves
    // the same alwaysThrow factory, so this thunk throws like the type-first form.
    validateSchema: () => createValidate(RT.symbol()),
    deserializeValidate: () => deserializeValidate<symbol>(),
    validateReflect: () => {
      const v: symbol = Symbol();
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: symbol = Symbol();
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<symbol>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<symbol>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.symbol()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<symbol>(),
    getValidationErrorsReflect: () => {
      const v: symbol = Symbol();
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: symbol = Symbol();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockData<symbol>(),
    mockTypeReflect: () => {
      const v: symbol = Symbol();
      return createMockData(v);
    },
    factoryThrows: true,
    getSamples: () => ({valid: [], invalid: []}),
  },

  undefined: {
    title: 'Undefined',
    description: 'A strict `=== undefined` check treats undefined as distinct from null and other falsy values.',
    validateNotes: 'Strict === undefined check. `null`, `0`, `""`, `false`, `{}`, `[]` are all rejected.',
    validate: () => createValidate<undefined>(),
    standardSchema: () => createStandardSchema<undefined>(),
    validateDataOnly: () => createValidate<DataOnly<undefined>>(),
    validateSchema: () => createValidate(RT.literal(undefined)),
    deserializeValidate: () => deserializeValidate<undefined>(),
    validateReflect: () => {
      const v: undefined = undefined;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: undefined = undefined;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<undefined>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<undefined>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.literal(undefined)),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<undefined>(),
    getValidationErrorsReflect: () => {
      const v: undefined = undefined;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: undefined = undefined;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockData<undefined>(),
    mockTypeReflect: () => {
      const v: undefined = undefined;
      return createMockData(v);
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
    title: 'Void',
    description: 'The `void` type validates like undefined, accepting undefined and a bare function return but rejecting null.',
    validateNotes:
      'TS DIVERGENCE: `void` validates like `undefined` — it accepts `undefined` (and a bare `(): void => {}` return) but rejects `null`, unlike a `null | undefined` type.',
    validate: () => createValidate<void>(),
    standardSchema: () => createStandardSchema<void>(),
    validateDataOnly: () => createValidate<DataOnly<void>>(),
    validateSchema: () => createValidate(RT.void()),
    deserializeValidate: () => deserializeValidate<void>(),
    validateReflect: () => {
      const v: void = undefined;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: void = undefined;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<void>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<void>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.void()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<void>(),
    getValidationErrorsReflect: () => {
      const v: void = undefined;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: void = undefined;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockData<void>(),
    mockTypeReflect: () => {
      const v: void = undefined;
      return createMockData(v);
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
  // literal.spec.ts. Each literal degrades to its base-type
  // check: the validator accepts any value of the base type instead
  // of only the exact literal. The Go-side resolver swaps the
  // literal type for its base via Checker_getBaseTypeOfLiteralType
  // before assigning the hash (see internal/compiler/resolver/scan.go), so
  // these cases reuse the existing base-kind emit code.

  literal_2_noLiterals: {
    title: 'Numeric literal noLiterals',
    description: 'With `{noLiterals: true}` the numeric literal degrades to `number`, using a `Number.isFinite` check.',
    validateNotes:
      'With `{noLiterals: true}` the literal degrades to its base type (`number`). The exact-literal check is replaced by `Number.isFinite` — same rules as the atomic `number` validator (NaN / Infinity / -Infinity rejected).',
    validate: () => createValidate<2>(undefined, {noLiterals: true}),
    standardSchema: () => createStandardSchema<2>(undefined, {noLiterals: true}),
    validateDataOnly: () => createValidate<DataOnly<2>>(undefined, {noLiterals: true}),
    // Value-first mirror of the type-first form: the SAME literal id carrying the
    // SAME {noLiterals} option — both resolve the `itNL_<literal-2 id>` variant.
    // (noLiterals keeps the literal's structural id and folds into the variant
    // key; it does NOT degrade to `number`'s id before hashing.)
    validateSchema: () => createValidate(RT.literal(2), {noLiterals: true}),
    deserializeValidate: () => deserializeValidate<2>(undefined, {noLiterals: true}),
    validateReflect: () => {
      const v = 2 as const;
      return createValidate(v, {noLiterals: true});
    },
    deserializeValidateReflect: () => {
      const v = 2 as const;
      return deserializeValidate(v, {noLiterals: true});
    },
    getValidationErrors: () => createGetValidationErrors<2>(undefined, {noLiterals: true}),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<2>>(undefined, {noLiterals: true}),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.literal(2), {noLiterals: true}),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<2>(undefined, {noLiterals: true}),
    getValidationErrorsReflect: () => {
      const v = 2 as const;
      return createGetValidationErrors(v, {noLiterals: true});
    },
    deserializeGetValidationErrorsReflect: () => {
      const v = 2 as const;
      return deserializeGetValidationErrors(v, {noLiterals: true});
    },
    mockType: () => createMockData<2>(undefined, undefined),
    mockTypeReflect: () => {
      const v = 2 as const;
      return createMockData(v);
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
    title: 'String literal noLiterals',
    description: 'With `{noLiterals: true}` the string literal degrades to `string`, using a typeof check.',
    validateNotes:
      '`{noLiterals: true}` degrades the literal to its base type `string`. Any string passes, including the empty string.',
    validate: () => createValidate<'a'>(undefined, {noLiterals: true}),
    standardSchema: () => createStandardSchema<'a'>(undefined, {noLiterals: true}),
    validateDataOnly: () => createValidate<DataOnly<'a'>>(undefined, {noLiterals: true}),
    validateSchema: () => createValidate(RT.literal('a'), {noLiterals: true}),
    deserializeValidate: () => deserializeValidate<'a'>(undefined, {noLiterals: true}),
    validateReflect: () => {
      const v = 'a' as const;
      return createValidate(v, {noLiterals: true});
    },
    deserializeValidateReflect: () => {
      const v = 'a' as const;
      return deserializeValidate(v, {noLiterals: true});
    },
    getValidationErrors: () => createGetValidationErrors<'a'>(undefined, {noLiterals: true}),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<'a'>>(undefined, {noLiterals: true}),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.literal('a'), {noLiterals: true}),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<'a'>(undefined, {noLiterals: true}),
    getValidationErrorsReflect: () => {
      const v = 'a' as const;
      return createGetValidationErrors(v, {noLiterals: true});
    },
    deserializeGetValidationErrorsReflect: () => {
      const v = 'a' as const;
      return deserializeGetValidationErrors(v, {noLiterals: true});
    },
    mockType: () => createMockData<'a'>(undefined, undefined),
    mockTypeReflect: () => {
      const v = 'a' as const;
      return createMockData(v);
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
    title: 'RegExp literal noLiterals',
    description: 'With `{noLiterals: true}` the RegExp literal degrades to `RegExp`, using an instanceof check.',
    validateNotes:
      '`{noLiterals: true}` degrades the literal to its base type `RegExp`. Any RegExp instance passes (constructor form `new RegExp(...)` included); source + flags are no longer matched.',
    validate: () => {
      const reg = /abc/i;
      return createValidate<typeof reg>(undefined, {noLiterals: true});
    },
    standardSchema: () => {
      const reg = /abc/i;
      return createStandardSchema<typeof reg>(undefined, {noLiterals: true});
    },
    validateDataOnly: () => {
      const reg = /abc/i;
      return createValidate<DataOnly<typeof reg>>(undefined, {noLiterals: true});
    },
    // Value-first mirror: RegExp base kind + the SAME {noLiterals} option, so both
    // resolve the `itNL_<regexp id>` variant. (No RegExp-literal kind exists since
    // PR #76, so `typeof /abc/i` is plain `RegExp` — `RT.regexp()` is the match.)
    validateSchema: () => createValidate(RT.regexp(), {noLiterals: true}),
    deserializeValidate: () => {
      const reg = /abc/i;
      return deserializeValidate<typeof reg>(undefined, {noLiterals: true});
    },
    validateReflect: () => {
      const reg = /abc/i;
      const v: typeof reg = reg;
      return createValidate(v, {noLiterals: true});
    },
    deserializeValidateReflect: () => {
      const reg = /abc/i;
      const v: typeof reg = reg;
      return deserializeValidate(v, {noLiterals: true});
    },
    getValidationErrors: () => {
      const reg = /abc/i;
      return createGetValidationErrors<typeof reg>(undefined, {noLiterals: true});
    },
    getValidationErrorsDataOnly: () => {
      const reg = /abc/i;
      return createGetValidationErrors<DataOnly<typeof reg>>(undefined, {noLiterals: true});
    },
    getValidationErrorsSchema: () => createGetValidationErrors(RT.regexp(), {noLiterals: true}),
    deserializeGetValidationErrors: () => {
      const reg = /abc/i;
      return deserializeGetValidationErrors<typeof reg>(undefined, {noLiterals: true});
    },
    getValidationErrorsReflect: () => {
      const reg = /abc/i;
      const v: typeof reg = reg;
      return createGetValidationErrors(v, {noLiterals: true});
    },
    deserializeGetValidationErrorsReflect: () => {
      const reg = /abc/i;
      const v: typeof reg = reg;
      return deserializeGetValidationErrors(v, {noLiterals: true});
    },
    mockType: () => {
      const reg = /abc/i;
      return createMockData<typeof reg>(undefined, undefined);
    },
    mockTypeReflect: () => {
      const reg = /abc/i;
      const v: typeof reg = reg;
      return createMockData(v);
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
    title: 'Boolean literal noLiterals',
    description: 'With `{noLiterals: true}` the boolean literal degrades to `boolean`, using a typeof check.',
    validateNotes:
      '`{noLiterals: true}` degrades the literal to its base type `boolean`. Either `true` or `false` passes; truthy values like 1 are still rejected.',
    validate: () => createValidate<true>(undefined, {noLiterals: true}),
    standardSchema: () => createStandardSchema<true>(undefined, {noLiterals: true}),
    validateDataOnly: () => createValidate<DataOnly<true>>(undefined, {noLiterals: true}),
    validateSchema: () => createValidate(RT.literal(true), {noLiterals: true}),
    deserializeValidate: () => deserializeValidate<true>(undefined, {noLiterals: true}),
    validateReflect: () => {
      const v = true as const;
      return createValidate(v, {noLiterals: true});
    },
    deserializeValidateReflect: () => {
      const v = true as const;
      return deserializeValidate(v, {noLiterals: true});
    },
    getValidationErrors: () => createGetValidationErrors<true>(undefined, {noLiterals: true}),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<true>>(undefined, {noLiterals: true}),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.literal(true), {noLiterals: true}),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<true>(undefined, {noLiterals: true}),
    getValidationErrorsReflect: () => {
      const v = true as const;
      return createGetValidationErrors(v, {noLiterals: true});
    },
    deserializeGetValidationErrorsReflect: () => {
      const v = true as const;
      return deserializeGetValidationErrors(v, {noLiterals: true});
    },
    mockType: () => createMockData<true>(undefined, undefined),
    mockTypeReflect: () => {
      const v = true as const;
      return createMockData(v);
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
    title: 'BigInt literal noLiterals',
    description: 'With `{noLiterals: true}` the bigint literal degrades to `bigint`, using a typeof check.',
    validateNotes:
      '`{noLiterals: true}` degrades the literal to its base type `bigint`. Any bigint passes; the number `1` does NOT.',
    validate: () => createValidate<1n>(undefined, {noLiterals: true}),
    standardSchema: () => createStandardSchema<1n>(undefined, {noLiterals: true}),
    validateDataOnly: () => createValidate<DataOnly<1n>>(undefined, {noLiterals: true}),
    validateSchema: () => createValidate(RT.literal(1n), {noLiterals: true}),
    deserializeValidate: () => deserializeValidate<1n>(undefined, {noLiterals: true}),
    validateReflect: () => {
      const v = 1n as const;
      return createValidate(v, {noLiterals: true});
    },
    deserializeValidateReflect: () => {
      const v = 1n as const;
      return deserializeValidate(v, {noLiterals: true});
    },
    getValidationErrors: () => createGetValidationErrors<1n>(undefined, {noLiterals: true}),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<1n>>(undefined, {noLiterals: true}),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.literal(1n), {noLiterals: true}),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<1n>(undefined, {noLiterals: true}),
    getValidationErrorsReflect: () => {
      const v = 1n as const;
      return createGetValidationErrors(v, {noLiterals: true});
    },
    deserializeGetValidationErrorsReflect: () => {
      const v = 1n as const;
      return deserializeGetValidationErrors(v, {noLiterals: true});
    },
    mockType: () => createMockData<1n>(undefined, undefined),
    mockTypeReflect: () => {
      const v = 1n as const;
      return createMockData(v);
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
    title: 'Symbol literal noLiterals',
    description: 'With `{noLiterals: true}` the symbol literal degrades to bare symbol, which is unsupported at root.',
    validateNotes:
      '`{noLiterals: true}` degrades the literal to its base type `symbol`, which is unsupported at root (see the `symbol` case above). The factory is rendered as alwaysThrow; the first `createXxx<typeof sym>()` call throws.',
    validate: () => {
      const sym = Symbol('hello');
      return createValidate<typeof sym>(undefined, {noLiterals: true});
    },
    standardSchema: () => {
      const sym = Symbol('hello');
      return createStandardSchema<typeof sym>(undefined, {noLiterals: true});
    },
    validateDataOnly: () => {
      const sym = Symbol('hello');
      return createValidate<DataOnly<typeof sym>>(undefined, {noLiterals: true});
    },
    // Degrades to bare symbol (unsupported at root) — `RT.symbol()` resolves the
    // same alwaysThrow factory, so the schema thunk throws like the type-first form.
    validateSchema: () => createValidate(RT.symbol(), {noLiterals: true}),
    deserializeValidate: () => {
      const sym = Symbol('hello');
      return deserializeValidate<typeof sym>(undefined, {noLiterals: true});
    },
    validateReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createValidate(v, {noLiterals: true});
    },
    deserializeValidateReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return deserializeValidate(v, {noLiterals: true});
    },
    getValidationErrors: () => {
      const sym = Symbol('hello');
      return createGetValidationErrors<typeof sym>(undefined, {noLiterals: true});
    },
    getValidationErrorsDataOnly: () => {
      const sym = Symbol('hello');
      return createGetValidationErrors<DataOnly<typeof sym>>(undefined, {noLiterals: true});
    },
    getValidationErrorsSchema: () => createGetValidationErrors(RT.symbol(), {noLiterals: true}),
    deserializeGetValidationErrors: () => {
      const sym = Symbol('hello');
      return deserializeGetValidationErrors<typeof sym>(undefined, {noLiterals: true});
    },
    getValidationErrorsReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createGetValidationErrors(v, {noLiterals: true});
    },
    deserializeGetValidationErrorsReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return deserializeGetValidationErrors(v, {noLiterals: true});
    },
    mockType: () => {
      const sym = Symbol('hello');
      return createMockData<typeof sym>(undefined, undefined);
    },
    mockTypeReflect: () => {
      const sym = Symbol('hello');
      const v: typeof sym = sym;
      return createMockData(v);
    },
    factoryThrows: true,
    getSamples: () => ({valid: [], invalid: []}),
  },

  // `unknown` — like `any`, every value passes. The unknown kind
  // reuses the any-kind emit (no validate emit), so both kinds
  // collapse to a noop validator. The reference suite skips this; we
  // include it here for full TS keyword coverage so a regression
  // can't silently change the always-pass semantics.
  unknown: {
    title: 'Unknown',
    description: 'The `unknown` keyword produces a no-op validator that accepts every value, same as `any`.',
    validateNotes: 'No-op validator — `unknown` accepts every value, same as `any`. Equivalent to `() => true`.',
    validate: () => createValidate<unknown>(),
    standardSchema: () => createStandardSchema<unknown>(),
    validateDataOnly: () => createValidate<DataOnly<unknown>>(),
    validateSchema: () => createValidate(RT.unknown()),
    deserializeValidate: () => deserializeValidate<unknown>(),
    validateReflect: () => {
      const v: unknown = null;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: unknown = null;
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<unknown>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<unknown>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.unknown()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<unknown>(),
    getValidationErrorsReflect: () => {
      const v: unknown = null;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: unknown = null;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockData<unknown>(),
    mockTypeReflect: () => {
      const v: unknown = null;
      return createMockData(v);
    },
    getSamples: () => ({
      valid: [null, undefined, 42, 'hello', true, {}, [], Symbol(), () => null, new Date()],
      invalid: [],
    }),
    getExpectedErrors: () => [],
  },
} as const satisfies Record<string, ValidationCase>;
