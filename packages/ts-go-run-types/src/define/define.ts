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
import type {FormatPattern} from '../runtypes/formatPattern.ts';

// ─────────────────────────── Field configs ──────────────────────────
//
// Each field config is a discriminated member: the `type` literal tag plus
// the exact param shape the matching format already validates. Reusing the
// published param interfaces means the value-first config and the type-first
// `Format*<P>` params stay in lockstep — one definition, two front doors.
//
// The members are an EXCLUSIVE union: each one explicitly forbids the param
// keys it doesn't own (typed `never`). Without this, TypeScript's
// excess-property check against a plain union is lenient — it allows any key
// present in *some* member — so `{type: 'number', maxLength: 5}` would compile
// (`maxLength` is valid for the string member) and the misplaced param would
// silently no-op. The `Forbid<…>` intersection turns that into a local error
// on the offending field. The forbidden keys are optional `never`, so omitting
// them is fine and the `const`-captured value type carries only the keys the
// author actually wrote (the negation never leaks into `ModelType`).

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
type StringFamilyParams = Omit<StringParams, 'pattern'> & {pattern?: ValuePattern};

// Every param key across all field families — the universe the per-member
// negation subtracts from.
type AllParamKeys = keyof StringFamilyParams | keyof NumberParams | keyof FormatParams_NativeDate;

// Forbids every param key NOT in `OwnKeys` by typing it optional-`never`.
type Forbid<OwnKeys extends PropertyKey> = Partial<Record<Exclude<AllParamKeys, OwnKeys>, never>>;

// `FieldMeta` — per-field flags that are NOT format params: shared by every
// field family, stripped before the params reach the brand, and (deliberately)
// kept out of `AllParamKeys` so the exclusive-union negation neither forbids
// nor mistakes them for params. `optional: true` makes the property optional
// (`key?:`) in the derived model — the key MAY be absent, matching the `?`
// modifier (not `T | undefined`).
type FieldMeta = {optional?: boolean};

/** A string field: the `string` discriminator plus the value-channel
 *  `FormatString` params (minLength / maxLength / length / allowedChars /
 *  disallowedChars / allowedValues / disallowedValues / mockSamples / the
 *  transform flags) plus `optional`. Forbids number/date-only params. **/
export type StringFieldConfig = {type: 'string'} & FieldMeta & StringFamilyParams & Forbid<keyof StringFamilyParams>;

/** A number field: the `number` discriminator plus every `FormatNumber` param
 *  (min / max / lt / gt / integer / float / multipleOf) plus `optional`.
 *  Forbids string-only params (date's min/max/lt/gt overlap number's, so they
 *  aren't forbidden). **/
export type NumberFieldConfig = {type: 'number'} & FieldMeta & NumberParams & Forbid<keyof NumberParams>;

/** A native-`Date` field: the `date` discriminator plus the `FormatDate`
 *  min/max bounds (absolute ISO literal or relative `now±P…`) plus `optional`.
 *  Forbids string-only params and the number-only `integer`/`float`/
 *  `multipleOf`. **/
export type DateFieldConfig = {type: 'date'} & FieldMeta & FormatParams_NativeDate & Forbid<keyof FormatParams_NativeDate>;

/** The discriminated union of every supported field config. Extending this
 *  union (object / array / union / named formats) is the Option-B follow-up
 *  parked in docs/value-first-formats.md. **/
export type FieldConfig = StringFieldConfig | NumberFieldConfig | DateFieldConfig;

/** A whole model: a flat record of named field configs. **/
export type ModelConfig = Record<string, FieldConfig>;

// ────────────────────────── Discriminator map ───────────────────────
//
// `Omit<F, 'type' | 'optional'>` strips the discriminator AND the `optional`
// meta flag before the rest becomes the `__rtFormatParams` payload, so the
// params the Go scanner reads are clean (`{maxLength: 50}`, never
// `{type: 'string', optional: true, maxLength: 50}`). Mapping through
// `TypeFormat` directly (its `Params` constraint is just `object`) sidesteps
// the per-family param-constraint proof while producing a type byte-for-byte
// identical to `FormatString` / `FormatNumber` / `FormatDate`.

/** Maps one field config to its branded format type via a conditional lookup
 *  on the `type` discriminator. **/
type FieldType<F extends FieldConfig> = F extends {type: 'string'}
  ? TypeFormat<string, 'stringFormat', Omit<F, 'type' | 'optional'>>
  : F extends {type: 'number'}
    ? TypeFormat<number, 'numberFormat', Omit<F, 'type' | 'optional'>>
    : F extends {type: 'date'}
      ? TypeFormat<Date, 'nativeDate', Omit<F, 'type' | 'optional'>>
      : never;

/** The type a value-first model represents — a flat mapped type over the
 *  config keys, each value resolved through `FieldType`.  Feed it to any RT
 *  factory: `createIsType<ModelType<typeof UserModel>>()`.
 *
 *  Two key-groups, intersected: fields flagged `optional: true` become
 *  optional properties (`key?:`), the rest required. TypeScript can't apply
 *  the `?` modifier per-key in a single homomorphic map, so the split is the
 *  standard way to do it — and it stays a flat O(keys) map (no template-literal
 *  `infer`, which would tax the checker). `-readonly` strips the `readonly` the
 *  `define<const C>` capture stamps on every config property; without it the
 *  derived properties would diverge from the canonical (mutable) type-first
 *  form at the structural-id level (the format type itself is already
 *  identical, only the modifier differed). An all-required model leaves the
 *  optional group empty (`… & {}`), which tsgo collapses, so it still converges
 *  with the plain type-first object. **/
export type ModelType<C extends ModelConfig> = {
  -readonly [K in keyof C as C[K] extends {optional: true} ? never : K]: FieldType<C[K]>;
} & {
  -readonly [K in keyof C as C[K] extends {optional: true} ? K : never]?: FieldType<C[K]>;
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
