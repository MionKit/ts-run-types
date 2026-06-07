import type {FormatValidationCase} from './types.ts';
import '@mionjs/ts-go-run-types/formats';
import {createIsType, createGetTypeErrors, createMockType} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {FormatNumber, FormatInteger, FormatFloat, FormatInt8, FormatUInt8} from '@mionjs/ts-go-run-types/formats';

export const NUMBER_FORMAT = {
  number_max: {
    title: 'FormatNumber<{max: 100}> — inclusive upper bound',
    isType: () => createIsType<FormatNumber<{max: 100}>>(),
    isTypeSchema: () => createIsType(RT.number({max: 100})),
    getTypeErrors: () => createGetTypeErrors<FormatNumber<{max: 100}>>(),
    mockType: () => createMockType<FormatNumber<{max: 100}>>(),
    getSamples: () => ({valid: [100, 0, -50], invalid: [101, '5']}),
    expectedFormatErrors: () => [{name: 'numberFormat', val: 100, formatPathTail: 'max'}, null],
  },
  number_min: {
    title: 'FormatNumber<{min: 0}> — inclusive lower bound',
    isType: () => createIsType<FormatNumber<{min: 0}>>(),
    isTypeSchema: () => createIsType(RT.number({min: 0})),
    getTypeErrors: () => createGetTypeErrors<FormatNumber<{min: 0}>>(),
    mockType: () => createMockType<FormatNumber<{min: 0}>>(),
    getSamples: () => ({valid: [0, 1, 9999], invalid: [-1]}),
    expectedFormatErrors: () => [{name: 'numberFormat', val: 0, formatPathTail: 'min'}],
  },
  number_lt: {
    title: 'FormatNumber<{lt: 10}> — exclusive upper bound',
    isType: () => createIsType<FormatNumber<{lt: 10}>>(),
    isTypeSchema: () => createIsType(RT.number({lt: 10})),
    getTypeErrors: () => createGetTypeErrors<FormatNumber<{lt: 10}>>(),
    mockType: () => createMockType<FormatNumber<{lt: 10}>>(),
    getSamples: () => ({valid: [9, 0, -100], invalid: [10, 11]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: 10, formatPathTail: 'lt'},
      {name: 'numberFormat', val: 10, formatPathTail: 'lt'},
    ],
  },
  number_gt: {
    title: 'FormatNumber<{gt: 0}> — exclusive lower bound',
    isType: () => createIsType<FormatNumber<{gt: 0}>>(),
    isTypeSchema: () => createIsType(RT.number({gt: 0})),
    getTypeErrors: () => createGetTypeErrors<FormatNumber<{gt: 0}>>(),
    mockType: () => createMockType<FormatNumber<{gt: 0}>>(),
    getSamples: () => ({valid: [1, 100], invalid: [0, -1]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: 0, formatPathTail: 'gt'},
      {name: 'numberFormat', val: 0, formatPathTail: 'gt'},
    ],
  },
  number_integer: {
    title: 'FormatInteger — whole numbers only',
    isType: () => createIsType<FormatInteger>(),
    isTypeSchema: () => createIsType(RT.integer()),
    getTypeErrors: () => createGetTypeErrors<FormatInteger>(),
    mockType: () => createMockType<FormatInteger>(),
    getSamples: () => ({valid: [0, 1, -1, 42], invalid: [1.5, 3.14]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: true, formatPathTail: 'integer'},
      {name: 'numberFormat', val: true, formatPathTail: 'integer'},
    ],
  },
  number_float: {
    title: 'FormatFloat — non-integer only',
    isType: () => createIsType<FormatFloat>(),
    isTypeSchema: () => createIsType(RT.float()),
    getTypeErrors: () => createGetTypeErrors<FormatFloat>(),
    mockType: () => createMockType<FormatFloat>(),
    getSamples: () => ({valid: [1.5, -0.5, 3.14], invalid: [1, 0, -2]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: true, formatPathTail: 'float'},
      {name: 'numberFormat', val: true, formatPathTail: 'float'},
      {name: 'numberFormat', val: true, formatPathTail: 'float'},
    ],
  },
  number_multipleOf: {
    title: 'FormatNumber<{multipleOf: 5}> — divisible by 5',
    isType: () => createIsType<FormatNumber<{multipleOf: 5}>>(),
    isTypeSchema: () => createIsType(RT.number({multipleOf: 5})),
    getTypeErrors: () => createGetTypeErrors<FormatNumber<{multipleOf: 5}>>(),
    mockType: () => createMockType<FormatNumber<{multipleOf: 5}>>(),
    getSamples: () => ({valid: [0, 5, 10, -15], invalid: [3, 7]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: 5, formatPathTail: 'multipleOf'},
      {name: 'numberFormat', val: 5, formatPathTail: 'multipleOf'},
    ],
  },
  number_combined: {
    title: 'FormatNumber<{min:0; max:100; integer:true; multipleOf:5}> — all constraints',
    isType: () => createIsType<FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
    isTypeSchema: () => createIsType(RT.number({min: 0, max: 100, integer: true, multipleOf: 5})),
    getTypeErrors: () => createGetTypeErrors<FormatNumber<{min: 0; max: 100; integer: true; multipleOf: 5}>>(),
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
    title: 'FormatInt8 — signed 8-bit range',
    isType: () => createIsType<FormatInt8>(),
    isTypeSchema: () => createIsType(RT.int8()),
    getTypeErrors: () => createGetTypeErrors<FormatInt8>(),
    mockType: () => createMockType<FormatInt8>(),
    getSamples: () => ({valid: [-128, 0, 127], invalid: [128, -129, 1.5]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: 127, formatPathTail: 'max'},
      {name: 'numberFormat', val: -128, formatPathTail: 'min'},
      {name: 'numberFormat', val: true, formatPathTail: 'integer'},
    ],
  },
  number_uint8: {
    title: 'FormatUInt8 — unsigned 8-bit range',
    isType: () => createIsType<FormatUInt8>(),
    isTypeSchema: () => createIsType(RT.uint8()),
    getTypeErrors: () => createGetTypeErrors<FormatUInt8>(),
    mockType: () => createMockType<FormatUInt8>(),
    getSamples: () => ({valid: [0, 128, 255], invalid: [256, -1]}),
    expectedFormatErrors: () => [
      {name: 'numberFormat', val: 255, formatPathTail: 'max'},
      {name: 'numberFormat', val: 0, formatPathTail: 'min'},
    ],
  },
} as const satisfies Record<string, FormatValidationCase>;
