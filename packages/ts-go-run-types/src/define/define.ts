// Value-first type definitions — a Zod/TypeBox-style BUILDER API. Each LEAF
// builder returns a generic `RunType<T>` (the runtime run-type node, typed with
// the source type `T` it represents); `TypeFromRT<typeof X>` recovers `T`:
//
//   import {string, number, boolean, bigint, date, temporal} from '@mionjs/ts-go-run-types/define';
//   import {createIsTypeFor, type TypeFromRT} from '@mionjs/ts-go-run-types';
//
//   const Name = string({minLength: 1, maxLength: 50}); // RunType<FormatString<…>>
//   type Name  = TypeFromRT<typeof Name>;               // FormatString<…>
//   const isName = createIsTypeFor(Name);               // validator from the schema
//
// The leaf builder's carried `T` is sourced from the leaf reverse map
// (leafTypes.ts) keyed by format name — the single place the format→type mapping
// lives. The Go scanner reflects the SAME branded type off the builder's
// `InjectRunTypeId<…>` brand as the type-first surface, so a value-first leaf and
// the hand-written `Format*<P>` form converge on one structural id; the runtime
// then resolves the same precompiled factory (see createIsTypeFor).
//
// `object(...)` composes leaf builders, but — unlike the leaves — it still
// returns the PLAIN object type (`ObjectType<C>`), not `RunType<ObjectType<C>>`;
// converting composition to the generic `RunType<…>` is a separate follow-up. So
// `typeof object({...})` is the object type, consumed with `createIsType<typeof
// Model>()` as today. The `{__propMod}` carrier `object` reads is a property
// MODIFIER (optional / readonly), not a format family.
//
// No `infer`, no Zod-style "type instantiation is excessively deep" tax: each
// builder types its own params arg (so cross-family misuse like
// `number({maxLength: 5})` errors at the call). The retained `ModelType<C>` /
// `FieldFormatMap` / `FieldType` / `ParamsOf` chain below is the config↔type
// bridge the inverse direction reuses (slated for removal in a later pass). The
// Go binary, not the type system, is the validation engine.
//
// `TypeFormat` IS imported as a value (not `import type`): the value-level
// import keeps the brand alias's reflection metadata reachable for tsgo, the
// same constraint the `formats/` files document.

import {TypeFormat} from '../runtypes/typeFormat.ts';
import {getRTUtils} from '../runtypes/rtUtils.ts';
import type {RunType} from '../runtypes/types.ts';
import type {TypeFromRT} from '../runtypes/typeFromRt.ts';
// The leaf descriptor → type reverse map (format name → branded type). Each
// builder routes its carried `RunType<…>` type through it, so the format→type
// mapping lives in ONE place (leafTypes.ts), not hardcoded per builder. The 6
// temporal rows reference the `FormatTemporal*` aliases there, keeping the
// Temporal-lib coupling out of this module.
import type {LeafType} from './leafTypes.ts';
import type {InjectRunTypeId} from '../markers.ts';
import type {StringParams} from '../formats/string/stringFormats.ts';
import type {NumberParams} from '../formats/numberFormats.ts';
import type {BigIntParams} from '../formats/bigintFormats.ts';
import type {FormatParams_NativeDate} from '../formats/datetime/dateFormats.ts';
import type {MinMax} from '../formats/datetime/dateTimeParams.ts';

// ─────────────────────────────── Params ─────────────────────────────
//
// Value-first builders accept the type-first format params unchanged
// (`StringParams`, `NumberParams`, … imported above). There is NO value-first
// re-typing of `pattern`: a pattern must carry `mockSamples` (see `PatternParam`
// in stringFormats.ts — a `FormatPattern` or an inline `{source, flags?,
// mockSamples, …}`, never a bare `/regex/`), so `string` uses
// `StringParams.pattern` as-is.

