import {initCache as initRestoreFromJsonFlatCache} from './caches/restoreFromJsonFlatCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import {buildFactoryFromCode} from './jit/restoreJitFns.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';
import type {RunTypeOptions} from './createIsType.ts';
import type {RestoreFromJsonFn} from './createRestoreFromJson.ts';

/** Sibling of RestoreFromJsonFn — same input/output contract, decodes
 *  the flat-union wire shape produced by `createPrepareForJsonFlat` /
 *  `createStringifyJsonFlat`. **/
export type RestoreFromJsonFlatFn = RestoreFromJsonFn;

initRestoreFromJsonFlatCache(getJitUtils());

const validatorCache = new Map<string, RestoreFromJsonFlatFn>();

/** Optimised sibling of `createRestoreFromJson<T>()`. **/
export function createRestoreFromJsonFlat<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): RestoreFromJsonFlatFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'createRestoreFromJsonFlat(): no id injected. vite-plugin-runtypes must be active for createRestoreFromJsonFlat to dispatch to a precompiled factory.'
    );
  }
  const cached = validatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('rjf_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const transformer: RestoreFromJsonFlatFn = (v) => v;
      validatorCache.set(id, transformer);
      return transformer;
    }
    throw new Error(
      `createRestoreFromJsonFlat(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a transformer for that runtype.`
    );
  }
  const transformer = entry.fn as RestoreFromJsonFlatFn;
  validatorCache.set(id, transformer);
  return transformer;
}

const deserializedValidatorCache = new Map<string, RestoreFromJsonFlatFn>();

/** Sibling of `deserializeRestoreFromJson<T>()`. **/
export function deserializeRestoreFromJsonFlat<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): RestoreFromJsonFlatFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'deserializeRestoreFromJsonFlat(): no id injected. vite-plugin-runtypes must be active for deserializeRestoreFromJsonFlat to dispatch to a precompiled factory.'
    );
  }
  const cached = deserializedValidatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('rjf_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const transformer: RestoreFromJsonFlatFn = (v) => v;
      deserializedValidatorCache.set(id, transformer);
      return transformer;
    }
    throw new Error(
      `deserializeRestoreFromJsonFlat(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a transformer for that runtype.`
    );
  }
  if (entry.isNoop) {
    const transformer = entry.fn as RestoreFromJsonFlatFn;
    deserializedValidatorCache.set(id, transformer);
    return transformer;
  }
  const factory = buildFactoryFromCode(entry.code);
  const transformer = factory(getJitUtils()) as RestoreFromJsonFlatFn;
  deserializedValidatorCache.set(id, transformer);
  return transformer;
}

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/restoreFromJsonFlatCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
  });
}
