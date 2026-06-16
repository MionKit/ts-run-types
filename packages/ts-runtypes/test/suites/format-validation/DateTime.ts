// Reflect-form thunks author a representative value of the (now transparent) format
// type — a Date / Temporal.X instance — whose only role is to drive `T` inference; it
// is discarded at runtime but reads like real usage. Every form is exercised: validate
// + getValidationErrors (static / reflect / deserialize-static / deserialize-reflect) +
// mockType; the getValidationErrors format-payload forms assert the exact format error
// survives every resolution path. Cases whose open/exclusive bounds can't be mocked
// carry `mockType: 'not-supported'` (they already omitted a mock — now explicit).
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
// test/temporal-ambient.d.ts + the ts-runtypes/formats/temporal
// subpath. The `/formats` side-effect import registers the native-date runtime.

import type {FormatValidationCase} from './types.ts';
import 'ts-runtypes/formats';
import {createValidate, createGetValidationErrors, createMockType, type DataOnly} from 'ts-runtypes';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';
import * as RT from 'ts-runtypes/schema';
import type {FormatDate} from 'ts-runtypes/formats';
import type {
  FormatTemporalInstant,
  FormatTemporalPlainDate,
  FormatTemporalPlainTime,
  FormatTemporalPlainDateTime,
  FormatTemporalPlainYearMonth,
  FormatTemporalZonedDateTime,
} from 'ts-runtypes/formats/temporal';

const T = (globalThis as {Temporal: typeof Temporal}).Temporal;

