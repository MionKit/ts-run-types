// Value-first ATOMIC / LEAF builders — a Zod/TypeBox-style BUILDER API. Each
// builder returns a generic `RunType<T>` (the runtime run-type node, typed with
// the source type `T` it represents); `Static<typeof X>` recovers `T`:
//
//   import {string, number, boolean, bigint, date, temporal} from '@mionjs/ts-go-run-types/schema';
//   import {createIsType, type Static} from '@mionjs/ts-go-run-types';
//
//   const Name = string({minLength: 1, maxLength: 50}); // RunType<FormatString<…>>
//   type Name  = Static<typeof Name>;                   // FormatString<…>
//   const isName = createIsType(Name);                  // validator from the schema
//
// The leaf builder's carried `T` is sourced from the leaf reverse map
// (static.ts `LeafType`) keyed by format name — the single place the format→type
// mapping lives. The Go scanner reflects the SAME branded type off the builder's
// `InjectRunTypeId<…>` brand as the type-first surface, so a value-first leaf and
// the hand-written `Format*<P>` form converge on one structural id; the runtime
// then resolves the same precompiled factory (see createIsType).
//
// Composition (`object` / `array` / `union` / … and the property modifiers
// `propMod` / `optional`) lives in compose.ts; the standard-library utility
// builders in utility.ts. All the type-level helpers these builders carry live in
// static.ts, so this file is runtime-only. The Go binary, not the type system, is
// the validation engine.

import {getRTUtils} from '../runtypes/rtUtils.ts';
import type {RunType} from '../runtypes/types.ts';
import type {InjectRunTypeId, CompTimeArgs} from '../markers.ts';
import type {StringParams, StringParamsValueFirst} from '../formats/string/stringFormats.ts';
import type {NumberParams} from '../formats/numberFormats.ts';
import type {BigIntParams} from '../formats/bigintFormats.ts';
import type {FormatParams_NativeDate} from '../formats/datetime/dateFormats.ts';
import type {MinMax} from '../formats/datetime/dateTimeParams.ts';
import type {LeafType, TemporalFormatByTag, TemporalBaseByTag, TemporalBuilderFn} from './static.ts';

// ───────────────────────────── builderResult ────────────────────────
//
// Each builder is an INJECTABLE MARKER (Tier 2): the trailing
// `id?: InjectRunTypeId<…>` is filled by vite-plugin-runtypes with the resolved
// structural id, and the body returns the LIVE RunType node for it
// (`getRunType(id)`) — the exact node the type compiler produces for the
// equivalent written type. A builder nested inside a composer is skipped by the
// scanner (the enclosing marker reflects the whole shape), so it has no id and
// returns the carrier the composer discards.

/** Resolves the live RunType node for an injected marker id — the exact node
 *  the type compiler produces for the builder's return type. With no id (the
 *  builder is nested inside a composer, so the scanner skipped it) or before the
 *  cache module has loaded, it returns the `carrier` the enclosing composer
 *  discards. **/
export function builderResult<T>(id: InjectRunTypeId<T> | undefined, carrier: unknown): RunType<T> {
  if (id !== undefined) {
    const runType = getRTUtils().getRunType(id);
    if (runType) return runType as RunType<T>;
  }
  return carrier as RunType<T>;
}

// ───────────────────────────── Leaf builders ────────────────────────
//
// Each parameterised leaf builder is TWO overloads: the no-params call returns
// the PLAIN base type (`RunType<string>`), so a value-first leaf converges on the
// SAME structural id as the type-first plain type and as a marker-form
// `createIsType<string>()`; the params-present call returns the branded
// `RunType<LeafType<…>>`. A single impl discriminates on the first arg — the
// injected id (a string) lands at slot 0 for the no-params overload, at slot 1
// for the params-present overload (the Go scanner derives each from the resolved
// overload's signature). The branded default `P = Record<string, never>` is GONE
// on purpose: defaulting it re-introduced the brand on `string()` and split the
// cache (see docs/SCHEMA-FORM-TYPEID-CONVERGENCE.md). The `const` type parameter
// is the ONLY narrowing mechanism: it keeps `{maxLength: 50}` as `50`, not
// `number`, so the literal survives into the brand.

