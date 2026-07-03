// Currency format cases — `TF.Currency<P>` is a number branded as a monetary
// amount: validation and mocking are identical to `TF.Number<P>` (same params
// surface); the brand's job is semantic — every format error carries
// `name: 'currency'`, the discriminator `createFriendlyI18n` uses to render a
// violated bound via `Intl.NumberFormat(locale, {style: 'currency', currency})`
// with the app-supplied currency code. WHICH currency a value is in is runtime
// data, deliberately never a type param.
import * as TF from 'ts-runtypes/formats';
import type {FormatValidationCase} from './types.ts';
import 'ts-runtypes/formats';
import {createValidate, createGetValidationErrors, createMockType, createStandardSchema, type DataOnly} from 'ts-runtypes';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

export const CURRENCY = {
  currency_plain: {
    title: 'Unconstrained currency amount',
    description: 'A bare Currency brand: validates as a plain number (the brand is semantic, not a constraint).',
    validateNotes:
      'Any finite number passes — the currency brand adds no numeric constraint of its own. A non-number ("5") fails the number typeof gate.',
    validate: () => createValidate<TF.Currency>(),
    standardSchema: () => createStandardSchema<TF.Currency>(),
    validateReflect: () => {
      const v: TF.Currency = 19.99;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Currency>(),
    deserializeValidateReflect: () => {
      const v: TF.Currency = 19.99;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Currency = 19.99;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Currency>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Currency = 19.99;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Currency = 19.99;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Currency>>(),
    validateSchema: () => createValidate(TF.currency()),
    getValidationErrors: () => createGetValidationErrors<TF.Currency>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Currency>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.currency()),
    mockType: () => createMockType<TF.Currency>(),
    getSamples: () => ({valid: [19.99, 0, -50.25], invalid: ['5']}),
    expectedFormatErrors: () => [null],
  },
  currency_max: {
    title: 'Currency with inclusive max',
    description: 'Currency with an upper bound; the format error carries name currency (the friendly-renderer discriminator).',
    validateNotes:
      'Boundary value 100 passes (inclusive); 101 fails on `max` with a `currency`-named format error. A non-number ("5") fails the number typeof gate before any format check.',
    validate: () => createValidate<TF.Currency<{max: 100}>>(),
    standardSchema: () => createStandardSchema<TF.Currency<{max: 100}>>(),
    // One hand-authored Standard Schema expectation per file (see
    // NumberFormat.ts): pins the consumer-facing {message, path} output — and
    // here specifically that the issue's format payload carries the `currency`
    // brand name end-to-end.
    getExpectedStandardErrors: () => [
      [
        {
          message: 'Failed max constraint (100)',
          path: [],
          expected: 'number',
          format: {name: 'currency', formatPath: ['max'], val: 100},
        },
      ],
      [{message: 'Expected number', path: [], expected: 'number'}],
    ],
    validateReflect: () => {
      const v: TF.Currency<{max: 100}> = 100;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Currency<{max: 100}>>(),
    deserializeValidateReflect: () => {
      const v: TF.Currency<{max: 100}> = 100;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Currency<{max: 100}> = 100;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Currency<{max: 100}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Currency<{max: 100}> = 100;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Currency<{max: 100}> = 100;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Currency<{max: 100}>>>(),
    validateSchema: () => createValidate(TF.currency({max: 100})),
    getValidationErrors: () => createGetValidationErrors<TF.Currency<{max: 100}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Currency<{max: 100}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.currency({max: 100})),
    mockType: () => createMockType<TF.Currency<{max: 100}>>(),
    getSamples: () => ({valid: [100, 0, -50], invalid: [101, '5']}),
    expectedFormatErrors: () => [{name: 'currency', val: 100, formatPathTail: 'max'}, null],
  },
  currency_minor_units: {
    title: 'Currency in integer minor units',
    description:
      'Currency stored as integer minor units (cents) with a uint16 range; validation mirrors the equivalent Number brand.',
    validateNotes:
      'Non-integers fail on `integer`; values above 65535 fail on `max`; negatives fail on `min`. The [0, 65535] bounds also drive the 2-byte binary packing (see the format-serialization suite).',
    validate: () => createValidate<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    standardSchema: () => createStandardSchema<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    validateReflect: () => {
      const v: TF.Currency<{integer: true; min: 0; max: 65535}> = 1999;
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    deserializeValidateReflect: () => {
      const v: TF.Currency<{integer: true; min: 0; max: 65535}> = 1999;
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: TF.Currency<{integer: true; min: 0; max: 65535}> = 1999;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: TF.Currency<{integer: true; min: 0; max: 65535}> = 1999;
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: TF.Currency<{integer: true; min: 0; max: 65535}> = 1999;
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<TF.Currency<{integer: true; min: 0; max: 65535}>>>(),
    validateSchema: () => createValidate(TF.currency({integer: true, min: 0, max: 65535})),
    getValidationErrors: () => createGetValidationErrors<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<TF.Currency<{integer: true; min: 0; max: 65535}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TF.currency({integer: true, min: 0, max: 65535})),
    mockType: () => createMockType<TF.Currency<{integer: true; min: 0; max: 65535}>>(),
    getSamples: () => ({valid: [0, 1999, 65535], invalid: [19.99, 65536, -1]}),
    expectedFormatErrors: () => [
      {name: 'currency', val: true, formatPathTail: 'integer'},
      {name: 'currency', val: 65535, formatPathTail: 'max'},
      {name: 'currency', val: 0, formatPathTail: 'min'},
    ],
  },
} as const satisfies Record<string, FormatValidationCase>;
