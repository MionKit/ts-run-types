// format-validation / DateTime — the date/time FORMAT family: `FormatDate<P>`
// (native JS Date with min/max bounds) plus the 6 orderable `FormatTemporal*<P>`
// types. PlainMonthDay/Duration have no ordering, so they carry no bound format
// and are absent here. Each case asserts in-range values pass, out-of-range
// values produce the format error, and bounded mocks stay in range.
//
// Relative `now±P` bounds use wide margins so the boolean assertions hold
// regardless of the wall clock (no fake timers). Temporal is the polyfill
// global (test/setup.ts); types resolve via test/temporal-ambient.d.ts +
// the @mionjs/ts-go-run-types/formats/temporal subpath. The `/formats`
// side-effect import registers the native-date format runtime.

import type {FormatValidationCase} from './types.ts';
import '@mionjs/ts-go-run-types/formats';
import {createIsType, createGetTypeErrors, createMockType} from '@mionjs/ts-go-run-types';
import type {FormatDate} from '@mionjs/ts-go-run-types/formats';
import type {
  FormatTemporalInstant,
  FormatTemporalPlainDate,
  FormatTemporalPlainTime,
  FormatTemporalPlainDateTime,
  FormatTemporalPlainYearMonth,
  FormatTemporalZonedDateTime,
} from '@mionjs/ts-go-run-types/formats/temporal';

const T = (globalThis as {Temporal: typeof Temporal}).Temporal;

