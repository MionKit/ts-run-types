/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Type surface copied from `@mionjs/core` so rtUtils stays dependency-free.
// Only the symbols `rtUtils.ts` actually reaches are kept here.

import type {RTUtils} from './rtUtils.ts';
import type {FormatAnnotation} from './formatAnnotation.ts';
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
} from '../createRTFunctions.ts';
import type {ToBinaryFn, FromBinaryFn} from '../createBinary.ts';

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
 *  runtime) so a value-first builder can return `RunType<FormatString<P>>`
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
  readonly rtFnHash: string;
  readonly args: CompiledFnArgs;
  readonly defaultParamValues: CompiledFnArgs;
  /** True for collapsed-to-identity compilations. */
  readonly isNoop?: boolean;
  readonly code: string;
  /** Sibling rt-fn hashes this entry calls into. */
  readonly rtDependencies?: Array<string>;
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

export interface CompiledTypeFn<Fn extends AnyFn = AnyFn> extends CompiledFnData {
  /** Factory closure wrapping the rt function with its context-code prologue.
   *  Optional: by default the Go renderer emits `undefined` and the JS-side
   *  `materializeRTFn` rebuilds via `new Function('utl', code)` on first
   *  lookup. The `--emit-create-rt-fn` flag opts back into eager emission
   *  for runtimes that can't use `new Function`. Always set on alwaysThrow
   *  entries; always undefined on noop entries. **/
  readonly createRTFn?: (utl: RTUtils) => Fn;
  /** The materialised RT function. */
  readonly fn?: Fn;
}

/** `CompiledTypeFn` after `materializeRTFn` — `createRTFn` and `fn` are
 *  guaranteed to be set. */
export type InitializedTypeFn<Fn extends AnyFn = AnyFn> = CompiledTypeFn<Fn> &
  Required<Pick<CompiledTypeFn<Fn>, 'createRTFn' | 'fn'>>;

// ############################# RT CACHES ###################################

// Per-family RTCompiledFn aliases — one per cache module under `src/caches/`.
// The cache skeletons are `@ts-nocheck`'d JS and reach these via JSDoc
// `@typedef {import('../runtypes/types.ts').<Alias>}`. Several families share an fn
// shape but occupy distinct cache slots (`ukuw` vs `uku`; `pjs`/`pjsp` vs `pj`).

export type IsTypeRTFn = CompiledTypeFn<IsTypeFn>;
export type GetTypeErrorsRTFn = CompiledTypeFn<GetTypeErrorsFn>;
export type HasUnknownKeysRTFn = CompiledTypeFn<HasUnknownKeysFn>;
export type StripUnknownKeysRTFn = CompiledTypeFn<StripUnknownKeysFn>;
export type UnknownKeyErrorsRTFn = CompiledTypeFn<UnknownKeyErrorsFn>;
export type UnknownKeysToUndefinedRTFn = CompiledTypeFn<UnknownKeysToUndefinedFn>;
export type UnknownKeysToUndefinedWireRTFn = CompiledTypeFn<UnknownKeysToUndefinedFn>;
export type PrepareForJsonRTFn = CompiledTypeFn<PrepareForJsonFn>;
export type PrepareForJsonSafeRTFn = CompiledTypeFn<PrepareForJsonFn>;
export type PrepareForJsonSafePreserveRTFn = CompiledTypeFn<PrepareForJsonFn>;
export type RestoreFromJsonRTFn = CompiledTypeFn<RestoreFromJsonFn>;
export type StringifyJsonRTFn = CompiledTypeFn<StringifyJsonFn>;
export type ToBinaryRTFn = CompiledTypeFn<ToBinaryFn>;
export type FromBinaryRTFn = CompiledTypeFn<FromBinaryFn>;

export type TypesFunctionsCache = Record<string, CompiledTypeFn>;
/** Flat pure-function cache keyed by "<namespace>::<fnName>" — see `pureFnKey`. */
export type PureFunctionsCache = Record<string, CompiledPureFunction>;

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

// #region dataonly-extract — the `DataOnly` machinery below is extracted
// VERBATIM by test/types/dataonlyHarness.ts (sliced between these markers) to
// build the per-branch instantiation-budget test. Keep the region
// self-contained: it may reference only `lib` types + its own declarations.

