// Public types for the mock-value generator. Surface mirrors mion's
// `MockOptions`. `createMockType<T>()` merges caller options over
// `defaultMockOptions` before walking the runtype graph.

/** Per-call options steering atomic-value generation and optional/recursive
 *  shape handling. Ported field-for-field from mion. **/
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

/** Wrapper bag passed at factory or call site. Reserved for future option
 *  groups (e.g. `validation`, `format`) without breaking the signature. **/
export interface RunTypeMockOptions {
  mock?: DeepPartial<MockOptions>;
}

/** Generator returned by `createMockType<T>()`. **/
export type MockTypeFn<T = unknown> = (options?: DeepPartial<RunTypeMockOptions>) => T;

/** Recursive Partial — every object branch becomes optional. **/
export type DeepPartial<T> = T extends object ? (T extends ReadonlyArray<unknown> ? T : {[K in keyof T]?: DeepPartial<T[K]>}) : T;
