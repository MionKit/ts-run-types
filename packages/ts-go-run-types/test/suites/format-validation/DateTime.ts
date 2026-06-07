// format-validation / DateTime — the date/time FORMAT family: `FormatDate<P>`
// (native JS Date) plus the 6 orderable `FormatTemporal*<P>` types. This suite
// exercises the bound machinery thoroughly:
//
//   • inclusive `min`/`max` — the bound value itself PASSES; one grid step
//     outside FAILS (formatPath tail 'min'/'max').
//   • exclusive `gt`/`lt`   — the bound value itself FAILS; one grid step
//     inside PASSES (formatPath tail 'gt'/'lt').
//   • mixed edges `min`+`lt` / `gt`+`max` (a lower edge is min OR gt, an upper
//     edge is max OR lt; the two distinct edges combine freely).
//   • single edges (only one of min/max/gt/lt).
//   • relative `now±P…` ISO-8601 duration bounds, with the per-kind component
//     restriction (date kinds → Y/M/W/D, time kinds → H/M/S, dateTime kinds →
//     both). Relative cases use WIDE margins so the boolean assertions hold
//     regardless of the wall clock — no fake timers (the case loop can't pin
//     the clock; precise relative edges are covered Go-side + in
//     adapters/formatRelativeBounds.test.ts).
//
// PlainMonthDay/Duration have no ordering, so they carry no bound format and are
// absent. Temporal is the polyfill global (test/setup.ts); types resolve via
// test/temporal-ambient.d.ts + the @mionjs/ts-go-run-types/formats/temporal
// subpath. The `/formats` side-effect import registers the native-date runtime.

