// Single home for every JIT-backed factory exported by this package.
//
// Each createXxx<T>() / deserializeXxx<T>() is a thin wrapper over one of
// two private generics — `createJitFunction` for the production path,
// `deserializeJitFunction` for the test/round-trip path. The only thing
// that varies per family is the cache-key prefix (`it`, `te`, `pj`, …),
// the identity fallback used when a runtype is registered but its factory
// collapsed to a noop, and the return type alias.
//
// No local Maps live here. The jitUtils singleton is the only cache —
// `getJIT(hash)` returns the entry, `materializeJitFn` populates
// `entry.fn` once, and every subsequent lookup reads the same slot.
// Composite wrappers (createSafeJsonParse, createUnsafeJsonStringify,
// createUnsafeJsonParse) rebuild their composed closure per call; the
// cost is one allocation + a handful of Map.gets, and callers memoize
// the returned fn anyway.

import {initCache as initIsTypeCache} from './caches/isTypeCache.ts';
import {initCache as initGetTypeErrorsCache} from './caches/getTypeErrorsCache.ts';
import {initCache as initHasUnknownKeysCache} from './caches/hasUnknownKeysCache.ts';
import {initCache as initStripUnknownKeysCache} from './caches/stripUnknownKeysCache.ts';
import {initCache as initUnknownKeyErrorsCache} from './caches/unknownKeyErrorsCache.ts';
import {initCache as initUnknownKeysToUndefinedCache} from './caches/unknownKeysToUndefinedCache.ts';
import {initCache as initPrepareForJsonCache} from './caches/prepareForJsonCache.ts';
import {initCache as initPrepareForJsonFlatCache} from './caches/prepareForJsonFlatCache.ts';
import {initCache as initPrepareForJsonSafeCache} from './caches/prepareForJsonSafeCache.ts';
import {initCache as initRestoreFromJsonCache} from './caches/restoreFromJsonCache.ts';
import {initCache as initRestoreFromJsonFlatCache} from './caches/restoreFromJsonFlatCache.ts';
import {initCache as initStringifyJsonCache} from './caches/stringifyJsonCache.ts';
import {initCache as initStringifyJsonFlatCache} from './caches/stringifyJsonFlatCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import {buildFactoryFromCode} from './jit/restoreJitFns.ts';
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

/** Transformer function returned by `createPrepareForJson<T>()`. Takes
 *  a runtime value and returns a JSON-serializable form (BigInts →
 *  decimal strings, Symbols → "Symbol:<desc>" strings, RegExps →
 *  "/source/flags" strings, etc.). Pair with `restoreFromJson`. **/
export type PrepareForJsonFn = (value: unknown) => unknown;

/** Sibling of PrepareForJsonFn. Same input/output contract; the on-the-
 *  wire union encoding collapses object members into a
 *  `[-1, mergedObject]` envelope so encode skips the per-object isType
 *  walk. Decode via `createRestoreFromJsonFlat`. **/
export type PrepareForJsonFlatFn = PrepareForJsonFn;

/** Non-mutating sibling of PrepareForJsonFn — returns a NEW value
 *  containing only the declared keys and transformed leaves. **/
export type PrepareForJsonSafeFn = PrepareForJsonFn;

/** Restorer function returned by `createRestoreFromJson<T>()`. Takes a
 *  JSON-parsed value and reconstructs the original runtime shape. **/
export type RestoreFromJsonFn = (value: unknown) => unknown;

/** Sibling of RestoreFromJsonFn — decodes the flat-union wire shape. **/
export type RestoreFromJsonFlatFn = RestoreFromJsonFn;

/** Stringifier returned by `createStringifyJson<T>()`. Mion's single-
 *  pass serialiser that walks the TYPE rather than `v`, so extras are
 *  stripped by construction and `v` is never mutated. Returns
 *  `undefined` for top-level `undefined` inputs. **/
export type StringifyJsonFn = (value: unknown) => string | undefined;

/** Sibling of StringifyJsonFn — emits the flat-union wire shape. **/
export type StringifyJsonFlatFn = StringifyJsonFn;

/** Stringifier returned by `createUnsafeJsonStringify<T>()`. Composes
 *  `prepareForJson + JSON.stringify`. Mutates `v` in place and lets
 *  extras leak into the output. **/
export type UnsafeJsonStringifyFn = (value: unknown) => string;

