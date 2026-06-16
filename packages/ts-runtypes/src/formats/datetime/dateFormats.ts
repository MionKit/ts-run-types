// Native `Date` format TYPE aliases — FormatDate<P> brands the JS `Date`
// object (not a string) with the SAME min/max bound params the string
// date/time formats use (./dateTimeParams.ts), so a Date field and a
// string-date field read identically. Validation is emitted on the Go
// side (internal/compiled/typefns/formats/datetime/nativeDate.go) inside
// validate / getValidationErrors; serialization needs no new work — Date already
// round-trips through the default serialisers.
//
// `TypeFormat` IS imported as a value (not `import type`) to keep each
// brand alias's reflection metadata reachable for tsgo, same as the other
// format files.

import {TypeFormat} from '../../runtypes/typeFormat.ts';
import type {MinMax, DateTimeBound} from './dateTimeParams.ts';

// FormatParams_NativeDate — min/max bounds for a native Date. A bound is
// an absolute ISO datetime literal OR a relative now±P spec; both date
// and time duration components are allowed (a Date carries both). An
// Invalid Date (NaN) is always rejected by the base check.
export type FormatParams_NativeDate = MinMax<DateTimeBound>;

// FormatDate — the `Date` format alias users annotate with, e.g.
// `FormatDate<{min: 'now'}>` (no past dates) or
// `FormatDate<{min: '2020-01-01T00:00:00'; max: 'now'}>`. Like the other base
// formats (`FormatString` / `FormatNumber` / `FormatBigInt`) it is TRANSPARENT by
// default — a plain `Date` flows in and out with no cast — and takes an optional
// user-facing `BrandName` to opt INTO a nominal type (`FormatDate<P, 'CreatedAt'>`),
// matching the value-first `date(P, brand('CreatedAt'))` builder. The previous
// hardcoded `'nativeDate'` brand arg was vestigial (the scanner ignores BrandName
// and reads `__rtFormatName` off the sentinel) until TypeFormat began honoring
// BrandName; leaving it would have made every `FormatDate<P>` spuriously nominal
// and split it from its transparent value-first builder.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatDate<P extends FormatParams_NativeDate = {}, BrandName extends string = never> = TypeFormat<
  Date,
  'nativeDate',
  P,
  BrandName
>;

// Convenience aliases mirroring the common "must be in the past / future"
// constraints. `now` is the current instant at validation time.
export type FormatDateFuture = FormatDate<{min: 'now'}>;
export type FormatDatePast = FormatDate<{max: 'now'}>;
