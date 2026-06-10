// Reflect-form thunks author a REAL example value of the (now transparent) format
// type — the case's first valid sample (e.g. 100n, 9, 'john@example.com'). The value
// only drives `T` inference and is discarded at runtime, but a realistic literal keeps
// these snippets self-explanatory and safe to lift into docs. Every form is exercised:
// validate + getValidationErrors (static / reflect / deserialize-static /
// deserialize-reflect) + mockType; the getValidationErrors format-payload forms assert
// the exact format error survives every resolution path.
import type {FormatValidationCase} from './types.ts';
import '@mionjs/ts-go-run-types/formats';
import {createValidate, createGetValidationErrors, createMockType, type DataOnly} from '@mionjs/ts-go-run-types';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {FormatBigInt, FormatBigInt64, FormatBigUInt64} from '@mionjs/ts-go-run-types/formats';

export const BIGINT_FORMAT = {
  bigint_max: {
    title: 'FormatBigInt<{max: 100n}> — inclusive upper bound',
    validate: () => createValidate<FormatBigInt<{max: 100n}>>(),
    validateReflect: () => {
      const v: FormatBigInt<{max: 100n}> = 100n;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatBigInt<{max: 100n}>>(),
    deserializeValidateReflect: () => {
      const v: FormatBigInt<{max: 100n}> = 100n;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatBigInt<{max: 100n}> = 100n;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatBigInt<{max: 100n}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatBigInt<{max: 100n}> = 100n;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatBigInt<{max: 100n}> = 100n;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatBigInt<{max: 100n}>>>(),
    validateSchema: () => createValidate(RT.bigint({max: 100n})),
    getValidationErrors: () => createGetValidationErrors<FormatBigInt<{max: 100n}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatBigInt<{max: 100n}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.bigint({max: 100n})),
    mockType: () => createMockType<FormatBigInt<{max: 100n}>>(),
    getSamples: () => ({valid: [100n, 0n, -50n], invalid: [101n, 5]}),
    expectedFormatErrors: () => [{name: 'bigintFormat', val: 100n, formatPathTail: 'max'}, null],
  },
  bigint_min: {
    title: 'FormatBigInt<{min: 0n}> — inclusive lower bound',
    validate: () => createValidate<FormatBigInt<{min: 0n}>>(),
    validateReflect: () => {
      const v: FormatBigInt<{min: 0n}> = 0n;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatBigInt<{min: 0n}>>(),
    deserializeValidateReflect: () => {
      const v: FormatBigInt<{min: 0n}> = 0n;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatBigInt<{min: 0n}> = 0n;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatBigInt<{min: 0n}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatBigInt<{min: 0n}> = 0n;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatBigInt<{min: 0n}> = 0n;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatBigInt<{min: 0n}>>>(),
    validateSchema: () => createValidate(RT.bigint({min: 0n})),
    getValidationErrors: () => createGetValidationErrors<FormatBigInt<{min: 0n}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatBigInt<{min: 0n}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.bigint({min: 0n})),
    mockType: () => createMockType<FormatBigInt<{min: 0n}>>(),
    getSamples: () => ({valid: [0n, 1n, 9999n], invalid: [-1n]}),
    expectedFormatErrors: () => [{name: 'bigintFormat', val: 0n, formatPathTail: 'min'}],
  },
  bigint_lt: {
    title: 'FormatBigInt<{lt: 10n}> — exclusive upper bound',
    validate: () => createValidate<FormatBigInt<{lt: 10n}>>(),
    validateReflect: () => {
      const v: FormatBigInt<{lt: 10n}> = 9n;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatBigInt<{lt: 10n}>>(),
    deserializeValidateReflect: () => {
      const v: FormatBigInt<{lt: 10n}> = 9n;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatBigInt<{lt: 10n}> = 9n;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatBigInt<{lt: 10n}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatBigInt<{lt: 10n}> = 9n;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatBigInt<{lt: 10n}> = 9n;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatBigInt<{lt: 10n}>>>(),
    validateSchema: () => createValidate(RT.bigint({lt: 10n})),
    getValidationErrors: () => createGetValidationErrors<FormatBigInt<{lt: 10n}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatBigInt<{lt: 10n}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.bigint({lt: 10n})),
    mockType: () => createMockType<FormatBigInt<{lt: 10n}>>(),
    getSamples: () => ({valid: [9n, -5n], invalid: [10n, 11n]}),
    expectedFormatErrors: () => [
      {name: 'bigintFormat', val: 10n, formatPathTail: 'lt'},
      {name: 'bigintFormat', val: 10n, formatPathTail: 'lt'},
    ],
  },
  bigint_gt: {
    title: 'FormatBigInt<{gt: 0n}> — exclusive lower bound',
    validate: () => createValidate<FormatBigInt<{gt: 0n}>>(),
    validateReflect: () => {
      const v: FormatBigInt<{gt: 0n}> = 1n;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatBigInt<{gt: 0n}>>(),
    deserializeValidateReflect: () => {
      const v: FormatBigInt<{gt: 0n}> = 1n;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatBigInt<{gt: 0n}> = 1n;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatBigInt<{gt: 0n}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatBigInt<{gt: 0n}> = 1n;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatBigInt<{gt: 0n}> = 1n;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatBigInt<{gt: 0n}>>>(),
    validateSchema: () => createValidate(RT.bigint({gt: 0n})),
    getValidationErrors: () => createGetValidationErrors<FormatBigInt<{gt: 0n}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatBigInt<{gt: 0n}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.bigint({gt: 0n})),
    mockType: () => createMockType<FormatBigInt<{gt: 0n}>>(),
    getSamples: () => ({valid: [1n, 100n], invalid: [0n, -1n]}),
    expectedFormatErrors: () => [
      {name: 'bigintFormat', val: 0n, formatPathTail: 'gt'},
      {name: 'bigintFormat', val: 0n, formatPathTail: 'gt'},
    ],
  },
  bigint_multipleOf: {
    title: 'FormatBigInt<{multipleOf: 5n}> — divisible by 5',
    validate: () => createValidate<FormatBigInt<{multipleOf: 5n}>>(),
    validateReflect: () => {
      const v: FormatBigInt<{multipleOf: 5n}> = 0n;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatBigInt<{multipleOf: 5n}>>(),
    deserializeValidateReflect: () => {
      const v: FormatBigInt<{multipleOf: 5n}> = 0n;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatBigInt<{multipleOf: 5n}> = 0n;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatBigInt<{multipleOf: 5n}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatBigInt<{multipleOf: 5n}> = 0n;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatBigInt<{multipleOf: 5n}> = 0n;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatBigInt<{multipleOf: 5n}>>>(),
    validateSchema: () => createValidate(RT.bigint({multipleOf: 5n})),
    getValidationErrors: () => createGetValidationErrors<FormatBigInt<{multipleOf: 5n}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatBigInt<{multipleOf: 5n}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.bigint({multipleOf: 5n})),
    mockType: () => createMockType<FormatBigInt<{multipleOf: 5n}>>(),
    getSamples: () => ({valid: [0n, 5n, -15n], invalid: [3n, 7n]}),
    expectedFormatErrors: () => [
      {name: 'bigintFormat', val: 5n, formatPathTail: 'multipleOf'},
      {name: 'bigintFormat', val: 5n, formatPathTail: 'multipleOf'},
    ],
  },
  bigint_combined: {
    title: 'FormatBigInt<{min:0n; max:1000n; multipleOf:10n}> — all constraints',
    validate: () => createValidate<FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
    validateReflect: () => {
      const v: FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}> = 0n;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
    deserializeValidateReflect: () => {
      const v: FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}> = 0n;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}> = 0n;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}> = 0n;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}> = 0n;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>>(),
    validateSchema: () => createValidate(RT.bigint({min: 0n, max: 1000n, multipleOf: 10n})),
    getValidationErrors: () => createGetValidationErrors<FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatBigInt<{min: 0n; max: 1000n; multipleOf: 10n}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.bigint({min: 0n, max: 1000n, multipleOf: 10n})),
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
    validate: () => createValidate<FormatBigInt64>(),
    validateReflect: () => {
      const v: FormatBigInt64 = -9223372036854775808n;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatBigInt64>(),
    deserializeValidateReflect: () => {
      const v: FormatBigInt64 = -9223372036854775808n;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatBigInt64 = -9223372036854775808n;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatBigInt64>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatBigInt64 = -9223372036854775808n;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatBigInt64 = -9223372036854775808n;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatBigInt64>>(),
    validateSchema: () => createValidate(RT.bigInt64()),
    getValidationErrors: () => createGetValidationErrors<FormatBigInt64>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatBigInt64>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.bigInt64()),
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
    validate: () => createValidate<FormatBigUInt64>(),
    validateReflect: () => {
      const v: FormatBigUInt64 = 0n;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatBigUInt64>(),
    deserializeValidateReflect: () => {
      const v: FormatBigUInt64 = 0n;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatBigUInt64 = 0n;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatBigUInt64>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatBigUInt64 = 0n;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatBigUInt64 = 0n;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatBigUInt64>>(),
    validateSchema: () => createValidate(RT.bigUInt64()),
    getValidationErrors: () => createGetValidationErrors<FormatBigUInt64>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatBigUInt64>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.bigUInt64()),
    mockType: () => createMockType<FormatBigUInt64>(),
    getSamples: () => ({valid: [0n, 18446744073709551615n], invalid: [18446744073709551616n, -1n]}),
    expectedFormatErrors: () => [
      {name: 'bigintFormat', val: 18446744073709551615n, formatPathTail: 'max'},
      {name: 'bigintFormat', val: 0n, formatPathTail: 'min'},
    ],
  },
} as const satisfies Record<string, FormatValidationCase>;
