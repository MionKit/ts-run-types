// Single home for every JIT-backed factory exported by this package.
//
// Each createXxx<T>() is a thin wrapper over the private `createJitFunction`
// generic. The only thing that varies per family is the cache-key prefix
// (`it`, `te`, `pj`, …), the identity fallback used when a runtype is
// registered but its factory collapsed to a noop, and the return type
// alias.
//
// No local Maps live here. The jitUtils singleton is the only cache —
// `getJIT(hash)` returns the entry, `materializeJitFn` populates
// `entry.fn` once, and every subsequent lookup reads the same slot.
//
// JSON I/O lives behind exactly two public entry functions:
// `createJsonEncoder` and `createJsonDecoder`. Each takes an `options`
// object whose `mode` field picks between two compiled variants. The
// underlying JIT primitives (prepareForJson / restoreFromJson /
// stringifyJson / unknownKeysToUndefined) are emitted by the Go side
// and looked up internally; consumers never call them directly.
//
// The deserialize-from-code test twins live under
// `test/util/deserializeJitFunctions.ts` — production callers never need
// them (`addSerializedJitCaches` already writes the rebuilt fn onto
// `entry.fn` on jitUtils), so they don't belong in the package's public
// surface.

import {initCache as initIsTypeCache} from './caches/isTypeCache.ts';
import {initCache as initGetTypeErrorsCache} from './caches/getTypeErrorsCache.ts';
import {initCache as initHasUnknownKeysCache} from './caches/hasUnknownKeysCache.ts';
import {initCache as initStripUnknownKeysCache} from './caches/stripUnknownKeysCache.ts';
import {initCache as initUnknownKeyErrorsCache} from './caches/unknownKeyErrorsCache.ts';
import {initCache as initUnknownKeysToUndefinedCache} from './caches/unknownKeysToUndefinedCache.ts';
import {initCache as initPrepareForJsonCache} from './caches/prepareForJsonCache.ts';
import {initCache as initRestoreFromJsonCache} from './caches/restoreFromJsonCache.ts';
import {initCache as initStringifyJsonCache} from './caches/stringifyJsonCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import type {AnyFn, JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';

// =============================================================================
// Type definitions
// =============================================================================

/** Subset of mion's RunTypeOptions
 *  (mion-run-types:packages/run-types/src/types.ts:110-127) that
 *  affects atomic-type isType validation. Currently only `noLiterals`
 *  is plumbed end-to-end; the other fields are typed for forward
 *  compatibility with mion's full surface.
 *
 *  Pass an OBJECT LITERAL at the call site — the Go-side marker
 *  scanner extracts the option values at build time from the literal
 *  AST node and bakes them into the validator's hash. Identifier or
 *  spread expressions are ignored; if you need dynamic options the
 *  v2 plan is to surface a separate factory API. **/
export interface RunTypeOptions {
  /** When true, compiled literal validators degrade to their base-type
   *  check — `literal 'a'` accepts any string, `literal 2` accepts any
   *  finite number, etc. Mirrors mion's literal.ts:56-59 behavior. **/
  noLiterals?: boolean;
  /** When true and the type is an array, the compiled validator skips
   *  the leading `Array.isArray(v)` guard and iterates `v` directly —
   *  trades safety for speed when the caller has already verified the
   *  input is array-like. Mirrors mion's array.ts:emitIsType behavior
   *  under `comp.opts.noIsArrayCheck`. Folded into the validator's hash
   *  at build time so `string[]` and `string[] + {noIsArrayCheck:true}`
   *  resolve to distinct validators. **/
  noIsArrayCheck?: boolean;
  /** Reserved — see mion's RunTypeOptions. Not yet plumbed. **/
  strictTypes?: boolean;
}

/** Validator function returned by `createIsType<T>()`. **/
export type IsTypeFn = (value: unknown) => boolean;

