/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Type surface copied from `@mionjs/core` so jitUtils stays dependency-free.
// Only the symbols `jitUtils.ts` actually reaches are kept here.

import type {JITUtils} from './jitUtils.ts';
// Per-family fn signatures are imported (type-only, no runtime cycle) from
// the modules that own them so the cache-entry typedefs below stay a single
// source of truth.
import type {
  IsTypeFn,
  GetTypeErrorsFn,
  HasUnknownKeysFn,
  StripUnknownKeysFn,
  UnknownKeyErrorsFn,
  UnknownKeysToUndefinedFn,
  PrepareForJsonFn,
  RestoreFromJsonFn,
  StringifyJsonFn,
} from '../createJitFunctions.ts';
import type {ToBinaryFn, FromBinaryFn} from '../createBinary.ts';

// ########################################### Pure functions #########################################

export type PureFunction = (...args: any[]) => any;

export type PureFunctionFactory = (jitUtils: JITUtils) => PureFunction;

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
 *  on the Go side. */
export interface RunType {
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
  inlined?: unknown;
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
  decorators?: unknown;
  typeArguments?: RunType[];
  arguments?: RunType[];
  extendsArguments?: RunType[];
  implements?: RunType[];
  extends?: RunType;
  classType?: RunType;
  [extra: string]: unknown;
}

/** Flat run-type cache keyed by canonical type id. */
export type RunTypesCache = Record<string, RunType>;

// ########################################### JIT functions ##########################################

export type AnyFn = (...args: any[]) => any;

export type JitFnArgs = {
  /** The name of the value of to be */
  vλl: string;
  /** Other argument names */
  [key: string]: string;
};

export interface JitCompiledFnData {
  readonly typeName: string;
  /** The operation family (`it`, `te`, `pj`, `rj`, …). */
  readonly fnID: string;
  readonly jitFnHash: string;
  readonly args: JitFnArgs;
  readonly defaultParamValues: JitFnArgs;
  /** True for collapsed-to-identity compilations. */
  readonly isNoop?: boolean;
  readonly code: string;
  /** Sibling jit-fn hashes this entry calls into. */
  readonly jitDependencies?: Array<string>;
  /** Pure function dependencies in format `"namespace::fnHash"`. */
  readonly pureFnDependencies?: Array<string>;
  paramNames?: string[];
  /**
   * Per-family diagnostic code (e.g. 'PJ001') when this entry is an
   * alwaysThrow factory — the Go-side compiler reached an unsupported leaf
   * and ships the code. The JS side renders `[code] message` at materialise
   * time. Undefined for normal and noop entries. See docs/UNSUPPORTED-KINDS.md.
   */
  readonly alwaysThrowCode?: string;
  /**
   * `file:line:col` of the first known marker call site for this runtype.
   * Set alongside `alwaysThrowCode` so the error message suffixes
   * `(at file:line:col)`. See docs/UNSUPPORTED-KINDS.md.
   */
  readonly alwaysThrowSite?: string;
}

export interface JitCompiledFn<Fn extends AnyFn = AnyFn> extends JitCompiledFnData {
  /** Factory closure wrapping the jit function with its context-code prologue.
   *  Optional: by default the Go renderer emits `undefined` and the JS-side
   *  `materializeJitFn` rebuilds via `new Function('utl', code)` on first
   *  lookup. The `--emit-create-jit-fn` flag opts back into eager emission
   *  for runtimes that can't use `new Function`. Always set on alwaysThrow
   *  entries; always undefined on noop entries. **/
  readonly createJitFn?: (utl: JITUtils) => Fn;
  /** The materialised JIT function. */
  readonly fn: Fn;
}

// ############################# JIT CACHES ###################################

// Per-family JitCompiledFn aliases — one per cache module under `src/caches/`.
// The cache skeletons are `@ts-nocheck`'d JS and reach these via JSDoc
// `@typedef {import('../jit/types.ts').<Alias>}`. Several families share an fn
// shape but occupy distinct cache slots (`ukuw` vs `uku`; `pjs`/`pjsp` vs `pj`).

export type IsTypeJitFn = JitCompiledFn<IsTypeFn>;
export type GetTypeErrorsJitFn = JitCompiledFn<GetTypeErrorsFn>;
export type HasUnknownKeysJitFn = JitCompiledFn<HasUnknownKeysFn>;
export type StripUnknownKeysJitFn = JitCompiledFn<StripUnknownKeysFn>;
export type UnknownKeyErrorsJitFn = JitCompiledFn<UnknownKeyErrorsFn>;
export type UnknownKeysToUndefinedJitFn = JitCompiledFn<UnknownKeysToUndefinedFn>;
export type UnknownKeysToUndefinedWireJitFn = JitCompiledFn<UnknownKeysToUndefinedFn>;
export type PrepareForJsonJitFn = JitCompiledFn<PrepareForJsonFn>;
export type PrepareForJsonSafeJitFn = JitCompiledFn<PrepareForJsonFn>;
export type PrepareForJsonSafePreserveJitFn = JitCompiledFn<PrepareForJsonFn>;
export type RestoreFromJsonJitFn = JitCompiledFn<RestoreFromJsonFn>;
export type StringifyJsonJitFn = JitCompiledFn<StringifyJsonFn>;
export type ToBinaryJitFn = JitCompiledFn<ToBinaryFn>;
export type FromBinaryJitFn = JitCompiledFn<FromBinaryFn>;

export type JitFunctionsCache = Record<string, JitCompiledFn>;
/** Flat pure-function cache keyed by "<namespace>::<fnName>" — see `pureFnKey`. */
export type PureFunctionsCache = Record<string, CompiledPureFunction>;

// ########################################### Classes / helpers #########################################

export interface AnyClass<T = any> {
  new (...args: any[]): T;
}

export interface SerializableClass<T = any> {
  new (): T;
}

// Web/DOM globals referenced below — declared as opaque interfaces because
// the package's tsconfig sets `types: []`. At runtime each `instanceof`
// resolves against the platform's real global.
interface URL {
  readonly __webURL?: never;
}
interface URLSearchParams {
  readonly __webURLSearchParams?: never;
}
interface Blob {
  readonly __webBlob?: never;
}
interface File {
  readonly __webFile?: never;
}
interface FileList {
  readonly __webFileList?: never;
}
interface FormData {
  readonly __webFormData?: never;
}

// prettier-ignore
type Native = Date | RegExp | URL | URLSearchParams | Blob | File | FileList | FormData | ArrayBuffer | SharedArrayBuffer | DataView | Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array | BigInt64Array | BigUint64Array;

/** Mapping type that strips methods and keeps data properties. Handles
 *  Date, plain objects, classes, arrays, Map, Set. */
export type DataOnly<T> = T extends object
  ? T extends Native
    ? T
    : T extends (...args: any[]) => any
      ? never
      : T extends new (...args: any[]) => any
        ? never
        : T extends Array<infer U>
          ? Array<DataOnly<U>>
          : T extends Map<infer K, infer V>
            ? Map<DataOnly<K>, DataOnly<V>>
            : T extends Set<infer U>
              ? Set<DataOnly<U>>
              : {[K in keyof T as T[K] extends (...args: any[]) => any ? never : K]: DataOnly<T[K]>}
  : T;

export type DeserializeClassFn<C extends InstanceType<AnyClass>> = (deserialized: DataOnly<C>) => C;
