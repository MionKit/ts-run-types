// Leaf descriptor → TS type — the single source of truth mapping a leaf
// RunType's FORMAT identity back to the branded TS type it represents. This is
// the reverse map the value-first builders route their carried `RunType<T>`
// through (the successor to the old `FieldFormatMap`): add a leaf format in ONE
// place here and every builder + `TypeFromRT` consumer stays in sync.
//
// Keyed by the format brand NAME (`__rtFormatName`) because the name is the
// precise leaf discriminator — it encodes both the reflection kind and subKind:
//   stringFormat            → kind string (5)
//   numberFormat            → kind number (6)
//   bigintFormat            → kind bigint (9)
//   nativeDate              → kind class (20) + subKind date (2001)
//   temporalInstant …       → kind class (20) + subKind temporal* (2101–2106)
// The lone bare leaf with no format (boolean, kind 7) needs no row — the
// `boolean()` builder returns `RunType<boolean>` directly.
//
// `TypeFormat` is a VALUE import (not `import type`): the value-level import
// keeps the brand alias's reflection metadata reachable for tsgo, the same
// constraint the `formats/` modules and the old `define.ts` bridge documented.

import {TypeFormat} from '../runtypes/typeFormat.ts';
import type {MinMax} from '../formats/datetime/dateTimeParams.ts';
import type {
  FormatTemporalInstant,
  FormatTemporalZonedDateTime,
  FormatTemporalPlainDate,
  FormatTemporalPlainTime,
  FormatTemporalPlainDateTime,
  FormatTemporalPlainYearMonth,
} from '../formats/datetime/temporalFormats.ts';

/** Format brand name → branded leaf type, parameterized by that leaf's params
 *  `P`. The non-temporal rows use `TypeFormat<Base, Name, P>` directly (only a
 *  `P extends object` bound) so a single `P` flows to every row without each
 *  family's own param constraint — each builder validates its own params at the
 *  call site. The temporal rows self-guard `P extends MinMax ? … : never`: the
 *  guard NARROWS, it does not intersect, so `P` flows through unchanged and no
 *  spurious `min?/max?: string | undefined` is injected into the reflected
 *  params (the same rule the old `FieldFormatMap` documented). */
export interface LeafTypeByFormatName<P extends object> {
  stringFormat: TypeFormat<string, 'stringFormat', P>;
  numberFormat: TypeFormat<number, 'numberFormat', P>;
  bigintFormat: TypeFormat<bigint, 'bigintFormat', P>;
  nativeDate: TypeFormat<Date, 'nativeDate', P>;
  temporalInstant: P extends MinMax ? FormatTemporalInstant<P> : never;
  temporalZonedDateTime: P extends MinMax ? FormatTemporalZonedDateTime<P> : never;
  temporalPlainDate: P extends MinMax ? FormatTemporalPlainDate<P> : never;
  temporalPlainTime: P extends MinMax ? FormatTemporalPlainTime<P> : never;
  temporalPlainDateTime: P extends MinMax ? FormatTemporalPlainDateTime<P> : never;
  temporalPlainYearMonth: P extends MinMax ? FormatTemporalPlainYearMonth<P> : never;
}

/** Every leaf format brand name (the keys of `LeafTypeByFormatName`). */
export type LeafFormatName = keyof LeafTypeByFormatName<Record<string, never>>;

/** The branded leaf type for a format `Name` with params `P` — the builders'
 *  carried `RunType<…>` type and the type the scanner reflects off the brand. */
export type LeafType<Name extends LeafFormatName, P extends object> = LeafTypeByFormatName<P>[Name];
