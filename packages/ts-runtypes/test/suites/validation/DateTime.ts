// validation / DateTime — the date/time family grouped together: JS `Date`
// (also kept in Atomic) plus all 8 TC39 `Temporal` types. Each is a leaf with
// no child types; validation is a plain `instanceof` check (Date additionally
// rejects Invalid Date). Mirrors the `ValidationCase` shape used by Atomic.
//
// Temporal is the polyfill global in tests (see test/support/setup.ts); the types
// resolve via test/support/temporal-ambient.d.ts. The `createX<T>()` factories must be
// called with a concrete type literally at the call site (the vite plugin
// injects the resolved id there), so each thunk spells out its own factory and
// the reflect thunks annotate a runtime value with the concrete type.

import * as TF from 'ts-runtypes/formats';
import * as TFT from 'ts-runtypes/formats/temporal';
import type {ValidationCase} from './types.ts';
import {createValidate, createGetValidationErrors, createMockType, createStandardSchema, type DataOnly} from 'ts-runtypes';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

const T = (globalThis as {Temporal: typeof Temporal}).Temporal;

export const DATETIME = {
  // Duplicated from Atomic.ts so the date/time family reads as one group here
  // too (Atomic keeps its own copy).
  date: {
    title: 'Date',
    description: 'A Date instance, rejecting Invalid Date whose getTime() returns NaN.',
    validateNotes: [
      'Must be an actual Date instance (instanceof Date).',
      'Invalid Date instances are rejected — e.g., `new Date("not-a-date")` or `new Date(NaN)`, whose `.getTime()` returns NaN.',
    ],
    validate: () => createValidate<Date>(),
    standardSchema: () => createStandardSchema<Date>(),
    // One hand-authored Standard Schema expectation per file. Every other case
    // derives its expected issues from getExpectedErrors via runTypeErrorsToIssues
    // (the same mapping the factory uses), so this single case pins the real
    // consumer-facing {message, path} output independently: it trips if error
    // generation or the issue mapping changes. One case per file covers this
    // file's shapes without the ~265x maintenance of authoring every case.
    getExpectedStandardErrors: () => [
      [{message: 'Expected date', path: [], expected: 'date'}],
      [{message: 'Expected date', path: [], expected: 'date'}],
      [{message: 'Expected date', path: [], expected: 'date'}],
    ],
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

  instant: {
    title: 'Temporal.Instant',
    description: 'The TC39 Temporal.Instant leaf, validated by instanceof.',
    // Temporal types are validated by native identity; DataOnly's structural
    // object projection mangles them, so createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validateNotes: 'Must be a Temporal.Instant instance (instanceof).',
    validate: () => createValidate<Temporal.Instant>(),
    standardSchema: () => createStandardSchema<Temporal.Instant>(),
    validateDataOnly: () => createValidate<DataOnly<Temporal.Instant>>(),
    validateSchema: () => createValidate(TFT.instant()),
    deserializeValidate: () => deserializeValidate<Temporal.Instant>(),
    validateReflect: () => {
      const v: Temporal.Instant = T.Instant.from('2020-01-15T10:30:00Z');
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Temporal.Instant = T.Instant.from('2020-01-15T10:30:00Z');
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Temporal.Instant>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Temporal.Instant>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TFT.instant()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Temporal.Instant>(),
    getValidationErrorsReflect: () => {
      const v: Temporal.Instant = T.Instant.from('2020-01-15T10:30:00Z');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Temporal.Instant = T.Instant.from('2020-01-15T10:30:00Z');
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<Temporal.Instant>(),
    mockTypeReflect: () => {
      const v: Temporal.Instant = T.Instant.from('2020-01-15T10:30:00Z');
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [T.Instant.from('2020-01-15T10:30:00Z'), T.Instant.fromEpochMilliseconds(0)],
      invalid: ['2020-01-15T10:30:00Z', T.PlainDate.from('2020-08-24')],
    }),
    getExpectedErrors: () => [[{path: [], expected: 'Temporal.Instant'}], [{path: [], expected: 'Temporal.Instant'}]],
  },

  zonedDateTime: {
    title: 'Temporal.ZonedDateTime',
    description: 'The TC39 Temporal.ZonedDateTime leaf, validated by instanceof.',
    // Temporal types are validated by native identity; DataOnly's structural
    // object projection mangles them, so createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validateNotes: 'Must be a Temporal.ZonedDateTime instance (instanceof).',
    validate: () => createValidate<Temporal.ZonedDateTime>(),
    standardSchema: () => createStandardSchema<Temporal.ZonedDateTime>(),
    validateDataOnly: () => createValidate<DataOnly<Temporal.ZonedDateTime>>(),
    validateSchema: () => createValidate(TFT.zonedDateTime()),
    deserializeValidate: () => deserializeValidate<Temporal.ZonedDateTime>(),
    validateReflect: () => {
      const v: Temporal.ZonedDateTime = T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]');
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Temporal.ZonedDateTime = T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]');
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Temporal.ZonedDateTime>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Temporal.ZonedDateTime>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TFT.zonedDateTime()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Temporal.ZonedDateTime>(),
    getValidationErrorsReflect: () => {
      const v: Temporal.ZonedDateTime = T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Temporal.ZonedDateTime = T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]');
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<Temporal.ZonedDateTime>(),
    mockTypeReflect: () => {
      const v: Temporal.ZonedDateTime = T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]');
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]')],
      invalid: ['2020-01-15T10:30:00[UTC]', T.Instant.from('2020-01-15T10:30:00Z')],
    }),
    getExpectedErrors: () => [[{path: [], expected: 'Temporal.ZonedDateTime'}], [{path: [], expected: 'Temporal.ZonedDateTime'}]],
  },

  plainDate: {
    title: 'Temporal.PlainDate',
    description: 'The TC39 Temporal.PlainDate leaf, validated by instanceof.',
    // Temporal types are validated by native identity; DataOnly's structural
    // object projection mangles them, so createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validateNotes: 'Must be a Temporal.PlainDate instance (instanceof).',
    validate: () => createValidate<Temporal.PlainDate>(),
    standardSchema: () => createStandardSchema<Temporal.PlainDate>(),
    validateDataOnly: () => createValidate<DataOnly<Temporal.PlainDate>>(),
    validateSchema: () => createValidate(TFT.plainDate()),
    deserializeValidate: () => deserializeValidate<Temporal.PlainDate>(),
    validateReflect: () => {
      const v: Temporal.PlainDate = T.PlainDate.from('2020-08-24');
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Temporal.PlainDate = T.PlainDate.from('2020-08-24');
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Temporal.PlainDate>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Temporal.PlainDate>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TFT.plainDate()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Temporal.PlainDate>(),
    getValidationErrorsReflect: () => {
      const v: Temporal.PlainDate = T.PlainDate.from('2020-08-24');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Temporal.PlainDate = T.PlainDate.from('2020-08-24');
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<Temporal.PlainDate>(),
    mockTypeReflect: () => {
      const v: Temporal.PlainDate = T.PlainDate.from('2020-08-24');
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-08-24'), T.PlainDate.from('1999-01-01')],
      invalid: ['2020-08-24', T.Instant.from('2020-01-15T10:30:00Z')],
    }),
    getExpectedErrors: () => [[{path: [], expected: 'Temporal.PlainDate'}], [{path: [], expected: 'Temporal.PlainDate'}]],
  },

  plainTime: {
    title: 'Temporal.PlainTime',
    description: 'The TC39 Temporal.PlainTime leaf, validated by instanceof.',
    // Temporal types are validated by native identity; DataOnly's structural
    // object projection mangles them, so createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validateNotes: 'Must be a Temporal.PlainTime instance (instanceof).',
    validate: () => createValidate<Temporal.PlainTime>(),
    standardSchema: () => createStandardSchema<Temporal.PlainTime>(),
    validateDataOnly: () => createValidate<DataOnly<Temporal.PlainTime>>(),
    validateSchema: () => createValidate(TFT.plainTime()),
    deserializeValidate: () => deserializeValidate<Temporal.PlainTime>(),
    validateReflect: () => {
      const v: Temporal.PlainTime = T.PlainTime.from('19:39:09');
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Temporal.PlainTime = T.PlainTime.from('19:39:09');
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Temporal.PlainTime>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Temporal.PlainTime>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TFT.plainTime()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Temporal.PlainTime>(),
    getValidationErrorsReflect: () => {
      const v: Temporal.PlainTime = T.PlainTime.from('19:39:09');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Temporal.PlainTime = T.PlainTime.from('19:39:09');
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<Temporal.PlainTime>(),
    mockTypeReflect: () => {
      const v: Temporal.PlainTime = T.PlainTime.from('19:39:09');
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [T.PlainTime.from('19:39:09'), T.PlainTime.from('00:00:00')],
      invalid: ['19:39:09', T.PlainDate.from('2020-08-24')],
    }),
    getExpectedErrors: () => [[{path: [], expected: 'Temporal.PlainTime'}], [{path: [], expected: 'Temporal.PlainTime'}]],
  },

  plainDateTime: {
    title: 'Temporal.PlainDateTime',
    description: 'The TC39 Temporal.PlainDateTime leaf, validated by instanceof.',
    // Temporal types are validated by native identity; DataOnly's structural
    // object projection mangles them, so createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validateNotes: 'Must be a Temporal.PlainDateTime instance (instanceof).',
    validate: () => createValidate<Temporal.PlainDateTime>(),
    standardSchema: () => createStandardSchema<Temporal.PlainDateTime>(),
    validateDataOnly: () => createValidate<DataOnly<Temporal.PlainDateTime>>(),
    validateSchema: () => createValidate(TFT.plainDateTime()),
    deserializeValidate: () => deserializeValidate<Temporal.PlainDateTime>(),
    validateReflect: () => {
      const v: Temporal.PlainDateTime = T.PlainDateTime.from('1995-12-07T15:00:00');
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Temporal.PlainDateTime = T.PlainDateTime.from('1995-12-07T15:00:00');
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Temporal.PlainDateTime>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Temporal.PlainDateTime>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TFT.plainDateTime()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Temporal.PlainDateTime>(),
    getValidationErrorsReflect: () => {
      const v: Temporal.PlainDateTime = T.PlainDateTime.from('1995-12-07T15:00:00');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Temporal.PlainDateTime = T.PlainDateTime.from('1995-12-07T15:00:00');
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<Temporal.PlainDateTime>(),
    mockTypeReflect: () => {
      const v: Temporal.PlainDateTime = T.PlainDateTime.from('1995-12-07T15:00:00');
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [T.PlainDateTime.from('1995-12-07T15:00:00')],
      invalid: ['1995-12-07T15:00:00', T.PlainDate.from('2020-08-24')],
    }),
    getExpectedErrors: () => [[{path: [], expected: 'Temporal.PlainDateTime'}], [{path: [], expected: 'Temporal.PlainDateTime'}]],
  },

  plainYearMonth: {
    title: 'Temporal.PlainYearMonth',
    description: 'The TC39 Temporal.PlainYearMonth leaf, validated by instanceof.',
    // Temporal types are validated by native identity; DataOnly's structural
    // object projection mangles them, so createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validateNotes: 'Must be a Temporal.PlainYearMonth instance (instanceof).',
    validate: () => createValidate<Temporal.PlainYearMonth>(),
    standardSchema: () => createStandardSchema<Temporal.PlainYearMonth>(),
    validateDataOnly: () => createValidate<DataOnly<Temporal.PlainYearMonth>>(),
    validateSchema: () => createValidate(TFT.plainYearMonth()),
    deserializeValidate: () => deserializeValidate<Temporal.PlainYearMonth>(),
    validateReflect: () => {
      const v: Temporal.PlainYearMonth = T.PlainYearMonth.from('2020-10');
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Temporal.PlainYearMonth = T.PlainYearMonth.from('2020-10');
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Temporal.PlainYearMonth>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Temporal.PlainYearMonth>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TFT.plainYearMonth()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Temporal.PlainYearMonth>(),
    getValidationErrorsReflect: () => {
      const v: Temporal.PlainYearMonth = T.PlainYearMonth.from('2020-10');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Temporal.PlainYearMonth = T.PlainYearMonth.from('2020-10');
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<Temporal.PlainYearMonth>(),
    mockTypeReflect: () => {
      const v: Temporal.PlainYearMonth = T.PlainYearMonth.from('2020-10');
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [T.PlainYearMonth.from('2020-10')],
      invalid: ['2020-10', T.PlainDate.from('2020-08-24')],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'Temporal.PlainYearMonth'}],
      [{path: [], expected: 'Temporal.PlainYearMonth'}],
    ],
  },

  plainMonthDay: {
    title: 'Temporal.PlainMonthDay',
    description: 'The TC39 Temporal.PlainMonthDay leaf, validated by instanceof.',
    // Temporal types are validated by native identity; DataOnly's structural
    // object projection mangles them, so createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validateNotes: 'Must be a Temporal.PlainMonthDay instance (instanceof).',
    validate: () => createValidate<Temporal.PlainMonthDay>(),
    standardSchema: () => createStandardSchema<Temporal.PlainMonthDay>(),
    validateDataOnly: () => createValidate<DataOnly<Temporal.PlainMonthDay>>(),
    validateSchema: () => createValidate(TFT.plainMonthDay()),
    deserializeValidate: () => deserializeValidate<Temporal.PlainMonthDay>(),
    validateReflect: () => {
      const v: Temporal.PlainMonthDay = T.PlainMonthDay.from('07-14');
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Temporal.PlainMonthDay = T.PlainMonthDay.from('07-14');
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Temporal.PlainMonthDay>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Temporal.PlainMonthDay>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TFT.plainMonthDay()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Temporal.PlainMonthDay>(),
    getValidationErrorsReflect: () => {
      const v: Temporal.PlainMonthDay = T.PlainMonthDay.from('07-14');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Temporal.PlainMonthDay = T.PlainMonthDay.from('07-14');
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<Temporal.PlainMonthDay>(),
    mockTypeReflect: () => {
      const v: Temporal.PlainMonthDay = T.PlainMonthDay.from('07-14');
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [T.PlainMonthDay.from('07-14')],
      invalid: ['07-14', T.PlainDate.from('2020-08-24')],
    }),
    getExpectedErrors: () => [[{path: [], expected: 'Temporal.PlainMonthDay'}], [{path: [], expected: 'Temporal.PlainMonthDay'}]],
  },

  duration: {
    title: 'Temporal.Duration',
    description: 'The TC39 Temporal.Duration leaf, validated by instanceof.',
    // Temporal types are validated by native identity; DataOnly's structural
    // object projection mangles them, so createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validateNotes: 'Must be a Temporal.Duration instance (instanceof).',
    validate: () => createValidate<Temporal.Duration>(),
    standardSchema: () => createStandardSchema<Temporal.Duration>(),
    validateDataOnly: () => createValidate<DataOnly<Temporal.Duration>>(),
    validateSchema: () => createValidate(TFT.duration()),
    deserializeValidate: () => deserializeValidate<Temporal.Duration>(),
    validateReflect: () => {
      const v: Temporal.Duration = T.Duration.from('P1Y2M10DT2H30M');
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Temporal.Duration = T.Duration.from('P1Y2M10DT2H30M');
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Temporal.Duration>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Temporal.Duration>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(TFT.duration()),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Temporal.Duration>(),
    getValidationErrorsReflect: () => {
      const v: Temporal.Duration = T.Duration.from('P1Y2M10DT2H30M');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Temporal.Duration = T.Duration.from('P1Y2M10DT2H30M');
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<Temporal.Duration>(),
    mockTypeReflect: () => {
      const v: Temporal.Duration = T.Duration.from('P1Y2M10DT2H30M');
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [T.Duration.from('P1Y2M10DT2H30M'), T.Duration.from('PT0S')],
      invalid: ['P1Y2M10DT2H30M', T.PlainDate.from('2020-08-24')],
    }),
    getExpectedErrors: () => [[{path: [], expected: 'Temporal.Duration'}], [{path: [], expected: 'Temporal.Duration'}]],
  },
} as const satisfies Record<string, ValidationCase>;