/** Augmentation hook for native / host classes that `DataOnly` must KEEP
 *  verbatim (the RT validates them by identity / `instanceof`, never by
 *  structural projection) but that this core module cannot NAME without forcing
 *  their lib onto every consumer. The opt-in
 *  `@mionjs/ts-go-run-types/formats/temporal` subpath augments this interface
 *  with the 8 TC39 `Temporal` types; consumers who never import it pay nothing
 *  and the `DataOnlyNative` tail below stays `never`. Add one row per kept
 *  class (`{ temporalInstant: Temporal.Instant; … }`). **/
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface DataOnlyNativeExtra {}

/** Built-in classes `DataOnly` KEEPS verbatim — only the ones the AOT validator
 *  checks by IDENTITY (`instanceof`): `Date` (SubKindDate) and `RegExp` (real
 *  `instanceof RegExp` emit). `Map`/`Set` are kept separately in the keep-union
 *  below. The augmentable `DataOnlyNativeExtra` tail folds in Temporal; with
 *  nothing augmenting it the tail is `never`, so this is just `Date | RegExp`.
 *
 *  Deliberately NOT here (the old broad `Native` union grouped them wrongly):
 *   - `ArrayBuffer`/`SharedArrayBuffer`/`DataView` + every typed array are
 *     `SubKindNonSerializable` in the emitter → unsupported, so `DataOnly`
 *     STRIPS them (listed in `DataOnlyStripped`);
 *   - `URL`/`URLSearchParams`/`Blob`/`File`/`FileList`/`FormData` are plain
 *     classes the emitter validates STRUCTURALLY (`ClassRef{Name}`), so they
 *     fall through to the object branch and project to their data shape —
 *     neither kept verbatim nor stripped. **/
type DataOnlyNative = Date | RegExp | DataOnlyNativeExtra[keyof DataOnlyNativeExtra];

/** Kinds the AOT validator treats as NON-DATA and strips (docs/UNSUPPORTED-KINDS.md
 *  "the unsupported set"):
 *   - `symbol` — runtime identity, not round-trippable;
 *   - any callable / constructable value (function, method, class value);
 *   - `Promise` / thenables — `isType` validates inbound public-API *data*,
 *     which never carries promises; a thenable is not data;
 *   - the non-serialisable built-ins — `ArrayBuffer`/`SharedArrayBuffer`/
 *     `DataView` and every typed array (`Int8Array`…`BigUint64Array`). These are
 *     `SubKindNonSerializable` in the Go emitter, i.e. unsupported for EVERY
 *     family (incl. isType/getTypeErrors): the validator drops them at a
 *     property and `alwaysThrow`s at root — exactly the `never` semantics.
 *
 *  (`WeakMap`/`WeakSet` are intentionally absent: a real `Map`/`Set` is
 *  structurally assignable to them, so listing them would wrongly strip
 *  `Map`/`Set`. They fall through to the object branch and project to `{}`,
 *  exactly as before.)
 *
 *  At a PROPERTY slot these drop silently; at a PROPAGATING slot (root, array
 *  element, tuple slot, union member) they collapse the projection to `never`.
 *  `DataOnly` maps each to `never`, so the single rule "a value that projects to
 *  `never` is dropped" subsumes symbol-keyed and method members alike. The
 *  `never[]` parameter positions disable variance so EVERY function and
 *  constructor shape is matched. **/
type DataOnlyStripped =
  | symbol
  | ((...args: never[]) => unknown)
  | (abstract new (...args: never[]) => unknown)
  // Thenables, detected STRUCTURALLY (a `.then` method) rather than as
  // `Promise<any>` — the latter's `T`-in-`then` contravariance means
  // `Promise<string> extends Promise<any>` does not hold, so it would miss.
  // The `never[]` params keep the check variance-free, matching every Promise.
  | {then: (...args: never[]) => unknown}
  // Non-serialisable built-ins (SubKindNonSerializable → unsupported). The
  // binary buffers, plus `ArrayBufferView` — the one lib type every typed array
  // AND `DataView` extend (`{ buffer; byteLength; byteOffset }`) — so all 12
  // collapse to a single cheap check instead of a 12-arm union.
  | ArrayBuffer
  | SharedArrayBuffer
  | ArrayBufferView;

