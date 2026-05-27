// Home for every JIT-backed factory exported by this package. Each
// `createXxx<T>()` is a thin wrapper over the private `createJitFunction`
// generic; only the cache-key prefix, identity fallback, and return type
// vary per family. The jitUtils singleton is the only cache.

import {initCache as initIsTypeCache} from './caches/isTypeCache.ts';
import {initCache as initGetTypeErrorsCache} from './caches/getTypeErrorsCache.ts';
import {initCache as initHasUnknownKeysCache} from './caches/hasUnknownKeysCache.ts';
import {initCache as initStripUnknownKeysCache} from './caches/stripUnknownKeysCache.ts';
import {initCache as initUnknownKeyErrorsCache} from './caches/unknownKeyErrorsCache.ts';
import {initCache as initUnknownKeysToUndefinedCache} from './caches/unknownKeysToUndefinedCache.ts';
import {initCache as initUnknownKeysToUndefinedWireCache} from './caches/unknownKeysToUndefinedWireCache.ts';
import {initCache as initPrepareForJsonCache} from './caches/prepareForJsonCache.ts';
import {initCache as initRestoreFromJsonCache} from './caches/restoreFromJsonCache.ts';
import {initCache as initStringifyJsonCache} from './caches/stringifyJsonCache.ts';
import {initCache as initPrepareForJsonSafeCache} from './caches/prepareForJsonSafeCache.ts';
import {initCache as initPrepareForJsonSafePreserveCache} from './caches/prepareForJsonSafePreserveCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import {lookupJitFn} from './jit/jitUtils.ts';
import type {AnyFn, JitCompiledFn} from './jit/types.ts';
import type {CompTimeArgs, InjectRuntypeId} from './index.ts';

// =============================================================================
// Type definitions
// =============================================================================

/** Subset of mion's RunTypeOptions that affects atomic-type isType validation.
 *  Pass an OBJECT LITERAL at the call site — the Go-side marker scanner reads
 *  the values at build time and bakes them into the validator's hash. **/
export interface RunTypeOptions {
  /** Literal validators degrade to their base-type check
   *  (`literal 'a'` → any string, `literal 2` → any finite number). **/
  noLiterals?: boolean;
  /** Skip the leading `Array.isArray(v)` guard on array validators. Folded
   *  into the validator hash so `string[]` and `string[] + {noIsArrayCheck:true}`
   *  resolve to distinct entries. **/
  noIsArrayCheck?: boolean;
  /** Reserved — not yet plumbed. **/
  strictTypes?: boolean;
}

/** Validator function returned by `createIsType<T>()`. **/
export type IsTypeFn = (value: unknown) => boolean;

/** Mirror of mion's RunTypeError shape. Map / Set emitters add
 *  `{key, index, failed: 'mapKey' | 'mapValue'}` path segments. **/
export type RunTypeErrorPathSegment = string | number | object;
export interface RunTypeError {
  path: RunTypeErrorPathSegment[];
  expected: string;
}

/** Validator returned by `createGetTypeErrors<T>()`. Caller-optional `path`
 *  and `errors` slots so the validator can be chained or pre-seeded. **/
export type GetTypeErrorsFn = (value: unknown, path?: RunTypeErrorPathSegment[], errors?: RunTypeError[]) => RunTypeError[];

/** Options bag for HasUnknownKeysFn. When `checkNonJitProps` is true the
 *  known-keys list expands to include children the JIT skipped. **/
export interface HasUnknownKeysOptions {
  checkNonJitProps?: boolean;
}

/** Predicate returned by `createHasUnknownKeys<T>()`. **/
export type HasUnknownKeysFn = (value: unknown, options?: HasUnknownKeysOptions) => boolean;

/** Mutator returned by `createStripUnknownKeys<T>()`. Deletes properties
 *  not declared in the schema and returns the same value reference. **/
export type StripUnknownKeysFn = (value: unknown) => unknown;

