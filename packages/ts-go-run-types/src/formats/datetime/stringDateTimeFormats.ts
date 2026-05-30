// String date/time/dateTime format TYPE aliases — extracted out of
// `../string/stringFormats.ts` so the whole date-ish surface (string
// formats here, the native `Date` family in ./dateFormats.ts, future
// Temporal) lives together and shares the min/max bound params from
// ./dateTimeParams.ts.
//
// These remain plain string formats: the value on the wire is a string,
// validated against the chosen layout AND (when present) the min/max
// bounds. Validation / mocking are emitted/registered on the Go side and
// in ../../mocking/mockStringFormat.ts; this file is type-only + brand
// wiring.
//
// `TypeFormat` IS imported as a value (not `import type`): the value-level
// import keeps each brand alias's reflection metadata reachable for tsgo
// (same constraint mion documents and the sibling format files follow).

import {TypeFormat} from '../../runtypes/typeFormat.ts';
import type {MinMax, DateBound, TimeBound, DateTimeBound} from './dateTimeParams.ts';

// ─────────────────────────────── Date ───────────────────────────────

export type DateFmt = 'ISO' | 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'YYYY-MM' | 'MM-DD' | 'DD-MM';
// FormatParams_Date — the chosen layout plus optional min/max. Each bound
// is a DateBound: an absolute literal in `format`'s layout, or a relative
// `now±P…` using ONLY date components (Go rejects time components for a
// date format).
export interface FormatParams_Date extends MinMax<DateBound> {
  format: DateFmt;
}
export type DEFAULT_DATE_PARAMS = {format: 'ISO'};
export type FormatStringDate<P extends Partial<FormatParams_Date> = DEFAULT_DATE_PARAMS> = TypeFormat<string, 'date', P, 'date'>;

// ─────────────────────────────── Time ───────────────────────────────

export type TimeFmt = 'ISO' | 'HH:mm:ss[.mmm]TZ' | 'HH:mm:ss[.mmm]' | 'HH:mm:ss' | 'HH:mm' | 'mm:ss' | 'HH' | 'mm' | 'ss';
// FormatParams_Time — the chosen layout plus optional min/max. Each bound
// is a TimeBound: an absolute literal in `format`'s layout, or a relative
// `now±P…` using ONLY time components (Go rejects date components for a
// time format).
export interface FormatParams_Time extends MinMax<TimeBound> {
  format: TimeFmt;
}
export type DEFAULT_TIME_FORMAT_PARAMS = {format: 'ISO'};
export type FormatStringTime<P extends Partial<FormatParams_Time> = DEFAULT_TIME_FORMAT_PARAMS> = TypeFormat<
  string,
  'time',
  P,
  'time'
>;

// ───────────────────────────── DateTime ─────────────────────────────

// FormatParams_DateTime — nested date + time layouts, the split char, and
// optional top-level min/max. A dateTime bound (DateTimeBound) may use
// both date and time duration components.
export interface FormatParams_DateTime extends MinMax<DateTimeBound> {
  date: FormatParams_Date;
  time: FormatParams_Time;
  splitChar: string;
}
export type DEFAULT_DATE_TIME_PARAMS = {
  date: {format: 'ISO'};
  time: {format: 'ISO'};
  splitChar: 'T';
};
// P is passed through verbatim (NOT intersected with defaults — that
// would collapse overridden `format` literals to `never`); the Go side
// defaults missing nested formats / splitChar to ISO / 'T'.
export type FormatStringDateTime<P extends Partial<FormatParams_DateTime> = DEFAULT_DATE_TIME_PARAMS> = TypeFormat<
  string,
  'dateTime',
  P,
  'dateTime'
>;