/** Mirror of mion's RunTypeError shape. Path segments are
 *  `string | number` for normal accessors; Map / Set emitters add
 *  `{key, index, failed: 'mapKey' | 'mapValue'}` segments. **/
export type RunTypeErrorPathSegment = string | number | object;
export interface RunTypeError {
  path: RunTypeErrorPathSegment[];
  expected: string;
}

/** Validator function returned by `createGetTypeErrors<T>()`. Caller-
 *  optional `path` and `errors` slots so the validator can be chained
 *  or pre-seeded. **/
export type GetTypeErrorsFn = (value: unknown, path?: RunTypeErrorPathSegment[], errors?: RunTypeError[]) => RunTypeError[];

/** Options bag passed to a HasUnknownKeysFn at runtime. Mirrors mion's
 *  `runTimeOptions.checkNonJitProps` — when true, the known-keys list
 *  is expanded to include children the JIT skipped (static / function-
 *  typed properties). Defaults to false. **/
export interface HasUnknownKeysOptions {
  checkNonJitProps?: boolean;
}

/** Predicate returned by `createHasUnknownKeys<T>()`. **/
export type HasUnknownKeysFn = (value: unknown, options?: HasUnknownKeysOptions) => boolean;

/** Mutator returned by `createStripUnknownKeys<T>()`. Mutates the value
 *  by deleting any property not declared in the schema for `T`, then
 *  returns the same value reference. **/
export type StripUnknownKeysFn = (value: unknown) => unknown;

/** Validator returned by `createUnknownKeyErrors<T>()`. Same arg shape
 *  as createGetTypeErrors. Each unknown key produces one
 *  `{path, expected: 'never'}` entry. **/
export type UnknownKeyErrorsFn = (value: unknown, path?: RunTypeErrorPathSegment[], errors?: RunTypeError[]) => RunTypeError[];

/** Mutator returned by `createUnknownKeysToUndefined<T>()`. Sets every
 *  unknown property to `undefined` (instead of removing it). **/
export type UnknownKeysToUndefinedFn = (value: unknown) => unknown;

// Internal type aliases describing the underlying JIT-primitive
// signatures. These are referenced by createJsonEncoder /
// createJsonDecoder when composing closures, and by the test util's
// deserialize twins; they are NOT re-exported from `index.ts`.
export type PrepareForJsonFn = (value: unknown) => unknown;
export type RestoreFromJsonFn = (value: unknown) => unknown;
export type StringifyJsonFn = (value: unknown) => string | undefined;

/** Stringifier returned by `createJsonEncoder<T>()`. Returns the JSON
 *  string for `value`, OR `undefined` for top-level `undefined` inputs
 *  (matches `JSON.stringify` and the underlying `stringifyJson`
 *  primitive). Callers should handle the `undefined` return when the
 *  input type admits `undefined`. **/
export type JsonEncoderFn = (value: unknown) => string | undefined;

/** Parse function returned by `createJsonDecoder<T>()`. **/
export type JsonDecoderFn<T = unknown> = (serialized: string) => T;

/** Caller-controlled options for `createJsonEncoder<T>()`. The Go-side
 *  marker scanner reads `mode` at build time from the literal options
 *  object and folds it into the injected runtype id, so two calls with
 *  different modes resolve to distinct JIT cache entries. **/
export interface JsonEncoderOptions {
  /** `'safe'` (default) routes through the single-pass `stringifyJson`
   *  JIT: walks the type, not the value — never mutates `v` and strips
   *  every undeclared property at emit time. `'unsafe'` composes
   *  `prepareForJson + JSON.stringify`: mutates `v` in place, preserves
   *  undeclared properties (and may throw on bigint extras at
   *  `JSON.stringify`). **/
  mode?: 'safe' | 'unsafe';
}