/** A string field builder. `string()` → `RunType<string>` (plain, converges with
 *  type-first `string`); `string({maxLength: 5})` → branded `RunType<FormatString<P>>`.
 *  Params are `StringParamsValueFirst`: like `StringParams` but `pattern` is the
 *  inline `{source, flags?, mockSamples, …}` literal ONLY — not the opaque
 *  `FormatPattern` value (whose source/flags erase to `string`), so the reflected
 *  `T` keeps the pattern literals and the value-first id stays faithful. **/
export function string(id?: InjectRunTypeId<string>): RunType<string>;
export function string<const P extends StringParamsValueFirst>(
  formatParams: CompTimeArgs<P>,
  id?: InjectRunTypeId<LeafType<'stringFormat', P>>
): RunType<LeafType<'stringFormat', P>>;
export function string(formatParamsOrId?: StringParams | InjectRunTypeId<string>, id?: InjectRunTypeId<string>): RunType<string> {
  const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
  const injectedId = typeof formatParamsOrId === 'string' ? formatParamsOrId : id;
  return builderResult(injectedId, {type: 'string', formatParams});
}

/** A number field builder. `number()` → `RunType<number>`; `number({min: 0})` →
 *  branded `RunType<FormatNumber<P>>`. **/
export function number(id?: InjectRunTypeId<number>): RunType<number>;
export function number<const P extends NumberParams>(
  formatParams: CompTimeArgs<P>,
  id?: InjectRunTypeId<LeafType<'numberFormat', P>>
): RunType<LeafType<'numberFormat', P>>;
export function number(formatParamsOrId?: NumberParams | InjectRunTypeId<number>, id?: InjectRunTypeId<number>): RunType<number> {
  const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
  const injectedId = typeof formatParamsOrId === 'string' ? formatParamsOrId : id;
  return builderResult(injectedId, {type: 'number', formatParams});
}

/** A bigint field builder. `bigint()` → `RunType<bigint>`; `bigint({min: 0n})` →
 *  branded `RunType<FormatBigInt<P>>`. **/
export function bigint(id?: InjectRunTypeId<bigint>): RunType<bigint>;
export function bigint<const P extends BigIntParams>(
  formatParams: CompTimeArgs<P>,
  id?: InjectRunTypeId<LeafType<'bigintFormat', P>>
): RunType<LeafType<'bigintFormat', P>>;
export function bigint(formatParamsOrId?: BigIntParams | InjectRunTypeId<bigint>, id?: InjectRunTypeId<bigint>): RunType<bigint> {
  const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
  const injectedId = typeof formatParamsOrId === 'string' ? formatParamsOrId : id;
  return builderResult(injectedId, {type: 'bigint', formatParams});
}

/** A native-`Date` field builder. `date()` → `RunType<Date>`; `date({max: 'now'})`
 *  → branded `RunType<FormatDate<P>>`. **/
export function date(id?: InjectRunTypeId<Date>): RunType<Date>;
export function date<const P extends FormatParams_NativeDate>(
  formatParams: CompTimeArgs<P>,
  id?: InjectRunTypeId<LeafType<'nativeDate', P>>
): RunType<LeafType<'nativeDate', P>>;
export function date(
  formatParamsOrId?: FormatParams_NativeDate | InjectRunTypeId<Date>,
  id?: InjectRunTypeId<Date>
): RunType<Date> {
  const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
  const injectedId = typeof formatParamsOrId === 'string' ? formatParamsOrId : id;
  return builderResult(injectedId, {type: 'date', formatParams});
}

/** A boolean builder — no params, no format brand (kind boolean). Returns
 *  `RunType<boolean>`. **/
export function boolean(id?: InjectRunTypeId<boolean>): RunType<boolean> {
  return builderResult(id, {type: 'boolean', formatParams: {}});
}

/** A literal builder — `literal('a')` → `RunType<'a'>`, plus `literal(42)`,
 *  `literal(10n)`, `literal(true)`, `literal(null)`, `literal(undefined)`. The
 *  `const V` narrows the argument to its literal type (so `literal(true)` is
 *  `RunType<true>`, not `RunType<boolean>`); the scanner reflects that literal
 *  off the `InjectRunTypeId<V>` brand. **/
export function literal<const V extends string | number | bigint | boolean | null | undefined>(
  value: V,
  id?: InjectRunTypeId<V>
): RunType<V> {
  return builderResult(id, {type: 'literal', literal: value});
}