export const DATETIME = {
  // ─────────────────────────── FormatDate (native JS Date) ──────────
  date_minmax: {
    title: 'FormatDate<{min,max}> — absolute window',
    isType: () => createIsType<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    getTypeErrors: () => createGetTypeErrors<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    mockType: () => createMockType<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    getSamples: () => ({
      valid: [new Date(Date.UTC(2020, 0, 1, 0, 0, 0)), new Date(Date.UTC(2020, 5, 15))],
      invalid: [new Date(Date.UTC(2019, 11, 31, 23, 59, 59)), new Date(Date.UTC(2021, 0, 1)), 'not-a-date'],
    }),
    expectedFormatErrors: () => [{name: 'nativeDate', formatPathTail: 'min'}, {name: 'nativeDate'}, null],
  },
  date_max_now: {
    title: 'FormatDate<{max: now}> — rejects the future',
    isType: () => createIsType<FormatDate<{max: 'now'}>>(),
    getTypeErrors: () => createGetTypeErrors<FormatDate<{max: 'now'}>>(),
    mockType: () => createMockType<FormatDate<{min: 'now-P1Y'; max: 'now'}>>(),
    getSamples: () => ({
      valid: [new Date('2020-01-01T00:00:00Z')],
      invalid: [new Date('2999-01-01T00:00:00Z'), 'not-a-date'],
    }),
    expectedFormatErrors: () => [{name: 'nativeDate'}, null],
  },

  // ─────────────────────────── FormatTemporal* (orderable) ──────────
  instant_minmax: {
    title: 'FormatTemporalInstant<{min,max}>',
    isType: () => createIsType<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    mockType: () => createMockType<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    getSamples: () => ({
      valid: [T.Instant.from('2020-06-15T12:00:00Z')],
      invalid: [T.Instant.from('2019-06-15T12:00:00Z'), T.Instant.from('2021-06-15T12:00:00Z'), 'not-an-instant'],
    }),
    expectedFormatErrors: () => [{name: 'temporalInstant'}, {name: 'temporalInstant'}, null],
  },
  plainDate_minmax: {
    title: 'FormatTemporalPlainDate<{min,max}>',
    isType: () => createIsType<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    mockType: () => createMockType<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-06-15'), T.PlainDate.from('2020-01-01'), T.PlainDate.from('2020-12-31')],
      invalid: [T.PlainDate.from('2019-12-31'), T.PlainDate.from('2021-01-01'), T.Instant.from('2020-06-15T00:00:00Z')],
    }),
    expectedFormatErrors: () => [{name: 'temporalPlainDate', formatPathTail: 'min'}, {name: 'temporalPlainDate'}, null],
  },
  plainTime_minmax: {
    title: 'FormatTemporalPlainTime<{min,max}> — business hours',
    isType: () => createIsType<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    mockType: () => createMockType<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    getSamples: () => ({
      valid: [T.PlainTime.from('12:30:00')],
      invalid: [T.PlainTime.from('08:59:59'), T.PlainTime.from('17:00:01'), 'not-a-time'],
    }),
    expectedFormatErrors: () => [{name: 'temporalPlainTime'}, {name: 'temporalPlainTime'}, null],
  },
  plainDateTime_minmax: {
    title: 'FormatTemporalPlainDateTime<{min,max}>',
    isType: () => createIsType<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    getTypeErrors: () =>
      createGetTypeErrors<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    mockType: () => createMockType<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    getSamples: () => ({
      valid: [T.PlainDateTime.from('2020-06-15T12:00:00')],
      invalid: [T.PlainDateTime.from('2019-06-15T12:00:00'), T.PlainDateTime.from('2021-06-15T12:00:00'), 'nope'],
    }),
    expectedFormatErrors: () => [{name: 'temporalPlainDateTime'}, {name: 'temporalPlainDateTime'}, null],
  },
  plainYearMonth_minmax: {
    title: 'FormatTemporalPlainYearMonth<{min,max}>',
    isType: () => createIsType<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    mockType: () => createMockType<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    getSamples: () => ({
      valid: [T.PlainYearMonth.from('2020-06')],
      invalid: [T.PlainYearMonth.from('2019-12'), T.PlainYearMonth.from('2021-01'), 'nope'],
    }),
    expectedFormatErrors: () => [{name: 'temporalPlainYearMonth'}, {name: 'temporalPlainYearMonth'}, null],
  },
  zonedDateTime_minmax: {
    title: 'FormatTemporalZonedDateTime<{min,max}>',
    isType: () => createIsType<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
    getTypeErrors: () =>
      createGetTypeErrors<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
    mockType: () =>
      createMockType<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
    getSamples: () => ({
      valid: [T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]')],
      invalid: [T.ZonedDateTime.from('2019-06-15T12:00:00[UTC]'), T.ZonedDateTime.from('2021-06-15T12:00:00[UTC]'), 'nope'],
    }),
    expectedFormatErrors: () => [{name: 'temporalZonedDateTime'}, {name: 'temporalZonedDateTime'}, null],
  },

  // ─────────────────────────── exclusive + relative bounds ──────────
  plainDate_gtlt: {
    title: 'FormatTemporalPlainDate<{gt,lt}> — exclusive bounds',
    isType: () => createIsType<FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-01-10'}>>(),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-01-10'}>>(),
    mockType: () => createMockType<FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-01-10'}>>(),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-01-05')],
      // gt/lt are exclusive: the bound values themselves are rejected.
      invalid: [T.PlainDate.from('2020-01-01'), T.PlainDate.from('2020-01-10'), T.PlainDate.from('2020-02-01')],
    }),
    expectedFormatErrors: () => [{name: 'temporalPlainDate'}, {name: 'temporalPlainDate'}, {name: 'temporalPlainDate'}],
  },
  plainDate_relative: {
    title: 'FormatTemporalPlainDate<{min: now-P1000Y, max: now+P1000Y}> — relative (clock-stable)',
    isType: () => createIsType<FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    mockType: () => createMockType<FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-06-15')],
      invalid: [T.PlainDate.from('0500-01-01'), T.PlainDate.from('3500-01-01')],
    }),
    expectedFormatErrors: () => [{name: 'temporalPlainDate'}, {name: 'temporalPlainDate'}],
  },
} as const satisfies Record<string, FormatValidationCase>;
