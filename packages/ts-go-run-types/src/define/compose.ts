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

/** A record / string-index-signature builder — `record(number())` →
 *  `RunType<Record<string, number>>` (i.e. `{[k: string]: number}`). **/
export function record<V>(valueSchema: RunType<V>, id?: InjectRunTypeId<Record<string, V>>): RunType<Record<string, V>> {
  return builderResult(id, {type: 'record', child: valueSchema});
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

/** A function builder — `func()` → `RunType<() => void>`; `func([string(),
 *  number()], boolean())` → `RunType<(a: string, b: number) => boolean>`. The
 *  params list maps to the call signature via `MapTuple` (rest-tuple form, so
 *  `(...args: [string, number])` ≡ `(a: string, b: number)`); `ret` defaults to
 *  `void`. Function values aren't serialisable, so the validator a function
 *  lowers to depends on POSITION: a function-typed object property is skipped
 *  entirely, a function at a tuple slot must be `undefined`, and a top-level
 *  function passes a `typeof === 'function'` gate. The builder exists so those
 *  shapes can be authored value-first. **/
export function func<P extends readonly RunType[] = [], R extends RunType = RunType<void>>(
  params?: readonly [...P],
  ret?: R,
  id?: InjectRunTypeId<(...args: MapTuple<P>) => TypeFromRT<R>>
): RunType<(...args: MapTuple<P>) => TypeFromRT<R>> {
  return builderResult(id, {type: 'function', parameters: params ?? [], return: ret});
}
