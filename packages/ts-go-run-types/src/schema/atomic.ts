// Value-first ATOMIC / LEAF builders — a Zod/TypeBox-style BUILDER API. Each
// builder returns a generic `RunType<T>` (the runtime run-type node, typed with
// the source type `T` it represents); `Static<typeof X>` recovers `T`:
//
//   import {string, number, boolean, bigint, date, temporal} from '@mionjs/ts-go-run-types/schema';
//   import {createValidate, type Static} from '@mionjs/ts-go-run-types';
//
//   const Name = string({minLength: 1, maxLength: 50}); // RunType<FormatString<…>>
//   type Name  = Static<typeof Name>;                   // FormatString<…>
//   const isName = createValidate(Name);                  // validator from the schema
//
// The leaf builder's carried `T` is sourced from the leaf reverse map
// (static.ts `LeafType`) keyed by format name — the single place the format→type
// mapping lives. The Go scanner reflects the SAME branded type off the builder's
// `InjectRunTypeId<…>` brand as the type-first surface, so a value-first leaf and
// the hand-written `Format*<P>` form converge on one structural id; the runtime
// then resolves the same precompiled factory (see createValidate).
//
// The date/time leaf builders (`date` / `temporal.*`) live in datetime.ts;
// composition (`object` / `array` / `union` / … and the property modifiers
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
import type {LeafType, BrandArg} from './static.ts';

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

/** Brand tag for the value-first leaf builders — `string({…}, brand('UserId'))`
 *  opts the leaf INTO a nominal `Format*<P, 'UserId'>` (matching the type-first
 *  `FormatString<P, 'UserId'>`). The tag is TS-only: the Go scanner reads the
 *  brand off the reflected `LeafType<…, B>`, NOT off this object, so at runtime
 *  the builder discards it and resolves the injected id as usual. It rides BEFORE
 *  the trailing id slot — an object, never confused with the id string. **/
export function brand<const B extends string>(name: B): BrandArg<B> {
  return {__rtBrandName: name};
}

/** Recovers the plugin-injected id from a leaf builder's args. The plugin appends
 *  the resolved id as the TRAILING argument; the optional params (object) and
 *  brand (object) slots before it are never strings, so the id is simply the last
 *  string argument. Before injection (no id arg) there is no string → `undefined`,
 *  and the builder falls back to the carrier. **/
export function lastInjectedId(...args: unknown[]): string | undefined {
  for (let i = args.length - 1; i >= 0; i--) {
    if (typeof args[i] === 'string') return args[i] as string;
  }
  return undefined;
}

/** Builds a no-param preset builder for a FIXED named format `T` (e.g.
 *  `FormatEmail`, `FormatInt8`). The returned function's only param is the injected
 *  `InjectRunTypeId<T>` brand, so the scanner reflects `T` and the value-first id
 *  matches the type-first alias. Used by the predefined-format builder files
 *  (stringFormats.ts / numberFormats.ts / bigintFormats.ts); `tag` is the Go
 *  format name, carried only on the fallback carrier. **/
export function presetBuilder<T>(tag: string): (id?: InjectRunTypeId<T>) => RunType<T> {
  return (id?: InjectRunTypeId<T>) => builderResult(id, {type: tag, formatParams: {}});
}

// ───────────────────────────── Leaf builders ────────────────────────
//
// Each parameterised scalar leaf builder is THREE overloads:
//   1. no-params       `string()`                 → PLAIN base `RunType<string>`
//   2. params-only     `string({maxLength: 5})`   → transparent `RunType<FormatString<P>>`
//   3. params + brand  `string({…}, brand('Id'))` → nominal `RunType<FormatString<P, 'Id'>>`
// The no-params call converges on the SAME structural id as the type-first plain
// type and a marker-form `createValidate<string>()`. A single impl resolves the
// injected id as the TRAILING string arg (`lastInjectedId`): it lands at slot 0
// (no-params), slot 1 (params), or slot 2 (params + brand), and the Go scanner
// derives the slot from the resolved overload's signature (trailing param). The
// brand rides slot 1 as a `BrandArg` OBJECT, so it never collides with the id
// string. The branded default `P = Record<string, never>` is GONE on purpose:
// defaulting it re-introduced the brand on `string()` and split the cache (see
// docs/SCHEMA-FORM-TYPEID-CONVERGENCE.md). The `const` type parameters are the ONLY
// narrowing mechanism: they keep `{maxLength: 50}` as `50` (not `number`) and the
// brand `'Id'` as a string literal, so both survive into the reflected type.

/** A string field builder. `string()` → `RunType<string>` (plain, converges with
 *  type-first `string`); `string({maxLength: 5})` → transparent `RunType<FormatString<P>>`;
 *  `string({maxLength: 5}, brand('UserId'))` → nominal `RunType<FormatString<P, 'UserId'>>`.
 *  Params are `StringParamsValueFirst`: like `StringParams` but `pattern` is the
 *  inline `{source, flags?, mockSamples, …}` literal ONLY — not the opaque
 *  `FormatPattern` value (whose source/flags erase to `string`), so the reflected
 *  `T` keeps the pattern literals and the value-first id stays faithful. **/