// ─────────────────────────── Field configs ──────────────────────────
//
// A field config describes a field's TYPE only — the `type` discriminator + the
// `formatParams`. Property MODIFIERS (optional / readonly) are deliberately NOT
// here: they are a property-POSITION concern that `object(...)` applies (from a
// `propMod(...)` wrapper), not part of a field's identity — so the same field
// type is reused whether the property is required, optional, or readonly. (These
// are the retained config↔type bridge shapes: `ModelConfigOf<T>` returns them
// and `ModelType<C>` maps them back; builders return the brand directly.)

/** A `string` field. **/
export type StringFieldConfig = {type: 'string'; formatParams: StringParams};
/** A `number` field. **/
export type NumberFieldConfig = {type: 'number'; formatParams: NumberParams};
/** A native-`Date` field (min/max bounds: absolute ISO literal or `now±P…`). **/
export type DateFieldConfig = {type: 'date'; formatParams: FormatParams_NativeDate};
/** A `bigint` field (bigint-valued bounds). **/
export type BigIntFieldConfig = {type: 'bigint'; formatParams: BigIntParams};
/** A `boolean` field — carries no params (`formatParams: {}`). **/
export type BooleanFieldConfig = {type: 'boolean'; formatParams: Record<string, never>};

// Temporal field configs — one per orderable `Temporal.X` FORMAT type, all
// sharing the `MinMax` bounds. The `temporal.<name>` discriminator mirrors the
// `temporal.instant(...)` builder (and the `Temporal.X` API). The Go side keys
// off the brand's `__rtFormatName`, not this tag, so the prefix is an
// authoring-side label only.
type TemporalFieldConfig<Tag extends string> = {type: Tag; formatParams: MinMax};
/** A `Temporal.Instant` field. **/
export type InstantFieldConfig = TemporalFieldConfig<'temporal.instant'>;
/** A `Temporal.ZonedDateTime` field. **/
export type ZonedDateTimeFieldConfig = TemporalFieldConfig<'temporal.zonedDateTime'>;
/** A `Temporal.PlainDate` field. **/
export type PlainDateFieldConfig = TemporalFieldConfig<'temporal.plainDate'>;
/** A `Temporal.PlainTime` field. **/
export type PlainTimeFieldConfig = TemporalFieldConfig<'temporal.plainTime'>;
/** A `Temporal.PlainDateTime` field. **/
export type PlainDateTimeFieldConfig = TemporalFieldConfig<'temporal.plainDateTime'>;
/** A `Temporal.PlainYearMonth` field. **/
export type PlainYearMonthFieldConfig = TemporalFieldConfig<'temporal.plainYearMonth'>;

/** The discriminated union of every supported field config. Extending it with
 *  composition (object / array / union / tuple / nullable) is out of scope by
 *  design — those compose for free in the type channel; see
 *  docs/value-first-formats.md. **/
export type FieldConfig =
  | StringFieldConfig
  | NumberFieldConfig
  | DateFieldConfig
  | BigIntFieldConfig
  | BooleanFieldConfig
  | InstantFieldConfig
  | ZonedDateTimeFieldConfig
  | PlainDateFieldConfig
  | PlainTimeFieldConfig
  | PlainDateTimeFieldConfig
  | PlainYearMonthFieldConfig;

/** A whole model: a flat record of named field configs. **/
export type ModelConfig = Record<string, FieldConfig>;

// ───────────────────────────── Builders ─────────────────────────────
//
// Each LEAF builder RETURNS `RunType<T>` where `T` is its branded format type
// (`RunType<FormatString<P>>` / …), sourced from the leaf reverse map. The
// `const` type parameter on the params is the ONLY narrowing mechanism: it
// keeps `{maxLength: 50}` as `50`, not `number`, so the literal survives into
// the brand. The params arg is typed to the family's own interface, so
// cross-family misuse (`number({maxLength: 5})`) errors right at the call.
//
// Each builder is an INJECTABLE MARKER (Tier 2): the trailing
// `id?: InjectRunTypeId<…>` is filled by vite-plugin-runtypes with the resolved
// structural id, and the body returns the LIVE RunType node for it
// (`getRunType(id)`) — the exact node the type compiler produces for the
// equivalent written type. A builder nested inside `object(...)` is skipped by
// the scanner (the enclosing marker reflects the whole shape), so it has no id
// and returns the `{type, formatParams}` carrier the `object` call discards.

