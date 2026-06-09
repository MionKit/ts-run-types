// The value-first surface's type channel — EVERY type-level helper the schema
// builders depend on lives here, so the sibling files (atomic.ts / compose.ts /
// utility.ts) carry only runtime builders. No `infer` anywhere (per CLAUDE.md):
// every helper is an `extends`-guard + indexed-access read.
//
// The headline export is `Static<RT>` — the single "recover the source TS type a
// `RunType<T>` represents" extractor (TypeBox's `Static<T>` by another lineage):
//
//   const Name = string({maxLength: 50});   // RunType<FormatString<{maxLength: 50}>>
//   type Name = Static<typeof Name>;         // FormatString<{maxLength: 50}>
//
// `TypeFormat` is imported as a VALUE (not `import type`): the value-level import
// keeps the brand alias's reflection metadata reachable for tsgo, the same
// constraint the `formats/` modules document.

import {TypeFormat} from '../runtypes/typeFormat.ts';
import type {RunType} from '../runtypes/types.ts';
import type {InjectRunTypeId, CompTimeArgs} from '../markers.ts';
import type {MinMax} from '../formats/datetime/dateTimeParams.ts';
import type {
  FormatTemporalInstant,
  FormatTemporalZonedDateTime,
  FormatTemporalPlainDate,
  FormatTemporalPlainTime,
  FormatTemporalPlainDateTime,
  FormatTemporalPlainYearMonth,
  TemporalBaseByFormatName,
} from '../formats/datetime/temporalFormats.ts';

// ─────────────────────────────── Static ─────────────────────────────

/** The TS type a `RunType<T>` carries; identity for anything that isn't a
 *  `RunType`. The carrier is `{t: T}`, so `NonNullable` strips the `| undefined`
 *  the optional `?` adds to the WRAPPER and `['t']` reads `T` back — preserving an
 *  intentional `null`/`undefined` `T` (which a bare-`T` carrier + `NonNullable`
 *  would collapse to `never`). No `infer`. **/
export type Static<RT> = RT extends RunType ? NonNullable<RT['__rtType']>['t'] : RT;

// ─────────────────────────────── Leaves ─────────────────────────────
//
// Leaf descriptor → TS type — the single source of truth mapping a leaf
// RunType's FORMAT identity back to the branded TS type it represents. The
// value-first leaf builders route their carried `RunType<T>` through this map, so
// adding a leaf format is ONE edit here. Keyed by the format brand NAME
// (`__rtFormatName`) because the name is the precise leaf discriminator — it
// encodes both the reflection kind and subKind:
//   stringFormat     → kind string (5)        nativeDate       → class (20) + date (2001)
//   numberFormat     → kind number (6)        temporalInstant… → class (20) + temporal* (2101–2106)
//   bigintFormat     → kind bigint (9)
// The lone bare leaf with no format (boolean, kind 7) needs no row — `boolean()`
// returns `RunType<boolean>` directly.

/** Format brand name → branded leaf type, parameterized by that leaf's params
 *  `P`. The non-temporal rows use `TypeFormat<Base, Name, P>` directly (only a
 *  `P extends object` bound) so a single `P` flows to every row without each
 *  family's own param constraint — each builder validates its own params at the
 *  call site. The temporal rows self-guard `P extends MinMax ? … : never`: the
 *  guard NARROWS, it does not intersect, so `P` flows through unchanged and no
 *  spurious `min?/max?: string | undefined` is injected into the reflected
 *  params. **/
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

/** Every leaf format brand name (the keys of `LeafTypeByFormatName`). **/
export type LeafFormatName = keyof LeafTypeByFormatName<Record<string, never>>;

/** The branded leaf type for a format `Name` with params `P` — the builders'
 *  carried `RunType<…>` type and the type the scanner reflects off the brand. **/
export type LeafType<Name extends LeafFormatName, P extends object> = LeafTypeByFormatName<P>[Name];

// ───────────────────────── Property modifiers ───────────────────────

/** Property modifiers a field can carry inside `object(...)`: `optional` makes
 *  the property `key?:`, `readonly` makes it `readonly key:`. Both are
 *  property-POSITION concerns `object`'s mapped type applies (from a `propMod(...)`
 *  wrapper) — NOT part of a field's identity — so this type appears only here and
 *  in `object`'s param. **/
export interface PropModifiers {
  optional?: true;
  readonly?: true;
}

