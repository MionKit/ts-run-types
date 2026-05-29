// Value-first model definitions — a Zod/TypeBox-style BUILDER API that derives
// the equivalent type-first format types via plain TYPE MAPPING (no TS
// `infer`). Author a model by composing per-type builders:
//
//   import {object, string, number, boolean, optional, temporal} from '@mionjs/ts-go-run-types/define';
//
//   const UserModel = object({
//     name:   string({minLength: 1, maxLength: 50}),
//     age:    number({min: 0, max: 120}),
//     active: boolean(),
//     nick:   optional(string({maxLength: 50})),
//     bornAt: temporal.instant({max: 'now'}),
//   });
//   type User = ModelType<typeof UserModel>;
//   const isUser = createIsType<User>();
//
// Each builder is a runtime identity that returns a plain field-config object
// `{type, optional?, formatParams}` — plain data so the model survives in the
// bundle (Drizzle / form builders / OpenAPI read it), `const`-narrowed so the
// literal params (`{maxLength: 50}`) stay narrow enough to brand. `ModelType<C>`
// maps each field onto the SAME branded format type the type-first surface
// produces (`FormatString` / `FormatNumber` / …), so the Go scanner
// (internal/compiled/runtype/typeid/formats.go) reflects it unchanged and both
// front-ends converge on the same structural id — one engine, two front doors.
//
// No `infer`, no Zod-style "type instantiation is excessively deep" tax: each
// builder types its own params arg (so cross-family misuse like
// `number({maxLength: 5})` errors at the call), and the mapping reads each
// field's params by INDEXED ACCESS `F['formatParams']` — a known key, not a
// pattern-match. The Go binary, not the type system, is the validation engine.
//
// `TypeFormat` IS imported as a value (not `import type`): the value-level
// import keeps the brand alias's reflection metadata reachable for tsgo, the
// same constraint the `formats/` files document.

import {TypeFormat} from '../runtypes/typeFormat.ts';
import type {StringParams} from '../formats/string/stringFormats.ts';
import type {NumberParams} from '../formats/numberFormats.ts';
import type {BigIntParams} from '../formats/bigintFormats.ts';
import type {FormatParams_NativeDate} from '../formats/datetime/dateFormats.ts';
import type {MinMax} from '../formats/datetime/dateTimeParams.ts';
import type {FormatPattern} from '../runtypes/formatPattern.ts';
// The 6 orderable Temporal FORMAT aliases (min/max bounds). Importing the
// alias TYPES — not naming `Temporal.*` directly — keeps the Temporal lib
// coupling inside temporalFormats.ts: a value-first temporal field still
// requires `ESNext.Temporal` in the consumer's `lib` (the same scan-time
// TMP001 rule as the type-first Temporal formats), but this module never
// references the Temporal global. `PlainMonthDay` / `Duration` have no format
// family (no ordering ⇒ no min/max), so they are outside the surface — the
// same leaf-only boundary that excludes object/array/union composition.
import type {
  FormatTemporalInstant,
  FormatTemporalZonedDateTime,
  FormatTemporalPlainDate,
  FormatTemporalPlainTime,
  FormatTemporalPlainDateTime,
  FormatTemporalPlainYearMonth,
} from '../formats/datetime/temporalFormats.ts';

// ─────────────────────────────── Params ─────────────────────────────

// `ValuePattern` — the regex forms a value-first string field accepts. The
// regex rides the VALUE channel, not the type channel: the Go scanner recovers
// `{source, flags}` from the literal the property declaration preserves
// (`formatPatternFromInitializer` in internal/compiled/runtype/typeid/formats.go).
//   - `/…/`               an inline regex literal — full `/…/` syntax, the
//                         recommended form;
//   - `{source, flags?}`  the regex as string literals (handy when assembled);
//   - `FormatPattern`     a `registerFormatPattern(...)` result — adds the
//                         load-time sample check + `mockSamples` for the mock
//                         generator (an inline `/…/` carries no samples, so
//                         `createMockType` can't generate matching values for it).
type ValuePattern = RegExp | FormatPattern | {source: string; flags?: string};

// `StringFamilyParams` — the string params a value-first field accepts. Same as
// `StringParams` but `pattern` is re-typed to the value-channel `ValuePattern`
// forms above (instead of the type-first `FormatPattern`-only `PatternParam`).
export type StringFamilyParams = Omit<StringParams, 'pattern'> & {pattern?: ValuePattern};

