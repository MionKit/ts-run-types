// Temporal format TYPE aliases — min/max bound constraints over the
// orderable builtin Temporal types. Opt-in via the dedicated
// `@mionjs/ts-go-run-types/formats/temporal` subpath (NOT re-exported from the
// root `formats` surface) so consumers who don't use Temporal never need the
// Temporal lib.
//
// IMPORTANT: this file deliberately has NO `/// <reference lib="esnext.temporal" />`.
// The Go scanner's inferred-program path cannot load that lib (it breaks lib
// resolution — see temporal-support.md §0); a reference here would make
// `Temporal.*` resolve to `any` DURING THE SCAN, collapse the `& {brand}`
// intersection, and silently drop the bounds. Temporal must instead be
// globally available to the program being scanned: the consumer's own
// tsconfig `lib` (which already includes it if they use Temporal), or the
// test harness's ambient (test/temporal-ambient.d.ts). If it isn't, the
// scanner raises TMP001 rather than emit a no-op validator.
//
// The brand intersection is written INLINE rather than via the shared
// `TypeFormat<Base,…>` helper on purpose: `TypeFormat`'s `Base extends
// TypeFormatBase` constraint lives in the root `runtypes/typeFormat.ts`, and
// naming `Temporal.*` there would force the Temporal lib on every marker
// consumer. The Go scanner detects a format brand structurally (the two
// `__rtFormat*` sentinel properties) regardless of how it's written, so the
// inline form is equivalent.
//
// Each bound (min/max) is an absolute Temporal string literal in the type's
// own ISO form (e.g. PlainDate `'2020-01-01'`, Instant `'2020-01-01T00:00:00Z'`)
// OR a relative `now±P…` ISO-8601 duration. The Go side validates the relative
// grammar + per-type duration-component restriction (Instant/PlainTime → time
// units only; PlainDate/PlainYearMonth → date units; PlainDateTime/
// ZonedDateTime → both) and emits `Temporal.X.compare(value, bound) >= 0/<= 0`.

import type {MinMax} from './dateTimeParams.ts';

// PlainMonthDay (no static compare) and Duration (a length, not an instant)
// are intentionally absent — they have no min/max ordering semantics.

export type FormatTemporalInstant<P extends MinMax = MinMax> = Temporal.Instant & {
  readonly __rtFormatName?: 'temporalInstant';
  readonly __rtFormatParams?: P;
};

export type FormatTemporalZonedDateTime<P extends MinMax = MinMax> = Temporal.ZonedDateTime & {
  readonly __rtFormatName?: 'temporalZonedDateTime';
  readonly __rtFormatParams?: P;
};

export type FormatTemporalPlainDate<P extends MinMax = MinMax> = Temporal.PlainDate & {
  readonly __rtFormatName?: 'temporalPlainDate';
  readonly __rtFormatParams?: P;
};

export type FormatTemporalPlainTime<P extends MinMax = MinMax> = Temporal.PlainTime & {
  readonly __rtFormatName?: 'temporalPlainTime';
  readonly __rtFormatParams?: P;
};

export type FormatTemporalPlainDateTime<P extends MinMax = MinMax> = Temporal.PlainDateTime & {
  readonly __rtFormatName?: 'temporalPlainDateTime';
  readonly __rtFormatParams?: P;
};

export type FormatTemporalPlainYearMonth<P extends MinMax = MinMax> = Temporal.PlainYearMonth & {
  readonly __rtFormatName?: 'temporalPlainYearMonth';
  readonly __rtFormatParams?: P;
};

// Unbranded base instance type per temporal format — the type a no-params
// builder call (`temporal.instant()`) returns, so it converges with the
// type-first `Temporal.Instant` id instead of carrying a `FormatTemporal*`
// brand for empty params. Kept here beside the branded aliases so the
// Temporal-lib coupling stays in this module (define.ts indexes this map by
// authoring tag and never names `Temporal.*` directly).
export interface TemporalBaseByFormatName {
  temporalInstant: Temporal.Instant;
  temporalZonedDateTime: Temporal.ZonedDateTime;
  temporalPlainDate: Temporal.PlainDate;
  temporalPlainTime: Temporal.PlainTime;
  temporalPlainDateTime: Temporal.PlainDateTime;
  temporalPlainYearMonth: Temporal.PlainYearMonth;
  // PlainMonthDay / Duration have no min/max ordering (see note above), so they
  // appear ONLY here as base instance types — there is no `FormatTemporal*` brand
  // and no `LeafType`/`TemporalFormatByTag` row for them. Their value-first
  // builders are no-param-only and converge with the type-first raw-instance form.
  temporalPlainMonthDay: Temporal.PlainMonthDay;
  temporalDuration: Temporal.Duration;
}

// ─────────────────────── DataOnly augmentation ──────────────────────
// Opt the 8 TC39 Temporal types into `DataOnly`'s KEEP set so
// `DataOnly<Temporal.Instant>` stays `Temporal.Instant` — the RT validates
// Temporal by `instanceof` / native identity, NOT by structural projection
// (see `DataOnly` in runtypes/dataOnly.ts). This augmentation lives HERE, in the
// lib-coupled `formats/temporal` subpath that already names `Temporal.*`, so
// core `runtypes/dataOnly.ts` never forces the Temporal lib on non-Temporal
// consumers. Only the VALUE union `DataOnlyNativeExtra[keyof …]` is read by
// `DataOnly`; the keys are arbitrary labels.
declare module '../../runtypes/dataOnly.ts' {
  interface DataOnlyNativeExtra {
    temporalInstant: Temporal.Instant;
    temporalZonedDateTime: Temporal.ZonedDateTime;
    temporalPlainDate: Temporal.PlainDate;
    temporalPlainTime: Temporal.PlainTime;
    temporalPlainDateTime: Temporal.PlainDateTime;
    temporalPlainYearMonth: Temporal.PlainYearMonth;
    temporalPlainMonthDay: Temporal.PlainMonthDay;
    temporalDuration: Temporal.Duration;
  }
}
