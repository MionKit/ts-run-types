// Reflect-form thunks author a representative value of the (now transparent) format
// type — a Date / Temporal.X instance whose only role is to drive `T` inference; it
// is discarded at runtime. The getValidationErrors reflect/deserialize forms are
// `'not-supported'` (the runner exercises getValidationErrors only via the
// format-payload + schema variants). Cases whose open/exclusive bounds can't be
// mocked carry `mockType: 'not-supported'` (they already omitted a mock — now explicit).
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
import {createValidate, createGetValidationErrors, createMockType, type DataOnly} from '@mionjs/ts-go-run-types';
import {deserializeValidate} from '../../util/deserializeRTFunctions.ts';
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatDate<{gt,lt}> — exclusive edges rejected, interior passes',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatDate<{min,lt}> — inclusive lower + exclusive upper',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatDate<{max: now}> — rejects the future (relative)',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatDate<{min: now-P1000Y, max: now+P1000Y}> — relative window (Y, both components allowed)',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatDate<{min: now-P1000YT12H}> — relative with both date + time components',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalInstant<{min,max}> — inclusive edges',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalInstant<{gt,lt}> — exclusive edges rejected',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalInstant<{min: now-PT8760000H, max: now+PT8760000H}> — relative (time components only)',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainDate<{min,max}> — inclusive edges',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainDate<{gt,lt}> — exclusive edges rejected, next day inside passes',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainDate<{min,lt}> — inclusive lower + exclusive upper',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainDate<{gt,max}> — exclusive lower + inclusive upper',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainDate<{min}> — lower bound only',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainDate<{max}> — upper bound only',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainDate<{gt}> — exclusive lower bound only',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainDate<{lt}> — exclusive upper bound only',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainDate<{min: now-P1000Y, max: now+P1000Y}> — relative window (Y)',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainDate<{min: now-P100Y6M15D}> — relative Y/M/D components',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainDate<{min: now-P52200W}> — relative W component',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainTime<{min,max}> — inclusive edges (business hours)',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainTime<{gt,lt}> — exclusive edges rejected',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainDateTime<{min,max}> — inclusive edges',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainDateTime<{gt,lt}> — exclusive edges rejected',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainDateTime<{min: now-P1000Y, max: now+P1000Y}> — relative window',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainDateTime<{min: now-P500YT12H}> — relative date + time components',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainYearMonth<{min,max}> — inclusive edges',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainYearMonth<{gt,lt}> — exclusive edges rejected',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalPlainYearMonth<{min: now-P1000Y, max: now+P1000Y}> — relative (Y/M)',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalZonedDateTime<{min,max}> — inclusive edges',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalZonedDateTime<{gt,lt}> — exclusive edges rejected',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
    title: 'FormatTemporalZonedDateTime<{min: now-P1000Y, max: now+P1000Y}> — relative window',
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
    getValidationErrorsReflect: 'not-supported',
    deserializeGetValidationErrors: 'not-supported',
    deserializeGetValidationErrorsReflect: 'not-supported',
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
