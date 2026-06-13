// serialization / DateTime — the date/time family grouped together: JS `Date`
// (also kept in Atomic) plus all 8 TC39 `Temporal` types, each through every
// JSON encoder × decoder pairing and the binary round-trip. All serialize via
// the type's own `toJSON()` (string on the wire) and restore via `.from()`;
// binary uses numeric packing where available and a string fallback otherwise.
//
// Temporal is the polyfill global in tests (see test/setup.ts); types resolve
// via test/temporal-ambient.d.ts. Each thunk spells out the concrete `<T>` at
// the call site so the vite plugin injects the resolved id. By-value equality
// for Temporal instances (no enumerable own keys) is handled in
// util/equalsHelpers.ts (canonical-string compare + immutable pass-through).

import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import '@mionjs/ts-go-run-types/formats';
import type {SerializationCase} from './types.ts';

const T = (globalThis as {Temporal: typeof Temporal}).Temporal;

export const DATETIME = {
  // Duplicated from Atomic.ts so the date/time family reads as one group here too.
  date: {
    title: 'date',
    description: 'Root `Date` round-trips across JSON and binary, returning a real Date instance on decode.',
    serializeNotes: 'JSON serializes Date to an ISO string and revives it with `new Date(...)`; binary stores the epoch as a fixed 8-byte float64 of `getTime()`.',
    mutateEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Date>(),
    preserveDecoder: () => createJsonDecoder<Date>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Date>(),
    binaryDecoder: () => createBinaryDecoder<Date>(),
    schemaEncoder: () => createJsonEncoder(RT.date()),
    schemaDecoder: () => createJsonDecoder(RT.date()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.date()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.date()),
    getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z')]}),
  },

  instant: {
    title: 'Temporal.Instant',
    description: 'Root `Temporal.Instant`, an exact point on the timeline, round-trips across JSON and binary, returning a real Instant on decode.',
    serializeNotes: 'JSON serializes via `Instant.toJSON()` (UTC instant string) and revives with `Temporal.Instant.from(...)`; equality is canonical-string compare since Instants have no enumerable own keys.',
    mutateEncoder: () => createJsonEncoder<Temporal.Instant>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Temporal.Instant>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Temporal.Instant>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Temporal.Instant>(),
    preserveDecoder: () => createJsonDecoder<Temporal.Instant>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Temporal.Instant>(),
    binaryDecoder: () => createBinaryDecoder<Temporal.Instant>(),
    schemaEncoder: () => createJsonEncoder(RT.temporal.instant()),
    schemaDecoder: () => createJsonDecoder(RT.temporal.instant()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.temporal.instant()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.temporal.instant()),
    getTestData: () => ({values: [T.Instant.from('2020-01-15T10:30:00Z'), T.Instant.fromEpochMilliseconds(0)]}),
  },

  zonedDateTime: {
    title: 'Temporal.ZonedDateTime',
    description: 'Root `Temporal.ZonedDateTime`, an instant plus time zone and calendar, round-trips across JSON and binary, returning a real ZonedDateTime on decode.',
    serializeNotes: 'JSON serializes via `toJSON()` (a `...[TimeZone]` string carrying the zone) and revives with `Temporal.ZonedDateTime.from(...)`; the time-zone annotation is preserved through the round-trip.',
    mutateEncoder: () => createJsonEncoder<Temporal.ZonedDateTime>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Temporal.ZonedDateTime>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Temporal.ZonedDateTime>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Temporal.ZonedDateTime>(),
    preserveDecoder: () => createJsonDecoder<Temporal.ZonedDateTime>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Temporal.ZonedDateTime>(),
    binaryDecoder: () => createBinaryDecoder<Temporal.ZonedDateTime>(),
    schemaEncoder: () => createJsonEncoder(RT.temporal.zonedDateTime()),
    schemaDecoder: () => createJsonDecoder(RT.temporal.zonedDateTime()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.temporal.zonedDateTime()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.temporal.zonedDateTime()),
    getTestData: () => ({values: [T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]')]}),
  },

  plainDate: {
    title: 'Temporal.PlainDate',
    description: 'Root `Temporal.PlainDate`, a calendar date with no time or zone, round-trips across JSON and binary, returning a real PlainDate on decode.',
    serializeNotes: 'JSON serializes via `toJSON()` (a `YYYY-MM-DD` string) and revives with `Temporal.PlainDate.from(...)`.',
    mutateEncoder: () => createJsonEncoder<Temporal.PlainDate>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Temporal.PlainDate>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Temporal.PlainDate>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Temporal.PlainDate>(),
    preserveDecoder: () => createJsonDecoder<Temporal.PlainDate>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Temporal.PlainDate>(),
    binaryDecoder: () => createBinaryDecoder<Temporal.PlainDate>(),
    schemaEncoder: () => createJsonEncoder(RT.temporal.plainDate()),
    schemaDecoder: () => createJsonDecoder(RT.temporal.plainDate()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.temporal.plainDate()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.temporal.plainDate()),
    getTestData: () => ({values: [T.PlainDate.from('2020-08-24'), T.PlainDate.from('1999-01-01')]}),
  },

  plainTime: {
    title: 'Temporal.PlainTime',
    description: 'Root `Temporal.PlainTime`, a wall-clock time with no date or zone, round-trips across JSON and binary, returning a real PlainTime on decode.',
    serializeNotes: 'JSON serializes via `toJSON()` (an `HH:MM:SS` string) and revives with `Temporal.PlainTime.from(...)`.',
    mutateEncoder: () => createJsonEncoder<Temporal.PlainTime>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Temporal.PlainTime>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Temporal.PlainTime>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Temporal.PlainTime>(),
    preserveDecoder: () => createJsonDecoder<Temporal.PlainTime>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Temporal.PlainTime>(),
    binaryDecoder: () => createBinaryDecoder<Temporal.PlainTime>(),
    schemaEncoder: () => createJsonEncoder(RT.temporal.plainTime()),
    schemaDecoder: () => createJsonDecoder(RT.temporal.plainTime()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.temporal.plainTime()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.temporal.plainTime()),
    getTestData: () => ({values: [T.PlainTime.from('19:39:09'), T.PlainTime.from('00:00:00')]}),
  },

  plainDateTime: {
    title: 'Temporal.PlainDateTime',
    description: 'Root `Temporal.PlainDateTime`, a date and time with no zone, round-trips across JSON and binary, returning a real PlainDateTime on decode.',
    serializeNotes: 'JSON serializes via `toJSON()` (a `YYYY-MM-DDTHH:MM:SS` string) and revives with `Temporal.PlainDateTime.from(...)`.',
    mutateEncoder: () => createJsonEncoder<Temporal.PlainDateTime>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Temporal.PlainDateTime>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Temporal.PlainDateTime>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Temporal.PlainDateTime>(),
    preserveDecoder: () => createJsonDecoder<Temporal.PlainDateTime>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Temporal.PlainDateTime>(),
    binaryDecoder: () => createBinaryDecoder<Temporal.PlainDateTime>(),
    schemaEncoder: () => createJsonEncoder(RT.temporal.plainDateTime()),
    schemaDecoder: () => createJsonDecoder(RT.temporal.plainDateTime()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.temporal.plainDateTime()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.temporal.plainDateTime()),
    getTestData: () => ({values: [T.PlainDateTime.from('1995-12-07T15:00:00')]}),
  },

  plainYearMonth: {
    title: 'Temporal.PlainYearMonth',
    description: 'Root `Temporal.PlainYearMonth`, a year and month with no day, round-trips across JSON and binary, returning a real PlainYearMonth on decode.',
    serializeNotes: 'JSON serializes via `toJSON()` (a `YYYY-MM` string) and revives with `Temporal.PlainYearMonth.from(...)`.',
    mutateEncoder: () => createJsonEncoder<Temporal.PlainYearMonth>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Temporal.PlainYearMonth>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Temporal.PlainYearMonth>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Temporal.PlainYearMonth>(),
    preserveDecoder: () => createJsonDecoder<Temporal.PlainYearMonth>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Temporal.PlainYearMonth>(),
    binaryDecoder: () => createBinaryDecoder<Temporal.PlainYearMonth>(),
    schemaEncoder: () => createJsonEncoder(RT.temporal.plainYearMonth()),
    schemaDecoder: () => createJsonDecoder(RT.temporal.plainYearMonth()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.temporal.plainYearMonth()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.temporal.plainYearMonth()),
    getTestData: () => ({values: [T.PlainYearMonth.from('2020-10')]}),
  },

  plainMonthDay: {
    title: 'Temporal.PlainMonthDay',
    description: 'Root `Temporal.PlainMonthDay`, a month and day with no year, round-trips across JSON and binary, returning a real PlainMonthDay on decode.',
    serializeNotes: 'JSON serializes via `toJSON()` (an `MM-DD` string) and revives with `Temporal.PlainMonthDay.from(...)`.',
    mutateEncoder: () => createJsonEncoder<Temporal.PlainMonthDay>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Temporal.PlainMonthDay>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Temporal.PlainMonthDay>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Temporal.PlainMonthDay>(),
    preserveDecoder: () => createJsonDecoder<Temporal.PlainMonthDay>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Temporal.PlainMonthDay>(),
    binaryDecoder: () => createBinaryDecoder<Temporal.PlainMonthDay>(),
    schemaEncoder: () => createJsonEncoder(RT.temporal.plainMonthDay()),
    schemaDecoder: () => createJsonDecoder(RT.temporal.plainMonthDay()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.temporal.plainMonthDay()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.temporal.plainMonthDay()),
    getTestData: () => ({values: [T.PlainMonthDay.from('07-14')]}),
  },

  duration: {
    title: 'Temporal.Duration',
    description: 'Root `Temporal.Duration`, a length of time rather than a point, round-trips across JSON and binary, returning a real Duration on decode.',
    serializeNotes: 'JSON serializes via `toJSON()` (an ISO-8601 `P...` duration string) and revives with `Temporal.Duration.from(...)`; the zero-duration `PT0S` sample confirms the empty case survives.',
    mutateEncoder: () => createJsonEncoder<Temporal.Duration>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Temporal.Duration>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Temporal.Duration>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Temporal.Duration>(),
    preserveDecoder: () => createJsonDecoder<Temporal.Duration>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Temporal.Duration>(),
    binaryDecoder: () => createBinaryDecoder<Temporal.Duration>(),
    schemaEncoder: () => createJsonEncoder(RT.temporal.duration()),
    schemaDecoder: () => createJsonDecoder(RT.temporal.duration()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.temporal.duration()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.temporal.duration()),
    getTestData: () => ({values: [T.Duration.from('P1Y2M10DT2H30M'), T.Duration.from('PT0S')]}),
  },
} as const satisfies Record<string, SerializationCase>;
