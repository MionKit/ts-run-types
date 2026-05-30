// Composer builders — `array` / `tuple` / `union` / `intersection` / `record`.
// Each takes child `RunType` schemas and returns the generic `RunType<…>` for
// the COMPOSED type, via the same trailing-`InjectRunTypeId` marker every
// builder uses: the Go scanner reflects the whole composed type off the brand
// (collapsing intersections, distributing unions, …) and the runtime returns
// that reflected node. Nested child builders are skipped by the scanner — they
// exist only to drive TS inference for the brand (see define.ts `builderResult`).
//
// No `infer` (per CLAUDE.md): `array`/`record` read their single child's `T`
// directly; `tuple` maps the child tuple with a homomorphic mapped type
// (`MapTuple`); `union` indexes that mapped tuple with `[number]` (→ a union,
// `TypeFromRT` distributing over the members); `intersection` uses positional
// type params (`A & B & …`) with `= unknown` defaults so omitted slots vanish
// (`X & unknown = X`).

import {builderResult} from './define.ts';
import type {RunType} from '../runtypes/types.ts';
import type {TypeFromRT} from '../runtypes/typeFromRt.ts';
import type {InjectRunTypeId} from '../markers.ts';

/** Maps a tuple of `RunType` schemas to the tuple of the types they carry —
 *  homomorphic over `keyof T`, so it preserves tuple length/order with no
 *  `infer`: `[RunType<A>, RunType<B>]` → `[A, B]`. **/
export type MapTuple<T extends readonly RunType[]> = {[K in keyof T]: TypeFromRT<T[K]>};

/** An array builder — `array(string())` → `RunType<string[]>`. **/
export function array<T>(item: RunType<T>, id?: InjectRunTypeId<T[]>): RunType<T[]> {
  return builderResult(id, {type: 'array', child: item});
}

/** A tuple builder. Four forms, each adding a trailing kind:
 *   - Fixed:    `tuple([string(), number()])` → `RunType<[string, number]>`.
 *   - Optional: `tuple([number()], [bigint(), boolean()])` →
 *               `RunType<[number, bigint?, boolean?]>` — the SECOND array holds
 *               the trailing optional elements; `Partial<MapTuple<O>>` makes each
 *               slot `?`. A separate arg (not inline `optional()` in one array) so
 *               the brand needs no recursive `infer`.
 *   - Rest:     `tuple([number()], string())` → `RunType<[number, ...string[]]>`
 *               — a single RunType second arg is the rest element.
 *   - Optional + rest: `tuple([number()], [bigint()], string())` →
 *               `RunType<[number, bigint?, ...string[]]>`.
 *  Disambiguated at runtime: an ARRAY second arg is the optional-items list, a
 *  RunType (object) second arg is the legacy rest element, a string is the
 *  injected id. The `readonly [...T]` targets capture each list as a tuple
 *  (length/order preserved); `MapTuple` recovers element types. The scanner
 *  reflects the whole tuple type off the brand, so the children ride the carrier
 *  only. **/
export function tuple<T extends readonly RunType[]>(
  items: readonly [...T],
  id?: InjectRunTypeId<MapTuple<T>>
): RunType<MapTuple<T>>;
export function tuple<T extends readonly RunType[], O extends readonly RunType[]>(
  items: readonly [...T],
  optionalItems: readonly [...O],
  id?: InjectRunTypeId<[...MapTuple<T>, ...Partial<MapTuple<O>>]>
): RunType<[...MapTuple<T>, ...Partial<MapTuple<O>>]>;
export function tuple<T extends readonly RunType[], O extends readonly RunType[], R>(
  items: readonly [...T],
  optionalItems: readonly [...O],
  rest: RunType<R>,
  id?: InjectRunTypeId<[...MapTuple<T>, ...Partial<MapTuple<O>>, ...R[]]>
): RunType<[...MapTuple<T>, ...Partial<MapTuple<O>>, ...R[]]>;
export function tuple<T extends readonly RunType[], R>(
  items: readonly [...T],
  rest: RunType<R>,
  id?: InjectRunTypeId<[...MapTuple<T>, ...R[]]>
): RunType<[...MapTuple<T>, ...R[]]>;
export function tuple(
  items: readonly RunType[],
  arg2?: readonly RunType[] | RunType | InjectRunTypeId<unknown>,
  arg3?: RunType | InjectRunTypeId<unknown>,
  arg4?: InjectRunTypeId<unknown>
): RunType {
  // Disambiguate positional args at runtime:
  //   arg2 — optional-items list (Array) | legacy rest element (RunType object)
  //          | injected id (string)
  //   arg3 — rest element (RunType object) | injected id (string)
  //   arg4 — injected id (string)
  let optionalChildren: readonly RunType[] | undefined;
  let rest: RunType | undefined;
  let injectedId: InjectRunTypeId<unknown> | undefined;
  if (Array.isArray(arg2)) {
    optionalChildren = arg2;
    if (typeof arg3 === 'object' && arg3 !== null) {
      rest = arg3 as RunType;
      injectedId = arg4;
    } else {
      injectedId = arg3 as InjectRunTypeId<unknown> | undefined;
    }
  } else if (typeof arg2 === 'object' && arg2 !== null) {
    rest = arg2 as RunType;
    injectedId = arg3 as InjectRunTypeId<unknown> | undefined;
  } else {
    injectedId = arg2 as InjectRunTypeId<unknown> | undefined;
  }
  return builderResult(injectedId, {type: 'tuple', children: items, optionalChildren, rest});
}