/** Resolves the live RunType node for an injected marker id — the exact node
 *  the type compiler produces for the builder's return type. With no id (the
 *  builder is nested inside `object(...)`, so the scanner skipped it) or before
 *  the cache module has loaded, it returns the `carrier` the enclosing `object`
 *  discards. **/
function builderResult<T>(id: InjectRunTypeId<T> | undefined, carrier: unknown): RunType<T> {
  if (id !== undefined) {
    const runType = getRTUtils().getRunType(id);
    if (runType) return runType as RunType<T>;
  }
  return carrier as RunType<T>;
}

/** A string field builder — returns the branded `FormatString`. The param type
 *  is `StringParams` (a `pattern` is a `FormatPattern` or an inline
 *  `{source, flags?, mockSamples, …}`, never a bare `/regex/`), so `P` satisfies
 *  `FormatString`'s own `StringParams` bound directly — no `TypeFormat<…>`
 *  workaround. **/
export function string<const P extends StringParams = Record<string, never>>(
  formatParams: P = {} as P,
  id?: InjectRunTypeId<LeafType<'stringFormat', P>>
): RunType<LeafType<'stringFormat', P>> {
  return builderResult(id, {type: 'string', formatParams});
}

/** A number field builder — returns the branded `FormatNumber`. **/
export function number<const P extends NumberParams = Record<string, never>>(
  formatParams: P = {} as P,
  id?: InjectRunTypeId<LeafType<'numberFormat', P>>
): RunType<LeafType<'numberFormat', P>> {
  return builderResult(id, {type: 'number', formatParams});
}

/** A bigint field builder — returns the branded `FormatBigInt`. **/
export function bigint<const P extends BigIntParams = Record<string, never>>(
  formatParams: P = {} as P,
  id?: InjectRunTypeId<LeafType<'bigintFormat', P>>
): RunType<LeafType<'bigintFormat', P>> {
  return builderResult(id, {type: 'bigint', formatParams});
}

/** A native-`Date` field builder — returns the branded `FormatDate`. **/
export function date<const P extends FormatParams_NativeDate = Record<string, never>>(
  formatParams: P = {} as P,
  id?: InjectRunTypeId<LeafType<'nativeDate', P>>
): RunType<LeafType<'nativeDate', P>> {
  return builderResult(id, {type: 'date', formatParams});
}

/** A boolean builder — no params, no format brand (kind boolean). Returns
 *  `RunType<boolean>`. **/
export function boolean(id?: InjectRunTypeId<boolean>): RunType<boolean> {
  return builderResult(id, {type: 'boolean', formatParams: {}});
}