/** Caller-controlled options for `createJsonDecoder<T>()`. **/
export interface JsonDecoderOptions {
  /** `'safe'` (default) composes `JSON.parse + unknownKeysToUndefined +
   *  restoreFromJson`: undeclared properties become `undefined` on the
   *  restored value. `'unsafe'` composes `JSON.parse + restoreFromJson`:
   *  undeclared properties pass through untouched. **/
  mode?: 'safe' | 'unsafe';
}

// =============================================================================
// Cache bootstrap — register every JIT family on the jitUtils singleton.
// initCache is idempotent (addToJitCache overwrites by jitFnHash), so HMR
// can safely re-run any of these on cache-module re-eval. Each call only
// registers entries; the actual fn closures are built lazily by
// materializeJitFn on first getJIT() lookup, which keeps cross-family
// dependencies happy regardless of registration order.
// =============================================================================

const _utils = getJitUtils();
initIsTypeCache(_utils);
initGetTypeErrorsCache(_utils);
initHasUnknownKeysCache(_utils);
initStripUnknownKeysCache(_utils);
initUnknownKeyErrorsCache(_utils);
initUnknownKeysToUndefinedCache(_utils);
initPrepareForJsonCache(_utils);
initRestoreFromJsonCache(_utils);
initStringifyJsonCache(_utils);

// =============================================================================
// Private generic factories
// =============================================================================

/** Production-path generic. Returns the per-id closure for the given
 *  family by looking up `<prefix>_<id>` on the jitUtils singleton.
 *  Falls back to `identityFn` when the runtype is registered but the
 *  Go-side emit collapsed the factory to a noop. Throws otherwise. **/
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

/** Shared lookup helper for composite wrappers. Same fallback semantics
 *  as `createJitFunction` but returns the fn directly so callers can
 *  compose it with sibling lookups. **/
function lookupJitFn<F extends AnyFn>(callerName: string, prefix: string, id: string, identityFn: F): F {
  const utils = getJitUtils();
  const entry = utils.getJIT(prefix + '_' + id) as JitCompiledFn | undefined;
  if (entry) return entry.fn as F;
  if (utils.hasRunType(id)) return identityFn;
  throw new Error(
    `${callerName}(): no JitCompiledFn entry for "${prefix}_${id}" in jitUtils. The build pipeline didn't emit a factory for that runtype.`
  );
}

// =============================================================================
// Standard family wrappers.
//
// The trailing `as unknown as <T>(...) => Fn` cast restores the generic <T>
// signature the Go-side marker scanner reads to identify call sites. The
// runtime function is a non-generic JS closure; <T> only ever exists at the
// type-checker layer and is erased before execution.
// =============================================================================

const identityValueFn = (v: unknown) => v;
const getTypeErrorsIdentity: GetTypeErrorsFn = () => [];
const unknownKeyErrorsIdentity: UnknownKeyErrorsFn = () => [];
const stringifyJsonIdentity: StringifyJsonFn = (v) => JSON.stringify(v);

export const createIsType = createJitFunction<IsTypeFn>('createIsType', 'it', () => true) as unknown as <T>(
  val?: T,
  options?: RunTypeOptions,
  id?: RuntypeId<T>
) => IsTypeFn;

