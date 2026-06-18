// Reflect-form thunks author a REAL example value of the (now transparent) format
// type — the case's first valid sample (e.g. 100n, 9, 'john@example.com'). The value
// only drives `T` inference and is discarded at runtime, but a realistic literal keeps
// these snippets self-explanatory and safe to lift into docs. Every form is exercised:
// validate + getValidationErrors (static / reflect / deserialize-static /
// deserialize-reflect) + mockType; the getValidationErrors format-payload forms assert
// the exact format error survives every resolution path.
import * as TF from 'ts-runtypes/formats';
import type {FormatValidationCase} from './types.ts';
import 'ts-runtypes/formats';
import {createValidate, createGetValidationErrors, createMockType, createStandardSchema, type DataOnly} from 'ts-runtypes';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

export const NUMBER_FORMAT = {
  number_max: {
    title: 'Inclusive max',
    description: 'numberFormat with an inclusive upper bound that rejects numbers above max.',
    validateNotes:
      'Boundary value 100 passes (inclusive); 101 fails on `max`. A non-number ("5") fails the number typeof gate before any format check.',
    validate: () => createValidate<TF.Number<{max: 100}>>(),
    standardSchema: () => createStandardSchema<TF.Number<{max: 100}>>(),
    validateReflect: () => {
      const v: TF.Number<{max: 100}> = 100;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Number<{max: 100}>>(),
    deserializeValidateReflect: () => {
      const v: TF.Number<{max: 100}> = 100;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Number<{max: 100}> = 100;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Number<{max: 100}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Number<{max: 100}> = 100;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Number<{max: 100}> = 100;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Number<{max: 100}>>>(),
    validateSchema: () => createValidate(TF.number({max: 100})),
    getValidationErrors: () => createGetValidationErrors<TF.Number<{max: 100}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Number<{max: 100}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.number({max: 100})),
    mockType: () => createMockType<TF.Number<{max: 100}>>(),
    getSamples: () => ({valid: [100, 0, -50], invalid: [101, '5']}),
    expectedFormatErrors: () => [{name: 'numberFormat', val: 100, formatPathTail: 'max'}, null],
  },
  number_min: {
    title: 'Inclusive min',
    description: 'numberFormat with an inclusive lower bound that rejects numbers below min, equivalent to FormatPositive.',
    validateNotes: 'Boundary value 0 passes (inclusive); -1 fails on `min`.',
    validate: () => createValidate<TF.Number<{min: 0}>>(),
    standardSchema: () => createStandardSchema<TF.Number<{min: 0}>>(),
    validateReflect: () => {
      const v: TF.Number<{min: 0}> = 0;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Number<{min: 0}>>(),
    deserializeValidateReflect: () => {
      const v: TF.Number<{min: 0}> = 0;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Number<{min: 0}> = 0;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Number<{min: 0}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Number<{min: 0}> = 0;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Number<{min: 0}> = 0;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Number<{min: 0}>>>(),
    validateSchema: () => createValidate(TF.number({min: 0})),
    getValidationErrors: () => createGetValidationErrors<TF.Number<{min: 0}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Number<{min: 0}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.number({min: 0})),
    mockType: () => createMockType<TF.Number<{min: 0}>>(),
    getSamples: () => ({valid: [0, 1, 9999], invalid: [-1]}),
    expectedFormatErrors: () => [{name: 'numberFormat', val: 0, formatPathTail: 'min'}],
  },
  number_lt: {
    title: 'Exclusive max',
    description: 'numberFormat with an exclusive upper bound where the bound itself is rejected.',
    validateNotes:
      'Exclusive `lt`: 9 passes but the boundary 10 fails (and 11 above it). Lower bound is unconstrained, so -100 passes.',
    validate: () => createValidate<TF.Number<{lt: 10}>>(),
    standardSchema: () => createStandardSchema<TF.Number<{lt: 10}>>(),
    validateReflect: () => {
      const v: TF.Number<{lt: 10}> = 9;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Number<{lt: 10}>>(),
    deserializeValidateReflect: () => {
      const v: TF.Number<{lt: 10}> = 9;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Number<{lt: 10}> = 9;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Number<{lt: 10}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Number<{lt: 10}> = 9;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Number<{lt: 10}> = 9;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Number<{lt: 10}>>>(),
    validateSchema: () => createValidate(TF.number({lt: 10})),
    getValidationErrors: () => createGetValidationErrors<TF.Number<{lt: 10}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Number<{lt: 10}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.number({lt: 10})),
    mockType: () => createMockType<TF.Number<{lt: 10}>>(),
    getSamples: () => ({valid: [9, 0, -100], invalid: [10, 11]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: 10, formatPathTail: 'lt'},
      {name: 'numberFormat', val: 10, formatPathTail: 'lt'},
    ],
  },
  number_gt: {
    title: 'Exclusive min',
    description: 'numberFormat with an exclusive lower bound where the bound itself is rejected.',
    validateNotes: 'Exclusive `gt`: 1 passes but the boundary 0 fails (and -1 below it).',
    validate: () => createValidate<TF.Number<{gt: 0}>>(),
    standardSchema: () => createStandardSchema<TF.Number<{gt: 0}>>(),
    validateReflect: () => {
      const v: TF.Number<{gt: 0}> = 1;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Number<{gt: 0}>>(),
    deserializeValidateReflect: () => {
      const v: TF.Number<{gt: 0}> = 1;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Number<{gt: 0}> = 1;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Number<{gt: 0}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Number<{gt: 0}> = 1;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Number<{gt: 0}> = 1;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Number<{gt: 0}>>>(),
    validateSchema: () => createValidate(TF.number({gt: 0})),
    getValidationErrors: () => createGetValidationErrors<TF.Number<{gt: 0}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Number<{gt: 0}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.number({gt: 0})),
    mockType: () => createMockType<TF.Number<{gt: 0}>>(),
    getSamples: () => ({valid: [1, 100], invalid: [0, -1]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: 0, formatPathTail: 'gt'},
      {name: 'numberFormat', val: 0, formatPathTail: 'gt'},
    ],
  },
  number_integer: {
    title: 'Integer',
    description: 'numberFormat with the `integer` flag that rejects any non-whole number.',
    validateNotes:
      'Whole numbers (incl. 0 and negatives like -1) pass; fractional values (1.5, 3.14) fail on `integer`. No min/max bound, so any integer magnitude is accepted.',
    validate: () => createValidate<TF.Integer>(),
    standardSchema: () => createStandardSchema<TF.Integer>(),
    validateReflect: () => {
      const v: TF.Integer = 0;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Integer>(),
    deserializeValidateReflect: () => {
      const v: TF.Integer = 0;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Integer = 0;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Integer>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Integer = 0;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Integer = 0;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Integer>>(),
    validateSchema: () => createValidate(TF.integer()),
    getValidationErrors: () => createGetValidationErrors<TF.Integer>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Integer>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.integer()),
    mockType: () => createMockType<TF.Integer>(),
    getSamples: () => ({valid: [0, 1, -1, 42], invalid: [1.5, 3.14]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: true, formatPathTail: 'integer'},
      {name: 'numberFormat', val: true, formatPathTail: 'integer'},
    ],
  },
  number_float: {
    title: 'Float',
    description: 'numberFormat with the `float` flag that rejects whole numbers, the inverse of TF.Integer.',
    validateNotes:
      'Fractional values (1.5, -0.5, 3.14) pass; whole numbers (1, 0, -2) fail on `float`. `float` and `integer` are mutually exclusive.',
    validate: () => createValidate<TF.Float>(),
    standardSchema: () => createStandardSchema<TF.Float>(),
    validateReflect: () => {
      const v: TF.Float = 1.5;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Float>(),
    deserializeValidateReflect: () => {
      const v: TF.Float = 1.5;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Float = 1.5;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Float>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Float = 1.5;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Float = 1.5;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Float>>(),
    validateSchema: () => createValidate(TF.float()),
    getValidationErrors: () => createGetValidationErrors<TF.Float>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Float>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.float()),
    mockType: () => createMockType<TF.Float>(),
    getSamples: () => ({valid: [1.5, -0.5, 3.14], invalid: [1, 0, -2]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: true, formatPathTail: 'float'},
      {name: 'numberFormat', val: true, formatPathTail: 'float'},
      {name: 'numberFormat', val: true, formatPathTail: 'float'},
    ],
  },
  number_multipleOf: {
    title: 'Multiple of',
    description: 'numberFormat divisibility constraint where only multiples of 5 pass.',
    validateNotes:
      '0 counts as a multiple and passes; non-multiples (3, 7) fail on `multipleOf`. Negative multiples like -15 pass.',
    validate: () => createValidate<TF.Number<{multipleOf: 5}>>(),
    standardSchema: () => createStandardSchema<TF.Number<{multipleOf: 5}>>(),
    validateReflect: () => {
      const v: TF.Number<{multipleOf: 5}> = 0;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Number<{multipleOf: 5}>>(),
    deserializeValidateReflect: () => {
      const v: TF.Number<{multipleOf: 5}> = 0;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Number<{multipleOf: 5}> = 0;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Number<{multipleOf: 5}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Number<{multipleOf: 5}> = 0;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Number<{multipleOf: 5}> = 0;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Number<{multipleOf: 5}>>>(),
    validateSchema: () => createValidate(TF.number({multipleOf: 5})),
    getValidationErrors: () => createGetValidationErrors<TF.Number<{multipleOf: 5}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Number<{multipleOf: 5}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.number({multipleOf: 5})),
    mockType: () => createMockType<TF.Number<{multipleOf: 5}>>(),
    getSamples: () => ({valid: [0, 5, 10, -15], invalid: [3, 7]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: 5, formatPathTail: 'multipleOf'},
      {name: 'numberFormat', val: 5, formatPathTail: 'multipleOf'},
    ],
  },
  number_combined: {
    title: 'Combined constraints',
    description:
      'numberFormat combining min, max, integer, and multipleOf, where each invalid sample trips a distinct constraint.',
    validateNotes:
      'All four constraints enforced together: -5 fails `min`, 105 fails `max`, 7 fails `multipleOf`, 2.5 fails `integer`. Boundary values 0 and 100 pass (both inclusive, integers, and multiples of 5).',
    validate: () => createValidate<TF.Number<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
    standardSchema: () => createStandardSchema<TF.Number<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
    validateReflect: () => {
      const v: TF.Number<{min: 0; max: 100; integer: true; multipleOf: 5}> = 0;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Number<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
    deserializeValidateReflect: () => {
      const v: TF.Number<{min: 0; max: 100; integer: true; multipleOf: 5}> = 0;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Number<{min: 0; max: 100; integer: true; multipleOf: 5}> = 0;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<TF.Number<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Number<{min: 0; max: 100; integer: true; multipleOf: 5}> = 0;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Number<{min: 0; max: 100; integer: true; multipleOf: 5}> = 0;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Number<{min: 0; max: 100; integer: true; multipleOf: 5}>>>(),
    validateSchema: () => createValidate(TF.number({min: 0, max: 100, integer: true, multipleOf: 5})),
    getValidationErrors: () => createGetValidationErrors<TF.Number<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<TF.Number<{min: 0; max: 100; integer: true; multipleOf: 5}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.number({min: 0, max: 100, integer: true, multipleOf: 5})),
    mockType: () => createMockType<TF.Number<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
    getSamples: () => ({valid: [0, 5, 50, 100], invalid: [-5, 105, 7, 2.5]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', formatPathTail: 'min'},
      {name: 'numberFormat', formatPathTail: 'max'},
      {name: 'numberFormat', formatPathTail: 'multipleOf'},
      {name: 'numberFormat', formatPathTail: 'integer'},
    ],
  },
  number_int8: {
    title: 'Int8',
    description: 'numberFormat preset for the integer-only signed 8-bit range [-128, 127] that selects 1-byte binary packing.',
    validateNotes:
      'Inclusive bounds min -128 / max 127, integer required: 128 fails `max`, -129 fails `min`, 1.5 fails `integer`. The fixed min/max drive the 1-byte binary packing optimization.',
    validate: () => createValidate<TF.Int8>(),
    standardSchema: () => createStandardSchema<TF.Int8>(),
    validateReflect: () => {
      const v: TF.Int8 = -128;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Int8>(),
    deserializeValidateReflect: () => {
      const v: TF.Int8 = -128;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Int8 = -128;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Int8>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Int8 = -128;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Int8 = -128;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Int8>>(),
    validateSchema: () => createValidate(TF.int8()),
    getValidationErrors: () => createGetValidationErrors<TF.Int8>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Int8>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.int8()),
    mockType: () => createMockType<TF.Int8>(),
    getSamples: () => ({valid: [-128, 0, 127], invalid: [128, -129, 1.5]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: 127, formatPathTail: 'max'},
      {name: 'numberFormat', val: -128, formatPathTail: 'min'},
      {name: 'numberFormat', val: true, formatPathTail: 'integer'},
    ],
  },
  number_uint8: {
    title: 'UInt8',
    description: 'numberFormat preset for the integer-only unsigned 8-bit range [0, 255] that selects 1-byte binary packing.',
    validateNotes:
      'Inclusive bounds min 0 / max 255, integer required: 256 fails `max`, -1 fails `min`. The fixed min/max drive the 1-byte binary packing optimization.',
    validate: () => createValidate<TF.UInt8>(),
    standardSchema: () => createStandardSchema<TF.UInt8>(),
    validateReflect: () => {
      const v: TF.UInt8 = 0;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.UInt8>(),
    deserializeValidateReflect: () => {
      const v: TF.UInt8 = 0;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.UInt8 = 0;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.UInt8>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.UInt8 = 0;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.UInt8 = 0;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.UInt8>>(),
    validateSchema: () => createValidate(TF.uint8()),
    getValidationErrors: () => createGetValidationErrors<TF.UInt8>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.UInt8>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.uint8()),
    mockType: () => createMockType<TF.UInt8>(),
    getSamples: () => ({valid: [0, 128, 255], invalid: [256, -1]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: 255, formatPathTail: 'max'},
      {name: 'numberFormat', val: 0, formatPathTail: 'min'},
    ],
  },
} as const satisfies Record<string, FormatValidationCase>;
