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
import type {SerializationCase} from './types.ts';

const T = (globalThis as {Temporal: typeof Temporal}).Temporal;

export const DATETIME = {
  // Duplicated from Atomic.ts so the date/time family reads as one group here too.
  date: {
    title: 'date',
    mutateEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<Date>(),
    directEncoder: () => createJsonEncoder<Date>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Date>(),
    preserveDecoder: () => createJsonDecoder<Date>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Date>(),
    binaryDecoder: () => createBinaryDecoder<Date>(),
    getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z')]}),
  },

  instant: {
    title: 'Temporal.Instant',
    mutateEncoder: () => createJsonEncoder<Temporal.Instant>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Temporal.Instant>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<Temporal.Instant>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<Temporal.Instant>(),
    directEncoder: () => createJsonEncoder<Temporal.Instant>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Temporal.Instant>(),
    preserveDecoder: () => createJsonDecoder<Temporal.Instant>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Temporal.Instant>(),
    binaryDecoder: () => createBinaryDecoder<Temporal.Instant>(),
    getTestData: () => ({values: [T.Instant.from('2020-01-15T10:30:00Z'), T.Instant.fromEpochMilliseconds(0)]}),
  },

  zonedDateTime: {
    title: 'Temporal.ZonedDateTime',
    mutateEncoder: () => createJsonEncoder<Temporal.ZonedDateTime>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Temporal.ZonedDateTime>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<Temporal.ZonedDateTime>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<Temporal.ZonedDateTime>(),
    directEncoder: () => createJsonEncoder<Temporal.ZonedDateTime>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Temporal.ZonedDateTime>(),
    preserveDecoder: () => createJsonDecoder<Temporal.ZonedDateTime>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Temporal.ZonedDateTime>(),
    binaryDecoder: () => createBinaryDecoder<Temporal.ZonedDateTime>(),
    getTestData: () => ({values: [T.ZonedDateTime.from('2020-01-15T10:30:00[UTC]')]}),
  },

  plainDate: {
    title: 'Temporal.PlainDate',
    mutateEncoder: () => createJsonEncoder<Temporal.PlainDate>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Temporal.PlainDate>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<Temporal.PlainDate>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<Temporal.PlainDate>(),
    directEncoder: () => createJsonEncoder<Temporal.PlainDate>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Temporal.PlainDate>(),
    preserveDecoder: () => createJsonDecoder<Temporal.PlainDate>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Temporal.PlainDate>(),
    binaryDecoder: () => createBinaryDecoder<Temporal.PlainDate>(),
    getTestData: () => ({values: [T.PlainDate.from('2020-08-24'), T.PlainDate.from('1999-01-01')]}),
  },

  plainTime: {
    title: 'Temporal.PlainTime',
    mutateEncoder: () => createJsonEncoder<Temporal.PlainTime>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Temporal.PlainTime>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<Temporal.PlainTime>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<Temporal.PlainTime>(),
    directEncoder: () => createJsonEncoder<Temporal.PlainTime>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Temporal.PlainTime>(),
    preserveDecoder: () => createJsonDecoder<Temporal.PlainTime>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Temporal.PlainTime>(),
    binaryDecoder: () => createBinaryDecoder<Temporal.PlainTime>(),
    getTestData: () => ({values: [T.PlainTime.from('19:39:09'), T.PlainTime.from('00:00:00')]}),
  },

  plainDateTime: {
    title: 'Temporal.PlainDateTime',
    mutateEncoder: () => createJsonEncoder<Temporal.PlainDateTime>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Temporal.PlainDateTime>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<Temporal.PlainDateTime>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<Temporal.PlainDateTime>(),
    directEncoder: () => createJsonEncoder<Temporal.PlainDateTime>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Temporal.PlainDateTime>(),
    preserveDecoder: () => createJsonDecoder<Temporal.PlainDateTime>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Temporal.PlainDateTime>(),
    binaryDecoder: () => createBinaryDecoder<Temporal.PlainDateTime>(),
    getTestData: () => ({values: [T.PlainDateTime.from('1995-12-07T15:00:00')]}),
  },

  plainYearMonth: {
    title: 'Temporal.PlainYearMonth',
    mutateEncoder: () => createJsonEncoder<Temporal.PlainYearMonth>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Temporal.PlainYearMonth>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<Temporal.PlainYearMonth>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<Temporal.PlainYearMonth>(),
    directEncoder: () => createJsonEncoder<Temporal.PlainYearMonth>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Temporal.PlainYearMonth>(),
    preserveDecoder: () => createJsonDecoder<Temporal.PlainYearMonth>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Temporal.PlainYearMonth>(),
    binaryDecoder: () => createBinaryDecoder<Temporal.PlainYearMonth>(),
    getTestData: () => ({values: [T.PlainYearMonth.from('2020-10')]}),
  },

  plainMonthDay: {
    title: 'Temporal.PlainMonthDay',
    mutateEncoder: () => createJsonEncoder<Temporal.PlainMonthDay>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Temporal.PlainMonthDay>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<Temporal.PlainMonthDay>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<Temporal.PlainMonthDay>(),
    directEncoder: () => createJsonEncoder<Temporal.PlainMonthDay>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Temporal.PlainMonthDay>(),
    preserveDecoder: () => createJsonDecoder<Temporal.PlainMonthDay>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Temporal.PlainMonthDay>(),
    binaryDecoder: () => createBinaryDecoder<Temporal.PlainMonthDay>(),
    getTestData: () => ({values: [T.PlainMonthDay.from('07-14')]}),
  },

  duration: {
    title: 'Temporal.Duration',
    mutateEncoder: () => createJsonEncoder<Temporal.Duration>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Temporal.Duration>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<Temporal.Duration>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<Temporal.Duration>(),
    directEncoder: () => createJsonEncoder<Temporal.Duration>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Temporal.Duration>(),
    preserveDecoder: () => createJsonDecoder<Temporal.Duration>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Temporal.Duration>(),
    binaryDecoder: () => createBinaryDecoder<Temporal.Duration>(),
    getTestData: () => ({values: [T.Duration.from('P1Y2M10DT2H30M'), T.Duration.from('PT0S')]}),
  },
} as const satisfies Record<string, SerializationCase>;
