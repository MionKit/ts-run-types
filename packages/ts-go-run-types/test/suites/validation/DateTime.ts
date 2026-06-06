// validation / DateTime — the date/time family grouped together: JS `Date`
// (also kept in Atomic) plus all 8 TC39 `Temporal` types. Each is a leaf with
// no child types; validation is a plain `instanceof` check (Date additionally
// rejects Invalid Date). Mirrors the `ValidationCase` shape used by Atomic.
//
// Temporal is the polyfill global in tests (see test/setup.ts); the types
// resolve via test/temporal-ambient.d.ts. The `createX<T>()` factories must be
// called with a concrete type literally at the call site (the vite plugin
// injects the resolved id there), so each thunk spells out its own factory and
// the reflect thunks annotate a runtime value with the concrete type.

import type {ValidationCase} from './types.ts';
import {createIsType, createGetTypeErrors, createMockType, type DataOnly} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import {deserializeIsType, deserializeGetTypeErrors} from '../../util/deserializeRTFunctions.ts';

const T = (globalThis as {Temporal: typeof Temporal}).Temporal;

export const DATETIME = {
  // Duplicated from Atomic.ts so the date/time family reads as one group here
  // too (Atomic keeps its own copy).
  date: {
    title: 'Date instance (rejects Invalid Date)',
    description: 'Invalid Date instances (getTime() === NaN) rejected',
    isTypeNotes: [
      'Must be an actual Date instance (instanceof Date).',
      'Invalid Date instances are rejected — e.g., `new Date("not-a-date")` or `new Date(NaN)`, whose `.getTime()` returns NaN.',
    ],
    isType: () => createIsType<Date>(),
    isTypeDataOnly: () => createIsType<DataOnly<Date>>(),
    isTypeSchema: () => createIsType(RT.date()),
    deserializeIsType: () => deserializeIsType<Date>(),
    isTypeReflect: () => {
      const v: Date = new Date();
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Date = new Date();
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Date>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<Date>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.date()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Date>(),
    getTypeErrorsReflect: () => {
      const v: Date = new Date();
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Date = new Date();
      return deserializeGetTypeErrors(v);
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
    // Temporal types are validated by native identity; DataOnly's structural
    // object projection mangles them, so createIsType<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    isTypeNotes: 'Must be a Temporal.Instant instance (instanceof).',
    isType: () => createIsType<Temporal.Instant>(),
    isTypeDataOnly: () => createIsType<DataOnly<Temporal.Instant>>(),
    isTypeSchema: () => createIsType(RT.temporal.instant()),
    deserializeIsType: () => deserializeIsType<Temporal.Instant>(),
    isTypeReflect: () => {
      const v: Temporal.Instant = T.Instant.from('2020-01-15T10:30:00Z');
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Temporal.Instant = T.Instant.from('2020-01-15T10:30:00Z');
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Temporal.Instant>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<Temporal.Instant>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.temporal.instant()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Temporal.Instant>(),
    getTypeErrorsReflect: () => {
      const v: Temporal.Instant = T.Instant.from('2020-01-15T10:30:00Z');
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Temporal.Instant = T.Instant.from('2020-01-15T10:30:00Z');
      return deserializeGetTypeErrors(v);
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
    // Temporal types are validated by native identity; DataOnly's structural
    // object projection mangles them, so createIsType<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    isTypeNotes: 'Must be a Temporal.ZonedDateTime instance (instanceof).',
    isType: () => createIsType<Temporal.ZonedDateTime>(),
    isTypeDataOnly: () => createIsType<DataOnly<Temporal.ZonedDateTime>>(),
    isTypeSchema: () => createIsType(RT.temporal.zonedDateTime()),
    deserializeIsType: () => deserializeIsType<Temporal.ZonedDateTime>(),
    isTypeReflect: () => {
      const v: Temporal.ZonedDateTime = T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]');
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Temporal.ZonedDateTime = T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]');
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Temporal.ZonedDateTime>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<Temporal.ZonedDateTime>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.temporal.zonedDateTime()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Temporal.ZonedDateTime>(),
    getTypeErrorsReflect: () => {
      const v: Temporal.ZonedDateTime = T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]');
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Temporal.ZonedDateTime = T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]');
      return deserializeGetTypeErrors(v);
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
    // Temporal types are validated by native identity; DataOnly's structural
    // object projection mangles them, so createIsType<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    isTypeNotes: 'Must be a Temporal.PlainDate instance (instanceof).',
    isType: () => createIsType<Temporal.PlainDate>(),
    isTypeDataOnly: () => createIsType<DataOnly<Temporal.PlainDate>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainDate()),
    deserializeIsType: () => deserializeIsType<Temporal.PlainDate>(),
    isTypeReflect: () => {
      const v: Temporal.PlainDate = T.PlainDate.from('2020-08-24');
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Temporal.PlainDate = T.PlainDate.from('2020-08-24');
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Temporal.PlainDate>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<Temporal.PlainDate>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.temporal.plainDate()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Temporal.PlainDate>(),
    getTypeErrorsReflect: () => {
      const v: Temporal.PlainDate = T.PlainDate.from('2020-08-24');
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Temporal.PlainDate = T.PlainDate.from('2020-08-24');
      return deserializeGetTypeErrors(v);
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
    // Temporal types are validated by native identity; DataOnly's structural
    // object projection mangles them, so createIsType<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    isTypeNotes: 'Must be a Temporal.PlainTime instance (instanceof).',
    isType: () => createIsType<Temporal.PlainTime>(),
    isTypeDataOnly: () => createIsType<DataOnly<Temporal.PlainTime>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainTime()),
    deserializeIsType: () => deserializeIsType<Temporal.PlainTime>(),
    isTypeReflect: () => {
      const v: Temporal.PlainTime = T.PlainTime.from('19:39:09');
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Temporal.PlainTime = T.PlainTime.from('19:39:09');
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Temporal.PlainTime>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<Temporal.PlainTime>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.temporal.plainTime()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Temporal.PlainTime>(),
    getTypeErrorsReflect: () => {
      const v: Temporal.PlainTime = T.PlainTime.from('19:39:09');
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Temporal.PlainTime = T.PlainTime.from('19:39:09');
      return deserializeGetTypeErrors(v);
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
    // Temporal types are validated by native identity; DataOnly's structural
    // object projection mangles them, so createIsType<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    isTypeNotes: 'Must be a Temporal.PlainDateTime instance (instanceof).',
    isType: () => createIsType<Temporal.PlainDateTime>(),
    isTypeDataOnly: () => createIsType<DataOnly<Temporal.PlainDateTime>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainDateTime()),
    deserializeIsType: () => deserializeIsType<Temporal.PlainDateTime>(),
    isTypeReflect: () => {
      const v: Temporal.PlainDateTime = T.PlainDateTime.from('1995-12-07T15:00:00');
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Temporal.PlainDateTime = T.PlainDateTime.from('1995-12-07T15:00:00');
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Temporal.PlainDateTime>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<Temporal.PlainDateTime>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.temporal.plainDateTime()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Temporal.PlainDateTime>(),
    getTypeErrorsReflect: () => {
      const v: Temporal.PlainDateTime = T.PlainDateTime.from('1995-12-07T15:00:00');
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Temporal.PlainDateTime = T.PlainDateTime.from('1995-12-07T15:00:00');
      return deserializeGetTypeErrors(v);
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
    // Temporal types are validated by native identity; DataOnly's structural
    // object projection mangles them, so createIsType<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    isTypeNotes: 'Must be a Temporal.PlainYearMonth instance (instanceof).',
    isType: () => createIsType<Temporal.PlainYearMonth>(),
    isTypeDataOnly: () => createIsType<DataOnly<Temporal.PlainYearMonth>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainYearMonth()),
    deserializeIsType: () => deserializeIsType<Temporal.PlainYearMonth>(),
    isTypeReflect: () => {
      const v: Temporal.PlainYearMonth = T.PlainYearMonth.from('2020-10');
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Temporal.PlainYearMonth = T.PlainYearMonth.from('2020-10');
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Temporal.PlainYearMonth>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<Temporal.PlainYearMonth>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.temporal.plainYearMonth()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Temporal.PlainYearMonth>(),
    getTypeErrorsReflect: () => {
      const v: Temporal.PlainYearMonth = T.PlainYearMonth.from('2020-10');
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Temporal.PlainYearMonth = T.PlainYearMonth.from('2020-10');
      return deserializeGetTypeErrors(v);
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
    // Temporal types are validated by native identity; DataOnly's structural
    // object projection mangles them, so createIsType<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    isTypeNotes: 'Must be a Temporal.PlainMonthDay instance (instanceof).',
    isType: () => createIsType<Temporal.PlainMonthDay>(),
    isTypeDataOnly: () => createIsType<DataOnly<Temporal.PlainMonthDay>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainMonthDay()),
    deserializeIsType: () => deserializeIsType<Temporal.PlainMonthDay>(),
    isTypeReflect: () => {
      const v: Temporal.PlainMonthDay = T.PlainMonthDay.from('07-14');
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Temporal.PlainMonthDay = T.PlainMonthDay.from('07-14');
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Temporal.PlainMonthDay>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<Temporal.PlainMonthDay>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.temporal.plainMonthDay()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Temporal.PlainMonthDay>(),
    getTypeErrorsReflect: () => {
      const v: Temporal.PlainMonthDay = T.PlainMonthDay.from('07-14');
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Temporal.PlainMonthDay = T.PlainMonthDay.from('07-14');
      return deserializeGetTypeErrors(v);
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
    // Temporal types are validated by native identity; DataOnly's structural
    // object projection mangles them, so createIsType<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    isTypeNotes: 'Must be a Temporal.Duration instance (instanceof).',
    isType: () => createIsType<Temporal.Duration>(),
    isTypeDataOnly: () => createIsType<DataOnly<Temporal.Duration>>(),
    isTypeSchema: () => createIsType(RT.temporal.duration()),
    deserializeIsType: () => deserializeIsType<Temporal.Duration>(),
    isTypeReflect: () => {
      const v: Temporal.Duration = T.Duration.from('P1Y2M10DT2H30M');
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Temporal.Duration = T.Duration.from('P1Y2M10DT2H30M');
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Temporal.Duration>(),
    getTypeErrorsDataOnly: () => createGetTypeErrors<DataOnly<Temporal.Duration>>(),
    getTypeErrorsSchema: () => createGetTypeErrors(RT.temporal.duration()),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Temporal.Duration>(),
    getTypeErrorsReflect: () => {
      const v: Temporal.Duration = T.Duration.from('P1Y2M10DT2H30M');
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Temporal.Duration = T.Duration.from('P1Y2M10DT2H30M');
      return deserializeGetTypeErrors(v);
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
