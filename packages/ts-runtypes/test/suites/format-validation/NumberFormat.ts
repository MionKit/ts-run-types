// Reflect-form thunks author a REAL example value of the (now transparent) format
// type — the case's first valid sample (e.g. 100n, 9, 'john@example.com'). The value
// only drives `T` inference and is discarded at runtime, but a realistic literal keeps
// these snippets self-explanatory and safe to lift into docs. Every form is exercised:
// validate + getValidationErrors (static / reflect / deserialize-static /
// deserialize-reflect) + mockType; the getValidationErrors format-payload forms assert
// the exact format error survives every resolution path.
import type {FormatValidationCase} from './types.ts';
import 'ts-runtypes/formats';
import {createValidate, createGetValidationErrors, createMockType, type DataOnly} from 'ts-runtypes';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';
import * as RT from 'ts-runtypes/schema';
import type {FormatNumber, FormatInteger, FormatFloat, FormatInt8, FormatUInt8} from 'ts-runtypes/formats';

export const NUMBER_FORMAT = {
  number_max: {
    title: 'Inclusive max',
    description: 'numberFormat with an inclusive upper bound that rejects numbers above max.',
    validateNotes:
      'Boundary value 100 passes (inclusive); 101 fails on `max`. A non-number ("5") fails the number typeof gate before any format check.',
    validate: () => createValidate<FormatNumber<{max: 100}>>(),
    validateReflect: () => {
      const v: FormatNumber<{max: 100}> = 100;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatNumber<{max: 100}>>(),
    deserializeValidateReflect: () => {
      const v: FormatNumber<{max: 100}> = 100;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatNumber<{max: 100}> = 100;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatNumber<{max: 100}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatNumber<{max: 100}> = 100;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatNumber<{max: 100}> = 100;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatNumber<{max: 100}>>>(),
    validateSchema: () => createValidate(RT.number({max: 100})),
    getValidationErrors: () => createGetValidationErrors<FormatNumber<{max: 100}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatNumber<{max: 100}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.number({max: 100})),
    mockType: () => createMockType<FormatNumber<{max: 100}>>(),
    getSamples: () => ({valid: [100, 0, -50], invalid: [101, '5']}),
    expectedFormatErrors: () => [{name: 'numberFormat', val: 100, formatPathTail: 'max'}, null],
  },
  number_min: {
    title: 'Inclusive min',
    description: 'numberFormat with an inclusive lower bound that rejects numbers below min, equivalent to FormatPositive.',
    validateNotes: 'Boundary value 0 passes (inclusive); -1 fails on `min`.',
    validate: () => createValidate<FormatNumber<{min: 0}>>(),
    validateReflect: () => {
      const v: FormatNumber<{min: 0}> = 0;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatNumber<{min: 0}>>(),
    deserializeValidateReflect: () => {
      const v: FormatNumber<{min: 0}> = 0;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatNumber<{min: 0}> = 0;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatNumber<{min: 0}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatNumber<{min: 0}> = 0;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatNumber<{min: 0}> = 0;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatNumber<{min: 0}>>>(),
    validateSchema: () => createValidate(RT.number({min: 0})),
    getValidationErrors: () => createGetValidationErrors<FormatNumber<{min: 0}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatNumber<{min: 0}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.number({min: 0})),
    mockType: () => createMockType<FormatNumber<{min: 0}>>(),
    getSamples: () => ({valid: [0, 1, 9999], invalid: [-1]}),
    expectedFormatErrors: () => [{name: 'numberFormat', val: 0, formatPathTail: 'min'}],
  },
  number_lt: {
    title: 'Exclusive max',
    description: 'numberFormat with an exclusive upper bound where the bound itself is rejected.',
    validateNotes:
      'Exclusive `lt`: 9 passes but the boundary 10 fails (and 11 above it). Lower bound is unconstrained, so -100 passes.',
    validate: () => createValidate<FormatNumber<{lt: 10}>>(),
    validateReflect: () => {
      const v: FormatNumber<{lt: 10}> = 9;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatNumber<{lt: 10}>>(),
    deserializeValidateReflect: () => {
      const v: FormatNumber<{lt: 10}> = 9;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatNumber<{lt: 10}> = 9;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatNumber<{lt: 10}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatNumber<{lt: 10}> = 9;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatNumber<{lt: 10}> = 9;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatNumber<{lt: 10}>>>(),
    validateSchema: () => createValidate(RT.number({lt: 10})),
    getValidationErrors: () => createGetValidationErrors<FormatNumber<{lt: 10}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatNumber<{lt: 10}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.number({lt: 10})),
    mockType: () => createMockType<FormatNumber<{lt: 10}>>(),
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
    validate: () => createValidate<FormatNumber<{gt: 0}>>(),
    validateReflect: () => {
      const v: FormatNumber<{gt: 0}> = 1;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatNumber<{gt: 0}>>(),
    deserializeValidateReflect: () => {
      const v: FormatNumber<{gt: 0}> = 1;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatNumber<{gt: 0}> = 1;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatNumber<{gt: 0}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatNumber<{gt: 0}> = 1;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatNumber<{gt: 0}> = 1;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatNumber<{gt: 0}>>>(),
    validateSchema: () => createValidate(RT.number({gt: 0})),
    getValidationErrors: () => createGetValidationErrors<FormatNumber<{gt: 0}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatNumber<{gt: 0}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.number({gt: 0})),
    mockType: () => createMockType<FormatNumber<{gt: 0}>>(),
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
    validate: () => createValidate<FormatInteger>(),
    validateReflect: () => {
      const v: FormatInteger = 0;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatInteger>(),
    deserializeValidateReflect: () => {
      const v: FormatInteger = 0;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatInteger = 0;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatInteger>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatInteger = 0;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatInteger = 0;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatInteger>>(),
    validateSchema: () => createValidate(RT.integer()),
    getValidationErrors: () => createGetValidationErrors<FormatInteger>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatInteger>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.integer()),
    mockType: () => createMockType<FormatInteger>(),
    getSamples: () => ({valid: [0, 1, -1, 42], invalid: [1.5, 3.14]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: true, formatPathTail: 'integer'},
      {name: 'numberFormat', val: true, formatPathTail: 'integer'},
    ],
  },
  number_float: {
    title: 'Float',
    description: 'numberFormat with the `float` flag that rejects whole numbers, the inverse of FormatInteger.',
    validateNotes:
      'Fractional values (1.5, -0.5, 3.14) pass; whole numbers (1, 0, -2) fail on `float`. `float` and `integer` are mutually exclusive.',
    validate: () => createValidate<FormatFloat>(),
    validateReflect: () => {
      const v: FormatFloat = 1.5;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatFloat>(),
    deserializeValidateReflect: () => {
      const v: FormatFloat = 1.5;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatFloat = 1.5;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatFloat>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatFloat = 1.5;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatFloat = 1.5;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatFloat>>(),
    validateSchema: () => createValidate(RT.float()),
    getValidationErrors: () => createGetValidationErrors<FormatFloat>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatFloat>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.float()),
    mockType: () => createMockType<FormatFloat>(),
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
    validate: () => createValidate<FormatNumber<{multipleOf: 5}>>(),
    validateReflect: () => {
      const v: FormatNumber<{multipleOf: 5}> = 0;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatNumber<{multipleOf: 5}>>(),
    deserializeValidateReflect: () => {
      const v: FormatNumber<{multipleOf: 5}> = 0;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatNumber<{multipleOf: 5}> = 0;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatNumber<{multipleOf: 5}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatNumber<{multipleOf: 5}> = 0;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatNumber<{multipleOf: 5}> = 0;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatNumber<{multipleOf: 5}>>>(),
    validateSchema: () => createValidate(RT.number({multipleOf: 5})),
    getValidationErrors: () => createGetValidationErrors<FormatNumber<{multipleOf: 5}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatNumber<{multipleOf: 5}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.number({multipleOf: 5})),
    mockType: () => createMockType<FormatNumber<{multipleOf: 5}>>(),
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
    validate: () => createValidate<FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
    validateReflect: () => {
      const v: FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}> = 0;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
    deserializeValidateReflect: () => {
      const v: FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}> = 0;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}> = 0;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}> = 0;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}> = 0;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>>>(),
    validateSchema: () => createValidate(RT.number({min: 0, max: 100, integer: true, multipleOf: 5})),
    getValidationErrors: () => createGetValidationErrors<FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.number({min: 0, max: 100, integer: true, multipleOf: 5})),
    mockType: () => createMockType<FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
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
    validate: () => createValidate<FormatInt8>(),
    validateReflect: () => {
      const v: FormatInt8 = -128;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatInt8>(),
    deserializeValidateReflect: () => {
      const v: FormatInt8 = -128;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatInt8 = -128;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatInt8>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatInt8 = -128;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatInt8 = -128;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatInt8>>(),
    validateSchema: () => createValidate(RT.int8()),
    getValidationErrors: () => createGetValidationErrors<FormatInt8>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatInt8>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.int8()),
    mockType: () => createMockType<FormatInt8>(),
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
    validate: () => createValidate<FormatUInt8>(),
    validateReflect: () => {
      const v: FormatUInt8 = 0;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatUInt8>(),
    deserializeValidateReflect: () => {
      const v: FormatUInt8 = 0;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatUInt8 = 0;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatUInt8>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatUInt8 = 0;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatUInt8 = 0;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatUInt8>>(),
    validateSchema: () => createValidate(RT.uint8()),
    getValidationErrors: () => createGetValidationErrors<FormatUInt8>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatUInt8>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.uint8()),
    mockType: () => createMockType<FormatUInt8>(),
    getSamples: () => ({valid: [0, 128, 255], invalid: [256, -1]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: 255, formatPathTail: 'max'},
      {name: 'numberFormat', val: 0, formatPathTail: 'min'},
    ],
  },
} as const satisfies Record<string, FormatValidationCase>;