export function string(id?: InjectRunTypeId<string>): RunType<string>;
export function string<const P extends StringParamsValueFirst>(
  formatParams: CompTimeArgs<P>,
  id?: InjectRunTypeId<LeafType<'stringFormat', P>>
): RunType<LeafType<'stringFormat', P>>;
export function string<const P extends StringParamsValueFirst, const B extends string>(
  formatParams: CompTimeArgs<P>,
  brandTag: BrandArg<B>,
  id?: InjectRunTypeId<LeafType<'stringFormat', P, B>>
): RunType<LeafType<'stringFormat', P, B>>;
export function string(
  formatParamsOrId?: StringParams | InjectRunTypeId<string>,
  brandOrId?: BrandArg<string> | InjectRunTypeId<string>,
  id?: InjectRunTypeId<string>
): RunType<string> {
  const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
  return builderResult(lastInjectedId(formatParamsOrId, brandOrId, id), {type: 'string', formatParams});
}

/** A number field builder. `number()` → `RunType<number>`; `number({min: 0})` →
 *  transparent `RunType<FormatNumber<P>>`; `number({min: 0}, brand('Age'))` →
 *  nominal `RunType<FormatNumber<P, 'Age'>>`. **/
export function number(id?: InjectRunTypeId<number>): RunType<number>;
export function number<const P extends NumberParams>(
  formatParams: CompTimeArgs<P>,
  id?: InjectRunTypeId<LeafType<'numberFormat', P>>
): RunType<LeafType<'numberFormat', P>>;
export function number<const P extends NumberParams, const B extends string>(
  formatParams: CompTimeArgs<P>,
  brandTag: BrandArg<B>,
  id?: InjectRunTypeId<LeafType<'numberFormat', P, B>>
): RunType<LeafType<'numberFormat', P, B>>;
export function number(
  formatParamsOrId?: NumberParams | InjectRunTypeId<number>,
  brandOrId?: BrandArg<string> | InjectRunTypeId<number>,
  id?: InjectRunTypeId<number>
): RunType<number> {
  const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
  return builderResult(lastInjectedId(formatParamsOrId, brandOrId, id), {type: 'number', formatParams});
}

/** A bigint field builder. `bigint()` → `RunType<bigint>`; `bigint({min: 0n})` →
 *  transparent `RunType<FormatBigInt<P>>`; `bigint({min: 0n}, brand('Balance'))` →
 *  nominal `RunType<FormatBigInt<P, 'Balance'>>`. **/
export function bigint(id?: InjectRunTypeId<bigint>): RunType<bigint>;
export function bigint<const P extends BigIntParams>(
  formatParams: CompTimeArgs<P>,
  id?: InjectRunTypeId<LeafType<'bigintFormat', P>>
): RunType<LeafType<'bigintFormat', P>>;
export function bigint<const P extends BigIntParams, const B extends string>(
  formatParams: CompTimeArgs<P>,
  brandTag: BrandArg<B>,
  id?: InjectRunTypeId<LeafType<'bigintFormat', P, B>>
): RunType<LeafType<'bigintFormat', P, B>>;
export function bigint(
  formatParamsOrId?: BigIntParams | InjectRunTypeId<bigint>,
  brandOrId?: BrandArg<string> | InjectRunTypeId<bigint>,
  id?: InjectRunTypeId<bigint>
): RunType<bigint> {
  const formatParams = typeof formatParamsOrId === 'object' ? formatParamsOrId : {};
  return builderResult(lastInjectedId(formatParamsOrId, brandOrId, id), {type: 'bigint', formatParams});
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
 *  `createValidate(symbol())` throws the same way the type-first `symbol` case
 *  does. **/
export function symbol(id?: InjectRunTypeId<symbol>): RunType<symbol> {
  return builderResult(id, {type: 'symbol', formatParams: {}});
}

// Top / bottom atomic builders — `any` / `unknown` / `never` / `void`. Dedicated
// builders: each carries its kind off the trailing `InjectRunTypeId<…>` brand, so
// the scanner reflects the SAME kind as the type-first `createValidate<any>()` /
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
 *  type-first `createValidate<MyClass>()`. validate matches by SHAPE (data properties;
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

/** An enum builder — accepts EITHER a TS `enum` (`enumType(Color)`) OR an
 *  enum-like record (`enumType({Red: 0, Green: 'green', Blue: 2})`), and carries
 *  the union of its VALUES (`E[keyof E]`). `Static<typeof enumType(Color)>` is then
 *  assignment-equivalent to the enum — it accepts exactly the same values (proven:
 *  `Color.Red` is assignable to both, and they cross-assign). `const E` preserves a
 *  plain record's literal values (`{Red: 0}` → `0`, not `number`); a TS enum object
 *  is already precise, and its numeric reverse-mapping doesn't leak into the value
 *  union.
 *
 *  Because the carried type is the value-union, the Go scanner resolves it as a
 *  UNION (kind union), NOT a TS `enum` (kind enum): the two validate identically,
 *  but a value-first builder can't reconstruct the nominal enum's member-NAME
 *  metadata (used for mocks / error messages), so the cache ids are distinct by
 *  design — the enum id-integrity cases are flagged `idDivergent`. Exported as
 *  `enum` from the `/schema` index for a natural `RT.enum(...)` (the function can't
 *  be named `enum` — reserved word — same as `voidType`/`classType`). **/
export function enumType<const E extends Record<string, string | number>>(
  enumObject: E,
  id?: InjectRunTypeId<E[keyof E]>
): RunType<E[keyof E]> {
  return builderResult(id, {type: 'enum', members: enumObject});
}