/** The carrier `propMod(...)` produces — a field paired with its modifiers.
 *  `object` reads `__propMod` to place the key and `__field` for its value type;
 *  the carrier never leaks past `object`'s mapped type. **/
export interface PropModCarrier<M extends PropModifiers, F> {
  readonly __propMod: M;
  readonly __field: F;
}

// object's per-field readers — all INDEXED ACCESS / structural guards, no `infer`.
/** The branded field type a value carries. Leaf builders return `RunType<…>`, so
 *  `Static` unwraps either the `__field` inside a `propMod` carrier (itself a
 *  `RunType<…>`) or a bare `RunType<…>` back to the format type the property should
 *  hold. **/
export type FieldOf<V> = V extends {__propMod: PropModifiers; __field: unknown} ? Static<V['__field']> : Static<V>;
/** Whether a value carries the `optional` / `readonly` property modifier. **/
export type IsOptional<V> = V extends {__propMod: {optional: true}} ? true : false;
export type IsReadonly<V> = V extends {__propMod: {readonly: true}} ? true : false;

/** The object type `object(C)` produces. Four key-groups intersected — the
 *  (optional × readonly) combinations — because TS can't apply `?` / `readonly`
 *  per-key in one homomorphic map. A bare field is required + mutable; a
 *  `propMod(...)` field places the key per its modifiers. `FieldOf` unwraps each
 *  field's `RunType<…>` to its format type; empty groups collapse (`& {}`) so an
 *  all-required-mutable object converges with the plain type-first object. Shared
 *  by `object`'s return type and its `InjectRunTypeId<…>` marker param. **/
export type ObjectType<C> = {
  -readonly [K in keyof C as IsOptional<C[K]> extends true ? never : IsReadonly<C[K]> extends true ? never : K]: FieldOf<C[K]>;
} & {
  readonly [K in keyof C as IsOptional<C[K]> extends true ? never : IsReadonly<C[K]> extends true ? K : never]: FieldOf<C[K]>;
} & {
  -readonly [K in keyof C as IsOptional<C[K]> extends true ? (IsReadonly<C[K]> extends true ? never : K) : never]?: FieldOf<C[K]>;
} & {
  readonly [K in keyof C as IsOptional<C[K]> extends true ? (IsReadonly<C[K]> extends true ? K : never) : never]?: FieldOf<C[K]>;
};

// ─────────────────────────── Temporal lookups ───────────────────────
//
// Authoring tag (`temporal.instant`, …) → branded / base temporal type, via the
// leaf reverse map (so the format→type mapping + the Temporal-lib coupling stay
// out of the builder file). Each branded row is `LeafType<'temporal<Name>', P>` =
// `FormatTemporal*<P>` for `P extends MinMax`.

/** Authoring tag → branded temporal format type (params-present overload). **/
export interface TemporalFormatByTag<P extends MinMax> {
  'temporal.instant': LeafType<'temporalInstant', P>;
  'temporal.zonedDateTime': LeafType<'temporalZonedDateTime', P>;
  'temporal.plainDate': LeafType<'temporalPlainDate', P>;
  'temporal.plainTime': LeafType<'temporalPlainTime', P>;
  'temporal.plainDateTime': LeafType<'temporalPlainDateTime', P>;
  'temporal.plainYearMonth': LeafType<'temporalPlainYearMonth', P>;
}

/** Authoring tag → UNBRANDED base instance type — the no-params overload's return.
 *  Routed through `TemporalBaseByFormatName` so `Temporal.*` stays named only in
 *  temporalFormats.ts, mirroring the `TemporalFormatByTag` rows. **/
export interface TemporalBaseByTag {
  'temporal.instant': TemporalBaseByFormatName['temporalInstant'];
  'temporal.zonedDateTime': TemporalBaseByFormatName['temporalZonedDateTime'];
  'temporal.plainDate': TemporalBaseByFormatName['temporalPlainDate'];
  'temporal.plainTime': TemporalBaseByFormatName['temporalPlainTime'];
  'temporal.plainDateTime': TemporalBaseByFormatName['temporalPlainDateTime'];
  'temporal.plainYearMonth': TemporalBaseByFormatName['temporalPlainYearMonth'];
  // No-ordering tags — present here (base instance type only) but absent from
  // `TemporalFormatByTag`, so their builders are no-param-only (no min/max brand).
  'temporal.plainMonthDay': TemporalBaseByFormatName['temporalPlainMonthDay'];
  'temporal.duration': TemporalBaseByFormatName['temporalDuration'];
}

