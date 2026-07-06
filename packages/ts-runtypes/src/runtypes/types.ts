/* ########
 * 2024 ma-jerez
 * Author: Ma-jerez
 * License: UNLICENSED - proprietary, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Local type surface for the RT utils, kept dependency-free.
// Only the symbols `rtUtils.ts` actually reaches are kept here.

import type {RTUtils} from './rtUtils.ts';
import type {FormatAnnotation} from './formatAnnotation.ts';
// Per-family fn signatures are imported (type-only, no runtime cycle) from
// the modules that own them so the cache-entry typedefs below stay a single
// source of truth.
import type {
  ValidateFn,
  GetValidationErrorsFn,
  HasUnknownKeysFn,
  StripUnknownKeysFn,
  UnknownKeyErrorsFn,
  UnknownKeysToUndefinedFn,
  PrepareForJsonFn,
  RestoreFromJsonFn,
  StringifyJsonFn,
} from '../createRTFunctions.ts';
import type {ToBinaryFn, FromBinaryFn} from '../createRTFBinary.ts';

// ########################################### Pure functions #########################################

export type PureFunction = (...args: any[]) => any;

export type PureFunctionFactory = (rtUtils: RTUtils) => PureFunction;

export interface PureFunctionData {
  /** The namespace this pure function belongs to */
  readonly namespace: string;
  /** The names of the arguments of the function */
  readonly paramNames: string[];
  /** The code of the function closure */
  readonly code: string;
  /** Unique id of the function */
  readonly fnName: string;
  /** Hash of the function body for version validation */
  readonly bodyHash: string;
  /** The list of all pure functions that are used by this function and it's children. */
  readonly pureFnDependencies?: Array<string>;
}

export interface CompiledPureFunction extends PureFunctionData {
  createPureFn: PureFunctionFactory;
  fn?: PureFunction;
}

// ########################################### Run types ##############################################

/** Runtime representation of a reflected type. Identification fields are
 *  set by the `rt(...)` factory; ref slots (`child`, `parameters`, …) start
 *  as `undefined` and are patched post-construction by the emitter's footer
 *  assignments. Fields are typed permissively — the concrete schema lives
 *  on the Go side.
 *
 *  `T` is the source TS type this node represents. It is a PHANTOM type
 *  parameter (carried on the never-set `__rtType` property, erased at
 *  runtime) so a value-first builder can return `RunType<String<P>>`
 *  and `Static<…>` can recover the original type. Defaults to `unknown`
 *  so every existing `RunType` reference (the cache, the mock walker, the
 *  self-referential ref slots) is unaffected — `RunType` ≡ `RunType<unknown>`. */
export interface RunType<T = unknown> {
  id: string;
  kind: unknown;
  subKind?: unknown;
  typeName?: unknown;
  name?: unknown;
  literal?: unknown;
  optional?: unknown;
  readonly?: unknown;
  isAbstract?: unknown;
  isStatic?: unknown;
  visibility?: unknown;
  isSafeName?: unknown;
  position?: unknown;
  isCircular?: boolean;
  /** True for the "non-data" kinds (function / method / call-signature /
   *  symbol / never / non-serialisable class) the validators & serializers
   *  ignore. The node is kept in the reflected tree so reflection stays
   *  complete; only the node itself is flagged, never its children. */
  notSupported?: boolean;
  flags?: unknown;
  description?: unknown;
  defaultVal?: unknown;
  enumVal?: unknown;
  values?: unknown;
  child?: RunType;
  index?: RunType;
  return?: RunType;
  indexType?: RunType;
  parameters?: RunType[];
  children?: RunType[];
  safeUnionChildren?: RunType[];
  unionDiscriminators?: unknown;
  typeMeta?: unknown;
  // Populated for a TypeFormat-branded primitive. Drives mock
  // generation (mockSamples) + format-formatter lookup at runtime.
  formatAnnotation?: FormatAnnotation;
  typeArguments?: RunType[];
  arguments?: RunType[];
  extendsArguments?: RunType[];
  implements?: RunType[];
  extends?: RunType;
  classType?: RunType;
  /** Phantom carrier of the source TS type `T` this node represents. Never set
   *  at runtime; exists only so `Static<RunType<T>>` recovers `T` via indexed
   *  access (no `infer`). `T` rides INSIDE a `{t: T}` wrapper so the optional `?`
   *  adds `| undefined` to the WRAPPER, not to `T`: `Static` strips that outer
   *  `undefined` and reads `.t`, preserving an intentional `null`/`undefined` `T`
   *  (a bare-`T` carrier + `NonNullable` would collapse those to `never`, dropping
   *  e.g. a `literal(null)` arm from a composed union). The explicit member wins
   *  over the index signature below. */
  readonly __rtType?: {t: T};
  [extra: string]: unknown;
}

/** Flat run-type cache keyed by canonical type id. */
export type RunTypesCache = Record<string, RunType>;

// ########################################### RT functions ##########################################

export type AnyFn = (...args: any[]) => any;

export type CompiledFnArgs = {
  /** The name of the value of to be */
  vλl: string;
  /** Other argument names */
  [key: string]: string;
};

