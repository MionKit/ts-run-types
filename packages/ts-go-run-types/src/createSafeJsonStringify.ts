import {initCache as initPrepareForJsonCache} from './caches/prepareForJsonCache.ts';
import {initCache as initStripUnknownKeysCache} from './caches/stripUnknownKeysCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';
import type {RunTypeOptions} from './createIsType.ts';

/** Stringify function returned by `createSafeJsonStringify<T>()`.
 *  Composes `stripUnknownKeys + prepareForJson + JSON.stringify` —
 *  strip-first because prepareForJson only transforms declared values
 *  and stripUnknownKeys only removes extras (orthogonal); stripping
 *  first means the per-kind transformer walks a smaller tree. Output
 *  matches mion's `stringifyJson` JIT family (which we have not yet
 *  ported as a single-pass JIT — the composed form is observably
 *  equivalent for our supported kinds).
 *
 *  **Mutates `v` in place** via both stripUnknownKeys (deletes extras)
 *  and prepareForJson (rewrites declared values). Callers needing
 *  preservation should clone before invoking.
 *
 *  Extras are always stripped — never reach JSON.stringify — so the
 *  result is the canonical JSON form for `T` regardless of what's on
 *  `v`. Pair with `createSafeJsonParse` for the matching round-trip. **/
export type SafeJsonStringifyFn = (value: unknown) => string;

initStripUnknownKeysCache(getJitUtils());
initPrepareForJsonCache(getJitUtils());

const composedCache = new Map<string, SafeJsonStringifyFn>();

/** Returns a safe JSON-stringify for `T`. Composes
 *  `stripUnknownKeys + prepareForJson + JSON.stringify`. **/
export function createSafeJsonStringify<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): SafeJsonStringifyFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'createSafeJsonStringify(): no id injected. vite-plugin-runtypes must be active for createSafeJsonStringify to dispatch to a precompiled factory.'
    );
  }
  const cached = composedCache.get(id);
  if (cached) return cached;
  const stripFn = lookupStripFn(id);
  const prepareFn = lookupPrepareFn(id);
  const composed: SafeJsonStringifyFn = (value) => JSON.stringify(prepareFn(stripFn(value)));
  composedCache.set(id, composed);
  return composed;
}

/** Identity-fallback lookup for the stripUnknownKeys JIT entry. **/
function lookupStripFn(id: string): (v: unknown) => unknown {
  const entry = getJitUtils().getJIT('suk_' + id) as JitCompiledFn | undefined;
  if (entry) return entry.fn as (v: unknown) => unknown;
  if (getJitUtils().hasRunType(id)) return (v) => v;
  throw new Error(
    `createSafeJsonStringify(): no stripUnknownKeys JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a mutator for that runtype.`
  );
}

/** Identity-fallback lookup for the prepareForJson JIT entry. **/
function lookupPrepareFn(id: string): (v: unknown) => unknown {
  const entry = getJitUtils().getJIT('pj_' + id) as JitCompiledFn | undefined;
  if (entry) return entry.fn as (v: unknown) => unknown;
  if (getJitUtils().hasRunType(id)) return (v) => v;
  throw new Error(
    `createSafeJsonStringify(): no prepareForJson JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a transformer for that runtype.`
  );
}

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/stripUnknownKeysCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
    composedCache.clear();
  });
  hot.accept('./caches/prepareForJsonCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
    composedCache.clear();
  });
}
