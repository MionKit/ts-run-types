import {initCache as initRestoreFromJsonCache} from './caches/restoreFromJsonCache.ts';
import {initCache as initStripUnknownKeysCache} from './caches/stripUnknownKeysCache.ts';
import {initCache as initUnknownKeyErrorsCache} from './caches/unknownKeyErrorsCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';
import type {RunTypeError, RunTypeErrorPathSegment} from './createGetTypeErrors.ts';

/** Parse function returned by `createSafeJsonParse<T>()`. Composes
 *  `JSON.parse + (stripUnknownKeys | unknownKeyErrors) + restoreFromJson`
 *  based on the `onUnknownKeys` option. Pair with
 *  `createSafeJsonStringify` for the matching round-trip. **/
export type SafeJsonParseFn<T = unknown> = (serialized: string) => T;

/** Caller-controlled runtime behavior for `createSafeJsonParse`.
 *  Not folded into the runtype hash — the Vite plugin's marker
 *  scanner ignores it. Same per-caller-options pattern as
 *  `HasUnknownKeysOptions`. **/
export interface SafeJsonParseOptions {
  /** `'strip'` (default) silently removes unknown keys before
   *  restoreFromJson runs. `'error'` runs `unknownKeyErrors` first
   *  and throws a `SafeJsonParseError` when any unknown key is
   *  present — the thrown error carries the accumulated
   *  `RunTypeError[]` on `.errors`. **/
  onUnknownKeys?: 'strip' | 'error';
}

/** Error thrown by `createSafeJsonParse` when `onUnknownKeys: 'error'`
 *  is set and the parsed value carries one or more unknown keys.
 *  Mirrors the throw-on-malformed shape of `JSON.parse` itself; the
 *  `.errors` field exposes the underlying `RunTypeError[]` so
 *  callers needing errors-as-data can `try/catch` and inspect. **/
export class SafeJsonParseError extends Error {
  readonly errors: RunTypeError[];
  constructor(errors: RunTypeError[]) {
    super(`createSafeJsonParse(): parsed value carries ${errors.length} unknown key(s)`);
    this.name = 'SafeJsonParseError';
    this.errors = errors;
  }
}

initStripUnknownKeysCache(getJitUtils());
initUnknownKeyErrorsCache(getJitUtils());
initRestoreFromJsonCache(getJitUtils());

const composedCache = new Map<string, SafeJsonParseFn>();

/** Returns a safe JSON-parse for `T`. Composes
 *  `JSON.parse + (stripUnknownKeys | unknownKeyErrors) + restoreFromJson`.
 *
 *  When `options.onUnknownKeys === 'error'`, runs unknownKeyErrors
 *  first and throws `SafeJsonParseError` when any unknown key is
 *  present. Default `'strip'` silently removes extras before restore.
 *
 *  Cache key includes the `onUnknownKeys` choice so callers can mix
 *  strip and error modes on the same runtype without one closure
 *  shadowing the other. **/
export function createSafeJsonParse<T>(val?: T, options?: SafeJsonParseOptions, id?: RuntypeId<T>): SafeJsonParseFn<T> {
  void val;
  if (id === undefined) {
    throw new Error(
      'createSafeJsonParse(): no id injected. vite-plugin-runtypes must be active for createSafeJsonParse to dispatch to a precompiled factory.'
    );
  }
  const onUnknownKeys = options?.onUnknownKeys ?? 'strip';
  const cacheKey = id + ':' + onUnknownKeys;
  const cached = composedCache.get(cacheKey) as SafeJsonParseFn<T> | undefined;
  if (cached) return cached;
  const restoreFn = lookupRestoreFn(id);
  let composed: SafeJsonParseFn<T>;
  if (onUnknownKeys === 'error') {
    const errorsFn = lookupErrorsFn(id);
    composed = (serialized) => {
      const parsed = JSON.parse(serialized);
      const errors = errorsFn(parsed, [], []);
      if (errors.length > 0) throw new SafeJsonParseError(errors);
      return restoreFn(parsed) as T;
    };
  } else {
    const stripFn = lookupStripFn(id);
    composed = (serialized) => restoreFn(stripFn(JSON.parse(serialized))) as T;
  }
  composedCache.set(cacheKey, composed as SafeJsonParseFn);
  return composed;
}

/** Identity-fallback lookup for the stripUnknownKeys JIT entry. **/
function lookupStripFn(id: string): (v: unknown) => unknown {
  const entry = getJitUtils().getJIT('suk_' + id) as JitCompiledFn | undefined;
  if (entry) return entry.fn as (v: unknown) => unknown;
  if (getJitUtils().hasRunType(id)) return (v) => v;
  throw new Error(
    `createSafeJsonParse(): no stripUnknownKeys JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a mutator for that runtype.`
  );
}

/** Identity-fallback lookup for the unknownKeyErrors JIT entry. **/
function lookupErrorsFn(id: string): (v: unknown, path?: RunTypeErrorPathSegment[], errors?: RunTypeError[]) => RunTypeError[] {
  const entry = getJitUtils().getJIT('uke_' + id) as JitCompiledFn | undefined;
  if (entry) return entry.fn as (v: unknown, path?: RunTypeErrorPathSegment[], errors?: RunTypeError[]) => RunTypeError[];
  if (getJitUtils().hasRunType(id)) return () => [];
  throw new Error(
    `createSafeJsonParse(): no unknownKeyErrors JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a validator for that runtype.`
  );
}

/** Identity-fallback lookup for the restoreFromJson JIT entry. **/
function lookupRestoreFn(id: string): (v: unknown) => unknown {
  const entry = getJitUtils().getJIT('rj_' + id) as JitCompiledFn | undefined;
  if (entry) return entry.fn as (v: unknown) => unknown;
  if (getJitUtils().hasRunType(id)) return (v) => v;
  throw new Error(
    `createSafeJsonParse(): no restoreFromJson JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a transformer for that runtype.`
  );
}

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/stripUnknownKeysCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
    composedCache.clear();
  });
  hot.accept('./caches/unknownKeyErrorsCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
    composedCache.clear();
  });
  hot.accept('./caches/restoreFromJsonCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
    composedCache.clear();
  });
}