export interface CompiledFnData {
  readonly typeName: string;
  /** The operation family (`it`, `te`, `pj`, `rj`, …). */
  readonly fnID: string;
  /** The tuple's slot-0 family tag (`pj`, `jeMU`, `jdST`, …). Unlike `fnID`
   *  (which composites HOST on — `jeMU` carries fnID `pj`), this is the exact
   *  emitting family, so consumers can tell a primitive from a composite. */
  readonly familyTag?: string;
  readonly rtFnHash: string;
  readonly args: CompiledFnArgs;
  readonly defaultParamValues: CompiledFnArgs;
  /** True for collapsed-to-identity compilations. */
  readonly isNoop?: boolean;
  /** The factory body string. Present in `code`/`both` emit modes; undefined
   *  in `functions` mode, where the live `createRTFn` ships instead and `code`
   *  is derived lazily from it (see `entryCode` in rtUtils.ts) only if read. **/
  readonly code?: string;
  /** Sibling rt-fn hashes this entry calls into. */
  readonly rtDependencies?: Array<string>;
  /** Pure function dependencies in format `"namespace::fnHash"`. */
  readonly pureFnDependencies?: Array<string>;
  paramNames?: string[];
  /**
   * Complete runtime throw message (`[code] headline (at file:line:col)`)
   * when this entry is an alwaysThrow factory — the Go-side compiler reached
   * an unsupported leaf and rendered the message at build time. The JS side
   * throws it verbatim, with no diagnostic catalog of its own. Undefined for
   * normal and noop entries. See docs/ARCHITECTURE.md (cache format v10).
   */
  readonly alwaysThrowMessage?: string;
}

export interface CompiledTypeFn<Fn extends AnyFn = AnyFn> extends CompiledFnData {
  /** Factory closure wrapping the rt function with its context-code prologue.
   *  Optional: in `code` mode (default) the Go renderer emits `undefined` and
   *  the JS-side `materializeRTFn` rebuilds via `new Function('utl', code)` on
   *  first lookup. `--emit-mode functions|both` emits the closure eagerly for
   *  runtimes that can't use `new Function`. Always set on alwaysThrow entries;
   *  always undefined on noop entries. **/
  readonly createRTFn?: (utl: RTUtils) => Fn;
  /** The materialised RT function. */
  readonly fn?: Fn;
}

/** `CompiledTypeFn` after `materializeRTFn` — `createRTFn` and `fn` are
 *  guaranteed to be set. */
export type InitializedTypeFn<Fn extends AnyFn = AnyFn> = CompiledTypeFn<Fn> &
  Required<Pick<CompiledTypeFn<Fn>, 'createRTFn' | 'fn'>>;

// ############################# RT CACHES ###################################

// Per-family RTCompiledFn aliases. Several families share an fn shape but
// occupy distinct cache slots (`ukuw` vs `uku`; `pjs` vs `pj`).

export type ValidateRTFn = CompiledTypeFn<ValidateFn>;
export type GetValidationErrorsRTFn = CompiledTypeFn<GetValidationErrorsFn>;
export type HasUnknownKeysRTFn = CompiledTypeFn<HasUnknownKeysFn>;
export type StripUnknownKeysRTFn = CompiledTypeFn<StripUnknownKeysFn>;
export type UnknownKeyErrorsRTFn = CompiledTypeFn<UnknownKeyErrorsFn>;
export type UnknownKeysToUndefinedRTFn = CompiledTypeFn<UnknownKeysToUndefinedFn>;
export type UnknownKeysToUndefinedWireRTFn = CompiledTypeFn<UnknownKeysToUndefinedFn>;
export type PrepareForJsonRTFn = CompiledTypeFn<PrepareForJsonFn>;
export type PrepareForJsonSafeRTFn = CompiledTypeFn<PrepareForJsonFn>;
export type RestoreFromJsonRTFn = CompiledTypeFn<RestoreFromJsonFn>;
export type StringifyJsonRTFn = CompiledTypeFn<StringifyJsonFn>;
export type ToBinaryRTFn = CompiledTypeFn<ToBinaryFn>;
export type FromBinaryRTFn = CompiledTypeFn<FromBinaryFn>;

export type TypesFunctionsCache = Record<string, CompiledTypeFn>;
/** Flat pure-function cache keyed by "<namespace>::<fnName>" — see `pureFnKey`. */
export type PureFunctionsCache = Record<string, CompiledPureFunction>;

// ########################################### Classes / helpers #########################################

// `AnyClass`, `SerializableClass` and `DeserializeClassFn` now live next to
// the public registry in ./classSerializerRegistry.ts (the class-serializer
// handler types).

export type Mutable<T> = {
  -readonly [K in keyof T]: T[K];
};

export type DeepRequired<T> = T extends object
  ? {
      [P in keyof T]?: DeepRequired<T[P]>;
    }
  : T;

export type DeepPartial<T> = T extends object
  ? {
      [P in keyof T]?: DeepPartial<T[P]>;
    }
  : T;