// ─────────────────────────── Field configs ──────────────────────────
//
// A field config is the plain object a builder returns: the `type`
// discriminator, an optional `optional` flag, and the `formatParams` object
// (always present — builders default it to `{}` — so the type mapping reads it
// by indexed access uniformly across every family). There is NO exclusive-union
// `Forbid<>` machinery: each builder types its own params arg, so a misplaced
// param (`number({maxLength: 5})`) is rejected at the builder call itself.

/** A `string` field — `formatParams` is the value-channel `FormatString` set. **/
export type StringFieldConfig = {type: 'string'; optional?: true; formatParams: StringFamilyParams};
/** A `number` field. **/
export type NumberFieldConfig = {type: 'number'; optional?: true; formatParams: NumberParams};
/** A native-`Date` field (min/max bounds: absolute ISO literal or `now±P…`). **/
export type DateFieldConfig = {type: 'date'; optional?: true; formatParams: FormatParams_NativeDate};
/** A `bigint` field (bigint-valued bounds). **/
export type BigIntFieldConfig = {type: 'bigint'; optional?: true; formatParams: BigIntParams};
/** A `boolean` field — carries no params (`formatParams: {}`). **/
export type BooleanFieldConfig = {type: 'boolean'; optional?: true; formatParams: Record<string, never>};

// Temporal field configs — one per orderable `Temporal.X` FORMAT type, all
// sharing the `MinMax` bounds. The `temporal.<name>` discriminator mirrors the
// `temporal.instant(...)` builder (and the `Temporal.X` API). The Go side keys
// off the brand's `__rtFormatName`, not this tag, so the prefix is an
// authoring-side label only.
type TemporalFieldConfig<Tag extends string> = {type: Tag; optional?: true; formatParams: MinMax};
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
// Each builder is a runtime identity returning the plain field object. The
// `const` type parameter on the params is the ONLY narrowing mechanism (same
// as the old `defineObject<const C>`): it keeps `{maxLength: 50}` as `50`, not
// `number`, so the literal survives into the brand. The params arg is typed to
// the family's own interface, so cross-family misuse errors right here.

/** A string field builder. **/
export function string<const P extends StringFamilyParams = Record<string, never>>(
  formatParams: P = {} as P
): {type: 'string'; formatParams: P} {
  return {type: 'string', formatParams};
}

/** A number field builder. **/
export function number<const P extends NumberParams = Record<string, never>>(
  formatParams: P = {} as P
): {type: 'number'; formatParams: P} {
  return {type: 'number', formatParams};
}

/** A bigint field builder. **/
export function bigint<const P extends BigIntParams = Record<string, never>>(
  formatParams: P = {} as P
): {type: 'bigint'; formatParams: P} {
  return {type: 'bigint', formatParams};
}

/** A native-`Date` field builder. **/
export function date<const P extends FormatParams_NativeDate = Record<string, never>>(
  formatParams: P = {} as P
): {type: 'date'; formatParams: P} {
  return {type: 'date', formatParams};
}

/** A boolean field builder — no params. **/
export function boolean(): {type: 'boolean'; formatParams: Record<string, never>} {
  return {type: 'boolean', formatParams: {}};
}

