import {initCache as initRestoreFromJsonCache} from './caches/restoreFromJsonCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import {buildFactoryFromCode} from './jit/restoreJitFns.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';
import type {RunTypeOptions} from './createIsType.ts';

/** Restorer function returned by `createRestoreFromJson<T>()`. Takes a
 *  JSON-parsed value and reconstructs the original runtime shape
 *  (Dates from ISO strings, BigInts from decimal strings, Symbols from
 *  "Symbol:<desc>" strings, RegExps from "/source/flags" strings). Pair
 *  with `prepareForJson` for the round-trip. Same shape as mion's
 *  `RestoreFromJsonFn` in run-types/src/types.ts. **/
export type RestoreFromJsonFn = (value: unknown) => unknown;

initRestoreFromJsonCache(getJitUtils());

const validatorCache = new Map<string, RestoreFromJsonFn>();

/** Returns a restoreFromJson transformer for `T`.
 *
 *  Two equivalent call shapes (static + reflect). Sync — materialised
 *  at cache-init time. Throws when no id is injected or the entry is
 *  missing. **/
export function createRestoreFromJson<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): RestoreFromJsonFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'createRestoreFromJson(): no id injected. vite-plugin-runtypes must be active for createRestoreFromJson to dispatch to a precompiled factory.'
    );
  }
  const cached = validatorCache.get(id);
  if (cached) return cached;
  // Cache key namespaced as `rj_<id>` — distinct from prepareForJson's
  // `pj_<id>` so both halves of the pair coexist in jitFnsCache.
  const entry = getJitUtils().getJIT('rj_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      // Noop fallback: identity. JSON.parse already produced the right
      // primitive shape for kinds whose restoreFromJson is a noop
      // (string / number / boolean / null / any / unknown / enum / object).
      const transformer: RestoreFromJsonFn = (v) => v;
      validatorCache.set(id, transformer);
      return transformer;
    }
    throw new Error(
      `createRestoreFromJson(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a transformer for that runtype.`
    );
  }
  const transformer = entry.fn as RestoreFromJsonFn;
  validatorCache.set(id, transformer);
  return transformer;
}

const deserializedValidatorCache = new Map<string, RestoreFromJsonFn>();

/** Like `createRestoreFromJson<T>()`, but rebuilds the transformer from
 *  the serialized `JitCompiledFnData.code` body via
 *  `new Function('utl', code)(jitUtils)`. Mirrors `deserializeIsType`. **/
export function deserializeRestoreFromJson<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): RestoreFromJsonFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'deserializeRestoreFromJson(): no id injected. vite-plugin-runtypes must be active for deserializeRestoreFromJson to dispatch to a precompiled factory.'
    );
  }
  const cached = deserializedValidatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('rj_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const transformer: RestoreFromJsonFn = (v) => v;
      deserializedValidatorCache.set(id, transformer);
      return transformer;
    }
    throw new Error(
      `deserializeRestoreFromJson(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a transformer for that runtype.`
    );
  }
  const factory = buildFactoryFromCode(entry.code);
  const transformer = factory(getJitUtils()) as RestoreFromJsonFn;
  deserializedValidatorCache.set(id, transformer);
  return transformer;
}

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/restoreFromJsonCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
  });
}
