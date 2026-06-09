// format-serialization / DateTime — the date/time FORMAT family round-tripped:
// format-branded `FormatDate<P>` + the 6 orderable `FormatTemporal*<P>` types
// through every JSON encoder × decoder pairing and the binary round-trip. The
// format brand only constrains validation (bounds); serialization uses the base
// kind (Date / Temporal.X), so this proves the branded types serialize exactly
// like their unbranded base. This closes the format-serialization gap, which
// previously had zero date/temporal coverage.
//
// Temporal is the polyfill global (test/setup.ts); types resolve via
// test/temporal-ambient.d.ts + the @mionjs/ts-go-run-types/formats/temporal
// subpath. By-value equality for Temporal instances is handled in
// util/equalsHelpers.ts. The `/formats` side-effect import registers the
// native-date format runtime.

import type {SerializationCase} from './types.ts';
import * as RT from '@mionjs/ts-go-run-types/schema';
import '@mionjs/ts-go-run-types/formats';
import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
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
  date: {
    title: 'FormatDate<{min,max}>',
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
    title: 'FormatTemporalInstant<{min,max}>',
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
    title: 'FormatTemporalPlainDate<{min,max}>',
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
    title: 'FormatTemporalPlainTime<{min,max}>',
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
    title: 'FormatTemporalPlainDateTime<{min,max}>',
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
    title: 'FormatTemporalPlainYearMonth<{min,max}>',
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
    title: 'FormatTemporalZonedDateTime<{min,max}>',
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
