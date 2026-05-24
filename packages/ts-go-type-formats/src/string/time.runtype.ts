// Time-string format — FormatStringTime<P>. The `format` param picks
// the layout. Mirrors mion's TimeStringRunTypeFormat. isType /
// typeErrors emit lives in internal/compiled/typefns/formats/string/time.go.

import {
  BaseRunTypeFormat,
  registerFormatter,
  RunTypeKind,
  TypeFormat,
} from '@mionjs/ts-go-run-types';
import type {FormatAnnotation} from '@mionjs/ts-go-run-types';

// TimeFmt — the layout strings the time format accepts.
export type TimeFmt =
  | 'ISO'
  | 'HH:mm:ss[.mmm]TZ'
  | 'HH:mm:ss[.mmm]'
  | 'HH:mm:ss'
  | 'HH:mm'
  | 'mm:ss'
  | 'HH'
  | 'mm'
  | 'ss';

export interface FormatParams_Time {
  format: TimeFmt;
}

export type DEFAULT_TIME_FORMAT_PARAMS = {format: 'ISO'};

// FormatStringTime — branded time-string alias. Default layout ISO.
export type FormatStringTime<P extends Partial<FormatParams_Time> = DEFAULT_TIME_FORMAT_PARAMS> = TypeFormat<
  string,
  'time',
  P,
  'time'
>;

export class TimeStringRunTypeFormat extends BaseRunTypeFormat<FormatParams_Time> {
  static readonly id = 'time' as const;
  readonly name = TimeStringRunTypeFormat.id;
  readonly kind = RunTypeKind.string;

  _mock(annotation: FormatAnnotation<FormatParams_Time>): string {
    const format = annotation.params?.format ?? 'ISO';
    const hours = String(Math.floor(Math.random() * 24)).padStart(2, '0');
    const minutes = String(Math.floor(Math.random() * 60)).padStart(2, '0');
    const seconds = String(Math.floor(Math.random() * 60)).padStart(2, '0');
    switch (format) {
      case 'ISO':
      case 'HH:mm:ss[.mmm]TZ':
        return `${hours}:${minutes}:${seconds}${mockMilliseconds()}${mockTimeZone()}`;
      case 'HH:mm:ss[.mmm]':
        return `${hours}:${minutes}:${seconds}${mockMilliseconds()}`;
      case 'HH:mm:ss':
        return `${hours}:${minutes}:${seconds}`;
      case 'HH:mm':
        return `${hours}:${minutes}`;
      case 'mm:ss':
        return `${minutes}:${seconds}`;
      case 'HH':
        return hours;
      case 'mm':
        return minutes;
      case 'ss':
        return seconds;
      default:
        throw new Error(`Invalid time format: ${String(format)}`);
    }
  }

  validateParams(annotation: FormatAnnotation<FormatParams_Time>): void {
    const format = annotation.params?.format ?? 'ISO';
    const valid: TimeFmt[] = [
      'ISO',
      'HH:mm:ss[.mmm]TZ',
      'HH:mm:ss[.mmm]',
      'HH:mm:ss',
      'HH:mm',
      'mm:ss',
      'HH',
      'mm',
      'ss',
    ];
    if (!valid.includes(format as TimeFmt)) {
      throw new Error(`Invalid time format: ${String(format)}`);
    }
  }
}

function mockMilliseconds(): string {
  if (Math.random() > 0.5) return '';
  return `.${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
}

function mockTimeZone(): string {
  if (Math.random() > 0.5) return 'Z';
  const hours = String(Math.floor(Math.random() * 24)).padStart(2, '0');
  const minutes = String(Math.floor(Math.random() * 60)).padStart(2, '0');
  return `${Math.random() > 0.5 ? '+' : '-'}${hours}:${minutes}`;
}

registerFormatter(new TimeStringRunTypeFormat());