/** Validator returned by `createUnknownKeyErrors<T>()`. Each unknown key
 *  produces one `{path, expected: 'never'}` entry. **/
export type UnknownKeyErrorsFn = (value: unknown, path?: RunTypeErrorPathSegment[], errors?: RunTypeError[]) => RunTypeError[];

/** Mutator returned by `createUnknownKeysToUndefined<T>()`. Sets every
 *  unknown property to `undefined` instead of removing it. **/
export type UnknownKeysToUndefinedFn = (value: unknown) => unknown;

// Internal JIT-primitive signatures consumed by the JSON encoder/decoder.
export type PrepareForJsonFn = (value: unknown) => unknown;
export type RestoreFromJsonFn = (value: unknown) => unknown;
export type StringifyJsonFn = (value: unknown) => string | undefined;

/** Stringifier returned by `createJsonEncoder<T>()`. Returns the JSON string,
 *  OR `undefined` for top-level `undefined` inputs (matches `JSON.stringify`). **/
export type JsonEncoderFn = (value: unknown) => string | undefined;

/** Parse function returned by `createJsonDecoder<T>()`. **/
export type JsonDecoderFn<T = unknown> = (serialized: string) => T;

/** Caller-controlled options for `createJsonEncoder<T>()`. Two orthogonal axes:
 *
 *  - `strategy`:
 *    - `'clone'` (default): walk the type, build a new value, hand to native
 *      `JSON.stringify`. Non-mutating, allocates per nested object literal.
 *    - `'mutate'`: walk `v`, transform leaves in place, hand to native
 *      `JSON.stringify`. Mutates the input, no clone allocation.
 *    - `'direct'`: single-pass `stringifyJson` JIT. Never mutates, no clone
 *      allocation, slower on non-trivial shapes. Always strips extras.
 *
 *  - `stripExtras` (default `true`): whether undeclared keys are removed.
 *    Pinned to `true` for `strategy: 'direct'`.
 */
export type JsonEncoderOptions = {strategy?: 'clone' | 'mutate'; stripExtras?: boolean} | {strategy: 'direct'};

/** Caller-controlled options for `createJsonDecoder<T>()`. The decoder
 *  always allocates fresh via `JSON.parse`, so only the strip knob applies.
 *  When `stripExtras` is true (default), undeclared properties on the parsed
 *  wire value become `undefined` before restore walks the declared shape. **/
export interface JsonDecoderOptions {
  stripExtras?: boolean;
}

// =============================================================================
// Cache bootstrap
// =============================================================================
// initCache is idempotent (addToJitCache overwrites by jitFnHash), so HMR can
// safely re-run any of these. Each call only registers entries; fn closures
// are built lazily by materializeJitFn on first getJIT() lookup.

const _utils = getJitUtils();
initIsTypeCache(_utils);
initGetTypeErrorsCache(_utils);
initHasUnknownKeysCache(_utils);
initStripUnknownKeysCache(_utils);
initUnknownKeyErrorsCache(_utils);
initUnknownKeysToUndefinedCache(_utils);
initUnknownKeysToUndefinedWireCache(_utils);
initPrepareForJsonCache(_utils);
initRestoreFromJsonCache(_utils);
initStringifyJsonCache(_utils);
initPrepareForJsonSafeCache(_utils);
initPrepareForJsonSafePreserveCache(_utils);
// Binary cache init lives in `./createBinary.ts` so binary cache modules
// don't get pulled into bundles that never reference the binary encoder/decoder.

// =============================================================================
// Private generic factories
// =============================================================================

/** Returns the per-id closure for a family. Falls back to `identityFn` when
 *  the runtype is registered but its Go-side factory collapsed to a noop. **/