/** A union builder — `union([string(), number()])` → `RunType<string |
 *  number>`. Array form, unlimited members: `MapTuple<T>[number]` is the union
 *  of the member types (`TypeFromRT` distributes over the indexed access). **/
export function union<T extends readonly RunType[]>(
  members: readonly [...T],
  id?: InjectRunTypeId<MapTuple<T>[number]>
): RunType<MapTuple<T>[number]> {
  return builderResult(id, {type: 'union', children: members});
}

/** An intersection builder — positional, `intersection(a, b, …)` →
 *  `RunType<A & B & …>`, up to 8 members. Omitted slots default to `unknown`
 *  and vanish from the composite (`X & unknown = X`); the plugin pads the
 *  unused slots with `undefined` so the injected id lands on the trailing
 *  `InjectRunTypeId` parameter. Real intersections are 2–3 types; `runType<T>()`
 *  covers anything wider. **/
export function intersection<A, B = unknown, C = unknown, D = unknown, E = unknown, F = unknown, G = unknown, H = unknown>(
  a: RunType<A>,
  b?: RunType<B>,
  c?: RunType<C>,
  d?: RunType<D>,
  e?: RunType<E>,
  f?: RunType<F>,
  g?: RunType<G>,
  h?: RunType<H>,
  id?: InjectRunTypeId<A & B & C & D & E & F & G & H>
): RunType<A & B & C & D & E & F & G & H> {
  return builderResult(id, {type: 'intersection', children: [a, b, c, d, e, f, g, h]});
}

/** A record / index-signature builder. Two forms:
 *   - Value-only: `record(number())` → `RunType<Record<string, number>>`
 *     (`{[k: string]: number}`) — the key defaults to `string`.
 *   - Key + value: `record(templateLiteral(['api/', string()]), number())` → a
 *     `Record` whose key is the template-literal pattern the key schema carries.
 *     The key schema's type `K` (any `string | number` subtype, incl. a
 *     template-literal pattern) becomes the index-signature key. **/
export function record<V>(valueSchema: RunType<V>, id?: InjectRunTypeId<Record<string, V>>): RunType<Record<string, V>>;
export function record<K extends string | number, V>(
  keySchema: RunType<K>,
  valueSchema: RunType<V>,
  id?: InjectRunTypeId<Record<K, V>>
): RunType<Record<K, V>>;
export function record(arg1: RunType, arg2?: RunType | InjectRunTypeId<unknown>, arg3?: InjectRunTypeId<unknown>): RunType {
  // A RunType OBJECT second arg is the (key, value) form; a string (injected id) or
  // undefined is the value-only form (key defaults to string).
  if (typeof arg2 === 'object' && arg2 !== null) {
    return builderResult(arg3, {type: 'record', index: arg1, child: arg2 as RunType});
  }
  return builderResult(arg2 as InjectRunTypeId<unknown> | undefined, {type: 'record', child: arg1});
}

/** A `Map` builder — `map(string(), number())` → `RunType<Map<string, number>>`.
 *  Both the key and value schemas are validated per entry. **/
export function map<K, V>(keySchema: RunType<K>, valueSchema: RunType<V>, id?: InjectRunTypeId<Map<K, V>>): RunType<Map<K, V>> {
  return builderResult(id, {type: 'map', index: keySchema, child: valueSchema});
}

/** A `Set` builder — `set(string())` → `RunType<Set<string>>`. Each member is
 *  validated against the value schema. **/
export function set<V>(valueSchema: RunType<V>, id?: InjectRunTypeId<Set<V>>): RunType<Set<V>> {
  return builderResult(id, {type: 'set', child: valueSchema});
}

/** A lazy / recursive reference — defers a self-referential schema so a circular
 *  type can name itself before its `const` is initialised:
 *
 *    interface Node { value: number; next: Node | null; }
 *    const Node: RunType<Node> = object({value: number(), next: union([lazy(() => Node), literal(null)])});
 *
 *  Always nested inside another composer, so the scanner skips it (the enclosing
 *  marker reflects the whole circular shape off its brand); the thunk exists only
 *  to break the value-level self-reference cycle and to carry `T` for inference. **/
