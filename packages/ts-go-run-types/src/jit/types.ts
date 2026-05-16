/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Type surface copied from mion (`@mionjs/core`) so jitUtils can live in this
// package without pulling the full `@mionjs/core` dependency tree. Only the
// symbols `jitUtils.ts` + `restoreJitFns.ts` actually reach are kept here.
// Sources (when cross-referencing changes):
//   - mion/packages/core/src/types/general.types.ts
//   - mion/packages/core/src/types/pureFunctions.types.ts

import type {JITUtils} from './jitUtils.ts';

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

export interface PersistedPureFunction extends CompiledPureFunction {
  fn: undefined;
}

// ########################################### Run types ##############################################

/** Runtime representation of a single reflected type, populated by the Go
 *  binary into the runTypes cache module. Shape mirrors the `rt(...)`
 *  factory in `caches/runTypesCache.ts`: identification fields are filled
 *  in by the factory call; ref slots (`child`, `parameters`, …) start as
 *  `undefined` and are patched post-construction by the emitter's footer
 *  assignments. Fields are typed permissively because their concrete
 *  schema lives on the Go side. */
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
  /** The id of the function (operation) to be compiled (isType, typeErrors, prepareForJson, restoreFromJson, etc) */
  readonly fnID: string;
  /** Unique id of the function */
  readonly jitFnHash: string;
  /** The names of the arguments of the function */
  readonly args: JitFnArgs;
  /** Default values for the arguments */
  readonly defaultParamValues: JitFnArgs;
  /**
   * This flag is set to true when the result of a jit compilation is a no operation (empty function).
   * if this flag is set to true, the function should not be called as it will not do anything.
   */
  readonly isNoop?: boolean;
  /** Code for the jit function. after the operation has been compiled */
  readonly code: string;
  /** The list of all jit functions that are used by this function and it's children. */
  readonly jitDependencies?: Array<string>;
  /** Pure function dependencies in format "namespace::fnHash" */
  readonly pureFnDependencies?: Array<string>;
  /** function param names if the compiled type is function params */
  paramNames?: string[];
}

export interface JitCompiledFn<Fn extends AnyFn = AnyFn> extends JitCompiledFnData {
  /** The closure function that contains the jit function, this one contains the context code */
  readonly createJitFn: (utl: JITUtils) => Fn;
  /** The Jit Generated function once the compilation is finished */
  readonly fn: Fn;
}

/** Jit Functions serialized to src code file, it contains the create jit function
 * but not the actual fn as this one can not be serialized to code.
 */
export interface PersistedJitFn extends Omit<JitCompiledFn, 'fn'> {
  /** The Jit Generated function once the compilation is finished */
  readonly fn: undefined;
}

// ############################# JIT CACHES ###################################

// jit and pure functions at runtime, contains both createJitFn and fn
export type JitFunctionsCache = Record<string, JitCompiledFn>;
/** Flat pure-function cache keyed by "<namespace>::<fnName>" — see `pureFnKey`. */
export type PureFunctionsCache = Record<string, CompiledPureFunction>;

// jit and pure functions persisted to src code, contains createJitFn but not fn
// this allow usage in environments that can not use eval or new Function()
export type PersistedJitFunctionsCache = Record<string, PersistedJitFn>;
/** Flat cache for persisted pure functions, keyed by "<namespace>::<fnName>". */
export type PersistedPureFunctionsCache = Record<string, PersistedPureFunction>;

// jit and pure functions data, does not contain createJitFn or fn
// this is used to serialize over the network, but requires using new Function() to restore functionality
export type FnsDataCache = Record<string, JitCompiledFnData>;
/** Flat cache for pure function data, keyed by "<namespace>::<fnName>". */
export type PureFnsDataCache = Record<string, PureFunctionData>;

// ########################################### Classes / helpers #########################################

export interface AnyClass<T = any> {
  new (...args: any[]): T;
}

export interface SerializableClass<T = any> {
  new (): T;
}

export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

// Web/DOM globals referenced by the `Native` union below — declared as
// opaque interfaces so this file stays compilable under the package's
// strict `types: []` config (no `dom` or `node` lib in scope). At runtime
// each `instanceof` check resolves against the platform's real global.
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

/** Typescript mapping type that stripes methods and only keep properties.
 * it takes into account, dates, objects, classes, arrays, maps and sets.
 */
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