import type {FormatValidationCase} from './types.ts';
import '@mionjs/ts-go-run-types/formats';
import {createIsType, createGetTypeErrors, createMockType} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
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
  // ═══════════════════════════ FormatDate (native JS Date) ══════════════════
  date_minmax: {
    title: 'FormatDate<{min,max}> — inclusive edges pass, one step outside fails',
    isType: () => createIsType<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    isTypeSchema: () => createIsType(RT.date({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    getTypeErrors: () => createGetTypeErrors<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    mockType: () => createMockType<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    getSamples: () => ({
      valid: [new Date(Date.UTC(2020, 0, 1, 0, 0, 0)), new Date(Date.UTC(2020, 11, 31, 23, 59, 59))],
      invalid: [new Date(Date.UTC(2019, 11, 31, 23, 59, 59)), new Date(Date.UTC(2021, 0, 1, 0, 0, 0)), 'not-a-date'],
    }),
    expectedFormatErrors: () => [{name: 'nativeDate', formatPathTail: 'min'}, {name: 'nativeDate', formatPathTail: 'max'}, null],
  },
  date_gtlt: {
    title: 'FormatDate<{gt,lt}> — exclusive edges rejected, interior passes',
    isType: () => createIsType<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    isTypeSchema: () => createIsType(RT.date({gt: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
    getTypeErrors: () => createGetTypeErrors<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    mockType: () => createMockType<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    getSamples: () => ({
      valid: [new Date(Date.UTC(2020, 5, 15))],
      // the bound values themselves are excluded (gt/lt are strict)
      invalid: [new Date(Date.UTC(2020, 0, 1, 0, 0, 0)), new Date(Date.UTC(2020, 11, 31, 23, 59, 59)), 'not-a-date'],
    }),
    expectedFormatErrors: () => [{name: 'nativeDate', formatPathTail: 'gt'}, {name: 'nativeDate', formatPathTail: 'lt'}, null],
  },
  date_min_lt: {
    title: 'FormatDate<{min,lt}> — inclusive lower + exclusive upper',
    isType: () => createIsType<FormatDate<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    isTypeSchema: () => createIsType(RT.date({min: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
    getTypeErrors: () => createGetTypeErrors<FormatDate<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    getSamples: () => ({
      valid: [new Date(Date.UTC(2020, 0, 1, 0, 0, 0)), new Date(Date.UTC(2020, 5, 15))],
      invalid: [new Date(Date.UTC(2019, 11, 31, 23, 59, 59)), new Date(Date.UTC(2020, 11, 31, 23, 59, 59))],
    }),
    expectedFormatErrors: () => [
      {name: 'nativeDate', formatPathTail: 'min'},
      {name: 'nativeDate', formatPathTail: 'lt'},
    ],
  },
  date_max_now: {
    title: 'FormatDate<{max: now}> — rejects the future (relative)',
    isType: () => createIsType<FormatDate<{max: 'now'}>>(),
    isTypeSchema: () => createIsType(RT.date({max: 'now'})),
    getTypeErrors: () => createGetTypeErrors<FormatDate<{max: 'now'}>>(),
    mockType: () => createMockType<FormatDate<{min: 'now-P1Y'; max: 'now'}>>(),
    getSamples: () => ({
      valid: [new Date('2020-01-01T00:00:00Z')],
      invalid: [new Date('2999-01-01T00:00:00Z'), 'not-a-date'],
    }),
    expectedFormatErrors: () => [{name: 'nativeDate', formatPathTail: 'max'}, null],
  },
  date_rel_window: {
    title: 'FormatDate<{min: now-P1000Y, max: now+P1000Y}> — relative window (Y, both components allowed)',
    isType: () => createIsType<FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    isTypeSchema: () => createIsType(RT.date({min: 'now-P1000Y', max: 'now+P1000Y'})),
    getTypeErrors: () => createGetTypeErrors<FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    mockType: () => createMockType<FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    getSamples: () => ({
      valid: [new Date(Date.UTC(2020, 5, 15))],
      invalid: [new Date(Date.UTC(1000, 0, 1)), new Date(Date.UTC(3500, 0, 1))],
    }),
    expectedFormatErrors: () => [
      {name: 'nativeDate', formatPathTail: 'min'},
      {name: 'nativeDate', formatPathTail: 'max'},
    ],
  },
  date_rel_datetime_components: {
    title: 'FormatDate<{min: now-P1000YT12H}> — relative with both date + time components',
    isType: () => createIsType<FormatDate<{min: 'now-P1000YT12H'}>>(),
    isTypeSchema: () => createIsType(RT.date({min: 'now-P1000YT12H'})),
    getTypeErrors: () => createGetTypeErrors<FormatDate<{min: 'now-P1000YT12H'}>>(),
    getSamples: () => ({
      valid: [new Date(Date.UTC(2020, 5, 15))],
      invalid: [new Date(Date.UTC(1000, 0, 1))],
    }),
    expectedFormatErrors: () => [{name: 'nativeDate', formatPathTail: 'min'}],
  },

  // ═══════════════════════════ Temporal.Instant ═════════════════════════════
  instant_minmax: {
    title: 'FormatTemporalInstant<{min,max}> — inclusive edges',
    isType: () => createIsType<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.instant({min: '2020-01-01T00:00:00Z', max: '2020-12-31T23:59:59Z'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    mockType: () => createMockType<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    getSamples: () => ({
      valid: [T.Instant.from('2020-01-01T00:00:00Z'), T.Instant.from('2020-12-31T23:59:59Z')],
      invalid: [T.Instant.from('2019-12-31T23:59:59Z'), T.Instant.from('2021-01-01T00:00:00Z'), 'not-an-instant'],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalInstant', formatPathTail: 'min'},
      {name: 'temporalInstant', formatPathTail: 'max'},
      null,
    ],
  },
  instant_gtlt: {
    title: 'FormatTemporalInstant<{gt,lt}> — exclusive edges rejected',
    isType: () => createIsType<FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.instant({gt: '2020-01-01T00:00:00Z', lt: '2020-12-31T23:59:59Z'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}>>(),
    mockType: () => createMockType<FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}>>(),
    getSamples: () => ({
      valid: [T.Instant.from('2020-06-15T12:00:00Z')],
      invalid: [T.Instant.from('2020-01-01T00:00:00Z'), T.Instant.from('2020-12-31T23:59:59Z'), 'not-an-instant'],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalInstant', formatPathTail: 'gt'},
      {name: 'temporalInstant', formatPathTail: 'lt'},
      null,
    ],
  },
  instant_rel: {
    title: 'FormatTemporalInstant<{min: now-PT8760000H, max: now+PT8760000H}> — relative (time components only)',
    isType: () => createIsType<FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.instant({min: 'now-PT8760000H', max: 'now+PT8760000H'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}>>(),
    mockType: () => createMockType<FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}>>(),
    getSamples: () => ({
      valid: [T.Instant.from('2020-06-15T12:00:00Z')],
      invalid: [T.Instant.from('1000-01-01T00:00:00Z'), T.Instant.from('3500-01-01T00:00:00Z')],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalInstant', formatPathTail: 'min'},
      {name: 'temporalInstant', formatPathTail: 'max'},
    ],
  },

  // ═══════════════════════════ Temporal.PlainDate ═══════════════════════════
  plainDate_minmax: {
    title: 'FormatTemporalPlainDate<{min,max}> — inclusive edges',
    isType: () => createIsType<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainDate({min: '2020-01-01', max: '2020-12-31'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    mockType: () => createMockType<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-01-01'), T.PlainDate.from('2020-12-31')],
      invalid: [T.PlainDate.from('2019-12-31'), T.PlainDate.from('2021-01-01'), T.Instant.from('2020-06-15T00:00:00Z')],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalPlainDate', formatPathTail: 'min'},
      {name: 'temporalPlainDate', formatPathTail: 'max'},
      null,
    ],
  },
  plainDate_gtlt: {
    title: 'FormatTemporalPlainDate<{gt,lt}> — exclusive edges rejected, next day inside passes',
    isType: () => createIsType<FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainDate({gt: '2020-01-01', lt: '2020-12-31'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}>>(),
    mockType: () => createMockType<FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}>>(),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-01-02'), T.PlainDate.from('2020-12-30')],
      invalid: [T.PlainDate.from('2020-01-01'), T.PlainDate.from('2020-12-31'), 'not-a-date'],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalPlainDate', formatPathTail: 'gt'},
      {name: 'temporalPlainDate', formatPathTail: 'lt'},
      null,
    ],
  },
  plainDate_min_lt: {
    title: 'FormatTemporalPlainDate<{min,lt}> — inclusive lower + exclusive upper',
    isType: () => createIsType<FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainDate({min: '2020-01-01', lt: '2020-01-10'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}>>(),
    mockType: () => createMockType<FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}>>(),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-01-01'), T.PlainDate.from('2020-01-09')],
      invalid: [T.PlainDate.from('2019-12-31'), T.PlainDate.from('2020-01-10')],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalPlainDate', formatPathTail: 'min'},
      {name: 'temporalPlainDate', formatPathTail: 'lt'},
    ],
  },
  plainDate_gt_max: {
    title: 'FormatTemporalPlainDate<{gt,max}> — exclusive lower + inclusive upper',
    isType: () => createIsType<FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainDate({gt: '2020-01-01', max: '2020-01-10'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}>>(),
    mockType: () => createMockType<FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}>>(),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-01-02'), T.PlainDate.from('2020-01-10')],
      invalid: [T.PlainDate.from('2020-01-01'), T.PlainDate.from('2020-01-11')],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalPlainDate', formatPathTail: 'gt'},
      {name: 'temporalPlainDate', formatPathTail: 'max'},
    ],
  },
  plainDate_min_only: {
    title: 'FormatTemporalPlainDate<{min}> — lower bound only',
    isType: () => createIsType<FormatTemporalPlainDate<{min: '2020-01-01'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainDate({min: '2020-01-01'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainDate<{min: '2020-01-01'}>>(),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-01-01'), T.PlainDate.from('2099-12-31')],
      invalid: [T.PlainDate.from('2019-12-31')],
    }),
    expectedFormatErrors: () => [{name: 'temporalPlainDate', formatPathTail: 'min'}],
  },
  plainDate_max_only: {
    title: 'FormatTemporalPlainDate<{max}> — upper bound only',
    isType: () => createIsType<FormatTemporalPlainDate<{max: '2020-12-31'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainDate({max: '2020-12-31'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainDate<{max: '2020-12-31'}>>(),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-12-31'), T.PlainDate.from('1900-01-01')],
      invalid: [T.PlainDate.from('2021-01-01')],
    }),
    expectedFormatErrors: () => [{name: 'temporalPlainDate', formatPathTail: 'max'}],
  },
  plainDate_gt_only: {
    title: 'FormatTemporalPlainDate<{gt}> — exclusive lower bound only',
    isType: () => createIsType<FormatTemporalPlainDate<{gt: '2020-01-01'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainDate({gt: '2020-01-01'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainDate<{gt: '2020-01-01'}>>(),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-01-02')],
      invalid: [T.PlainDate.from('2020-01-01'), T.PlainDate.from('2019-12-31')],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalPlainDate', formatPathTail: 'gt'},
      {name: 'temporalPlainDate', formatPathTail: 'gt'},
    ],
  },
  plainDate_lt_only: {
    title: 'FormatTemporalPlainDate<{lt}> — exclusive upper bound only',
    isType: () => createIsType<FormatTemporalPlainDate<{lt: '2020-12-31'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainDate({lt: '2020-12-31'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainDate<{lt: '2020-12-31'}>>(),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-12-30')],
      invalid: [T.PlainDate.from('2020-12-31'), T.PlainDate.from('2021-06-01')],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalPlainDate', formatPathTail: 'lt'},
      {name: 'temporalPlainDate', formatPathTail: 'lt'},
    ],
  },
  plainDate_rel_window: {
    title: 'FormatTemporalPlainDate<{min: now-P1000Y, max: now+P1000Y}> — relative window (Y)',
    isType: () => createIsType<FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainDate({min: 'now-P1000Y', max: 'now+P1000Y'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    mockType: () => createMockType<FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-06-15')],
      invalid: [T.PlainDate.from('0500-01-01'), T.PlainDate.from('3500-01-01')],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalPlainDate', formatPathTail: 'min'},
      {name: 'temporalPlainDate', formatPathTail: 'max'},
    ],
  },
  plainDate_rel_ymd: {
    title: 'FormatTemporalPlainDate<{min: now-P100Y6M15D}> — relative Y/M/D components',
    isType: () => createIsType<FormatTemporalPlainDate<{min: 'now-P100Y6M15D'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainDate({min: 'now-P100Y6M15D'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainDate<{min: 'now-P100Y6M15D'}>>(),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-06-15')],
      invalid: [T.PlainDate.from('1800-01-01')],
    }),
    expectedFormatErrors: () => [{name: 'temporalPlainDate', formatPathTail: 'min'}],
  },
  plainDate_rel_weeks: {
    title: 'FormatTemporalPlainDate<{min: now-P52200W}> — relative W component',
    isType: () => createIsType<FormatTemporalPlainDate<{min: 'now-P52200W'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainDate({min: 'now-P52200W'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainDate<{min: 'now-P52200W'}>>(),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-06-15')],
      invalid: [T.PlainDate.from('0500-01-01')],
    }),
    expectedFormatErrors: () => [{name: 'temporalPlainDate', formatPathTail: 'min'}],
  },

  // ═══════════════════════════ Temporal.PlainTime ═══════════════════════════
  plainTime_minmax: {
    title: 'FormatTemporalPlainTime<{min,max}> — inclusive edges (business hours)',
    isType: () => createIsType<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainTime({min: '09:00:00', max: '17:00:00'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    mockType: () => createMockType<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    getSamples: () => ({
      valid: [T.PlainTime.from('09:00:00'), T.PlainTime.from('17:00:00')],
      invalid: [T.PlainTime.from('08:59:59'), T.PlainTime.from('17:00:01'), 'not-a-time'],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalPlainTime', formatPathTail: 'min'},
      {name: 'temporalPlainTime', formatPathTail: 'max'},
      null,
    ],
  },
  plainTime_gtlt: {
    title: 'FormatTemporalPlainTime<{gt,lt}> — exclusive edges rejected',
    isType: () => createIsType<FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainTime({gt: '09:00:00', lt: '17:00:00'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>(),
    mockType: () => createMockType<FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>(),
    getSamples: () => ({
      valid: [T.PlainTime.from('09:00:01'), T.PlainTime.from('16:59:59')],
      invalid: [T.PlainTime.from('09:00:00'), T.PlainTime.from('17:00:00'), 'not-a-time'],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalPlainTime', formatPathTail: 'gt'},
      {name: 'temporalPlainTime', formatPathTail: 'lt'},
      null,
    ],
  },

  // ═══════════════════════════ Temporal.PlainDateTime ═══════════════════════
  plainDateTime_minmax: {
    title: 'FormatTemporalPlainDateTime<{min,max}> — inclusive edges',
    isType: () => createIsType<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainDateTime({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    getTypeErrors: () =>
      createGetTypeErrors<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    mockType: () => createMockType<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    getSamples: () => ({
      valid: [T.PlainDateTime.from('2020-01-01T00:00:00'), T.PlainDateTime.from('2020-12-31T23:59:59')],
      invalid: [T.PlainDateTime.from('2019-12-31T23:59:59'), T.PlainDateTime.from('2021-01-01T00:00:00'), 'nope'],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalPlainDateTime', formatPathTail: 'min'},
      {name: 'temporalPlainDateTime', formatPathTail: 'max'},
      null,
    ],
  },
  plainDateTime_gtlt: {
    title: 'FormatTemporalPlainDateTime<{gt,lt}> — exclusive edges rejected',
    isType: () => createIsType<FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainDateTime({gt: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
    getTypeErrors: () =>
      createGetTypeErrors<FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    mockType: () => createMockType<FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    getSamples: () => ({
      valid: [T.PlainDateTime.from('2020-06-15T12:00:00')],
      invalid: [T.PlainDateTime.from('2020-01-01T00:00:00'), T.PlainDateTime.from('2020-12-31T23:59:59'), 'nope'],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalPlainDateTime', formatPathTail: 'gt'},
      {name: 'temporalPlainDateTime', formatPathTail: 'lt'},
      null,
    ],
  },
  plainDateTime_rel: {
    title: 'FormatTemporalPlainDateTime<{min: now-P1000Y, max: now+P1000Y}> — relative window',
    isType: () => createIsType<FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainDateTime({min: 'now-P1000Y', max: 'now+P1000Y'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    mockType: () => createMockType<FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    getSamples: () => ({
      valid: [T.PlainDateTime.from('2020-06-15T12:00:00')],
      invalid: [T.PlainDateTime.from('0500-01-01T00:00:00'), T.PlainDateTime.from('3500-01-01T00:00:00')],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalPlainDateTime', formatPathTail: 'min'},
      {name: 'temporalPlainDateTime', formatPathTail: 'max'},
    ],
  },
  plainDateTime_rel_combo: {
    title: 'FormatTemporalPlainDateTime<{min: now-P500YT12H}> — relative date + time components',
    isType: () => createIsType<FormatTemporalPlainDateTime<{min: 'now-P500YT12H'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainDateTime({min: 'now-P500YT12H'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainDateTime<{min: 'now-P500YT12H'}>>(),
    getSamples: () => ({
      valid: [T.PlainDateTime.from('2020-06-15T12:00:00')],
      invalid: [T.PlainDateTime.from('1000-01-01T00:00:00')],
    }),
    expectedFormatErrors: () => [{name: 'temporalPlainDateTime', formatPathTail: 'min'}],
  },

  // ═══════════════════════════ Temporal.PlainYearMonth ══════════════════════
  plainYearMonth_minmax: {
    title: 'FormatTemporalPlainYearMonth<{min,max}> — inclusive edges',
    isType: () => createIsType<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainYearMonth({min: '2020-01', max: '2020-12'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    mockType: () => createMockType<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    getSamples: () => ({
      valid: [T.PlainYearMonth.from('2020-01'), T.PlainYearMonth.from('2020-12')],
      invalid: [T.PlainYearMonth.from('2019-12'), T.PlainYearMonth.from('2021-01'), 'nope'],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalPlainYearMonth', formatPathTail: 'min'},
      {name: 'temporalPlainYearMonth', formatPathTail: 'max'},
      null,
    ],
  },
  plainYearMonth_gtlt: {
    title: 'FormatTemporalPlainYearMonth<{gt,lt}> — exclusive edges rejected',
    isType: () => createIsType<FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainYearMonth({gt: '2020-01', lt: '2020-12'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}>>(),
    mockType: () => createMockType<FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}>>(),
    getSamples: () => ({
      valid: [T.PlainYearMonth.from('2020-02'), T.PlainYearMonth.from('2020-11')],
      invalid: [T.PlainYearMonth.from('2020-01'), T.PlainYearMonth.from('2020-12'), 'nope'],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalPlainYearMonth', formatPathTail: 'gt'},
      {name: 'temporalPlainYearMonth', formatPathTail: 'lt'},
      null,
    ],
  },
  plainYearMonth_rel: {
    title: 'FormatTemporalPlainYearMonth<{min: now-P1000Y, max: now+P1000Y}> — relative (Y/M)',
    isType: () => createIsType<FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.plainYearMonth({min: 'now-P1000Y', max: 'now+P1000Y'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    mockType: () => createMockType<FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    getSamples: () => ({
      valid: [T.PlainYearMonth.from('2020-06')],
      invalid: [T.PlainYearMonth.from('0500-01'), T.PlainYearMonth.from('3500-01')],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalPlainYearMonth', formatPathTail: 'min'},
      {name: 'temporalPlainYearMonth', formatPathTail: 'max'},
    ],
  },

  // ═══════════════════════════ Temporal.ZonedDateTime ═══════════════════════
  zonedDateTime_minmax: {
    title: 'FormatTemporalZonedDateTime<{min,max}> — inclusive edges',
    isType: () => createIsType<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
    isTypeSchema: () =>
      createIsType(RT.temporal.zonedDateTime({min: '2020-01-01T00:00:00[UTC]', max: '2020-12-31T23:59:59[UTC]'})),
    getTypeErrors: () =>
      createGetTypeErrors<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
    mockType: () =>
      createMockType<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
    getSamples: () => ({
      valid: [T.ZonedDateTime.from('2020-01-01T00:00:00[UTC]'), T.ZonedDateTime.from('2020-12-31T23:59:59[UTC]')],
      invalid: [T.ZonedDateTime.from('2019-12-31T23:59:59[UTC]'), T.ZonedDateTime.from('2021-01-01T00:00:00[UTC]'), 'nope'],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalZonedDateTime', formatPathTail: 'min'},
      {name: 'temporalZonedDateTime', formatPathTail: 'max'},
      null,
    ],
  },
  zonedDateTime_gtlt: {
    title: 'FormatTemporalZonedDateTime<{gt,lt}> — exclusive edges rejected',
    isType: () => createIsType<FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.zonedDateTime({gt: '2020-01-01T00:00:00[UTC]', lt: '2020-12-31T23:59:59[UTC]'})),
    getTypeErrors: () =>
      createGetTypeErrors<FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}>>(),
    mockType: () =>
      createMockType<FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}>>(),
    getSamples: () => ({
      valid: [T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]')],
      invalid: [T.ZonedDateTime.from('2020-01-01T00:00:00[UTC]'), T.ZonedDateTime.from('2020-12-31T23:59:59[UTC]'), 'nope'],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalZonedDateTime', formatPathTail: 'gt'},
      {name: 'temporalZonedDateTime', formatPathTail: 'lt'},
      null,
    ],
  },
  zonedDateTime_rel: {
    title: 'FormatTemporalZonedDateTime<{min: now-P1000Y, max: now+P1000Y}> — relative window',
    isType: () => createIsType<FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    isTypeSchema: () => createIsType(RT.temporal.zonedDateTime({min: 'now-P1000Y', max: 'now+P1000Y'})),
    getTypeErrors: () => createGetTypeErrors<FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    mockType: () => createMockType<FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    getSamples: () => ({
      valid: [T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]')],
      invalid: [T.ZonedDateTime.from('0500-01-01T00:00:00[UTC]'), T.ZonedDateTime.from('3500-01-01T00:00:00[UTC]')],
    }),
    expectedFormatErrors: () => [
      {name: 'temporalZonedDateTime', formatPathTail: 'min'},
      {name: 'temporalZonedDateTime', formatPathTail: 'max'},
    ],
  },
} as const satisfies Record<string, FormatValidationCase>;
