// Date-string format — FormatStringDate<P>. The `format` param picks
// the layout ('ISO' / 'YYYY-MM-DD' / 'DD-MM-YYYY' / 'MM-DD-YYYY' /
// 'YYYY-MM' / 'MM-DD' / 'DD-MM'). Mirrors mion's
// DateStringRunTypeFormat. isType / typeErrors emit lives in the Go
// binary (internal/compiled/typefns/formats/string/date.go).

import {
  BaseRunTypeFormat,
  registerFormatter,
  RunTypeKind,
  TypeFormat,
} from '@mionjs/ts-go-run-types';
import type {FormatAnnotation} from '@mionjs/ts-go-run-types';

// DateFmt — the layout strings the date format accepts.
export type DateFmt = 'ISO' | 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'YYYY-MM' | 'MM-DD' | 'DD-MM';

// FormatParams_Date — the params object FormatStringDate carries.
export interface FormatParams_Date {
  format: DateFmt;
}

// DEFAULT_DATE_PARAMS — used when FormatStringDate is parameterless.
export type DEFAULT_DATE_PARAMS = {format: 'ISO'};

// FormatStringDate — branded date-string alias. Default layout is
// ISO (YYYY-MM-DD). Brand 'date' keeps it nominally distinct.
export type FormatStringDate<P extends Partial<FormatParams_Date> = DEFAULT_DATE_PARAMS> = TypeFormat<
  string,
  'date',
  P,
  'date'
>;

export class DateStringRunTypeFormat extends BaseRunTypeFormat<FormatParams_Date> {
  static readonly id = 'date' as const;
  readonly name = DateStringRunTypeFormat.id;
  readonly kind = RunTypeKind.string;

  _mock(annotation: FormatAnnotation<FormatParams_Date>): string {
    const format = annotation.params?.format ?? 'ISO';
    const yy = Math.floor(Math.random() * 10000);
    const mm = Math.floor(Math.random() * 12) + 1;
    const dd = Math.floor(Math.random() * maxDaysInMonth(yy, mm)) + 1;
    const year = String(yy).padStart(4, '0');
    const month = String(mm).padStart(2, '0');
    const day = String(dd).padStart(2, '0');
    switch (format) {
      case 'ISO':
      case 'YYYY-MM-DD':
        return `${year}-${month}-${day}`;
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
        throw new Error(`Invalid date format: ${String(format)}`);
    }
  }

  validateParams(annotation: FormatAnnotation<FormatParams_Date>): void {
    const format = annotation.params?.format ?? 'ISO';
    const valid: DateFmt[] = ['ISO', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MM-DD-YYYY', 'YYYY-MM', 'MM-DD', 'DD-MM'];
    if (!valid.includes(format as DateFmt)) {
      throw new Error(`Invalid date format: ${String(format)}`);
    }
  }
}

function maxDaysInMonth(year: number, month: number): number {
  if (month === 2) {
    if (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) return 29;
    return 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

registerFormatter(new DateStringRunTypeFormat());
