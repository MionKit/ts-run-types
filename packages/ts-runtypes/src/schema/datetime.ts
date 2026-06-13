// Value-first DATE / TIME leaf builders — the native JS `Date` builder plus the
// namespaced `temporal.*` builders (the 8 TC39 `Temporal` types), grouped in one
// file (mirrors the test-suite `DateTime` grouping). Split out of atomic.ts so the
// date/time family reads as a unit; behaviour is unchanged — each builder still
// returns the generic `RunType<…>` node and converges on the same structural id as
// the matching type-first surface.
//
// `builderResult` (the shared injected-id → live-node resolver) and the scalar
// leaf builders stay in atomic.ts; this file imports `builderResult` from there.
// All the type-level helpers these builders carry (`LeafType` /
// `TemporalFormatByTag` / `TemporalBaseByTag` / `TemporalBuilderFn`) live in
// static.ts, so this file is runtime-only.

import {builderResult, lastInjectedId} from './atomic.ts';
import type {RunType} from '../runtypes/types.ts';
import type {InjectRunTypeId, CompTimeArgs} from '../markers.ts';
import type {FormatParams_NativeDate} from '../formats/datetime/dateFormats.ts';
import type {MinMax} from '../formats/datetime/dateTimeParams.ts';
import type {LeafType, BrandArg, TemporalFormatByTag, TemporalBaseByTag, TemporalBuilderFn} from './static.ts';

// ────────────────────────── Native Date builder ─────────────────────
//
// Same no-params/params/params+brand overload split as the scalar leaves in
// atomic.ts: the no-params call returns plain `RunType<Date>` (converges with the
// type-first `Date` / `createValidate<Date>()`), the params-present call returns the
// transparent `RunType<FormatDate<P>>`, and the params+brand call the nominal
// `RunType<FormatDate<P, B>>`.

/** A native-`Date` field builder. `date()` → `RunType<Date>`; `date({max: 'now'})`
 *  → transparent `RunType<FormatDate<P>>`; `date({max: 'now'}, brand('CreatedAt'))`
 *  → nominal `RunType<FormatDate<P, 'CreatedAt'>>`. **/
export function date(id?: InjectRunTypeId<Date>): RunType<Date>;
export function date<const P extends FormatParams_NativeDate>(
  formatParams: CompTimeArgs<P>,
  id?: InjectRunTypeId<LeafType<'nativeDate', P>>
): RunType<LeafType<'nativeDate', P>>;
export function date<const P extends FormatParams_NativeDate, const B extends string>(
  formatParams: CompTimeArgs<P>,
  brandTag: BrandArg<B>,
  id?: InjectRunTypeId<LeafType<'nativeDate', P, B>>
): RunType<LeafType<'nativeDate', P, B>>;
export function date(
  formatParamsOrId?: FormatParams_NativeDate | InjectRunTypeId<Date>,
  brandOrId?: BrandArg<string> | InjectRunTypeId<Date>,
  id?: InjectRunTypeId<Date>
): RunType<Date> {
  const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
  return builderResult(lastInjectedId(formatParamsOrId, brandOrId, id), {type: 'date', formatParams});
}

// ─────────────────────────── Temporal builders ──────────────────────
//
// `temporalBuilder` — shared factory for the 6 orderable temporal builders below.
// Each fixes its tag and returns the matching `FormatTemporal*<P>` via the
// static.ts tag→format lookup, so the 6 namespace call sites don't change. Same
// no-params/plain ↔ params/branded overload split as the scalar leaves in
// atomic.ts.

function temporalBuilder<Tag extends keyof TemporalFormatByTag<MinMax>>(tag: Tag): TemporalBuilderFn<Tag> {
  const build = (
    formatParamsOrId?: MinMax | InjectRunTypeId<TemporalBaseByTag[Tag]>,
    id?: InjectRunTypeId<TemporalBaseByTag[Tag]>
  ): RunType<TemporalBaseByTag[Tag]> => {
    const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
    const injectedId = typeof formatParamsOrId === 'string' ? formatParamsOrId : id;
    return builderResult(injectedId, {type: tag, formatParams});
  };
  return build as TemporalBuilderFn<Tag>;
}

/** A no-ordering temporal builder (`plainMonthDay` / `duration`). These have no
 *  min/max semantics, so — unlike `temporalBuilder` — there is only the no-params
 *  overload: it returns the raw instance type and converges with the type-first
 *  `createValidate<Temporal.PlainMonthDay>()` / `<Temporal.Duration>()` form. **/
function temporalInstanceBuilder<Tag extends 'temporal.plainMonthDay' | 'temporal.duration'>(
  tag: Tag
): (id?: InjectRunTypeId<TemporalBaseByTag[Tag]>) => RunType<TemporalBaseByTag[Tag]> {
  return (id?: InjectRunTypeId<TemporalBaseByTag[Tag]>) => builderResult(id, {type: tag, formatParams: {}});
}

/** Temporal field builders, namespaced to mirror the `Temporal.X` API
 *  (lowercase, to differentiate from the native `Temporal` global). The six
 *  orderable types take optional min/max; `plainMonthDay` / `duration` are
 *  no-param instance validators (no ordering — see temporalFormats.ts). **/
export const temporal = {
  instant: temporalBuilder('temporal.instant'),
  zonedDateTime: temporalBuilder('temporal.zonedDateTime'),
  plainDate: temporalBuilder('temporal.plainDate'),
  plainTime: temporalBuilder('temporal.plainTime'),
  plainDateTime: temporalBuilder('temporal.plainDateTime'),
  plainYearMonth: temporalBuilder('temporal.plainYearMonth'),
  plainMonthDay: temporalInstanceBuilder('temporal.plainMonthDay'),
  duration: temporalInstanceBuilder('temporal.duration'),
};
