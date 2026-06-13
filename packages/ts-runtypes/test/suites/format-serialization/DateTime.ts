// format-serialization / DateTime — the date/time FORMAT family round-tripped:
// format-branded `FormatDate<P>` + the 6 orderable `FormatTemporal*<P>` types
// through every JSON encoder × decoder pairing and the binary round-trip. The
// format brand only constrains validation (bounds); serialization uses the base
// kind (Date / Temporal.X), so this proves the branded types serialize exactly
// like their unbranded base. This closes the format-serialization gap, which
// previously had zero date/temporal coverage.
//
// Temporal is the polyfill global (test/setup.ts); types resolve via
// test/temporal-ambient.d.ts + the ts-runtypes/formats/temporal
// subpath. By-value equality for Temporal instances is handled in
// util/equalsHelpers.ts. The `/formats` side-effect import registers the
// native-date format runtime.

import type {SerializationCase} from './types.ts';
import * as RT from 'ts-runtypes/schema';
import 'ts-runtypes/formats';
import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from 'ts-runtypes';
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
  date: {
    title: 'FormatDate',
    description:
      'JSON and binary round-trip of FormatDate, a native Date branded with date-range bounds; the min/max brand constrains validation only, so the Date serializes exactly like an unbranded Date, carrying the toJSON() ISO string in JSON and numeric packing in binary.',
    serializeNotes:
      'Branded native Date: serialization uses the base Date kind (brand is validation-only). JSON carries the toJSON() ISO string and restores via the Date constructor; binary uses the numeric Date packing.',
    mutateEncoder: () =>
      createJsonEncoder<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    preserveDecoder: () =>
      createJsonDecoder<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    binaryDecoder: () => createBinaryDecoder<FormatDate<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    schemaEncoder: () => createJsonEncoder(RT.date({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    schemaDecoder: () => createJsonDecoder(RT.date({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.date({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.date({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    getTestData: () => ({values: [new Date(Date.UTC(2020, 5, 15))]}),
  },

  instant: {
    title: 'FormatTemporalInstant',
    description:
      'JSON and binary round-trip of FormatTemporalInstant, a Temporal.Instant branded with an instant range; the bounds constrain validation only, so the Instant serializes exactly like an unbranded one, carrying the toJSON() string in JSON and restoring via Temporal.Instant.from().',
    serializeNotes:
      'Branded Temporal.Instant: serialization uses the base Temporal kind (brand is validation-only); JSON carries the canonical instant string and restores via .from(), binary uses the Instant packing.',
    mutateEncoder: () =>
      createJsonEncoder<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(undefined, {
        strategy: 'mutate',
      }),
    cloneEncoder: () =>
      createJsonEncoder<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(undefined, {
        strategy: 'clone',
      }),
    directEncoder: () =>
      createJsonEncoder<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(undefined, {
        strategy: 'direct',
      }),
    stripDecoder: () => createJsonDecoder<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    preserveDecoder: () =>
      createJsonDecoder<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(undefined, {
        strategy: 'preserve',
      }),
    binaryEncoder: () => createBinaryEncoder<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    binaryDecoder: () => createBinaryDecoder<FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'; max: '2020-12-31T23:59:59Z'}>>(),
    schemaEncoder: () => createJsonEncoder(RT.temporal.instant({min: '2020-01-01T00:00:00Z', max: '2020-12-31T23:59:59Z'})),
    schemaDecoder: () => createJsonDecoder(RT.temporal.instant({min: '2020-01-01T00:00:00Z', max: '2020-12-31T23:59:59Z'})),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(RT.temporal.instant({min: '2020-01-01T00:00:00Z', max: '2020-12-31T23:59:59Z'})),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(RT.temporal.instant({min: '2020-01-01T00:00:00Z', max: '2020-12-31T23:59:59Z'})),
    getTestData: () => ({values: [T.Instant.from('2020-06-15T12:00:00Z')]}),
  },

  plainDate: {
    title: 'FormatTemporalPlainDate',
    description:
      'JSON and binary round-trip of FormatTemporalPlainDate, a Temporal.PlainDate branded with a date range; the bounds constrain validation only, so the PlainDate serializes exactly like an unbranded one, carrying the toJSON() "YYYY-MM-DD" string in JSON and restoring via Temporal.PlainDate.from().',
    serializeNotes:
      'Branded Temporal.PlainDate: serialization uses the base Temporal kind (brand is validation-only); JSON carries the plain-date string and restores via .from().',
    mutateEncoder: () =>
      createJsonEncoder<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    preserveDecoder: () =>
      createJsonDecoder<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    binaryDecoder: () => createBinaryDecoder<FormatTemporalPlainDate<{min: '2020-01-01'; max: '2020-12-31'}>>(),
    schemaEncoder: () => createJsonEncoder(RT.temporal.plainDate({min: '2020-01-01', max: '2020-12-31'})),
    schemaDecoder: () => createJsonDecoder(RT.temporal.plainDate({min: '2020-01-01', max: '2020-12-31'})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.temporal.plainDate({min: '2020-01-01', max: '2020-12-31'})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.temporal.plainDate({min: '2020-01-01', max: '2020-12-31'})),
    getTestData: () => ({values: [T.PlainDate.from('2020-06-15')]}),
  },

  plainTime: {
    title: 'FormatTemporalPlainTime',
    description:
      'JSON and binary round-trip of FormatTemporalPlainTime, a Temporal.PlainTime branded with a time-of-day range; the bounds constrain validation only, so the PlainTime serializes exactly like an unbranded one, carrying the toJSON() "HH:mm:ss" string in JSON and restoring via Temporal.PlainTime.from().',
    serializeNotes:
      'Branded Temporal.PlainTime: serialization uses the base Temporal kind (brand is validation-only); JSON carries the plain-time string and restores via .from().',
    mutateEncoder: () =>
      createJsonEncoder<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    preserveDecoder: () =>
      createJsonDecoder<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    binaryDecoder: () => createBinaryDecoder<FormatTemporalPlainTime<{min: '09:00:00'; max: '17:00:00'}>>(),
    schemaEncoder: () => createJsonEncoder(RT.temporal.plainTime({min: '09:00:00', max: '17:00:00'})),
    schemaDecoder: () => createJsonDecoder(RT.temporal.plainTime({min: '09:00:00', max: '17:00:00'})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.temporal.plainTime({min: '09:00:00', max: '17:00:00'})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.temporal.plainTime({min: '09:00:00', max: '17:00:00'})),
    getTestData: () => ({values: [T.PlainTime.from('12:30:00')]}),
  },

  plainDateTime: {
    title: 'FormatTemporalPlainDateTime',
    description:
      'JSON and binary round-trip of FormatTemporalPlainDateTime, a Temporal.PlainDateTime branded with a date-time range; the bounds constrain validation only, so the PlainDateTime serializes exactly like an unbranded one, carrying the toJSON() "YYYY-MM-DDTHH:mm:ss" string in JSON and restoring via Temporal.PlainDateTime.from().',
    serializeNotes:
      'Branded Temporal.PlainDateTime: serialization uses the base Temporal kind (brand is validation-only); JSON carries the plain-date-time string and restores via .from().',
    mutateEncoder: () =>
      createJsonEncoder<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {
        strategy: 'mutate',
      }),
    cloneEncoder: () =>
      createJsonEncoder<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {
        strategy: 'clone',
      }),
    directEncoder: () =>
      createJsonEncoder<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {
        strategy: 'direct',
      }),
    stripDecoder: () =>
      createJsonDecoder<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    preserveDecoder: () =>
      createJsonDecoder<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(undefined, {
        strategy: 'preserve',
      }),
    binaryEncoder: () =>
      createBinaryEncoder<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    binaryDecoder: () =>
      createBinaryDecoder<FormatTemporalPlainDateTime<{min: '2020-01-01T00:00:00'; max: '2020-12-31T23:59:59'}>>(),
    schemaEncoder: () => createJsonEncoder(RT.temporal.plainDateTime({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    schemaDecoder: () => createJsonDecoder(RT.temporal.plainDateTime({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(RT.temporal.plainDateTime({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(RT.temporal.plainDateTime({min: '2020-01-01T00:00:00', max: '2020-12-31T23:59:59'})),
    getTestData: () => ({values: [T.PlainDateTime.from('2020-06-15T12:00:00')]}),
  },

  plainYearMonth: {
    title: 'FormatTemporalPlainYearMonth',
    description:
      'JSON and binary round-trip of FormatTemporalPlainYearMonth, a Temporal.PlainYearMonth branded with a year-month range; the bounds constrain validation only, so the PlainYearMonth serializes exactly like an unbranded one, carrying the toJSON() "YYYY-MM" string in JSON and restoring via Temporal.PlainYearMonth.from().',
    serializeNotes:
      'Branded Temporal.PlainYearMonth: serialization uses the base Temporal kind (brand is validation-only); JSON carries the year-month string and restores via .from().',
    mutateEncoder: () =>
      createJsonEncoder<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    preserveDecoder: () =>
      createJsonDecoder<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    binaryDecoder: () => createBinaryDecoder<FormatTemporalPlainYearMonth<{min: '2020-01'; max: '2020-12'}>>(),
    schemaEncoder: () => createJsonEncoder(RT.temporal.plainYearMonth({min: '2020-01', max: '2020-12'})),
    schemaDecoder: () => createJsonDecoder(RT.temporal.plainYearMonth({min: '2020-01', max: '2020-12'})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.temporal.plainYearMonth({min: '2020-01', max: '2020-12'})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.temporal.plainYearMonth({min: '2020-01', max: '2020-12'})),
    getTestData: () => ({values: [T.PlainYearMonth.from('2020-06')]}),
  },

  zonedDateTime: {
    title: 'FormatTemporalZonedDateTime',
    description:
      'JSON and binary round-trip of FormatTemporalZonedDateTime, a Temporal.ZonedDateTime branded with a zoned range; the bounds constrain validation only, so the ZonedDateTime serializes exactly like an unbranded one, carrying the toJSON() string with its "[timezone]" annotation in JSON and restoring via Temporal.ZonedDateTime.from().',
    serializeNotes:
      'Branded Temporal.ZonedDateTime: serialization uses the base Temporal kind (brand is validation-only); the wire string preserves the [UTC] time-zone annotation and restores via .from(), so the zone survives the round-trip.',
    mutateEncoder: () =>
      createJsonEncoder<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(
        undefined,
        {strategy: 'mutate'}
      ),
    cloneEncoder: () =>
      createJsonEncoder<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(
        undefined,
        {strategy: 'clone'}
      ),
    directEncoder: () =>
      createJsonEncoder<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(
        undefined,
        {strategy: 'direct'}
      ),
    stripDecoder: () =>
      createJsonDecoder<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
    preserveDecoder: () =>
      createJsonDecoder<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(
        undefined,
        {strategy: 'preserve'}
      ),
    binaryEncoder: () =>
      createBinaryEncoder<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
    binaryDecoder: () =>
      createBinaryDecoder<FormatTemporalZonedDateTime<{min: '2020-01-01T00:00:00[UTC]'; max: '2020-12-31T23:59:59[UTC]'}>>(),
    schemaEncoder: () =>
      createJsonEncoder(RT.temporal.zonedDateTime({min: '2020-01-01T00:00:00[UTC]', max: '2020-12-31T23:59:59[UTC]'})),
    schemaDecoder: () =>
      createJsonDecoder(RT.temporal.zonedDateTime({min: '2020-01-01T00:00:00[UTC]', max: '2020-12-31T23:59:59[UTC]'})),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(RT.temporal.zonedDateTime({min: '2020-01-01T00:00:00[UTC]', max: '2020-12-31T23:59:59[UTC]'})),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(RT.temporal.zonedDateTime({min: '2020-01-01T00:00:00[UTC]', max: '2020-12-31T23:59:59[UTC]'})),
    getTestData: () => ({values: [T.ZonedDateTime.from('2020-06-15T12:00:00[UTC]')]}),
  },
} as const satisfies Record<string, SerializationCase>;