/** Recursion-budget decrement for `DataOnly`: `_DataOnlyDepth[N]` is `N - 1`
 *  (and `_DataOnlyDepth[0]` is `never`, never reached — the `Depth extends 0`
 *  guard stops first). Bounding the recursion is what lets circular / mutually
 *  recursive types resolve to a finite instantiation instead of tripping the
 *  TS2589 depth cap. **/
type _DataOnlyDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];

/** The data-only projection of `T` — the exact shape `createIsType<T>()` /
 *  `createGetTypeErrors<T>()` validate. It walks `T` and DROPS every member the
 *  AOT emitter treats as non-data (see CLAUDE.md "isType contract — serializable
 *  data only" + docs/UNSUPPORTED-KINDS.md):
 *   - `DataOnlyStripped` kinds (symbol / function / constructor / promise /
 *     non-serialisable built-ins / `never`) → `never`;
 *   - primitives, `Date`/`RegExp` (+ augmented Temporal), and `Map`/`Set` →
 *     kept verbatim (the validator checks these by identity);
 *   - `any` / `unknown` (and broad `object`) → kept (the emitter best-effort
 *     accepts the broad kinds — the validator emits `true`);
 *   - arrays + tuples → recurse per element/slot, preserving array-ness, slot
 *     order, and `readonly`/`?` modifiers;
 *   - objects → recurse per property, dropping symbol-keyed and `never`-valued
 *     (⊇ method) properties.
 *
 *  Implementation: NO `infer` — every arm is a bare `extends` test or a
 *  homomorphic `{[K in keyof T]: …}` map (which preserves array/tuple structure
 *  and `readonly`/`?` modifiers for free). `Map`/`Set` are kept verbatim rather
 *  than recursed: they are validation-supported and their type args don't change
 *  the validator's structural id in practice.
 *
 *  Recursion is BOUNDED by the `Depth` budget (`_DataOnlyDepth` decrement): a
 *  self- or mutually-referential type resolves to a finite instantiation rather
 *  than tripping TS's instantiation-depth cap (TS2589). Beyond the budget the
 *  remaining sub-tree is kept as-is. 8 levels covers any realistic data shape.
 *
 *  Root-level non-data kinds (a bare function type, a `symbol`, a `Promise`)
 *  collapse to `never` here, which the emitter renders as an always-throw
 *  factory — those cases are intentionally `DataOnly`-divergent. **/
export type DataOnly<T, Depth extends number = 8> = Depth extends 0
  ? T // budget exhausted — keep the remaining sub-tree as-is (best effort)
  : unknown extends T
    ? T // any / unknown — keep the broad kinds
    : T extends DataOnlyStripped
      ? never // symbol / fn / ctor / thenable — strip
      : T extends
            | string
            | number
            | boolean
            | bigint
            | null
            | undefined
            | DataOnlyNative
            | ReadonlyMap<any, any>
            | ReadonlySet<any>
        ? T // primitive / native (+ Temporal) / Map / Set (incl. readonly) — keep verbatim
        : T extends readonly unknown[]
          ? {-readonly [K in keyof T]: DataOnly<T[K], _DataOnlyDepth[Depth]>} // array + tuple
          : T extends object
            ? object extends T
              ? T // broad `object` / `{}` — keep (the emitter accepts the broad kind)
              : {
                  // plain object — drop symbol keys + never-valued (⊇ method) props
                  [K in keyof T as K extends symbol
                    ? never
                    : [DataOnly<T[K], _DataOnlyDepth[Depth]>] extends [never]
                      ? never
                      : K]: DataOnly<T[K], _DataOnlyDepth[Depth]>;
                }
            : T;
// #endregion dataonly-extract

export type DeserializeClassFn<C extends InstanceType<AnyClass>> = (deserialized: DataOnly<C>) => C;

// ########################################### Classes / helpers #########################################

export interface AnyClass<T = any> {
  new (...args: any[]): T;
}

export interface SerializableClass<T = any> {
  new (): T;
}

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