/** Overloaded shape of each `temporal.<name>` builder — the no-params/plain ↔
 *  params/branded split shared by the scalar leaves. **/
export interface TemporalBuilderFn<Tag extends keyof TemporalFormatByTag<MinMax>> {
  (id?: InjectRunTypeId<TemporalBaseByTag[Tag]>): RunType<TemporalBaseByTag[Tag]>;
  <const P extends MinMax>(
    formatParams: CompTimeArgs<P>,
    id?: InjectRunTypeId<TemporalFormatByTag<P>[Tag]>
  ): RunType<TemporalFormatByTag<P>[Tag]>;
}

// ─────────────────────────── Composer types ─────────────────────────

/** Maps a tuple of `RunType` schemas to the tuple of the types they carry —
 *  homomorphic over `keyof T`, so it preserves tuple length/order with no
 *  `infer`: `[RunType<A>, RunType<B>]` → `[A, B]`. The `-readonly` strips the
 *  `readonly` that `const T` inference adds at the variadic composer call sites
 *  (`tuple` / `func`), so a fixed-tuple return is mutable `[A, B]` and converges
 *  with the type-first tuple. **/
export type MapTuple<T extends readonly RunType[]> = {-readonly [K in keyof T]: Static<T[K]>};

/** The union of the `Static` types of a RunType tuple, built RECURSIVELY so EACH
 *  member survives as a distinct arm. The obvious non-recursive form
 *  `MapTuple<T>[number]` is subtype-REDUCED by tsgo — a subset arm swallows its
 *  superset (`{a} | {a; b}` → `{a}`) — so it diverges from the written
 *  `{a} | {a; b}`. The recursive build preserves every arm, converging on the
 *  same structural id as the type-first union.
 *
 *  ⚠️ Recursive `infer` is the TS-checker-perf hazard this value-first surface
 *  otherwise avoids (see docs/value-first-formats.md). It is used ONLY here, and
 *  the `union` builder reaches it ONLY as the variable-arity fallback: unions up
 *  to the fixed-arity overload count are branded directly (`A | B | …`) via plain
 *  generic inference, with NO `infer`. So the perf cost is confined to unusually
 *  wide unions. **/
export type UnionOf<T extends readonly RunType[]> = T extends readonly [
  infer Head extends RunType,
  ...infer Tail extends readonly RunType[],
]
  ? Static<Head> | UnionOf<Tail>
  : never;

/** The intersection of the `Static` types of a RunType tuple, built recursively
 *  (`Static<Head> & IntersectionOf<Tail>`), terminating at `unknown` — the identity
 *  of `&` (`X & unknown = X`). The array-form `intersection` fallback brands this for
 *  9+ members (the positional overloads can't carry a trailing injected id past a
 *  rest). Same recursive-`infer` perf caveat as `UnionOf`, reached only past the
 *  positional overloads. **/
export type IntersectionOf<T extends readonly RunType[]> = T extends readonly [
  infer Head extends RunType,
  ...infer Tail extends readonly RunType[],
]
  ? Static<Head> & IntersectionOf<Tail>
  : unknown;

/** A template-literal part: a string-literal segment or a `RunType` placeholder. **/
export type TemplatePart = string | RunType;

/** The TS template-literal interpolation domain — what a `${…}` placeholder may
 *  hold. A `RunType` part contributes its carried `T` narrowed to this set; a
 *  string part contributes its own literal text. **/
type Interpolatable = string | number | bigint | boolean | null | undefined;

/** Strips a value-first leaf's FORMAT brand (`{__rtFormatName, __rtFormatParams}`
 *  carried by `number()`/`string()`/`bigint()`) back to its base primitive, so a
 *  placeholder converges with the type-first PLAIN `${number}` / `${string}` —
 *  otherwise the brand leaks into the template-literal type and the scanner
 *  reflects a different (permissive) shape. Literals and unions carry no brand and
 *  pass through unchanged, so `literal('a')` stays `'a'`. **/
type Unbrand<X> = X extends {__rtFormatName: string; __rtFormatParams: object}
  ? X extends string
    ? string
    : X extends number
      ? number
      : X extends bigint
        ? bigint
        : X & Interpolatable
  : X & Interpolatable;
type PartText<Part extends TemplatePart> = Part extends RunType ? Unbrand<Static<Part>> : Part & Interpolatable;

