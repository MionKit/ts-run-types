// format-serialization / DateTime — the date/time FORMAT family round-tripped:
// format-branded `TF.Date<P>` + the 6 orderable `TFT.*<P>` types
// through every JSON encoder × decoder pairing and the binary round-trip. The
// format brand only constrains validation (bounds); serialization uses the base
// kind (Date / Temporal.X), so this proves the branded types serialize exactly
// like their unbranded base. This closes the format-serialization gap, which
// previously had zero date/temporal coverage.
//
// Temporal is the polyfill global (test/support/setup.ts); types resolve via
// test/support/temporal-ambient.d.ts + the ts-runtypes/formats/temporal
// subpath. By-value equality for Temporal instances is handled in
// util/equalsHelpers.ts. The `/formats` side-effect import registers the
// native-date format runtime.

import * as TF from 'ts-runtypes/formats';
import * as TFT from 'ts-runtypes/formats/temporal';
import type {SerializationCase} from './types.ts';
import 'ts-runtypes/formats';
import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from 'ts-runtypes';

const T = (globalThis as {Temporal: typeof Temporal}).Temporal;

export const DATETIME = {
  date: {
    title: 'TF.Date',
    description:
      'JSON and binary round-trip of TF.Date, a native Date branded with date-range bounds; the min/max brand constrains validation only, so the Date serializes exactly like an unbranded Date, carrying the toJSON() ISO string in JSON and numeric packing in binary.',
    serializeNotes:
      'Branded native Date: serialization uses the base Date kind (brand is validation-only). JSON carries the toJSON() ISO string and restores via the Date constructor; binary uses the numeric Date packing.',
    mutateEncoder: () =>
      createJsonEncoder<TF.Date<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<TF.Date<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<TF.Date<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {strategy: 'direct'}),
    compactEncoder: () =>
      createJsonEncoder<TF.Date<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<TF.Date<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    preserveDecoder: () =>
      createJsonDecoder<TF.Date<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () =>
      createJsonDecoder<TF.Date<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<TF.Date<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    binaryDecoder: () => createBinaryDecoder<TF.Date<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    schemaEncoder: () => createJsonEncoder(TF.date({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    schemaDecoder: () => createJsonDecoder(TF.date({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.date({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.date({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    getTestData: () => ({
      values: [
        new Date(Date.UTC(2020, 5, 15)),
        new Date(Date.UTC(2020, 5, 15, 12, 30, 45, 123)), // ms precision survives the round-trip
        new Date(Date.UTC(2020, 0, 1)), // range lower-edge
      ],
    }),
  },

  instant: {
    title: 'TFT.Instant',
    description:
      'JSON and binary round-trip of TFT.Instant, a Temporal.Instant branded with an instant range; the bounds constrain validation only, so the Instant serializes exactly like an unbranded one, carrying the toJSON() string in JSON and restoring via Temporal.Instant.from().',
    serializeNotes:
      'Branded Temporal.Instant: serialization uses the base Temporal kind (brand is validation-only); JSON carries the canonical instant string and restores via .from(), binary uses the Instant packing.',
    mutateEncoder: () =>
      createJsonEncoder<TFT.Instant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(undefined, {
        strategy: 'mutate',
      }),
    cloneEncoder: () =>
      createJsonEncoder<TFT.Instant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(undefined, {
        strategy: 'clone',
      }),
    directEncoder: () =>
      createJsonEncoder<TFT.Instant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(undefined, {
        strategy: 'direct',
      }),
    compactEncoder: () =>
      createJsonEncoder<TFT.Instant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(undefined, {
        strategy: 'compact',
      }),
    stripDecoder: () => createJsonDecoder<TFT.Instant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    preserveDecoder: () =>
      createJsonDecoder<TFT.Instant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(undefined, {
        strategy: 'preserve',
      }),
    compactDecoder: () =>
      createJsonDecoder<TFT.Instant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(undefined, {
        strategy: 'compact',
      }),
    binaryEncoder: () => createBinaryEncoder<TFT.Instant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    binaryDecoder: () => createBinaryDecoder<TFT.Instant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    schemaEncoder: () => createJsonEncoder(TFT.instant({min: '2020-01-01T00:00:00Z', max: '2020-12-31T23:59:59Z'})),
    schemaDecoder: () => createJsonDecoder(TFT.instant({min: '2020-01-01T00:00:00Z', max: '2020-12-31T23:59:59Z'})),
    schemaBinaryEncoder: () => createBinaryEncoder(TFT.instant({min: '2020-01-01T00:00:00Z', max: '2020-12-31T23:59:59Z'})),
    schemaBinaryDecoder: () => createBinaryDecoder(TFT.instant({min: '2020-01-01T00:00:00Z', max: '2020-12-31T23:59:59Z'})),
    getTestData: () => ({values: [T.Instant.from('2020-06-15T12:00:00Z')]}),
  },

  plainDate: {
    title: 'TFT.PlainDate',
    description:
      'JSON and binary round-trip of TFT.PlainDate, a Temporal.PlainDate branded with a date range; the bounds constrain validation only, so the PlainDate serializes exactly like an unbranded one, carrying the toJSON() "YYYY-MM-DD" string in JSON and restoring via Temporal.PlainDate.from().',
    serializeNotes:
      'Branded Temporal.PlainDate: serialization uses the base Temporal kind (brand is validation-only); JSON carries the plain-date string and restores via .from().',
    mutateEncoder: () =>
      createJsonEncoder<TFT.PlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<TFT.PlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<TFT.PlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(undefined, {strategy: 'direct'}),
    compactEncoder: () =>
      createJsonEncoder<TFT.PlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<TFT.PlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    preserveDecoder: () =>
      createJsonDecoder<TFT.PlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () =>
      createJsonDecoder<TFT.PlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<TFT.PlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    binaryDecoder: () => createBinaryDecoder<TFT.PlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    schemaEncoder: () => createJsonEncoder(TFT.plainDate({min: '2020-01-01', max: '2020-12-31'})),
    schemaDecoder: () => createJsonDecoder(TFT.plainDate({min: '2020-01-01', max: '2020-12-31'})),
    schemaBinaryEncoder: () => createBinaryEncoder(TFT.plainDate({min: '2020-01-01', max: '2020-12-31'})),
    schemaBinaryDecoder: () => createBinaryDecoder(TFT.plainDate({min: '2020-01-01', max: '2020-12-31'})),
    getTestData: () => ({values: [T.PlainDate.from('2020-06-15')]}),
  },

  plainTime: {
    title: 'TFT.PlainTime',
    description:
      'JSON and binary round-trip of TFT.PlainTime, a Temporal.PlainTime branded with a time-of-day range; the bounds constrain validation only, so the PlainTime serializes exactly like an unbranded one, carrying the toJSON() "HH:mm:ss" string in JSON and restoring via Temporal.PlainTime.from().',
    serializeNotes:
      'Branded Temporal.PlainTime: serialization uses the base Temporal kind (brand is validation-only); JSON carries the plain-time string and restores via .from().',
    mutateEncoder: () => createJsonEncoder<TFT.PlainTime<{min: '09:00:00'; max: '17:00:00'}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<TFT.PlainTime<{min: '09:00:00'; max: '17:00:00'}>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<TFT.PlainTime<{min: '09:00:00'; max: '17:00:00'}>>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<TFT.PlainTime<{min: '09:00:00'; max: '17:00:00'}>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<TFT.PlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    preserveDecoder: () =>
      createJsonDecoder<TFT.PlainTime<{min: '09:00:00'; max: '17:00:00'}>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<TFT.PlainTime<{min: '09:00:00'; max: '17:00:00'}>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<TFT.PlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    binaryDecoder: () => createBinaryDecoder<TFT.PlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    schemaEncoder: () => createJsonEncoder(TFT.plainTime({min: '09:00:00', max: '17:00:00'})),
    schemaDecoder: () => createJsonDecoder(TFT.plainTime({min: '09:00:00', max: '17:00:00'})),
    schemaBinaryEncoder: () => createBinaryEncoder(TFT.plainTime({min: '09:00:00', max: '17:00:00'})),
    schemaBinaryDecoder: () => createBinaryDecoder(TFT.plainTime({min: '09:00:00', max: '17:00:00'})),
    getTestData: () => ({values: [T.PlainTime.from('12:30:00')]}),
  },

  plainDateTime: {
    title: 'TFT.PlainDateTime',
    description:
      'JSON and binary round-trip of TFT.PlainDateTime, a Temporal.PlainDateTime branded with a date-time range; the bounds constrain validation only, so the PlainDateTime serializes exactly like an unbranded one, carrying the toJSON() "YYYY-MM-DDTHH:mm:ss" string in JSON and restoring via Temporal.PlainDateTime.from().',
    serializeNotes:
      'Branded Temporal.PlainDateTime: serialization uses the base Temporal kind (brand is validation-only); JSON carries the plain-date-time string and restores via .from().',
    mutateEncoder: () =>
      createJsonEncoder<TFT.PlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {
        strategy: 'mutate',
      }),
    cloneEncoder: () =>
      createJsonEncoder<TFT.PlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {
        strategy: 'clone',
      }),
    directEncoder: () =>
      createJsonEncoder<TFT.PlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {
        strategy: 'direct',
      }),
    compactEncoder: () =>
      createJsonEncoder<TFT.PlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {
        strategy: 'compact',
      }),
    stripDecoder: () => createJsonDecoder<TFT.PlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    preserveDecoder: () =>
      createJsonDecoder<TFT.PlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {
        strategy: 'preserve',
      }),
    compactDecoder: () =>
      createJsonDecoder<TFT.PlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {
        strategy: 'compact',
      }),
    binaryEncoder: () => createBinaryEncoder<TFT.PlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    binaryDecoder: () => createBinaryDecoder<TFT.PlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    schemaEncoder: () => createJsonEncoder(TFT.plainDateTime({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    schemaDecoder: () => createJsonDecoder(TFT.plainDateTime({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    schemaBinaryEncoder: () => createBinaryEncoder(TFT.plainDateTime({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    schemaBinaryDecoder: () => createBinaryDecoder(TFT.plainDateTime({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    getTestData: () => ({values: [T.PlainDateTime.from('2020-06-15T12:00:00')]}),
  },

  plainYearMonth: {
    title: 'TFT.PlainYearMonth',
    description:
      'JSON and binary round-trip of TFT.PlainYearMonth, a Temporal.PlainYearMonth branded with a year-month range; the bounds constrain validation only, so the PlainYearMonth serializes exactly like an unbranded one, carrying the toJSON() "YYYY-MM" string in JSON and restoring via Temporal.PlainYearMonth.from().',
    serializeNotes:
      'Branded Temporal.PlainYearMonth: serialization uses the base Temporal kind (brand is validation-only); JSON carries the year-month string and restores via .from().',
    mutateEncoder: () => createJsonEncoder<TFT.PlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<TFT.PlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<TFT.PlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(undefined, {strategy: 'direct'}),
    compactEncoder: () =>
      createJsonEncoder<TFT.PlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<TFT.PlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    preserveDecoder: () =>
      createJsonDecoder<TFT.PlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () =>
      createJsonDecoder<TFT.PlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<TFT.PlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    binaryDecoder: () => createBinaryDecoder<TFT.PlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    schemaEncoder: () => createJsonEncoder(TFT.plainYearMonth({min: '2020-01', max: '2020-12'})),
    schemaDecoder: () => createJsonDecoder(TFT.plainYearMonth({min: '2020-01', max: '2020-12'})),
    schemaBinaryEncoder: () => createBinaryEncoder(TFT.plainYearMonth({min: '2020-01', max: '2020-12'})),
    schemaBinaryDecoder: () => createBinaryDecoder(TFT.plainYearMonth({min: '2020-01', max: '2020-12'})),
    getTestData: () => ({values: [T.PlainYearMonth.from('2020-06')]}),
  },

  zonedDateTime: {
    title: 'TFT.ZonedDateTime',
    description:
      'JSON and binary round-trip of TFT.ZonedDateTime, a Temporal.ZonedDateTime branded with a zoned range; the bounds constrain validation only, so the ZonedDateTime serializes exactly like an unbranded one, carrying the toJSON() string with its "[timezone]" annotation in JSON and restoring via Temporal.ZonedDateTime.from().',
    serializeNotes:
      'Branded Temporal.ZonedDateTime: serialization uses the base Temporal kind (brand is validation-only); the wire string preserves the [UTC] time-zone annotation and restores via .from(), so the zone survives the round-trip.',
    mutateEncoder: () =>
      createJsonEncoder<TFT.ZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(undefined, {
        strategy: 'mutate',
      }),
    cloneEncoder: () =>
      createJsonEncoder<TFT.ZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(undefined, {
        strategy: 'clone',
      }),
    directEncoder: () =>
      createJsonEncoder<TFT.ZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(undefined, {
        strategy: 'direct',
      }),
    compactEncoder: () =>
      createJsonEncoder<TFT.ZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(undefined, {
        strategy: 'compact',
      }),
    stripDecoder: () =>
      createJsonDecoder<TFT.ZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
    preserveDecoder: () =>
      createJsonDecoder<TFT.ZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(undefined, {
        strategy: 'preserve',
      }),
    compactDecoder: () =>
      createJsonDecoder<TFT.ZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(undefined, {
        strategy: 'compact',
      }),
    binaryEncoder: () =>
      createBinaryEncoder<TFT.ZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
    binaryDecoder: () =>
      createBinaryDecoder<TFT.ZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
    schemaEncoder: () => createJsonEncoder(TFT.zonedDateTime({min: '2020-01-01T00:00:00[UTC]', max: '2020-12-31T23:59:59[UTC]'})),
    schemaDecoder: () => createJsonDecoder(TFT.zonedDateTime({min: '2020-01-01T00:00:00[UTC]', max: '2020-12-31T23:59:59[UTC]'})),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(TFT.zonedDateTime({min: '2020-01-01T00:00:00[UTC]', max: '2020-12-31T23:59:59[UTC]'})),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(TFT.zonedDateTime({min: '2020-01-01T00:00:00[UTC]', max: '2020-12-31T23:59:59[UTC]'})),
    getTestData: () => ({values: [T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]')]}),
  },
} as const satisfies Record<string, SerializationCase>;
