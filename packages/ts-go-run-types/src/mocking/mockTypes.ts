// Public types for the mock-value generator. Surface mirrors mion's
// `MockOptions` interface (mion-run-types:packages/run-types/src/types.ts)
// so existing consumers can port option bags verbatim. Every option is
// optional at the call site — `createMockType<T>()` merges caller options
// over `defaultMockOptions` (`constants.mock.ts`) before walking the
// runtype graph.

/** Per-call options that steer how atomic values are generated and how
 *  optional / recursive shapes are handled. Ported field-for-field from
 *  mion. **/
export interface MockOptions {
  /** Pool the walker draws from for `any` / `unknown` kinds. **/
  anyValuesList: unknown[];
  /** Inclusive lower bound for `mockNumber` / `mockBigInt`. **/
  minNumber?: number;
  /** Inclusive upper bound for `mockNumber` / `mockBigInt`. **/
  maxNumber?: number;
  /** Inclusive lower bound (timestamp) for `mockDate`. **/
  minDate?: number | Date;
  /** Inclusive upper bound (timestamp) for `mockDate`. **/
  maxDate?: number | Date;
  /** Force a specific enum branch; if unset a random one is picked. **/
  enumIndex?: number;
  /** Pool the walker draws from for the `object` kind. **/
  objectList: object[];
  /** Promise resolution delay (ms). 0 resolves synchronously after a
   *  microtask. **/
  promiseTimeOut: number;
  /** When set the mocked Promise rejects with this value instead of
   *  resolving. **/
  promiseReject?: unknown;
  /** Pool the walker draws from for the `regexp` kind. **/
  regexpList: RegExp[];
  /** Upper bound for random string lengths when `stringLength` is
   *  omitted. **/
  maxRandomStringLength: number;
  /** Force a specific string length. **/
  stringLength?: number;
  /** Character set used by `mockString`. **/
  stringCharSet: string;
  /** Force a specific symbol-description length. **/
  symbolLength?: number;
  /** Override character set for symbol-description generation. **/
  symbolCharSet?: string;
  /** Force a specific symbol description. **/
  symbolName?: string;
  /** Upper bound for random array / Map / Set / indexSignature sizes
   *  when `arrayLength` is omitted. **/
  maxRandomItemsLength: number;
  /** Force a specific array / Map / Set length. **/
  arrayLength?: number;
  /** Probability (0..1) that an optional property / parameter is
   *  included. Decays by nesting depth in cyclic types. **/
  optionalProbability: number;
  /** Per-property override of `optionalProbability`. Keyed by property
   *  name; value is in the same 0..1 range. **/
  optionalPropertyProbability?: Record<string | number, number>;
  /** Pre-built object the walker mutates for cyclic-shape parents. The
   *  decay helper clears this on every recursion to prevent runaway
   *  binding. **/
  parentObj?: Record<string | number | symbol, unknown>;
  /** Force a specific union branch; out-of-range throws. **/
  unionIndex?: number;
  /** Per-element mock options for tuple members. **/
  tupleOptions?: MockOptions[];
  /** Per-parameter mock options for function parameters. **/
  paramsOptions?: MockOptions[];
  /** Hard cap on stack depth (currently informational — the
   *  `maxMockRecursion` decay handles the practical case). **/
  maxStackDepth: number;
  /** Cap on how many times a given runtype can appear on the descent
   *  stack before mocking bails out with `undefined`. Combined with
   *  the probability decay this guarantees termination on cyclic
   *  types. **/
  maxMockRecursion: number;
}

/** Wrapper bag passed at factory or call site. Mirrors mion's
 *  `RunTypeOptions.mock` slot — keeping the wrapper lets future option
 *  groups (e.g. `validation`, `format`) slot in alongside without
 *  breaking the public signature. **/
export interface RunTypeMockOptions {
  mock?: DeepPartial<MockOptions>;
}

/** Generator returned by `createMockType<T>()`. Each invocation returns
 *  a fresh value. Per-call options merge over the factory's defaults. **/
export type MockTypeFn<T = unknown> = (options?: DeepPartial<RunTypeMockOptions>) => T;

/** Recursive Partial — every object branch becomes optional in lockstep
 *  with mion's `DeepPartial`. Arrays and primitives stay as-is. **/
export type DeepPartial<T> = T extends object ? (T extends ReadonlyArray<infer _> ? T : {[K in keyof T]?: DeepPartial<T[K]>}) : T;