/** Stringifier returned by `createSafeJsonStringify<T>()`. Single
 *  stringifyJson JIT call — no mutation, extras stripped at emit. **/
export type SafeJsonStringifyFn = (value: unknown) => string | undefined;

/** Parse function returned by `createUnsafeJsonParse<T>()`. Composes
 *  `JSON.parse + restoreFromJson`. Extras present in the JSON string
 *  pass through unchanged. **/
export type UnsafeJsonParseFn<T = unknown> = (serialized: string) => T;

/** Parse function returned by `createSafeJsonParse<T>()`. Composes
 *  `JSON.parse + (stripUnknownKeys | unknownKeyErrors) +
 *  restoreFromJson` based on the `onUnknownKeys` option. **/
export type SafeJsonParseFn<T = unknown> = (serialized: string) => T;

/** Caller-controlled runtime behavior for `createSafeJsonParse`. Not
 *  folded into the runtype hash — the Vite plugin's marker scanner
 *  ignores it. **/
export interface SafeJsonParseOptions {
  /** `'strip'` (default) silently removes unknown keys before
   *  restoreFromJson runs. `'error'` runs `unknownKeyErrors` first and
   *  throws a `SafeJsonParseError` when any unknown key is present. **/
  onUnknownKeys?: 'strip' | 'error';
}

/** Error thrown by `createSafeJsonParse` when `onUnknownKeys: 'error'`
 *  is set and the parsed value carries one or more unknown keys. The
 *  `.errors` field exposes the underlying `RunTypeError[]`. **/
