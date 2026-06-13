// Public types for the mock-value generator. Surface mirrors the
// `MockOptions` shape. `createMockType<T>()` merges caller options over
// `defaultMockOptions` before walking the runtype graph.

import type {MockData} from '../enrich/mockData.ts';

/** Per-call options steering atomic-value generation and optional/recursive
 *  shape handling. Ported field-for-field from the reference implementation. **/
export interface MockOptions {
  /** Pool for `any` / `unknown` kinds. **/
  anyValuesList: unknown[];
  /** Inclusive bounds for `mockNumber` / `mockBigInt`. **/
  minNumber?: number;
  maxNumber?: number;
  /** Inclusive timestamp bounds for `mockDate`. **/
  minDate?: number | Date;
  maxDate?: number | Date;
  /** Force a specific enum branch. **/
  enumIndex?: number;
  /** Pool for the `object` kind. **/
  objectList: object[];
  /** Promise resolution delay (ms). 0 = synchronous (microtask). **/
  promiseTimeOut: number;
  /** When set the mocked Promise rejects with this value. **/
  promiseReject?: unknown;
  /** Pool for the `regexp` kind. **/
  regexpList: RegExp[];
  /** Upper bound used when `stringLength` is omitted. **/
  maxRandomStringLength: number;
  /** Force a specific string length. **/
  stringLength?: number;
  /** Character set used by `mockString`. **/
  stringCharSet: string;
  symbolLength?: number;
  symbolCharSet?: string;
  symbolName?: string;
  /** Upper bound for array / Map / Set / indexSignature sizes. **/
  maxRandomItemsLength: number;
  /** Force a specific length. **/
  arrayLength?: number;
  /** Probability (0..1) that an optional is included. Decays by depth. **/
  optionalProbability: number;
  /** Per-property override of `optionalProbability`. **/
  optionalPropertyProbability?: Record<string | number, number>;
  /** Pre-built object the walker mutates for cyclic-shape parents.
   *  The decay helper clears this on each recursion. **/
  parentObj?: Record<string | number | symbol, unknown>;
  /** Force a specific union branch. **/
  unionIndex?: number;
  tupleOptions?: MockOptions[];
  paramsOptions?: MockOptions[];
  /** Informational only — `maxMockRecursion` decay handles the practical case. **/
  maxStackDepth: number;
  /** Cap on stack re-entry count before mocking bails to `undefined`.
   *  Combined with the probability decay this guarantees termination. **/
  maxMockRecursion: number;
}

/** Loose runtime view of a `MockNode` (../enrich/mockData.ts) — the walker
 *  reads pools / ranges / array controls structurally, descending by property
 *  name (objects) or `$items` (arrays). Typed permissively because the walker
 *  operates over erased `unknown` values; the typed surface is `MockData<T>` on
 *  the public `data` field. Every slot is optional, so an absent / partial node
 *  leaves the corresponding generation path untouched (strictly additive). **/
export interface MockDataNode {
  /** Value pool — leaf kinds draw `randomItem(pool)`. **/
  pool?: unknown[];
  /** Inclusive numeric / Date range bounds. **/
  min?: number | Date;
  max?: number | Date;
  /** Array element data node. **/
  $items?: MockDataNode;
  /** Array element count — fixed `n` or `[min, max]` range. **/
  $length?: number | [number, number];
  /** Present-probability for optional object members (reserved; not yet read). **/
  $optional?: number;
  /** Per-property child node (objects), descended by property name. **/
  [property: string]: unknown;
}

/** Wrapper bag passed at factory or call site. Reserved for future option
 *  groups (e.g. `validation`, `format`) without breaking the signature.
 *
 *  `data` is the optional `MockData<T>` enrichment map: per-field pools / ranges
 *  / element + length controls that steer value generation. Strictly additive —
 *  when absent the walker behaves byte-identically. `dataNode` is the internal
 *  current-node cursor the walker threads + descends; callers supply `data`. **/
export interface RunTypeMockOptions<T = unknown> {
  mock?: DeepPartial<MockOptions>;
  data?: MockData<T>;
  /** Internal: the current MockData node for the node being walked. Seeded
   *  from `data` at walk entry, descended by field name / `$items` / element.
   *  Not part of the caller-facing surface — set by the walker. **/
  dataNode?: MockDataNode;
}

/** Generator returned by `createMockType<T>()`. Call-time options may carry a
 *  `data` enrichment map (typed loosely as `MockData<unknown>` here so the
 *  return type stays structurally stable across `T`; the precisely-typed
 *  `MockData<T>` surface is the factory's `options` param). **/
export type MockTypeFn<T = unknown> = (options?: DeepPartial<RunTypeMockOptions>) => T;

/** Recursive Partial — every object branch becomes optional. **/
export type DeepPartial<T> = T extends object ? (T extends ReadonlyArray<unknown> ? T : {[K in keyof T]?: DeepPartial<T[K]>}) : T;