/** A `RegExp` builder — `regexp()` → `RunType<RegExp>`, matches any `RegExp`
 *  instance. TS has NO regex-literal type (a `/abc/i` literal widens to `RegExp`
 *  even under `as const`), so there is deliberately no "specific source/flags"
 *  form: it would make the structural id depend on data absent from `T`, breaking
 *  the id ≡ f(T) invariant. To validate a STRING against a pattern, use
 *  `string({pattern: {source, flags, mockSamples}})`. **/
export function regexp(id?: InjectRunTypeId<RegExp>): RunType<RegExp> {
  return builderResult(id, {type: 'regexp', formatParams: {}});
}

/** A `symbol` builder — `symbol()` → `RunType<symbol>`. Provided for
 *  composition/parity; symbol identity is not round-trippable, so the Go side
 *  emits an unsupported validator (docs/UNSUPPORTED-KINDS.md) — a standalone
 *  `createIsType(symbol())` throws the same way the type-first `symbol` case
 *  does. **/
export function symbol(id?: InjectRunTypeId<symbol>): RunType<symbol> {
  return builderResult(id, {type: 'symbol', formatParams: {}});
}

// Top / bottom atomic builders — `any` / `unknown` / `never` / `void`. Dedicated
// builders: each carries its kind off the trailing `InjectRunTypeId<…>` brand, so
// the scanner reflects the SAME kind as the type-first `createIsType<any>()` /
// `<never>` / … surface and the value-first form converges on one structural id.

/** An `any` builder — `any()` → `RunType<any>` (no-op validator; every value
 *  passes). **/
export function any(id?: InjectRunTypeId<any>): RunType<any> {
  return builderResult(id, {type: 'any', formatParams: {}});
}

/** An `unknown` builder — `unknown()` → `RunType<unknown>` (every value passes,
 *  same as `any`). **/
export function unknown(id?: InjectRunTypeId<unknown>): RunType<unknown> {
  return builderResult(id, {type: 'unknown', formatParams: {}});
}

/** A `never` builder — `never()` → `RunType<never>` (no value passes; the
 *  validator returns `false` for every input). **/
export function never(id?: InjectRunTypeId<never>): RunType<never> {
  return builderResult(id, {type: 'never', formatParams: {}});
}

/** A `void` builder — `voidType()` → `RunType<void>` (accepts `undefined`,
 *  rejects `null`). The function can't be named `void` (reserved word); the
 *  `/schema` index also re-exports it as `void` so `RT.void()` reads naturally. **/
export function voidType(id?: InjectRunTypeId<void>): RunType<void> {
  return builderResult(id, {type: 'void', formatParams: {}});
}

/** A class builder — `classType(MyClass)` → `RunType<MyClass>`. `Instance` infers
 *  directly from the constructor's instance type, so it converges with the
 *  type-first `createIsType<MyClass>()`. isType matches by SHAPE (data properties;
 *  methods skipped), NOT `instanceof` — a plain object of the right shape passes.
 *  For a GENERIC class the instance type is pinned explicitly
 *  (`classType<Box<number>>(Box)`); otherwise it infers the unparameterised
 *  instance. The ctor rides the carrier (the runtime keeps a real class
 *  reference). **/
export function classType<Instance>(
  ctor: abstract new (...args: any[]) => Instance,
  id?: InjectRunTypeId<Instance>
): RunType<Instance> {
  return builderResult(id, {type: 'class', ctor});
}

// ─────────────────────────── Temporal builders ──────────────────────
//
// `temporalBuilder` — shared factory for the 6 temporal builders below. Each
// fixes its tag and returns the matching `FormatTemporal*<P>` via the static.ts
// tag→format lookup, so the 6 namespace call sites don't change. Same no-params/
// plain ↔ params/branded overload split as the scalar leaves above.

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

/** Temporal field builders, namespaced to mirror the `Temporal.X` API
 *  (lowercase, to differentiate from the native `Temporal` global). **/
export const temporal = {
  instant: temporalBuilder('temporal.instant'),
  zonedDateTime: temporalBuilder('temporal.zonedDateTime'),
  plainDate: temporalBuilder('temporal.plainDate'),
  plainTime: temporalBuilder('temporal.plainTime'),
  plainDateTime: temporalBuilder('temporal.plainDateTime'),
  plainYearMonth: temporalBuilder('temporal.plainYearMonth'),
};
