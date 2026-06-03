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

/** A tuple builder. Fixed: `tuple([string(), number()])` →
 *  `RunType<[string, number]>`. Rest: `tuple([number()], string())` →
 *  `RunType<[number, ...string[]]>` — the second argument is the rest element.
 *  The `readonly [...T]` target captures the leading items as a tuple `T`
 *  (length/order preserved); `MapTuple` recovers each element's type. **/
export function tuple<T extends readonly RunType[]>(
  items: readonly [...T],
  id?: InjectRunTypeId<MapTuple<T>>
): RunType<MapTuple<T>>;
export function tuple<T extends readonly RunType[], R>(
  items: readonly [...T],
  rest: RunType<R>,
  id?: InjectRunTypeId<[...MapTuple<T>, ...R[]]>
): RunType<[...MapTuple<T>, ...R[]]>;
export function tuple(
  items: readonly RunType[],
  restOrId?: RunType | InjectRunTypeId<unknown>,
  id?: InjectRunTypeId<unknown>
): RunType {
  // Disambiguate the two overloads at runtime: a rest element is a RunType
  // (object); the injected id is a string. Either way the scanner reflected the
  // whole tuple type off the brand, so items/rest ride the carrier only.
  const restIsSchema = typeof restOrId === 'object' && restOrId !== null;
  const injectedId = (restIsSchema ? id : restOrId) as InjectRunTypeId<unknown> | undefined;
  const rest = restIsSchema ? (restOrId as RunType) : undefined;
  return builderResult(injectedId, {type: 'tuple', children: items, rest});
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

/** A `Promise` builder — `promise(string())` → `RunType<Promise<string>>`.
 *  Validates the thenable shape (the resolved value type is not checked at
 *  runtime — a pending promise's value isn't available synchronously). **/
export function promise<V>(valueSchema: RunType<V>, id?: InjectRunTypeId<Promise<V>>): RunType<Promise<V>> {
  return builderResult(id, {type: 'promise', child: valueSchema});
}
