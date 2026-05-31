import type {FormatValidationCase} from './types.ts';
import '@mionjs/ts-go-run-types/formats';
import {createIsType, createGetTypeErrors, createMockType} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {FormatBigInt, FormatBigInt64, FormatBigUInt64} from '@mionjs/ts-go-run-types/formats';

export const BIGINT_FORMAT = {
  bigint_max: {
    title: 'FormatBigInt<{max: 100n}> — inclusive upper bound',
    isType: () => createIsType<FormatBigInt<{max: 100n}>>(),
    isTypeSchema: () => createIsType(RT.bigint({max: 100n})),
    getTypeErrors: () => createGetTypeErrors<FormatBigInt<{max: 100n}>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.bigint({max: 100n})),
    mockType: () => createMockType<FormatBigInt<{max: 100n}>>(),
    getSamples: () => ({valid: [100n, 0n, -50n], invalid: [101n, 5]}),
    expectedFormatErrors: () => [{name: 'bigintFormat', val: 100n, formatPathTail: 'max'}, null],
  },
  bigint_min: {
    title: 'FormatBigInt<{min: 0n}> — inclusive lower bound',
    isType: () => createIsType<FormatBigInt<{min: 0n}>>(),
    isTypeSchema: () => createIsType(RT.bigint({min: 0n})),
    getTypeErrors: () => createGetTypeErrors<FormatBigInt<{min: 0n}>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.bigint({min: 0n})),
    mockType: () => createMockType<FormatBigInt<{min: 0n}>>(),
    getSamples: () => ({valid: [0n, 1n, 9999n], invalid: [-1n]}),
    expectedFormatErrors: () => [{name: 'bigintFormat', val: 0n, formatPathTail: 'min'}],
  },
  bigint_lt: {
    title: 'FormatBigInt<{lt: 10n}> — exclusive upper bound',
    isType: () => createIsType<FormatBigInt<{lt: 10n}>>(),
    isTypeSchema: () => createIsType(RT.bigint({lt: 10n})),
    getTypeErrors: () => createGetTypeErrors<FormatBigInt<{lt: 10n}>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.bigint({lt: 10n})),
    mockType: () => createMockType<FormatBigInt<{lt: 10n}>>(),
    getSamples: () => ({valid: [9n, -5n], invalid: [10n, 11n]}),
    expectedFormatErrors: () => [
      {name: 'bigintFormat', val: 10n, formatPathTail: 'lt'},
      {name: 'bigintFormat', val: 10n, formatPathTail: 'lt'},
    ],
  },
  bigint_gt: {
    title: 'FormatBigInt<{gt: 0n}> — exclusive lower bound',
    isType: () => createIsType<FormatBigInt<{gt: 0n}>>(),
    isTypeSchema: () => createIsType(RT.bigint({gt: 0n})),
    getTypeErrors: () => createGetTypeErrors<FormatBigInt<{gt: 0n}>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.bigint({gt: 0n})),
    mockType: () => createMockType<FormatBigInt<{gt: 0n}>>(),
    getSamples: () => ({valid: [1n, 100n], invalid: [0n, -1n]}),
    expectedFormatErrors: () => [
      {name: 'bigintFormat', val: 0n, formatPathTail: 'gt'},
      {name: 'bigintFormat', val: 0n, formatPathTail: 'gt'},
    ],
  },
  bigint_multipleOf: {
    title: 'FormatBigInt<{multipleOf: 5n}> — divisible by 5',
    isType: () => createIsType<FormatBigInt<{multipleOf: 5n}>>(),
    isTypeSchema: () => createIsType(RT.bigint({multipleOf: 5n})),
    getTypeErrors: () => createGetTypeErrors<FormatBigInt<{multipleOf: 5n}>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.bigint({multipleOf: 5n})),
    mockType: () => createMockType<FormatBigInt<{multipleOf: 5n}>>(),
    getSamples: () => ({valid: [0n, 5n, -15n], invalid: [3n, 7n]}),
    expectedFormatErrors: () => [
      {name: 'bigintFormat', val: 5n, formatPathTail: 'multipleOf'},
      {name: 'bigintFormat', val: 5n, formatPathTail: 'multipleOf'},
    ],
  },
  bigint_combined: {
    title: 'FormatBigInt<{min:0n; max:1000n; multipleOf:10n}> — all constraints',
    isType: () => createIsType<FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
    isTypeSchema: () => createIsType(RT.bigint({min: 0n, max: 1000n, multipleOf: 10n})),
    getTypeErrors: () => createGetTypeErrors<FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.bigint({min: 0n, max: 1000n, multipleOf: 10n})),
    mockType: () => createMockType<FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
    getSamples: () => ({valid: [0n, 10n, 1000n], invalid: [-10n, 1010n, 7n]}),
    expectedFormatErrors: () => [
      {name: 'bigintFormat', formatPathTail: 'min'},
      {name: 'bigintFormat', formatPathTail: 'max'},
      {name: 'bigintFormat', formatPathTail: 'multipleOf'},
    ],
  },
  bigint_int64: {
    title: 'FormatBigInt64 — full signed 64-bit range',
    isType: () => createIsType<FormatBigInt64>(),
    isTypeSchema: () => createIsType(RT.bigInt64()),
    getTypeErrors: () => createGetTypeErrors<FormatBigInt64>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.bigInt64()),
    mockType: () => createMockType<FormatBigInt64>(),
    getSamples: () => ({
      valid: [-9223372036854775808n, 0n, 9223372036854775807n],
      invalid: [9223372036854775808n, -9223372036854775809n],
    }),
    expectedFormatErrors: () => [
      {name: 'bigintFormat', val: 9223372036854775807n, formatPathTail: 'max'},
      {name: 'bigintFormat', val: -9223372036854775808n, formatPathTail: 'min'},
    ],
  },
  bigint_uint64: {
    title: 'FormatBigUInt64 — full unsigned 64-bit range',
    isType: () => createIsType<FormatBigUInt64>(),
    isTypeSchema: () => createIsType(RT.bigUInt64()),
    getTypeErrors: () => createGetTypeErrors<FormatBigUInt64>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.bigUInt64()),
    mockType: () => createMockType<FormatBigUInt64>(),
    getSamples: () => ({valid: [0n, 18446744073709551615n], invalid: [18446744073709551616n, -1n]}),
    expectedFormatErrors: () => [
      {name: 'bigintFormat', val: 18446744073709551615n, formatPathTail: 'max'},
      {name: 'bigintFormat', val: 0n, formatPathTail: 'min'},
    ],
  },
} as const satisfies Record<string, FormatValidationCase>;
