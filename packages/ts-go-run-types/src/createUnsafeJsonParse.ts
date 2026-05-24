import {initCache as initRestoreFromJsonCache} from './caches/restoreFromJsonCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';
import type {RunTypeOptions} from './createIsType.ts';

/** Parse function returned by `createUnsafeJsonParse<T>()`. Composes
 *  `JSON.parse + restoreFromJson` — extras present in the JSON string
 *  pass through unchanged: restoreFromJson only walks declared keys,
 *  so extra keys on the parsed value survive untouched. Pair with
 *  `createUnsafeJsonStringify` for the matching round-trip. **/
export type UnsafeJsonParseFn<T = unknown> = (serialized: string) => T;

initRestoreFromJsonCache(getJitUtils());

const composedCache = new Map<string, UnsafeJsonParseFn>();

/** Returns an unsafe JSON-parse for `T`. Mirrors mion's
 *  jsonHelpers.ts `createSerializationFns` deserialize half (uses
 *  JSON.parse + restoreFromJson). Does NOT strip extras. **/
export function createUnsafeJsonParse<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): UnsafeJsonParseFn<T> {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'createUnsafeJsonParse(): no id injected. vite-plugin-runtypes must be active for createUnsafeJsonParse to dispatch to a precompiled factory.'
    );
  }
  const cached = composedCache.get(id) as UnsafeJsonParseFn<T> | undefined;
  if (cached) return cached;
  const restoreFn = lookupRestoreFn(id);
  const composed: UnsafeJsonParseFn<T> = (serialized) => restoreFn(JSON.parse(serialized)) as T;
  composedCache.set(id, composed as UnsafeJsonParseFn);
  return composed;
}

/** Identity-fallback lookup for the restoreFromJson JIT entry. **/
function lookupRestoreFn(id: string): (v: unknown) => unknown {
  const entry = getJitUtils().getJIT('rj_' + id) as JitCompiledFn | undefined;
  if (entry) return entry.fn as (v: unknown) => unknown;
  if (getJitUtils().hasRunType(id)) return (v) => v;
  throw new Error(
    `createUnsafeJsonParse(): no restoreFromJson JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a transformer for that runtype.`
  );
}

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/restoreFromJsonCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
    composedCache.clear();
  });
}