// `temporalBuilder` — shared factory for the 6 temporal builders below. Each
// fixes its tag and returns the matching `FormatTemporal*<P>` via the local
// tag→format lookup, so the 6 namespace call sites don't change.
// Authoring tag (`temporal.instant`, …) → branded temporal type, via the leaf
// reverse map (so the format→type mapping stays in leafTypes.ts only). Each row
// is `LeafType<'temporal<Name>', P>` = `FormatTemporal*<P>` for `P extends MinMax`.
interface TemporalFormatByTag<P extends MinMax> {
  'temporal.instant': LeafType<'temporalInstant', P>;
  'temporal.zonedDateTime': LeafType<'temporalZonedDateTime', P>;
  'temporal.plainDate': LeafType<'temporalPlainDate', P>;
  'temporal.plainTime': LeafType<'temporalPlainTime', P>;
  'temporal.plainDateTime': LeafType<'temporalPlainDateTime', P>;
  'temporal.plainYearMonth': LeafType<'temporalPlainYearMonth', P>;
}
function temporalBuilder<Tag extends keyof TemporalFormatByTag<MinMax>>(tag: Tag) {
  return <const P extends MinMax = Record<string, never>>(
    formatParams: P = {} as P,
    id?: InjectRunTypeId<TemporalFormatByTag<P>[Tag]>
  ): RunType<TemporalFormatByTag<P>[Tag]> => builderResult(id, {type: tag, formatParams});
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

/** Property modifiers a field can carry inside `object(...)`: `optional` makes
 *  the property `key?:`, `readonly` makes it `readonly key:`. Both are
 *  property-POSITION concerns `object`'s mapped type applies — NOT part of a
 *  field's identity (the `*FieldConfig` types stay pure `{type, formatParams}`),
 *  so this type appears only here and in `object`'s param, never in a config. **/
export interface PropModifiers {
  optional?: true;
  readonly?: true;
}

/** The carrier `propMod(...)` produces — a field paired with its modifiers.
 *  `object` reads `__propMod` to place the key and `__field` for its value type;
 *  the carrier never leaks past `object`'s mapped type. **/
interface PropModCarrier<M extends PropModifiers, F> {
  readonly __propMod: M;
  readonly __field: F;
}

/** Applies property modifiers to a field for use inside `object(...)`:
 *  `propMod({optional: true}, string({maxLength: 5}))`, `propMod({readonly:
 *  true}, number())`, or both. The modifiers ride a DISTINCT carrier (no brand
 *  intersection, which would corrupt the `__rtFormatName` / `__rtFormatParams`
 *  sentinels); `object` unwraps it. A bare `propMod(...)` is only meaningful as a
 *  field inside `object(...)`. **/
export function propMod<const M extends PropModifiers, const F>(modifiers: M, field: F): PropModCarrier<M, F> {
  return {__propMod: modifiers, __field: field};
}

/** Shortcut for `propMod({optional: true}, field)` — marks a field optional
 *  (`key?:`) inside `object(...)`. The common modifier gets a terse spelling;
 *  reach for `propMod` for `readonly` or combinations. **/
export function optional<const F>(field: F): PropModCarrier<{optional: true}, F> {
  return propMod({optional: true}, field);
}

// object's per-field readers — all INDEXED ACCESS / structural guards, no `infer`.
/** The branded field type a value carries. Leaf builders now return
 *  `RunType<…>`, so `TypeFromRT` unwraps either the `__field` inside a `propMod`
 *  carrier (itself a `RunType<…>`) or a bare `RunType<…>` back to the format
 *  type the property should hold. **/
type FieldOf<V> = V extends {__propMod: PropModifiers; __field: unknown} ? TypeFromRT<V['__field']> : TypeFromRT<V>;
/** Whether a value carries the `optional` / `readonly` property modifier. **/
type IsOptional<V> = V extends {__propMod: {optional: true}} ? true : false;
type IsReadonly<V> = V extends {__propMod: {readonly: true}} ? true : false;

/** The object type `object(C)` produces. Four key-groups intersected — the
 *  (optional × readonly) combinations — because TS can't apply `?` / `readonly`
 *  per-key in one homomorphic map. A bare field is required + mutable; a
 *  `propMod(...)` field places the key per its modifiers. `FieldOf` unwraps each
 *  field's `RunType<…>` to its format type; empty groups collapse (`& {}`) so an
 *  all-required-mutable object converges with the plain type-first object. Shared
 *  by `object`'s return type and its `InjectRunTypeId<…>` marker param. **/
type ObjectType<C> = {
  -readonly [K in keyof C as IsOptional<C[K]> extends true ? never : IsReadonly<C[K]> extends true ? never : K]: FieldOf<C[K]>;
} & {
  readonly [K in keyof C as IsOptional<C[K]> extends true ? never : IsReadonly<C[K]> extends true ? K : never]: FieldOf<C[K]>;
} & {
  -readonly [K in keyof C as IsOptional<C[K]> extends true ? (IsReadonly<C[K]> extends true ? never : K) : never]?: FieldOf<C[K]>;
} & {
  readonly [K in keyof C as IsOptional<C[K]> extends true ? (IsReadonly<C[K]> extends true ? K : never) : never]?: FieldOf<C[K]>;
};

// ──────────── Config↔type bridge (RETAINED, off the forward path) ───────────
//
// `ParamsOf` / `FieldFormatMap` / `FieldType` / `ModelType` below NO LONGER run
// the forward authoring path — builders return the brand directly. They are
// retained as the discriminated-config → branded-type direction of a
// bidirectional bridge the inverse `RunType → typed model` reflection reuses,
// kept byte-for-byte so a config mapped through `ModelType` still equals the
// matching builder / type-first brand.
//
// `ParamsOf<F>` (indexed access, NOT `infer`) pulls the params object a field
// config stored, and `TypeFormat<Base, Name, Params>` re-brands it. The helper's
// own `extends {formatParams: unknown}` constraint is what lets the bare indexed
// access typecheck (a generic `F extends FieldConfig` alone doesn't surface the
// key to `F[...]`).
type ParamsOf<F extends {formatParams: unknown}> = F['formatParams'];

/** The discriminator → format-type lookup, keyed by the `type` tag every field
 *  config carries and parameterized by that field's params `P`. Each entry is
 *  the SAME branded format type the type-first surface produces, so a
 *  builder-authored field converges on the same structural id as the
 *  hand-written `Format*<P>` form. This replaces a long `F extends {type:'x'} ?
 *  … : …` ladder with a flat dictionary — add a leaf format by adding ONE line
 *  here (plus its field config + builder), not another nested branch.
 *
 *  `P` is passed STRAIGHT THROUGH to every entry — in particular the temporal
 *  rows must NOT intersect `& MinMax`: that would re-inject the interface's
 *  optional `min?/max?/gt?/lt?: string | undefined`, and the scanner would read
 *  an unset bound as the literal type-string `"string | undefined"` and emit a
 *  broken `Temporal.X.compare(value, "string | undefined")`. Each builder's own
 *  `P extends …` constraint already validated the params at the call site.
 *  `boolean` ignores `P` (it carries none). **/
interface FieldFormatMap<P extends object> {
  string: TypeFormat<string, 'stringFormat', P>;
  number: TypeFormat<number, 'numberFormat', P>;
  date: TypeFormat<Date, 'nativeDate', P>;
  bigint: TypeFormat<bigint, 'bigintFormat', P>;
  boolean: boolean;
  // Temporal rows reuse `LeafType<'temporal*', P>` — which IS
  // `P extends MinMax ? FormatTemporal*<P> : never` — so the format→type mapping
  // (and the Temporal-lib import) stays in leafTypes.ts only. The internal guard
  // NARROWS, it does not intersect, so `P` flows through unchanged and no
  // spurious `min?/max?: string | undefined` is injected (see the params note).
  'temporal.instant': LeafType<'temporalInstant', P>;
  'temporal.zonedDateTime': LeafType<'temporalZonedDateTime', P>;
  'temporal.plainDate': LeafType<'temporalPlainDate', P>;
  'temporal.plainTime': LeafType<'temporalPlainTime', P>;
  'temporal.plainDateTime': LeafType<'temporalPlainDateTime', P>;
  'temporal.plainYearMonth': LeafType<'temporalPlainYearMonth', P>;
}

/** Maps one field config to its branded format type by indexing
 *  `FieldFormatMap` with the field's `type` tag and its own params. The
 *  `F extends FieldConfig ? …` wrapper distributes over a union `F` (each member
 *  resolves with ITS own params), matching the old per-branch conditional. **/
type FieldType<F extends FieldConfig> = F extends FieldConfig ? FieldFormatMap<ParamsOf<F>>[F['type']] : never;

/** Maps a discriminated `ModelConfig` to its branded model type — the
 *  config→type half of the bridge (no longer the forward authoring hop; builders
 *  return the brand). A `FieldConfig` carries no property modifiers (optional /
 *  readonly live on the `object` / `propMod` authoring layer, not on a field's
 *  identity), so this is a flat all-required map; `-readonly` strips the capture
 *  `readonly` so it converges with the mutable type-first form. **/
export type ModelType<C extends ModelConfig> = {
  -readonly [K in keyof C]: FieldType<C[K]>;
};

// ───────────── Type → config bridge (inverse of ModelType, Tier 3) ──────────
//
// `ModelConfigOf<T>` reads the brand off each field of a branded model type `T`
// and recovers the discriminated `{type, formatParams}` config — the inverse of
// `ModelType<C>`, so `ModelType<ModelConfigOf<T>>` round-trips to `T`. It is the
// static, literal-precise half of `reflectModel<T>()` (define/reflectModel.ts):
// the runtime walk over the RunType supplies the param VALUES (erased to a loose
// type at runtime), this type supplies the precise SHAPE. Flat models only — a
// nested object / array / union field has no `__rtFormat*` brand and resolves to
// `never`, matching the leaf-only value-first scope.

/** Format brand name → authoring `type` tag — the inverse of `FieldFormatMap`'s
 *  per-tag rows, as a single keyed lookup (a flat dictionary, NOT a nested
 *  conditional ladder). This object is the SINGLE source of truth for the
 *  brand→tag map: the `TagByFormatName` type is derived from it via `typeof`, and
 *  the runtime walk in define/reflectModel.ts imports it directly — so adding a
 *  format is one edit here, and the type + runtime can't drift. **/
export const tagByFormatName = {
  stringFormat: 'string',
  numberFormat: 'number',
  bigintFormat: 'bigint',
  nativeDate: 'date',
  temporalInstant: 'temporal.instant',
  temporalZonedDateTime: 'temporal.zonedDateTime',
  temporalPlainDate: 'temporal.plainDate',
  temporalPlainTime: 'temporal.plainTime',
  temporalPlainDateTime: 'temporal.plainDateTime',
  temporalPlainYearMonth: 'temporal.plainYearMonth',
} as const;

/** brand `__rtFormatName` → authoring tag, derived from `tagByFormatName`. **/
type TagByFormatName = typeof tagByFormatName;
type TagOf<N extends keyof TagByFormatName> = TagByFormatName[N];

/** A single branded field type → its discriminated config. The structural guard
 *  proves the two sentinel brand properties exist, then INDEXED ACCESS pulls
 *  them (`F['__rtFormatName']` / `F['__rtFormatParams']`) — no `infer`, matching
 *  the `ParamsOf` / `FieldType` style on the forward path. A plain `boolean` (no
 *  brand) maps to the param-less config; a non-leaf field resolves to `never`. **/
type FieldConfigOf<F> = F extends {__rtFormatName: keyof TagByFormatName; __rtFormatParams: object}
  ? {type: TagOf<F['__rtFormatName']>; formatParams: F['__rtFormatParams']}
  : F extends boolean
    ? {type: 'boolean'; formatParams: Record<string, never>}
    : never;

/** The discriminated `ModelConfig` a branded model type `T` came from — the
 *  inverse of `ModelType<C>`. `-?` un-optionalises the mapped keys and
 *  `NonNullable` strips the `| undefined` an optional property's `?` adds, so
 *  every field yields a concrete config entry (property modifiers aren't
 *  recovered — they're not part of a `FieldConfig`; flat-model scope). **/
export type ModelConfigOf<T> = {-readonly [K in keyof T]-?: FieldConfigOf<NonNullable<T[K]>>};

// ─────────────────────────────── object() ───────────────────────────

/** Assembles an object run-type from named leaf builders, building the object
 *  type via `ObjectType<C>`: a bare field is a required + mutable property; a
 *  `propMod({optional?, readonly?}, field)` wrapper places the key (`key?:` /
 *  `readonly key:`). Strips the `const`-capture `readonly` from un-modified keys
 *  and unwraps each field's `RunType<…>` to its format type.
 *
 *  NOTE: unlike the leaf builders, `object` still returns the PLAIN object type
 *  (`ObjectType<C>`), not `RunType<ObjectType<C>>` — converting composition to
 *  the generic `RunType<…>` is a separate follow-up. So `typeof object({...})` is
 *  the object type, consumed with `createIsType<typeof Model>()` as today. At
 *  runtime it is still the live composite RunType node (the nested leaf builders
 *  are skipped by the scanner); the cast bridges the node to the plain type. **/
export function object<const C extends Record<string, unknown>>(config: C, id?: InjectRunTypeId<ObjectType<C>>): ObjectType<C> {
  return builderResult<ObjectType<C>>(id, config) as unknown as ObjectType<C>;
}