// `temporalBuilder` — shared factory for the 6 temporal builders below. Each
// fixes its `temporal.<name>` discriminator and accepts the `MinMax` bounds.
function temporalBuilder<Tag extends string>(tag: Tag) {
  return <const P extends MinMax = Record<string, never>>(formatParams: P = {} as P): {type: Tag; formatParams: P} => ({
    type: tag,
    formatParams,
  });
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

/** Marks a field optional — the wrapped property becomes `key?:` in the
 *  derived model (the key MAY be absent, matching the `?` modifier, NOT
 *  `T | undefined`). A composable modifier (Zod/TypeBox style) that preserves
 *  the field's static type and keeps it plain data. **/
export function optional<const F extends FieldConfig>(field: F): F & {optional: true} {
  return {...field, optional: true};
}

// ────────────────────────── Discriminator map ───────────────────────
//
// `ParamsOf<F>` (indexed access, NOT `infer`) pulls the params object a builder
// stored, and `TypeFormat<Base, Name, Params>` re-brands it — producing a type
// byte-for-byte identical to `FormatString` / `FormatNumber` / etc., so a
// builder-authored model converges on the same structural id as the
// hand-written type-first form. The helper's own `extends {formatParams:
// unknown}` constraint is what lets the bare indexed access typecheck (a
// generic `F extends FieldConfig` alone doesn't surface the key to `F[...]`).
type ParamsOf<F extends {formatParams: unknown}> = F['formatParams'];

/** Maps the 6 orderable temporal discriminators onto the `FormatTemporal*`
 *  aliases; returns `never` for non-temporal `F` so it composes as the
 *  fallthrough branch of `FieldType`. Passes `ParamsOf<F>` straight through —
 *  do NOT intersect `& MinMax` here: that re-injects the interface's optional
 *  `min?/max?/gt?/lt?: string | undefined`, and the scanner would read an unset
 *  bound as the literal type-string `"string | undefined"` and emit a broken
 *  `Temporal.X.compare(value, "string | undefined")`. The builder's own
 *  `P extends MinMax` already constrained the params at the call site. **/
type TemporalFieldType<F extends FieldConfig> = F extends {type: 'temporal.instant'}
  ? FormatTemporalInstant<ParamsOf<F>>
  : F extends {type: 'temporal.zonedDateTime'}
    ? FormatTemporalZonedDateTime<ParamsOf<F>>
    : F extends {type: 'temporal.plainDate'}
      ? FormatTemporalPlainDate<ParamsOf<F>>
      : F extends {type: 'temporal.plainTime'}
        ? FormatTemporalPlainTime<ParamsOf<F>>
        : F extends {type: 'temporal.plainDateTime'}
          ? FormatTemporalPlainDateTime<ParamsOf<F>>
          : F extends {type: 'temporal.plainYearMonth'}
            ? FormatTemporalPlainYearMonth<ParamsOf<F>>
            : never;

/** Maps one field config to its branded format type via a conditional lookup
 *  on the `type` discriminator. Scalars resolve directly; the temporal
 *  discriminators fall through to `TemporalFieldType`. **/
type FieldType<F extends FieldConfig> = F extends {type: 'string'}
  ? TypeFormat<string, 'stringFormat', ParamsOf<F>>
  : F extends {type: 'number'}
    ? TypeFormat<number, 'numberFormat', ParamsOf<F>>
    : F extends {type: 'date'}
      ? TypeFormat<Date, 'nativeDate', ParamsOf<F>>
      : F extends {type: 'bigint'}
        ? TypeFormat<bigint, 'bigintFormat', ParamsOf<F>>
        : F extends {type: 'boolean'}
          ? boolean
          : TemporalFieldType<F>;

/** The type a value-first model represents — a flat mapped type over the
 *  config keys, each value resolved through `FieldType`. Feed it to any RT
 *  factory: `createIsType<ModelType<typeof UserModel>>()`.
 *
 *  Two key-groups, intersected: fields wrapped in `optional(...)` (carrying
 *  `optional: true`) become optional properties (`key?:`), the rest required.
 *  TypeScript can't apply the `?` modifier per-key in a single homomorphic map,
 *  so the split is the standard way to do it — and it stays a flat O(keys) map.
 *  `-readonly` strips the `readonly` the `object<const C>` capture stamps on
 *  every config property; without it the derived properties would diverge from
 *  the canonical (mutable) type-first form at the structural-id level (the
 *  format type itself is already identical, only the modifier differed). An
 *  all-required model leaves the optional group empty (`… & {}`), which tsgo
 *  collapses, so it still converges with the plain type-first object. **/
export type ModelType<C extends ModelConfig> = {
  -readonly [K in keyof C as C[K] extends {optional: true} ? never : K]: FieldType<C[K]>;
} & {
  -readonly [K in keyof C as C[K] extends {optional: true} ? K : never]?: FieldType<C[K]>;
};

// ─────────────────────────────── object() ───────────────────────────

/** Assembles a model from named field builders. Identity at runtime — returns
 *  the config object unchanged so it survives in the bundle (Drizzle / form
 *  builders / OpenAPI read it as plain data). The `const` type parameter
 *  captures the composed builder objects narrowly so each field's `formatParams`
 *  literals stay narrow enough to brand. **/
export function object<const C extends ModelConfig>(config: C): C {
  return config;
}
