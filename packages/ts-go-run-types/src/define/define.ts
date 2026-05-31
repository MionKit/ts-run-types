// Value-first model definitions — a discriminator-keyed config surface that
// derives the equivalent type-first format types via plain TYPE MAPPING (no
// TS `infer`). Write a runtime config object:
//
//   const UserModel = define({
//     name: {type: 'string', minLength: 1, maxLength: 50},
//     age:  {type: 'number', min: 0, max: 120},
//     born: {type: 'date', max: 'now'},
//   });
//   type User = ModelType<typeof UserModel>;
//   const isUser = createIsType<User>();
//
// `ModelType<C>` maps each field config onto the SAME branded format type the
// type-first surface produces (`FormatString` / `FormatNumber` / `FormatDate`
// all lower to `TypeFormat<Base, Name, Params>`). Because the output is
// structurally identical to the hand-written type-first form, the Go scanner
// (internal/compiled/runtype/typeid/formats.go) reflects it unchanged and both
// front-ends converge on the same structural id — no second engine, just a
// thinner authoring door.
//
// Mechanism note: this is NOT inference. `FieldType` is an O(1) conditional
// lookup on the `type` discriminator literal, and `ModelType` is a flat mapped
// type over the keys — cheap native TS, none of Zod's "type instantiation is
// excessively deep" tax, because the Go binary (not the type system) is the
// validation engine here.
//
// `TypeFormat` IS imported as a value (not `import type`): the value-level
// import keeps the brand alias's reflection metadata reachable for tsgo, the
// same constraint the `formats/` files document.

import {TypeFormat} from '../runtypes/typeFormat.ts';
import type {StringParams} from '../formats/string/stringFormats.ts';
import type {NumberParams} from '../formats/numberFormats.ts';
import type {FormatParams_NativeDate} from '../formats/datetime/dateFormats.ts';

// ─────────────────────────── Field configs ──────────────────────────
//
// Each field config is a discriminated member: the `type` literal tag plus
// the exact param shape the matching format already validates. Reusing the
// published param interfaces means the value-first config and the type-first
// `Format*<P>` params stay in lockstep — one definition, two front doors.

/** A string field: the `string` discriminator plus the `FormatString` params
 *  that survive the value channel (minLength / maxLength / length /
 *  allowedChars / disallowedChars / allowedValues / disallowedValues /
 *  mockSamples / the transform flags).
 *
 *  `pattern` is intentionally OMITTED. A `FormatPattern` (from
 *  `registerFormatPattern`) is recovered Go-side by tracing a `typeof p`
 *  TypeQuery back to the const's `registerFormatPattern({regexp, …})` call.
 *  In a value config the property is written as a value (`pattern: slug`), so
 *  `define<const C>` captures its type as the structural `FormatPattern`
 *  interface — the `typeof` link is gone and the scanner can only read the
 *  interface's `flags: string` as a non-literal, emitting a broken
 *  `new RegExp(…, 'string')`. Regex therefore stays on the type-first surface
 *  (`FormatString<{pattern: typeof slug}>`) until the value-AST front-end
 *  (Option B in docs/value-first-formats.md) lands. Omitting it here turns a
 *  silent runtime break into a local compile error. **/
export interface StringFieldConfig extends Omit<StringParams, 'pattern'> {
  type: 'string';
}

/** A number field: the `number` discriminator plus every `FormatNumber` param
 *  (min / max / lt / gt / integer / float / multipleOf). **/
export interface NumberFieldConfig extends NumberParams {
  type: 'number';
}

/** A native-`Date` field: the `date` discriminator plus the `FormatDate`
 *  min/max bounds (absolute ISO literal or relative `now±P…`). **/
export interface DateFieldConfig extends FormatParams_NativeDate {
  type: 'date';
}

/** The discriminated union of every supported field config. Extending this
 *  union (object / array / union / named formats) is the Option-B follow-up
 *  parked in docs/value-first-formats.md. **/
export type FieldConfig = StringFieldConfig | NumberFieldConfig | DateFieldConfig;

/** A whole model: a flat record of named field configs. **/
export type ModelConfig = Record<string, FieldConfig>;

// ────────────────────────── Discriminator map ───────────────────────
//
// `Omit<F, 'type'>` strips the discriminator before it becomes the
// `__rtFormatParams` payload, so the params the Go scanner reads are clean
// (`{maxLength: 50}`, never `{type: 'string', maxLength: 50}`). Mapping
// through `TypeFormat` directly (its `Params` constraint is just `object`)
// sidesteps the per-family param-constraint proof while producing a type
// byte-for-byte identical to `FormatString` / `FormatNumber` / `FormatDate`.

/** Maps one field config to its branded format type via a conditional lookup
 *  on the `type` discriminator. **/
type FieldType<F extends FieldConfig> = F extends {type: 'string'}
  ? TypeFormat<string, 'stringFormat', Omit<F, 'type'>>
  : F extends {type: 'number'}
    ? TypeFormat<number, 'numberFormat', Omit<F, 'type'>>
    : F extends {type: 'date'}
      ? TypeFormat<Date, 'nativeDate', Omit<F, 'type'>>
      : never;

/** The type a value-first model represents — a flat mapped type over the
 *  config keys, each value resolved through `FieldType`. Feed it to any RT
 *  factory: `createIsType<ModelType<typeof UserModel>>()`.
 *
 *  `-readonly` strips the `readonly` the `define<const C>` capture stamps on
 *  every config property. Without it the derived properties would be
 *  `readonly` and diverge from the canonical (mutable) type-first form
 *  `{name: FormatString<…>}` at the structural-id level — the underlying
 *  format type is already identical, only the property modifier differed. **/
export type ModelType<C extends ModelConfig> = {
  -readonly [K in keyof C]: FieldType<C[K]>;
};

// ───────────────────────────── define() ─────────────────────────────

/** Identity at runtime — returns the config object unchanged so it survives
 *  in the bundle (Drizzle / form builders / OpenAPI generators can read it as
 *  plain data). The `const` type parameter captures literals narrowly (so
 *  `{maxLength: 50}` stays `50`, not `number`) and `extends ModelConfig`
 *  validates the config shape at the authoring site, surfacing a local
 *  discriminated-union mismatch on a bad field instead of a deep generic
 *  error downstream. **/
export function define<const C extends ModelConfig>(config: C): C {
  return config;
}
