// DateTime-string format — FormatStringDateTime<P>. Composes a date
// layout and a time layout joined by `splitChar` (default 'T'). Mirrors
// mion's DateTimeRunTypeFormat. isType / typeErrors emit lives in
// internal/compiled/typefns/formats/string/datetime.go.

import {
  BaseRunTypeFormat,
  registerTypeFormat,
  RunTypeKind,
  TypeFormat,
} from '@mionjs/ts-go-run-types';
import type {FormatAnnotation} from '@mionjs/ts-go-run-types';
import type {FormatParams_Date, DateFmt} from './date.runtype.ts';
import type {FormatParams_Time, TimeFmt} from './time.runtype.ts';

export interface FormatParams_DateTime {
  date: FormatParams_Date;
  time: FormatParams_Time;
  splitChar: string;
}

export type DEFAULT_DATE_TIME_PARAMS = {
  date: {format: 'ISO'};
  time: {format: 'ISO'};
  splitChar: 'T';
};

// FormatStringDateTime — P is passed through verbatim (NOT
// intersected with the defaults: `{format:'ISO'} & {format:'DD-MM-YYYY'}`
// collapses `format` to `never`, which would erase the override).
// Missing nested formats / splitChar default to ISO / 'T' on the Go
// side (see datetime.go nestedFormat + dateTimeParts), so a partial
// `FormatStringDateTime<{splitChar: '-'}>` still resolves correctly.
export type FormatStringDateTime<P extends Partial<FormatParams_DateTime> = DEFAULT_DATE_TIME_PARAMS> = TypeFormat<
  string,
  'dateTime',
  P,
  'dateTime'
>;

export class DateTimeRunTypeFormat extends BaseRunTypeFormat<FormatParams_DateTime> {
  static readonly id = 'dateTime' as const;
  readonly name = DateTimeRunTypeFormat.id;
  readonly kind = RunTypeKind.string;

  _mock(annotation: FormatAnnotation<FormatParams_DateTime>): string {
    const params = annotation.params;
    const splitChar = params?.splitChar ?? 'T';
    const datePart = mockDate(params?.date?.format ?? 'ISO');
    const timePart = mockTime(params?.time?.format ?? 'ISO');
    return `${datePart}${splitChar}${timePart}`;
  }

  validateParams(annotation: FormatAnnotation<FormatParams_DateTime>): void {
    const splitChar = annotation.params?.splitChar ?? 'T';
    if (typeof splitChar !== 'string' || splitChar.length !== 1) {
      throw new Error(`DateTime splitChar must be a single character, got: ${String(splitChar)}`);
    }
  }
}

// Lightweight local mockers — independent of the date/time runtype
// classes so this module stays free of cross-format runtime imports
// (the format types are imported `type`-only above).
function mockDate(format: DateFmt): string {
  const year = String(Math.floor(Math.random() * 9999) + 1).padStart(4, '0');
  const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0');
  const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
  switch (format) {
    case 'DD-MM-YYYY':
      return `${day}-${month}-${year}`;
    case 'MM-DD-YYYY':
      return `${month}-${day}-${year}`;
    case 'YYYY-MM':
      return `${year}-${month}`;
    case 'MM-DD':
      return `${month}-${day}`;
    case 'DD-MM':
      return `${day}-${month}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

function mockTime(format: TimeFmt): string {
  const hh = String(Math.floor(Math.random() * 24)).padStart(2, '0');
  const mm = String(Math.floor(Math.random() * 60)).padStart(2, '0');
  const ss = String(Math.floor(Math.random() * 60)).padStart(2, '0');
  switch (format) {
    case 'ISO':
    case 'HH:mm:ss[.mmm]TZ':
      return `${hh}:${mm}:${ss}Z`;
    case 'HH:mm:ss[.mmm]':
    case 'HH:mm:ss':
      return `${hh}:${mm}:${ss}`;
    case 'HH:mm':
      return `${hh}:${mm}`;
    case 'mm:ss':
      return `${mm}:${ss}`;
    case 'HH':
      return hh;
    case 'mm':
      return mm;
    case 'ss':
      return ss;
    default:
      return `${hh}:${mm}:${ss}`;
  }
}

registerTypeFormat(new DateTimeRunTypeFormat());