export function lazy<T>(thunk: () => RunType<T>, id?: InjectRunTypeId<T>): RunType<T> {
  return builderResult(id, {type: 'lazy', thunk});
}

/** A `Promise` builder — `promise(string())` → `RunType<Promise<string>>`.
 *  Validates the thenable shape (the resolved value type is not checked at
 *  runtime — a pending promise's value isn't available synchronously). **/
export function promise<V>(valueSchema: RunType<V>, id?: InjectRunTypeId<Promise<V>>): RunType<Promise<V>> {
  return builderResult(id, {type: 'promise', child: valueSchema});
}

/** A function builder. Two param forms:
 *   - Array: `func([string(), number()], boolean())` →
 *            `RunType<(a: string, b: number) => boolean>` — each element is a
 *            positional param RunType, mapped via `MapTuple` (rest-tuple form, so
 *            `(...args: [string, number])` ≡ `(a: string, b: number)`).
 *   - Tuple: `func(tuple([number()], [string()]), date())` →
 *            `RunType<(a: number, b?: string) => Date>` — a single params-TUPLE
 *            RunType, so optional/rest params ride the `tuple()` builder.
 *  `func()` → `RunType<() => void>`; `ret` defaults to `void`. Function values
 *  aren't serialisable, so the validator a function lowers to depends on POSITION:
 *  a function-typed object property is skipped entirely, a function at a tuple slot
 *  must be `undefined`, and a top-level function passes a `typeof === 'function'`
 *  gate. The builder exists so those shapes can be authored value-first. **/
export function func<P extends readonly RunType[] = [], R extends RunType = RunType<void>>(
  params?: readonly [...P],
  ret?: R,
  id?: InjectRunTypeId<(...args: MapTuple<P>) => TypeFromRT<R>>
): RunType<(...args: MapTuple<P>) => TypeFromRT<R>>;
export function func<T extends readonly unknown[], R extends RunType = RunType<void>>(
  paramsTuple: RunType<T>,
  ret?: R,
  id?: InjectRunTypeId<(...args: T) => TypeFromRT<R>>
): RunType<(...args: T) => TypeFromRT<R>>;
export function func(paramsOrTuple?: readonly RunType[] | RunType, ret?: RunType, id?: InjectRunTypeId<unknown>): RunType {
  // An ARRAY first arg is the array form (a list of positional param RunTypes); a
  // RunType OBJECT first arg is the tuple form (a single params-tuple RunType whose
  // carried T is the param tuple — lets optional/rest params be authored via
  // tuple()). The carrier `parameters` is not walked for root function schemas.
  const parameters = Array.isArray(paramsOrTuple) ? paramsOrTuple : (paramsOrTuple ?? []);
  return builderResult(id, {type: 'function', parameters, return: ret});
}

/** A `Parameters<F>` builder — `parameters(func([number(), boolean()], string()))`
 *  → `RunType<[number, boolean]>`. Takes a function run-type and yields its
 *  parameter tuple (exactly the tuple `Parameters<F>` denotes), so a function's
 *  parameters can be validated as a first-class tuple. The function rides the
 *  carrier; the brand `Parameters<F>` (an ordinary tuple type) drives the id and
 *  reflects through the existing tuple path. **/
export function parameters<F extends (...args: any[]) => any>(
  fnRt: RunType<F>,
  id?: InjectRunTypeId<Parameters<F>>
): RunType<Parameters<F>> {
  return builderResult(id, {type: 'parameters', child: fnRt});
}

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
type PartText<Part extends TemplatePart> = Part extends RunType ? Unbrand<TypeFromRT<Part>> : Part & Interpolatable;

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

/** A template-literal builder — value-first authoring of a TS template-literal
 *  type from a parts array mixing string segments and `RunType` placeholders:
 *  `templateLiteral(['api/user/', number()])` → `` RunType<`api/user/${number}`> ``;
 *  `templateLiteral([string(), '/', number()])` → `` RunType<`${string}/${number}`> ``;
 *  `templateLiteral([union([literal('a'), literal('b')]), '-', number()])` →
 *  `` RunType<`${'a' | 'b'}-${number}`> ``. Because the result is a real
 *  template-literal TYPE it nests anywhere (object property, union member) and
 *  converges with the type-first `` createIsType<`…`>() `` through the existing
 *  reflection — no Go-side change. The `const` type parameter captures
 *  string-literal segments (`'api/user/'` stays a literal, not `string`); the
 *  parts ride the carrier only. **/
export function templateLiteral<const P extends readonly TemplatePart[]>(
  parts: P,
  id?: InjectRunTypeId<AssembleTemplate<P>>
): RunType<AssembleTemplate<P>> {
  return builderResult(id, {type: 'templateLiteral', children: parts});
}