export class SafeJsonParseError extends Error {
  readonly errors: RunTypeError[];
  constructor(errors: RunTypeError[]) {
    super(`createSafeJsonParse(): parsed value carries ${errors.length} unknown key(s)`);
    this.name = 'SafeJsonParseError';
    this.errors = errors;
  }
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
initPrepareForJsonFlatCache(_utils);
initPrepareForJsonSafeCache(_utils);
initRestoreFromJsonCache(_utils);
initRestoreFromJsonFlatCache(_utils);
initStringifyJsonCache(_utils);
initStringifyJsonFlatCache(_utils);

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

/** Test/round-trip generic. Rebuilds the per-id closure from the
 *  serialized `JitCompiledFnData.code` via `new Function('utl',
 *  code)(jitUtils)` on every call — exercises the over-the-wire
 *  reconstruction path used by `restoreCompiledJitFns`. Noop entries
 *  carry no code; they reuse the cache module's pre-populated
 *  `entry.fn`. No local cache — production deserialization runs
 *  through `addSerializedJitCaches` which writes the rebuilt fn back
 *  onto `entry.fn` on the singleton. **/
function deserializeJitFunction<F extends AnyFn>(
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
    if (!entry) {
      if (utils.hasRunType(id)) return identityFn;
      throw new Error(
        `${fnName}(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a factory for that runtype.`
      );
    }
    if (entry.isNoop) return entry.fn as F;
    return buildFactoryFromCode(entry.code)(utils) as F;
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
// Standard family wrappers — one createXxx + one deserializeXxx per family.
//
// The trailing `as unknown as <T>(...) => Fn` cast restores the generic <T>
// signature the Go-side marker scanner reads to identify call sites. The
// runtime function is a non-generic JS closure; <T> only ever exists at the
// type-checker layer and is erased before execution.
// =============================================================================

export const createIsType = createJitFunction<IsTypeFn>('createIsType', 'it', () => true) as unknown as <T>(
  val?: T,
  options?: RunTypeOptions,
  id?: RuntypeId<T>
) => IsTypeFn;
export const deserializeIsType = deserializeJitFunction<IsTypeFn>('deserializeIsType', 'it', () => true) as unknown as <T>(
  val?: T,
  options?: RunTypeOptions,
  id?: RuntypeId<T>
) => IsTypeFn;

const getTypeErrorsIdentity: GetTypeErrorsFn = () => [];
export const createGetTypeErrors = createJitFunction<GetTypeErrorsFn>(
  'createGetTypeErrors',
  'te',
  getTypeErrorsIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => GetTypeErrorsFn;
export const deserializeGetTypeErrors = deserializeJitFunction<GetTypeErrorsFn>(
  'deserializeGetTypeErrors',
  'te',
  getTypeErrorsIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => GetTypeErrorsFn;

export const createHasUnknownKeys = createJitFunction<HasUnknownKeysFn>(
  'createHasUnknownKeys',
  'huk',
  () => false
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => HasUnknownKeysFn;
export const deserializeHasUnknownKeys = deserializeJitFunction<HasUnknownKeysFn>(
  'deserializeHasUnknownKeys',
  'huk',
  () => false
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => HasUnknownKeysFn;

const identityValueFn = (v: unknown) => v;

export const createStripUnknownKeys = createJitFunction<StripUnknownKeysFn>(
  'createStripUnknownKeys',
  'suk',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => StripUnknownKeysFn;
export const deserializeStripUnknownKeys = deserializeJitFunction<StripUnknownKeysFn>(
  'deserializeStripUnknownKeys',
  'suk',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => StripUnknownKeysFn;

const unknownKeyErrorsIdentity: UnknownKeyErrorsFn = () => [];
export const createUnknownKeyErrors = createJitFunction<UnknownKeyErrorsFn>(
  'createUnknownKeyErrors',
  'uke',
  unknownKeyErrorsIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => UnknownKeyErrorsFn;
export const deserializeUnknownKeyErrors = deserializeJitFunction<UnknownKeyErrorsFn>(
  'deserializeUnknownKeyErrors',
  'uke',
  unknownKeyErrorsIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => UnknownKeyErrorsFn;

export const createUnknownKeysToUndefined = createJitFunction<UnknownKeysToUndefinedFn>(
  'createUnknownKeysToUndefined',
  'uku',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => UnknownKeysToUndefinedFn;
export const deserializeUnknownKeysToUndefined = deserializeJitFunction<UnknownKeysToUndefinedFn>(
  'deserializeUnknownKeysToUndefined',
  'uku',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => UnknownKeysToUndefinedFn;

export const createPrepareForJson = createJitFunction<PrepareForJsonFn>(
  'createPrepareForJson',
  'pj',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => PrepareForJsonFn;
export const deserializePrepareForJson = deserializeJitFunction<PrepareForJsonFn>(
  'deserializePrepareForJson',
  'pj',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => PrepareForJsonFn;

export const createPrepareForJsonFlat = createJitFunction<PrepareForJsonFlatFn>(
  'createPrepareForJsonFlat',
  'pjf',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => PrepareForJsonFlatFn;
export const deserializePrepareForJsonFlat = deserializeJitFunction<PrepareForJsonFlatFn>(
  'deserializePrepareForJsonFlat',
  'pjf',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => PrepareForJsonFlatFn;

export const createPrepareForJsonSafe = createJitFunction<PrepareForJsonSafeFn>(
  'createPrepareForJsonSafe',
  'pjs',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => PrepareForJsonSafeFn;
export const deserializePrepareForJsonSafe = deserializeJitFunction<PrepareForJsonSafeFn>(
  'deserializePrepareForJsonSafe',
  'pjs',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => PrepareForJsonSafeFn;

export const createRestoreFromJson = createJitFunction<RestoreFromJsonFn>(
  'createRestoreFromJson',
  'rj',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => RestoreFromJsonFn;
export const deserializeRestoreFromJson = deserializeJitFunction<RestoreFromJsonFn>(
  'deserializeRestoreFromJson',
  'rj',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => RestoreFromJsonFn;

export const createRestoreFromJsonFlat = createJitFunction<RestoreFromJsonFlatFn>(
  'createRestoreFromJsonFlat',
  'rjf',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => RestoreFromJsonFlatFn;
export const deserializeRestoreFromJsonFlat = deserializeJitFunction<RestoreFromJsonFlatFn>(
  'deserializeRestoreFromJsonFlat',
  'rjf',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => RestoreFromJsonFlatFn;

const stringifyJsonIdentity: StringifyJsonFn = (v) => JSON.stringify(v);
export const createStringifyJson = createJitFunction<StringifyJsonFn>(
  'createStringifyJson',
  'sj',
  stringifyJsonIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => StringifyJsonFn;
export const deserializeStringifyJson = deserializeJitFunction<StringifyJsonFn>(
  'deserializeStringifyJson',
  'sj',
  stringifyJsonIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => StringifyJsonFn;

export const createStringifyJsonFlat = createJitFunction<StringifyJsonFlatFn>(
  'createStringifyJsonFlat',
  'sjf',
  stringifyJsonIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => StringifyJsonFlatFn;
export const deserializeStringifyJsonFlat = deserializeJitFunction<StringifyJsonFlatFn>(
  'deserializeStringifyJsonFlat',
  'sjf',
  stringifyJsonIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => StringifyJsonFlatFn;

// =============================================================================
// Composite wrappers — compose multiple JIT primitives.
//
// No local cache. Each call rebuilds the composed closure (one closure
// allocation + 1-3 Map.gets); the underlying primitive fns themselves are
// still cached on the jitUtils singleton, so the cost is just the
// composition.
// =============================================================================

/** Safe single-pass JSON serialiser — backed directly by the
 *  stringifyJson JIT family. Equivalent to createStringifyJson except
 *  for the public name (`createSafeJsonStringify` reads better when
 *  paired with `createSafeJsonParse`). **/
export const createSafeJsonStringify = createJitFunction<SafeJsonStringifyFn>(
  'createSafeJsonStringify',
  'sj',
  stringifyJsonIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => SafeJsonStringifyFn;

/** Unsafe JSON-stringify — `prepareForJson + JSON.stringify`. Mutates
 *  `v` in place via prepareForJson and lets undeclared extras leak into
 *  the output (may throw on bigint extras). **/
export function createUnsafeJsonStringify<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): UnsafeJsonStringifyFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'createUnsafeJsonStringify(): no id injected. vite-plugin-runtypes must be active for createUnsafeJsonStringify to dispatch to a precompiled factory.'
    );
  }
  const prepareFn = lookupJitFn<PrepareForJsonFn>('createUnsafeJsonStringify', 'pj', id, identityValueFn);
  return (value) => JSON.stringify(prepareFn(value));
}

/** Unsafe JSON-parse — `JSON.parse + restoreFromJson`. Extras present
 *  in the parsed value pass through unchanged. **/
export function createUnsafeJsonParse<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): UnsafeJsonParseFn<T> {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'createUnsafeJsonParse(): no id injected. vite-plugin-runtypes must be active for createUnsafeJsonParse to dispatch to a precompiled factory.'
    );
  }
  const restoreFn = lookupJitFn<RestoreFromJsonFn>('createUnsafeJsonParse', 'rj', id, identityValueFn);
  return (serialized) => restoreFn(JSON.parse(serialized)) as T;
}

/** Safe JSON-parse — composes `JSON.parse + (stripUnknownKeys |
 *  unknownKeyErrors) + restoreFromJson` based on `onUnknownKeys`. When
 *  `'error'` (default `'strip'`), runs unknownKeyErrors first and
 *  throws `SafeJsonParseError` when any unknown key is present. **/
export function createSafeJsonParse<T>(val?: T, options?: SafeJsonParseOptions, id?: RuntypeId<T>): SafeJsonParseFn<T> {
  void val;
  if (id === undefined) {
    throw new Error(
      'createSafeJsonParse(): no id injected. vite-plugin-runtypes must be active for createSafeJsonParse to dispatch to a precompiled factory.'
    );
  }
  const onUnknownKeys = options?.onUnknownKeys ?? 'strip';
  const restoreFn = lookupJitFn<RestoreFromJsonFn>('createSafeJsonParse', 'rj', id, identityValueFn);
  if (onUnknownKeys === 'error') {
    const errorsFn = lookupJitFn<UnknownKeyErrorsFn>('createSafeJsonParse', 'uke', id, unknownKeyErrorsIdentity);
    return (serialized) => {
      const parsed = JSON.parse(serialized);
      const errors = errorsFn(parsed, [], []);
      if (errors.length > 0) throw new SafeJsonParseError(errors);
      return restoreFn(parsed) as T;
    };
  }
  const stripFn = lookupJitFn<StripUnknownKeysFn>('createSafeJsonParse', 'suk', id, identityValueFn);
  return (serialized) => restoreFn(stripFn(JSON.parse(serialized))) as T;
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
  hot.accept('./caches/prepareForJsonFlatCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/prepareForJsonSafeCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/restoreFromJsonCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/restoreFromJsonFlatCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/stringifyJsonCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/stringifyJsonFlatCache.ts', (m) => m?.initCache?.(getJitUtils()));
}