/** Folds a parts tuple into the template-literal type it denotes:
 *  `['api/user/', RunType<number>]` → `` `api/user/${number}` ``. Recursion over
 *  the FIXED parts tuple is what assembles the literal — the one spot a `infer`
 *  head/tail split is unavoidable (a mapped type can't JOIN into a template
 *  string). The parts tuple is bounded by the call site, so there's no
 *  deep-instantiation tax; a nested template-literal placeholder flattens
 *  transparently, and a union placeholder distributes — both matching how the
 *  type-first `` `…` `` form normalises, so the two converge on one structural id. **/
export type AssembleTemplate<P extends readonly TemplatePart[]> = P extends readonly [
  infer Head extends TemplatePart,
  ...infer Tail extends readonly TemplatePart[],
]
  ? `${PartText<Head>}${AssembleTemplate<Tail>}`
  : '';

// ─────────────────────── Recursive schemas (self / circular) ─────────
//
// `circular((self) => body)` authors a self-referential schema with NO
// hand-written type. The callback's `self` is a `RunType<Self>` placeholder baked
// wherever the type recurses (`{next?: Self}`); `Recursive<Body>` ties the knot —
// substituting every `Self` with the recursive type itself. `circular` brands the
// FULLY-RESOLVED `Recursive<Body>`, so the Go scanner reflects an ordinary
// recursive type and (with the structural cycle-token anchor in typeid.go)
// value-first converges with the type-first form.

// #region substituteself-extract — Self / SubstituteSelf / Recursive machinery;
// sliced verbatim between these markers by test/types/substituteSelfHarness.ts to
// build the recursive-schema budget test. Keep self-contained (only `lib` types).

/** The self-reference placeholder `self()` carries — a unique brand so nothing
 *  structural can collide with it. **/
declare const SelfBrand: unique symbol;
export type Self = {readonly [SelfBrand]: true};

/** Traverse any node type, replacing every `Self` with the recursion fixpoint
 *  `P[0]`. `P` is a 1-tuple holding the recursion; threading it (not a bare type)
 *  lets `Recursive` defer the self-reference. Leaves (primitives — incl. branded
 *  primitives like `FormatString` = `string & brand` — `Date`, `RegExp`) pass
 *  through; containers recurse. `T extends Self` distributes, so union members
 *  substitute individually. Arrays use `infer E → E[]` (defers the recursive
 *  element); tuples use the homomorphic mapped type (preserves slots/optional). **/
type SubstituteSelf<T, P extends [unknown]> = T extends Self
  ? P[0]
  : T extends string | number | boolean | bigint | symbol | null | undefined
    ? T
    : T extends Date | RegExp
      ? T
      : // Gate Map/Set behind cheap non-`infer` checks so non-collection nodes
        // skip the inference machinery (same optimisation as `DataOnly`).
        T extends Map<any, any>
        ? T extends Map<infer K, infer V>
          ? Map<SubstituteSelf<K, P>, SubstituteSelf<V, P>>
          : never // unreachable — gate guarantees a Map
        : T extends Set<any>
          ? T extends Set<infer E>
            ? Set<SubstituteSelf<E, P>>
            : never // unreachable — gate guarantees a Set
          : T extends Promise<infer E>
            ? Promise<SubstituteSelf<E, P>>
            : T extends (...args: infer A extends readonly unknown[]) => infer R
              ? (...args: {-readonly [K in keyof A]: SubstituteSelf<A[K], P>}) => SubstituteSelf<R, P>
              : T extends readonly unknown[]
                ? number extends T['length']
                  ? T extends readonly (infer E)[]
                    ? SubstituteSelf<E, P>[]
                    : never
                  : {-readonly [K in keyof T]: SubstituteSelf<T[K], P>}
                : T extends object
                  ? {[K in keyof T]: SubstituteSelf<T[K], P>}
                  : T;

/** Ties a recursive body (containing `Self`) into the self-referential type it
 *  denotes — `Recursive<{next?: Self}>` ≡ `type Node = {next?: Node}`. The
 *  tuple-wrapped `[Recursive<Body>]` + `P[0]` read defers the self-reference so
 *  the alias is legal (a direct substitution errors TS2456). Root-level recursive
 *  TUPLES are the one shape TS can't build this way (TS2589) — author those
 *  type-first. **/
export type Recursive<Body> = SubstituteSelf<Body, [Recursive<Body>]>;
// #endregion substituteself-extract