function createJitFunction<F extends AnyFn>(
  fnName: string,
  prefix: string,
  identityFn: F
): (val?: unknown, options?: unknown, id?: string) => F {
  return (val, options, id) => {
    void val;
    void options;
    if (id === undefined) {
      throw new Error(
        `${fnName}(): no id injected. vite-plugin-runtypes must be active for ${fnName} to dispatch to a precompiled factory.`
      );
    }
    const utils = getJitUtils();
    const entry = utils.getJIT(prefix + '_' + id) as JitCompiledFn | undefined;
    if (entry) return entry.fn as F;
    if (utils.hasRunType(id)) return identityFn;
    throw new Error(
      `${fnName}(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a factory for that runtype.`
    );
  };
}

// =============================================================================
// Standard family wrappers.
//
// The trailing `as unknown as <T>(...) => Fn` cast restores the generic <T>
// signature the Go-side marker scanner reads to identify call sites. <T>
// only exists at the type-checker layer and is erased before execution.
// =============================================================================

const identityValueFn = (v: unknown) => v;
const getTypeErrorsIdentity: GetTypeErrorsFn = () => [];
const unknownKeyErrorsIdentity: UnknownKeyErrorsFn = () => [];

export const createIsType = createJitFunction<IsTypeFn>('createIsType', 'it', () => true) as unknown as <T>(
  val?: T,
  options?: CompTimeArgs<RunTypeOptions>,
  id?: InjectRuntypeId<T>
) => IsTypeFn;

export const createGetTypeErrors = createJitFunction<GetTypeErrorsFn>(
  'createGetTypeErrors',
  'te',
  getTypeErrorsIdentity
) as unknown as <T>(val?: T, options?: CompTimeArgs<RunTypeOptions>, id?: InjectRuntypeId<T>) => GetTypeErrorsFn;

export const createHasUnknownKeys = createJitFunction<HasUnknownKeysFn>(
  'createHasUnknownKeys',
  'huk',
  () => false
) as unknown as <T>(val?: T, options?: CompTimeArgs<RunTypeOptions>, id?: InjectRuntypeId<T>) => HasUnknownKeysFn;

export const createStripUnknownKeys = createJitFunction<StripUnknownKeysFn>(
  'createStripUnknownKeys',
  'suk',
  identityValueFn
) as unknown as <T>(val?: T, options?: CompTimeArgs<RunTypeOptions>, id?: InjectRuntypeId<T>) => StripUnknownKeysFn;

export const createUnknownKeyErrors = createJitFunction<UnknownKeyErrorsFn>(
  'createUnknownKeyErrors',
  'uke',
  unknownKeyErrorsIdentity
) as unknown as <T>(val?: T, options?: CompTimeArgs<RunTypeOptions>, id?: InjectRuntypeId<T>) => UnknownKeyErrorsFn;

export const createUnknownKeysToUndefined = createJitFunction<UnknownKeysToUndefinedFn>(
  'createUnknownKeysToUndefined',
  'uku',
  identityValueFn
) as unknown as <T>(val?: T, options?: CompTimeArgs<RunTypeOptions>, id?: InjectRuntypeId<T>) => UnknownKeysToUndefinedFn;

// =============================================================================
// JSON encode / decode — the only two public JSON entry functions.
//
// Each composes one or two underlying JIT primitives based on runtime options.
// Option fields (strategy / stripExtras) are NOT folded into the typeid, so
// every encoder shape against the same `T` shares one type id; the runtime
// picks the right family (`sj` / `pj` / `pjs` / `pjsp` + optional `uku`
// compose) based on the caller's options.
// =============================================================================

const jsonStringifyFallback: JsonEncoderFn = (v) => JSON.stringify(v);

/** Returns a JSON encoder for `T`. Defaults: `strategy: 'clone',
 *  stripExtras: true`. See `JsonEncoderOptions` for the full matrix. **/