export const createGetTypeErrors = createJitFunction<GetTypeErrorsFn>(
  'createGetTypeErrors',
  'te',
  getTypeErrorsIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => GetTypeErrorsFn;

export const createHasUnknownKeys = createJitFunction<HasUnknownKeysFn>('createHasUnknownKeys', 'huk', () => false) as unknown as <T>(
  val?: T,
  options?: RunTypeOptions,
  id?: RuntypeId<T>
) => HasUnknownKeysFn;

export const createStripUnknownKeys = createJitFunction<StripUnknownKeysFn>(
  'createStripUnknownKeys',
  'suk',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => StripUnknownKeysFn;

export const createUnknownKeyErrors = createJitFunction<UnknownKeyErrorsFn>(
  'createUnknownKeyErrors',
  'uke',
  unknownKeyErrorsIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => UnknownKeyErrorsFn;

export const createUnknownKeysToUndefined = createJitFunction<UnknownKeysToUndefinedFn>(
  'createUnknownKeysToUndefined',
  'uku',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => UnknownKeysToUndefinedFn;

// =============================================================================
// JSON encode / decode — the only two public JSON entry functions.
//
// Each composes one or two underlying JIT primitives based on the
// runtime `options.mode`. The Go-side marker scanner reads the literal
// `mode` value at build time and folds it into the injected runtype id,
// so two calls with different modes resolve to distinct ids (and the
// composed closures don't collide on the call-site cache).
//
// No closure cache here — composition is one allocation per call. The
// underlying JIT primitives (`sj`, `pj`, `rj`, `uku`) ARE cached on the
// jitUtils singleton, so the heavy code runs once per type.
// =============================================================================

const jsonStringifyFallback: JsonEncoderFn = (v) => JSON.stringify(v);

/** Returns a JSON encoder for `T`. Default mode is `'safe'` (single-pass
 *  stringifyJson, no mutation, undeclared keys stripped at emit). The
 *  `'unsafe'` mode composes `prepareForJson + JSON.stringify` — faster
 *  but mutates `v` and lets undeclared keys leak through (may throw on
 *  bigint extras). **/
export function createJsonEncoder<T>(val?: T, options?: JsonEncoderOptions, id?: RuntypeId<T>): JsonEncoderFn {
  void val;
  if (id === undefined) {
    throw new Error(
      'createJsonEncoder(): no id injected. vite-plugin-runtypes must be active for createJsonEncoder to dispatch to a precompiled factory.'
    );
  }
  const mode = options?.mode ?? 'safe';
  if (mode === 'unsafe') {
    const prepareFn = lookupJitFn<PrepareForJsonFn>('createJsonEncoder', 'pj', id, identityValueFn);
    return (value) => JSON.stringify(prepareFn(value));
  }
  // 'safe' default — single-pass stringifyJson. Returns `string |
  // undefined`; callers handle the undefined for top-level-undefined
  // inputs the same way they would for `JSON.stringify`.
  return lookupJitFn<JsonEncoderFn>('createJsonEncoder', 'sj', id, jsonStringifyFallback);
}

/** Returns a JSON decoder for `T`. Default mode is `'safe'` (composes
 *  `JSON.parse + unknownKeysToUndefined + restoreFromJson`, so any
 *  undeclared property on the parsed value becomes `undefined`). The
 *  `'unsafe'` mode skips the unknown-keys pass — undeclared properties
 *  pass through to the restored value untouched. **/
export function createJsonDecoder<T>(val?: T, options?: JsonDecoderOptions, id?: RuntypeId<T>): JsonDecoderFn<T> {
  void val;
  if (id === undefined) {
    throw new Error(
      'createJsonDecoder(): no id injected. vite-plugin-runtypes must be active for createJsonDecoder to dispatch to a precompiled factory.'
    );
  }
  const mode = options?.mode ?? 'safe';
  const restoreFn = lookupJitFn<RestoreFromJsonFn>('createJsonDecoder', 'rj', id, identityValueFn);
  if (mode === 'unsafe') {
    return (serialized) => restoreFn(JSON.parse(serialized)) as T;
  }
  // 'safe' default — overwrite undeclared keys with undefined before
  // restoreFromJson walks the declared shape.
  const ukuFn = lookupJitFn<UnknownKeysToUndefinedFn>('createJsonDecoder', 'uku', id, identityValueFn);
  return (serialized) => restoreFn(ukuFn(JSON.parse(serialized))) as T;
}

// =============================================================================
// HMR — refresh the JIT registry whenever any cache module re-evaluates.
// Production builds tree-shake the entire `if (hot)` block at bundle time.
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
  hot.accept('./caches/prepareForJsonCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/restoreFromJsonCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/stringifyJsonCache.ts', (m) => m?.initCache?.(getJitUtils()));
}