export const DATETIME = {
  // ═══════════════════════════ FormatDate (native JS Date) ══════════════════
  date_minmax: {
    title: 'Date min/max',
    description:
      'Native `Date` with an inclusive `min`/`max` window where the edges pass and one step outside fails; rejects dates outside [min, max].',
    validateNotes: [
      'Inclusive bounds: both 2020-01-01T00:00:00 (`min`) and 2020-12-31T23:59:59 (`max`) pass as the exact boundary values.',
      'One step outside fails: 2019-12-31T23:59:59 trips `min`, 2021-01-01T00:00:00 trips `max`; a non-Date value (`not-a-date`) is also rejected.',
    ],
    validate: () => createValidate<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    validateReflect: () => {
      const v: FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}> = new Date();
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}> = new Date();
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}> = new Date();
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}> = new Date();
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}> = new Date();
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>>(),
    validateSchema: () => createValidate(RT.date({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    getValidationErrors: () => createGetValidationErrors<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.date({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    mockType: () => createMockType<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    getSamples: () => ({
      valid: [new Date(Date.UTC(2020, 0, 1, 0, 0, 0)), new Date(Date.UTC(2020, 11, 31, 23, 59, 59))],
      invalid: [new Date(Date.UTC(2019, 11, 31, 23, 59, 59)), new Date(Date.UTC(2021, 0, 1, 0, 0, 0)), 'not-a-date'],
    }),
    expectedFormatErrors: () => [{name: 'nativeDate', formatPathTail: 'min'}, {name: 'nativeDate', formatPathTail: 'max'}, null],
  },
  date_gtlt: {
    title: 'Date gt/lt',
    description:
      'Native `Date` with exclusive `gt`/`lt` bounds where the edges are rejected and only strictly-interior dates pass.',
    validateNotes: [
      'Exclusive bounds: an interior date (2020-06-15) passes, but the boundary values themselves fail — 2020-01-01T00:00:00 trips `gt` and 2020-12-31T23:59:59 trips `lt`.',
      'A non-Date value (`not-a-date`) is also rejected.',
    ],
    validate: () => createValidate<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    validateReflect: () => {
      const v: FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}> = new Date();
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}> = new Date();
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}> = new Date();
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}> = new Date();
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}> = new Date();
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>>(),
    validateSchema: () => createValidate(RT.date({gt: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
    getValidationErrors: () => createGetValidationErrors<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.date({gt: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
    mockType: () => createMockType<FormatDate<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    getSamples: () => ({
      valid: [new Date(Date.UTC(2020, 5, 15))],
      // the bound values themselves are excluded (gt/lt are strict)
      invalid: [new Date(Date.UTC(2020, 0, 1, 0, 0, 0)), new Date(Date.UTC(2020, 11, 31, 23, 59, 59)), 'not-a-date'],
    }),
    expectedFormatErrors: () => [{name: 'nativeDate', formatPathTail: 'gt'}, {name: 'nativeDate', formatPathTail: 'lt'}, null],
  },
  date_min_lt: {
    title: 'Date min/lt',
    description: 'Native `Date` mixing an inclusive lower `min` with an exclusive upper `lt`.',
    validateNotes: [
      'Mixed edges: the lower bound 2020-01-01T00:00:00 (`min`, inclusive) passes, but the upper bound 2020-12-31T23:59:59 (`lt`, exclusive) fails.',
      'Below-range 2019-12-31T23:59:59 trips `min`; an interior date (2020-06-15) passes.',
    ],
    validate: () => createValidate<FormatDate<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    validateReflect: () => {
      const v: FormatDate<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}> = new Date();
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatDate<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatDate<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}> = new Date();
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatDate<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}> = new Date();
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatDate<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatDate<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}> = new Date();
      return deserializeGetValidationErrors(v);
    },
    mockType: 'not-supported',
    mockTypeReflect: 'not-supported',
    validateDataOnly: () => createValidate<DataOnly<FormatDate<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>>(),
    validateSchema: () => createValidate(RT.date({min: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
    getValidationErrors: () => createGetValidationErrors<FormatDate<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatDate<{min: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.date({min: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
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
    title: 'Date max now',
    description: 'Native `Date` with an inclusive relative upper bound `max: now` that rejects the future; rejects future dates.',
    validateNotes: [
      'The `max` bound is the relative anchor `now`, resolved at validation time — a past date (2020-01-01) passes, a far-future date (2999-01-01) trips `max`.',
      'Lower bound is unconstrained; a non-Date value (`not-a-date`) is also rejected.',
    ],
    validate: () => createValidate<FormatDate<{max: 'now'}>>(),
    validateReflect: () => {
      const v: FormatDate<{max: 'now'}> = new Date();
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatDate<{max: 'now'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatDate<{max: 'now'}> = new Date();
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatDate<{max: 'now'}> = new Date();
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatDate<{max: 'now'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatDate<{max: 'now'}> = new Date();
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatDate<{max: 'now'}> = new Date();
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatDate<{max: 'now'}>>>(),
    validateSchema: () => createValidate(RT.date({max: 'now'})),
    getValidationErrors: () => createGetValidationErrors<FormatDate<{max: 'now'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatDate<{max: 'now'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.date({max: 'now'})),
    mockType: () => createMockType<FormatDate<{min: 'now-P1Y'; max: 'now'}>>(),
    getSamples: () => ({
      valid: [new Date('2020-01-01T00:00:00Z')],
      invalid: [new Date('2999-01-01T00:00:00Z'), 'not-a-date'],
    }),
    expectedFormatErrors: () => [{name: 'nativeDate', formatPathTail: 'max'}, null],
  },
  date_rel_window: {
    title: 'Date relative window',
    description:
      'Native `Date` with a relative inclusive window `now-P1000Y`/`now+P1000Y` using year components, both of which are allowed for Date.',
    validateNotes: [
      'Both bounds are relative durations anchored at validation time (`now` ± 1000 years); a present-day date (2020-06-15) passes.',
      'Far outside the wide window fails: year 1000 trips `min`, year 3500 trips `max`. The margin is deliberately huge so the boolean result holds regardless of the wall clock.',
    ],
    validate: () => createValidate<FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    validateReflect: () => {
      const v: FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = new Date();
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = new Date();
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = new Date();
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = new Date();
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = new Date();
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>>(),
    validateSchema: () => createValidate(RT.date({min: 'now-P1000Y', max: 'now+P1000Y'})),
    getValidationErrors: () => createGetValidationErrors<FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.date({min: 'now-P1000Y', max: 'now+P1000Y'})),
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
    title: 'Date relative date-time components',
    description: 'Native `Date` with a relative inclusive lower bound only (`now-P1000YT12H`) mixing year and hour components.',
    validateNotes: [
      'Single relative `min` anchored at validation time (1000 years and 12 hours ago); the upper bound is open.',
      'A present-day date (2020-06-15) passes; far-past year 1000 trips `min`. Date accepts both date (Y) and time (T) duration components.',
    ],
    validate: () => createValidate<FormatDate<{min: 'now-P1000YT12H'}>>(),
    validateReflect: () => {
      const v: FormatDate<{min: 'now-P1000YT12H'}> = new Date();
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatDate<{min: 'now-P1000YT12H'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatDate<{min: 'now-P1000YT12H'}> = new Date();
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatDate<{min: 'now-P1000YT12H'}> = new Date();
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatDate<{min: 'now-P1000YT12H'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatDate<{min: 'now-P1000YT12H'}> = new Date();
      return deserializeGetValidationErrors(v);
    },
    mockType: 'not-supported',
    mockTypeReflect: 'not-supported',
    validateDataOnly: () => createValidate<DataOnly<FormatDate<{min: 'now-P1000YT12H'}>>>(),
    validateSchema: () => createValidate(RT.date({min: 'now-P1000YT12H'})),
    getValidationErrors: () => createGetValidationErrors<FormatDate<{min: 'now-P1000YT12H'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatDate<{min: 'now-P1000YT12H'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.date({min: 'now-P1000YT12H'})),
    getSamples: () => ({
      valid: [new Date(Date.UTC(2020, 5, 15))],
      invalid: [new Date(Date.UTC(1000, 0, 1))],
    }),
    expectedFormatErrors: () => [{name: 'nativeDate', formatPathTail: 'min'}],
  },

  // ═══════════════════════════ Temporal.Instant ═════════════════════════════
  instant_minmax: {
    title: 'Temporal instant min/max',
    description: '`Temporal.Instant` with an inclusive `min`/`max` window whose edges pass; rejects instants outside [min, max].',
    validateNotes: [
      'Inclusive bounds: both the `min` instant (2020-01-01T00:00:00Z) and the `max` instant (2020-12-31T23:59:59Z) pass as exact boundaries.',
      'One second outside fails: 2019-12-31T23:59:59Z trips `min`, 2021-01-01T00:00:00Z trips `max`; a non-Instant value is also rejected.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    validateReflect: () => {
      const v: FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}> =
        T.Instant.from('2020-06-15T12:00:00Z');
      return createValidate(v);
    },
    deserializeValidate: () =>
      deserializeValidate<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}> =
        T.Instant.from('2020-06-15T12:00:00Z');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}> =
        T.Instant.from('2020-06-15T12:00:00Z');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}> =
        T.Instant.from('2020-06-15T12:00:00Z');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}> =
        T.Instant.from('2020-06-15T12:00:00Z');
      return createMockType(v);
    },
    validateDataOnly: () =>
      createValidate<DataOnly<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>>(),
    validateSchema: () => createValidate(RT.temporal.instant({min: '2020-01-01T00:00:00Z', max: '2020-12-31T23:59:59Z'})),
    getValidationErrors: () =>
      createGetValidationErrors<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.temporal.instant({min: '2020-01-01T00:00:00Z', max: '2020-12-31T23:59:59Z'})),
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
    title: 'Temporal instant gt/lt',
    description:
      '`Temporal.Instant` with exclusive `gt`/`lt` bounds whose edges are rejected; only strictly-interior instants pass.',
    validateNotes: [
      'Exclusive bounds: an interior instant (2020-06-15T12:00:00Z) passes, but the boundary instants themselves fail — 2020-01-01T00:00:00Z trips `gt`, 2020-12-31T23:59:59Z trips `lt`.',
      'A non-Instant value is also rejected.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}>>(),
    validateReflect: () => {
      const v: FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}> =
        T.Instant.from('2020-06-15T12:00:00Z');
      return createValidate(v);
    },
    deserializeValidate: () =>
      deserializeValidate<FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}> =
        T.Instant.from('2020-06-15T12:00:00Z');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}> =
        T.Instant.from('2020-06-15T12:00:00Z');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}> =
        T.Instant.from('2020-06-15T12:00:00Z');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}> =
        T.Instant.from('2020-06-15T12:00:00Z');
      return createMockType(v);
    },
    validateDataOnly: () =>
      createValidate<DataOnly<FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}>>>(),
    validateSchema: () => createValidate(RT.temporal.instant({gt: '2020-01-01T00:00:00Z', lt: '2020-12-31T23:59:59Z'})),
    getValidationErrors: () =>
      createGetValidationErrors<FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatTemporalInstant<{gt: '2020-01-01T00:00:00Z'; lt: '2020-12-31T23:59:59Z'}>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.temporal.instant({gt: '2020-01-01T00:00:00Z', lt: '2020-12-31T23:59:59Z'})),
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
    title: 'Temporal instant relative',
    description:
      '`Temporal.Instant` with a relative inclusive window expressed in hours (`now±PT8760000H`), since Instant only accepts time components.',
    validateNotes: [
      'Both bounds are relative durations anchored at validation time (±8,760,000 hours ≈ ±1000 years); a present-day instant (2020-06-15T12:00:00Z) passes.',
      'Far outside the wide window fails: year 1000 trips `min`, year 3500 trips `max`. The margin is huge so the result holds regardless of the wall clock.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}>>(),
    validateReflect: () => {
      const v: FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}> = T.Instant.from('2020-06-15T12:00:00Z');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}> = T.Instant.from('2020-06-15T12:00:00Z');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}> = T.Instant.from('2020-06-15T12:00:00Z');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}> = T.Instant.from('2020-06-15T12:00:00Z');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}> = T.Instant.from('2020-06-15T12:00:00Z');
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}>>>(),
    validateSchema: () => createValidate(RT.temporal.instant({min: 'now-PT8760000H', max: 'now+PT8760000H'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatTemporalInstant<{min: 'now-PT8760000H'; max: 'now+PT8760000H'}>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.temporal.instant({min: 'now-PT8760000H', max: 'now+PT8760000H'})),
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
    title: 'Plain date min/max',
    description: '`Temporal.PlainDate` with an inclusive `min`/`max` window whose edges pass; rejects dates outside [min, max].',
    validateNotes: [
      'Inclusive bounds: both 2020-01-01 (`min`) and 2020-12-31 (`max`) pass as exact boundaries.',
      'One day outside fails: 2019-12-31 trips `min`, 2021-01-01 trips `max`; a wrong-type value (a `Temporal.Instant`) is also rejected.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainDate({min: '2020-01-01', max: '2020-12-31'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.plainDate({min: '2020-01-01', max: '2020-12-31'})),
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
    title: 'Plain date gt/lt',
    description:
      '`Temporal.PlainDate` with exclusive `gt`/`lt` bounds where the edges are rejected and the next day inside passes; only strictly-interior dates pass.',
    validateNotes: [
      'Exclusive bounds: the next day inside each edge passes (2020-01-02, 2020-12-30), but the boundary dates themselves fail — 2020-01-01 trips `gt`, 2020-12-31 trips `lt`.',
      'A non-date value is also rejected.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainDate({gt: '2020-01-01', lt: '2020-12-31'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatTemporalPlainDate<{gt: '2020-01-01'; lt: '2020-12-31'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.plainDate({gt: '2020-01-01', lt: '2020-12-31'})),
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
    title: 'Plain date min/lt',
    description: '`Temporal.PlainDate` mixing an inclusive lower `min` with an exclusive upper `lt`.',
    validateNotes: [
      'Mixed edges: the lower bound 2020-01-01 (`min`, inclusive) passes, but the upper bound 2020-01-10 (`lt`, exclusive) fails; the day before it (2020-01-09) passes.',
      'Below-range 2019-12-31 trips `min`.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}> = T.PlainDate.from('2020-06-15');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}> = T.PlainDate.from('2020-06-15');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}> = T.PlainDate.from('2020-06-15');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}> = T.PlainDate.from('2020-06-15');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}> = T.PlainDate.from('2020-06-15');
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainDate({min: '2020-01-01', lt: '2020-01-10'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatTemporalPlainDate<{min: '2020-01-01'; lt: '2020-01-10'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.plainDate({min: '2020-01-01', lt: '2020-01-10'})),
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
    title: 'Plain date gt/max',
    description: '`Temporal.PlainDate` mixing an exclusive lower `gt` with an inclusive upper `max`.',
    validateNotes: [
      'Mixed edges: the lower bound 2020-01-01 (`gt`, exclusive) fails while the day after (2020-01-02) passes; the upper bound 2020-01-10 (`max`, inclusive) passes.',
      'Above-range 2020-01-11 trips `max`.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}> = T.PlainDate.from('2020-06-15');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}> = T.PlainDate.from('2020-06-15');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}> = T.PlainDate.from('2020-06-15');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}> = T.PlainDate.from('2020-06-15');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}> = T.PlainDate.from('2020-06-15');
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainDate({gt: '2020-01-01', max: '2020-01-10'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatTemporalPlainDate<{gt: '2020-01-01'; max: '2020-01-10'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.plainDate({gt: '2020-01-01', max: '2020-01-10'})),
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
    title: 'Plain date min only',
    description: '`Temporal.PlainDate` with an inclusive lower `min` only and an open upper end.',
    validateNotes:
      'Inclusive `min`: the boundary 2020-01-01 passes, as does any later date (2099-12-31); only 2019-12-31 (below `min`) fails.',
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainDate<{min: '2020-01-01'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainDate<{min: '2020-01-01'}> = T.PlainDate.from('2020-06-15');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainDate<{min: '2020-01-01'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainDate<{min: '2020-01-01'}> = T.PlainDate.from('2020-06-15');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{min: '2020-01-01'}> = T.PlainDate.from('2020-06-15');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatTemporalPlainDate<{min: '2020-01-01'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{min: '2020-01-01'}> = T.PlainDate.from('2020-06-15');
      return deserializeGetValidationErrors(v);
    },
    mockType: 'not-supported',
    mockTypeReflect: 'not-supported',
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainDate<{min: '2020-01-01'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainDate({min: '2020-01-01'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainDate<{min: '2020-01-01'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatTemporalPlainDate<{min: '2020-01-01'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.plainDate({min: '2020-01-01'})),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-01-01'), T.PlainDate.from('2099-12-31')],
      invalid: [T.PlainDate.from('2019-12-31')],
    }),
    expectedFormatErrors: () => [{name: 'temporalPlainDate', formatPathTail: 'min'}],
  },
  plainDate_max_only: {
    title: 'Plain date max only',
    description: '`Temporal.PlainDate` with an inclusive upper `max` only and an open lower end.',
    validateNotes:
      'Inclusive `max`: the boundary 2020-12-31 passes, as does any earlier date (1900-01-01); only 2021-01-01 (above `max`) fails.',
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainDate<{max: '2020-12-31'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainDate<{max: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainDate<{max: '2020-12-31'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainDate<{max: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{max: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatTemporalPlainDate<{max: '2020-12-31'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{max: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return deserializeGetValidationErrors(v);
    },
    mockType: 'not-supported',
    mockTypeReflect: 'not-supported',
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainDate<{max: '2020-12-31'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainDate({max: '2020-12-31'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainDate<{max: '2020-12-31'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatTemporalPlainDate<{max: '2020-12-31'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.plainDate({max: '2020-12-31'})),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-12-31'), T.PlainDate.from('1900-01-01')],
      invalid: [T.PlainDate.from('2021-01-01')],
    }),
    expectedFormatErrors: () => [{name: 'temporalPlainDate', formatPathTail: 'max'}],
  },
  plainDate_gt_only: {
    title: 'Plain date gt only',
    description: '`Temporal.PlainDate` with an exclusive lower `gt` only and an open upper end.',
    validateNotes:
      'Exclusive `gt`: the next day inside (2020-01-02) passes, but the boundary 2020-01-01 fails and so does the earlier 2019-12-31 — both invalid samples trip `gt`.',
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainDate<{gt: '2020-01-01'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainDate<{gt: '2020-01-01'}> = T.PlainDate.from('2020-06-15');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainDate<{gt: '2020-01-01'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainDate<{gt: '2020-01-01'}> = T.PlainDate.from('2020-06-15');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{gt: '2020-01-01'}> = T.PlainDate.from('2020-06-15');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatTemporalPlainDate<{gt: '2020-01-01'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{gt: '2020-01-01'}> = T.PlainDate.from('2020-06-15');
      return deserializeGetValidationErrors(v);
    },
    mockType: 'not-supported',
    mockTypeReflect: 'not-supported',
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainDate<{gt: '2020-01-01'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainDate({gt: '2020-01-01'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainDate<{gt: '2020-01-01'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatTemporalPlainDate<{gt: '2020-01-01'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.plainDate({gt: '2020-01-01'})),
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
    title: 'Plain date lt only',
    description: '`Temporal.PlainDate` with an exclusive upper `lt` only and an open lower end.',
    validateNotes:
      'Exclusive `lt`: the day before (2020-12-30) passes, but the boundary 2020-12-31 fails and so does the later 2021-06-01 — both invalid samples trip `lt`.',
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainDate<{lt: '2020-12-31'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainDate<{lt: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainDate<{lt: '2020-12-31'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainDate<{lt: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{lt: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatTemporalPlainDate<{lt: '2020-12-31'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{lt: '2020-12-31'}> = T.PlainDate.from('2020-06-15');
      return deserializeGetValidationErrors(v);
    },
    mockType: 'not-supported',
    mockTypeReflect: 'not-supported',
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainDate<{lt: '2020-12-31'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainDate({lt: '2020-12-31'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainDate<{lt: '2020-12-31'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatTemporalPlainDate<{lt: '2020-12-31'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.plainDate({lt: '2020-12-31'})),
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
    title: 'Plain date relative window',
    description: '`Temporal.PlainDate` with a relative inclusive window `now-P1000Y`/`now+P1000Y` using year components.',
    validateNotes: [
      'Both bounds are relative durations anchored at validation time (`now` ± 1000 years); a present-day date (2020-06-15) passes.',
      'Far outside the wide window fails: year 0500 trips `min`, year 3500 trips `max`. The margin is huge so the result holds regardless of the wall clock.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = T.PlainDate.from('2020-06-15');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = T.PlainDate.from('2020-06-15');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = T.PlainDate.from('2020-06-15');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = T.PlainDate.from('2020-06-15');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = T.PlainDate.from('2020-06-15');
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainDate({min: 'now-P1000Y', max: 'now+P1000Y'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatTemporalPlainDate<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.plainDate({min: 'now-P1000Y', max: 'now+P1000Y'})),
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
    title: 'Plain date relative Y/M/D',
    description:
      '`Temporal.PlainDate` with a relative inclusive lower bound only (`now-P100Y6M15D`) using year/month/day components and an open upper end.',
    validateNotes:
      'Single relative `min` anchored at validation time (100 years, 6 months, 15 days ago); a present-day date (2020-06-15) passes while far-past 1800-01-01 trips `min`.',
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainDate<{min: 'now-P100Y6M15D'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainDate<{min: 'now-P100Y6M15D'}> = T.PlainDate.from('2020-06-15');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainDate<{min: 'now-P100Y6M15D'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainDate<{min: 'now-P100Y6M15D'}> = T.PlainDate.from('2020-06-15');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{min: 'now-P100Y6M15D'}> = T.PlainDate.from('2020-06-15');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatTemporalPlainDate<{min: 'now-P100Y6M15D'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{min: 'now-P100Y6M15D'}> = T.PlainDate.from('2020-06-15');
      return deserializeGetValidationErrors(v);
    },
    mockType: 'not-supported',
    mockTypeReflect: 'not-supported',
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainDate<{min: 'now-P100Y6M15D'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainDate({min: 'now-P100Y6M15D'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainDate<{min: 'now-P100Y6M15D'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatTemporalPlainDate<{min: 'now-P100Y6M15D'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.plainDate({min: 'now-P100Y6M15D'})),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-06-15')],
      invalid: [T.PlainDate.from('1800-01-01')],
    }),
    expectedFormatErrors: () => [{name: 'temporalPlainDate', formatPathTail: 'min'}],
  },
  plainDate_rel_weeks: {
    title: 'Plain date relative weeks',
    description:
      '`Temporal.PlainDate` with a relative inclusive lower bound only expressed in weeks (`now-P52200W` ≈ 1000 years) and an open upper end.',
    validateNotes:
      'Single relative `min` anchored at validation time (52,200 weeks ≈ 1000 years ago); a present-day date (2020-06-15) passes while far-past year 0500 trips `min`. The week (W) component is valid for date kinds.',
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainDate<{min: 'now-P52200W'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainDate<{min: 'now-P52200W'}> = T.PlainDate.from('2020-06-15');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainDate<{min: 'now-P52200W'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainDate<{min: 'now-P52200W'}> = T.PlainDate.from('2020-06-15');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{min: 'now-P52200W'}> = T.PlainDate.from('2020-06-15');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatTemporalPlainDate<{min: 'now-P52200W'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDate<{min: 'now-P52200W'}> = T.PlainDate.from('2020-06-15');
      return deserializeGetValidationErrors(v);
    },
    mockType: 'not-supported',
    mockTypeReflect: 'not-supported',
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainDate<{min: 'now-P52200W'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainDate({min: 'now-P52200W'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainDate<{min: 'now-P52200W'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatTemporalPlainDate<{min: 'now-P52200W'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.plainDate({min: 'now-P52200W'})),
    getSamples: () => ({
      valid: [T.PlainDate.from('2020-06-15')],
      invalid: [T.PlainDate.from('0500-01-01')],
    }),
    expectedFormatErrors: () => [{name: 'temporalPlainDate', formatPathTail: 'min'}],
  },

  // ═══════════════════════════ Temporal.PlainTime ═══════════════════════════
  plainTime_minmax: {
    title: 'Plain time min/max',
    description:
      '`Temporal.PlainTime` with an inclusive `min`/`max` window covering business hours 09:00–17:00 whose edges pass; rejects times outside [min, max].',
    validateNotes: [
      'Inclusive bounds: both 09:00:00 (`min`) and 17:00:00 (`max`) pass as exact boundaries.',
      'One second outside fails: 08:59:59 trips `min`, 17:00:01 trips `max`; a non-time value is also rejected.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}> = T.PlainTime.from('12:00:00');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}> = T.PlainTime.from('12:00:00');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}> = T.PlainTime.from('12:00:00');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}> = T.PlainTime.from('12:00:00');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}> = T.PlainTime.from('12:00:00');
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainTime({min: '09:00:00', max: '17:00:00'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.plainTime({min: '09:00:00', max: '17:00:00'})),
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
    title: 'Plain time gt/lt',
    description:
      '`Temporal.PlainTime` with exclusive `gt`/`lt` bounds whose edges are rejected; only strictly-interior times pass.',
    validateNotes: [
      'Exclusive bounds: one second inside each edge passes (09:00:01, 16:59:59), but the boundary times themselves fail — 09:00:00 trips `gt`, 17:00:00 trips `lt`.',
      'A non-time value is also rejected.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}> = T.PlainTime.from('12:00:00');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}> = T.PlainTime.from('12:00:00');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}> = T.PlainTime.from('12:00:00');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}> = T.PlainTime.from('12:00:00');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}> = T.PlainTime.from('12:00:00');
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainTime({gt: '09:00:00', lt: '17:00:00'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatTemporalPlainTime<{gt: '09:00:00'; lt: '17:00:00'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.plainTime({gt: '09:00:00', lt: '17:00:00'})),
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
    title: 'Plain date-time min/max',
    description:
      '`Temporal.PlainDateTime` with an inclusive `min`/`max` window whose edges pass; rejects datetimes outside [min, max].',
    validateNotes: [
      'Inclusive bounds: both 2020-01-01T00:00:00 (`min`) and 2020-12-31T23:59:59 (`max`) pass as exact boundaries.',
      'One second outside fails: 2019-12-31T23:59:59 trips `min`, 2021-01-01T00:00:00 trips `max`; a non-datetime value is also rejected.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}> =
        T.PlainDateTime.from('2020-06-15T12:00:00');
      return createValidate(v);
    },
    deserializeValidate: () =>
      deserializeValidate<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}> =
        T.PlainDateTime.from('2020-06-15T12:00:00');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}> =
        T.PlainDateTime.from('2020-06-15T12:00:00');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}> =
        T.PlainDateTime.from('2020-06-15T12:00:00');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}> =
        T.PlainDateTime.from('2020-06-15T12:00:00');
      return createMockType(v);
    },
    validateDataOnly: () =>
      createValidate<DataOnly<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainDateTime({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    getValidationErrors: () =>
      createGetValidationErrors<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<
        DataOnly<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>
      >(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.temporal.plainDateTime({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
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
    title: 'Plain date-time gt/lt',
    description:
      '`Temporal.PlainDateTime` with exclusive `gt`/`lt` bounds whose edges are rejected; only strictly-interior datetimes pass.',
    validateNotes: [
      'Exclusive bounds: an interior datetime (2020-06-15T12:00:00) passes, but the boundary datetimes themselves fail — 2020-01-01T00:00:00 trips `gt`, 2020-12-31T23:59:59 trips `lt`.',
      'A non-datetime value is also rejected.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}> =
        T.PlainDateTime.from('2020-06-15T12:00:00');
      return createValidate(v);
    },
    deserializeValidate: () =>
      deserializeValidate<FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}> =
        T.PlainDateTime.from('2020-06-15T12:00:00');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}> =
        T.PlainDateTime.from('2020-06-15T12:00:00');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}> =
        T.PlainDateTime.from('2020-06-15T12:00:00');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}> =
        T.PlainDateTime.from('2020-06-15T12:00:00');
      return createMockType(v);
    },
    validateDataOnly: () =>
      createValidate<DataOnly<FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainDateTime({gt: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
    getValidationErrors: () =>
      createGetValidationErrors<FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatTemporalPlainDateTime<{gt: '2020-01-01T00:00:00'; lt: '2020-12-31T23:59:59'}>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.temporal.plainDateTime({gt: '2020-01-01T00:00:00', lt: '2020-12-31T23:59:59'})),
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
    title: 'Plain date-time relative window',
    description: '`Temporal.PlainDateTime` with a relative inclusive window `now-P1000Y`/`now+P1000Y` using year components.',
    validateNotes: [
      'Both bounds are relative durations anchored at validation time (`now` ± 1000 years); a present-day datetime (2020-06-15T12:00:00) passes.',
      'Far outside the wide window fails: year 0500 trips `min`, year 3500 trips `max`. The margin is huge so the result holds regardless of the wall clock.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = T.PlainDateTime.from('2020-06-15T12:00:00');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = T.PlainDateTime.from('2020-06-15T12:00:00');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = T.PlainDateTime.from('2020-06-15T12:00:00');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = T.PlainDateTime.from('2020-06-15T12:00:00');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = T.PlainDateTime.from('2020-06-15T12:00:00');
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainDateTime({min: 'now-P1000Y', max: 'now+P1000Y'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatTemporalPlainDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.plainDateTime({min: 'now-P1000Y', max: 'now+P1000Y'})),
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
    title: 'Plain date-time relative combo',
    description:
      '`Temporal.PlainDateTime` with a relative inclusive lower bound only (`now-P500YT12H`) mixing year and hour components and an open upper end.',
    validateNotes:
      'Single relative `min` anchored at validation time (500 years and 12 hours ago); a present-day datetime (2020-06-15T12:00:00) passes while far-past year 1000 trips `min`. DateTime kinds accept both date (Y) and time (T) duration components.',
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainDateTime<{min: 'now-P500YT12H'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainDateTime<{min: 'now-P500YT12H'}> = T.PlainDateTime.from('2020-06-15T12:00:00');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainDateTime<{min: 'now-P500YT12H'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainDateTime<{min: 'now-P500YT12H'}> = T.PlainDateTime.from('2020-06-15T12:00:00');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDateTime<{min: 'now-P500YT12H'}> = T.PlainDateTime.from('2020-06-15T12:00:00');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<FormatTemporalPlainDateTime<{min: 'now-P500YT12H'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainDateTime<{min: 'now-P500YT12H'}> = T.PlainDateTime.from('2020-06-15T12:00:00');
      return deserializeGetValidationErrors(v);
    },
    mockType: 'not-supported',
    mockTypeReflect: 'not-supported',
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainDateTime<{min: 'now-P500YT12H'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainDateTime({min: 'now-P500YT12H'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainDateTime<{min: 'now-P500YT12H'}>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<FormatTemporalPlainDateTime<{min: 'now-P500YT12H'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.plainDateTime({min: 'now-P500YT12H'})),
    getSamples: () => ({
      valid: [T.PlainDateTime.from('2020-06-15T12:00:00')],
      invalid: [T.PlainDateTime.from('1000-01-01T00:00:00')],
    }),
    expectedFormatErrors: () => [{name: 'temporalPlainDateTime', formatPathTail: 'min'}],
  },

  // ═══════════════════════════ Temporal.PlainYearMonth ══════════════════════
  plainYearMonth_minmax: {
    title: 'Plain year-month min/max',
    description:
      '`Temporal.PlainYearMonth` with an inclusive `min`/`max` window whose edges pass; rejects year-months outside [min, max].',
    validateNotes: [
      'Inclusive bounds: both 2020-01 (`min`) and 2020-12 (`max`) pass as exact boundaries.',
      'One month outside fails: 2019-12 trips `min`, 2021-01 trips `max`; a non-year-month value is also rejected.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}> = T.PlainYearMonth.from('2020-06');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}> = T.PlainYearMonth.from('2020-06');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}> = T.PlainYearMonth.from('2020-06');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}> = T.PlainYearMonth.from('2020-06');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}> = T.PlainYearMonth.from('2020-06');
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainYearMonth({min: '2020-01', max: '2020-12'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.plainYearMonth({min: '2020-01', max: '2020-12'})),
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
    title: 'Plain year-month gt/lt',
    description:
      '`Temporal.PlainYearMonth` with exclusive `gt`/`lt` bounds whose edges are rejected; only strictly-interior year-months pass.',
    validateNotes: [
      'Exclusive bounds: the next month inside each edge passes (2020-02, 2020-11), but the boundary year-months themselves fail — 2020-01 trips `gt`, 2020-12 trips `lt`.',
      'A non-year-month value is also rejected.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}> = T.PlainYearMonth.from('2020-06');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}> = T.PlainYearMonth.from('2020-06');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}> = T.PlainYearMonth.from('2020-06');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}> = T.PlainYearMonth.from('2020-06');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}> = T.PlainYearMonth.from('2020-06');
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainYearMonth({gt: '2020-01', lt: '2020-12'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatTemporalPlainYearMonth<{gt: '2020-01'; lt: '2020-12'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.plainYearMonth({gt: '2020-01', lt: '2020-12'})),
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
    title: 'Plain year-month relative',
    description:
      '`Temporal.PlainYearMonth` with a relative inclusive window `now-P1000Y`/`now+P1000Y` using year/month components.',
    validateNotes: [
      'Both bounds are relative durations anchored at validation time (`now` ± 1000 years); a present-day year-month (2020-06) passes.',
      'Far outside the wide window fails: 0500-01 trips `min`, 3500-01 trips `max`. The margin is huge so the result holds regardless of the wall clock.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    validateReflect: () => {
      const v: FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = T.PlainYearMonth.from('2020-06');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = T.PlainYearMonth.from('2020-06');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = T.PlainYearMonth.from('2020-06');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = T.PlainYearMonth.from('2020-06');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}> = T.PlainYearMonth.from('2020-06');
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>>(),
    validateSchema: () => createValidate(RT.temporal.plainYearMonth({min: 'now-P1000Y', max: 'now+P1000Y'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatTemporalPlainYearMonth<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.temporal.plainYearMonth({min: 'now-P1000Y', max: 'now+P1000Y'})),
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
    title: 'Zoned date-time min/max',
    description:
      '`Temporal.ZonedDateTime` (UTC) with an inclusive `min`/`max` window whose edges pass; rejects instants outside [min, max].',
    validateNotes: [
      'Inclusive bounds: both 2020-01-01T00:00:00[UTC] (`min`) and 2020-12-31T23:59:59[UTC] (`max`) pass as exact boundaries.',
      'One second outside fails: 2019-12-31T23:59:59[UTC] trips `min`, 2021-01-01T00:00:00[UTC] trips `max`; a non-zoned value is also rejected.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () =>
      createValidate<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
    validateReflect: () => {
      const v: FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}> =
        T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]');
      return createValidate(v);
    },
    deserializeValidate: () =>
      deserializeValidate<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}> =
        T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}> =
        T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<
        FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>
      >(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}> =
        T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}> =
        T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]');
      return createMockType(v);
    },
    validateDataOnly: () =>
      createValidate<DataOnly<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>>(),
    validateSchema: () =>
      createValidate(RT.temporal.zonedDateTime({min: '2020-01-01T00:00:00[UTC]', max: '2020-12-31T23:59:59[UTC]'})),
    getValidationErrors: () =>
      createGetValidationErrors<
        FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>
      >(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<
        DataOnly<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>
      >(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.temporal.zonedDateTime({min: '2020-01-01T00:00:00[UTC]', max: '2020-12-31T23:59:59[UTC]'})),
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
    title: 'Zoned date-time gt/lt',
    description:
      '`Temporal.ZonedDateTime` (UTC) with exclusive `gt`/`lt` bounds whose edges are rejected; only strictly-interior instants pass.',
    validateNotes: [
      'Exclusive bounds: an interior datetime (2020-06-15T12:00:00[UTC]) passes, but the boundary values themselves fail — 2020-01-01T00:00:00[UTC] trips `gt`, 2020-12-31T23:59:59[UTC] trips `lt`.',
      'A non-zoned value is also rejected.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () =>
      createValidate<FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}>>(),
    validateReflect: () => {
      const v: FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}> =
        T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]');
      return createValidate(v);
    },
    deserializeValidate: () =>
      deserializeValidate<FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}> =
        T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}> =
        T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<
        FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}>
      >(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}> =
        T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}> =
        T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]');
      return createMockType(v);
    },
    validateDataOnly: () =>
      createValidate<DataOnly<FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}>>>(),
    validateSchema: () =>
      createValidate(RT.temporal.zonedDateTime({gt: '2020-01-01T00:00:00[UTC]', lt: '2020-12-31T23:59:59[UTC]'})),
    getValidationErrors: () =>
      createGetValidationErrors<FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<
        DataOnly<FormatTemporalZonedDateTime<{gt: '2020-01-01T00:00:00[UTC]'; lt: '2020-12-31T23:59:59[UTC]'}>>
      >(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.temporal.zonedDateTime({gt: '2020-01-01T00:00:00[UTC]', lt: '2020-12-31T23:59:59[UTC]'})),
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
    title: 'Zoned date-time relative window',
    description:
      '`Temporal.ZonedDateTime` (UTC) with a relative inclusive window `now-P1000Y`/`now+P1000Y` using year components.',
    validateNotes: [
      'Both bounds are relative durations anchored at validation time (`now` ± 1000 years); a present-day datetime (2020-06-15T12:00:00[UTC]) passes.',
      'Far outside the wide window fails: year 0500 trips `min`, year 3500 trips `max`. The margin is huge so the result holds regardless of the wall clock.',
    ],
    // Temporal-based format types (`Temporal.X & {brand}`) are validated by native
    // identity; DataOnly's structural object projection mangles them, so
    // createValidate<DataOnly<T>>() diverges.
    dataOnlyDivergent: true,
    validate: () => createValidate<FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    validateReflect: () => {
      const v: FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}> =
        T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]');
      return createValidate(v);
    },
    deserializeValidate: () => deserializeValidate<FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    deserializeValidateReflect: () => {
      const v: FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}> =
        T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]');
      return deserializeValidate(v);
    },
    getValidationErrorsReflect: () => {
      const v: FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}> =
        T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]');
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrors: () =>
      deserializeGetValidationErrors<FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    deserializeGetValidationErrorsReflect: () => {
      const v: FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}> =
        T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]');
      return deserializeGetValidationErrors(v);
    },
    mockTypeReflect: () => {
      const v: FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}> =
        T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]');
      return createMockType(v);
    },
    validateDataOnly: () => createValidate<DataOnly<FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>>(),
    validateSchema: () => createValidate(RT.temporal.zonedDateTime({min: 'now-P1000Y', max: 'now+P1000Y'})),
    getValidationErrors: () => createGetValidationErrors<FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>(),
    getValidationErrorsDataOnly: () =>
      createGetValidationErrors<DataOnly<FormatTemporalZonedDateTime<{min: 'now-P1000Y'; max: 'now+P1000Y'}>>>(),
    getValidationErrorsSchema: () => createGetValidationErrors(RT.temporal.zonedDateTime({min: 'now-P1000Y', max: 'now+P1000Y'})),
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