export function createJsonEncoder<T>(
  val?: T,
  options?: CompTimeArgs<JsonEncoderOptions>,
  id?: InjectRuntypeId<T>
): JsonEncoderFn {
  void val;
  if (id === undefined) {
    throw new Error(
      'createJsonEncoder(): no id injected. vite-plugin-runtypes must be active for createJsonEncoder to dispatch to a precompiled factory.'
    );
  }
  const strategy = options?.strategy ?? 'clone';
  // `direct` is type-pinned to stripExtras: true (the JIT walks the type and
  // can't see undeclared keys).
  const stripExtras = strategy === 'direct' ? true : ((options as {stripExtras?: boolean})?.stripExtras ?? true);

  if (strategy === 'direct') {
    return lookupJitFn<JsonEncoderFn>('createJsonEncoder', 'sj', id, jsonStringifyFallback);
  }

  if (strategy === 'clone') {
    if (stripExtras) {
      const prepareSafeFn = lookupJitFn<PrepareForJsonFn>('createJsonEncoder', 'pjs', id, identityValueFn);
      return (value) => JSON.stringify(prepareSafeFn(value));
    }
    // pjsp = same clone codegen as pjs but with `...v` spread so undeclared
    // keys survive.
    const prepareSafePreserveFn = lookupJitFn<PrepareForJsonFn>('createJsonEncoder', 'pjsp', id, identityValueFn);
    return (value) => JSON.stringify(prepareSafePreserveFn(value));
  }

  // strategy === 'mutate'
  const prepareFn = lookupJitFn<PrepareForJsonFn>('createJsonEncoder', 'pj', id, identityValueFn);
  if (!stripExtras) {
    return (value) => JSON.stringify(prepareFn(value));
  }
  // mutate + strip: uku sets undeclared keys to undefined, pj transforms
  // declared leaves, then JSON.stringify skips undefined-valued keys naturally.
  const ukuFn = lookupJitFn<UnknownKeysToUndefinedFn>('createJsonEncoder', 'uku', id, identityValueFn);
  return (value) => {
    ukuFn(value);
    return JSON.stringify(prepareFn(value));
  };
}

/** Returns a JSON decoder for `T`. Default `stripExtras: true` — undeclared
 *  properties become `undefined` before restore walks the declared shape. **/
export function createJsonDecoder<T>(
  val?: T,
  options?: CompTimeArgs<JsonDecoderOptions>,
  id?: InjectRuntypeId<T>
): JsonDecoderFn<T> {
  void val;
  if (id === undefined) {
    throw new Error(
      'createJsonDecoder(): no id injected. vite-plugin-runtypes must be active for createJsonDecoder to dispatch to a precompiled factory.'
    );
  }
  const stripExtras = options?.stripExtras ?? true;
  const restoreFn = lookupJitFn<RestoreFromJsonFn>('createJsonDecoder', 'rj', id, identityValueFn);
  if (!stripExtras) {
    return (serialized) => restoreFn(JSON.parse(serialized)) as T;
  }
  // ukuWire (not public uku): union-arm emit reaches into the flat-union wire
  // wrapper `[-1, mergedObject]` instead of corrupting its `0`/`1` indices.
  const ukuFn = lookupJitFn<UnknownKeysToUndefinedFn>('createJsonDecoder', 'ukuw', id, identityValueFn);
  return (serialized) => restoreFn(ukuFn(JSON.parse(serialized))) as T;
}

// =============================================================================
// HMR — refresh the JIT registry whenever any cache module re-evaluates.
// Tree-shaken at bundle time. Binary HMR lives in `./createBinary.ts`.
// =============================================================================

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/isTypeCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/getTypeErrorsCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/hasUnknownKeysCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/stripUnknownKeysCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/unknownKeyErrorsCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/unknownKeysToUndefinedCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/unknownKeysToUndefinedWireCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/prepareForJsonCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/restoreFromJsonCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/stringifyJsonCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/prepareForJsonSafeCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/prepareForJsonSafePreserveCache.ts', (m) => m?.initCache?.(getJitUtils()));
}
