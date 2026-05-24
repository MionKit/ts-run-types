import {initCache as initStringifyJsonFlatCache} from './caches/stringifyJsonFlatCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import {buildFactoryFromCode} from './jit/restoreJitFns.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';
import type {RunTypeOptions} from './createIsType.ts';
import type {StringifyJsonFn} from './createStringifyJson.ts';

/** Sibling of StringifyJsonFn — single-pass JSON serialiser that
 *  emits the flat-union wire shape. Pair with `createRestoreFromJsonFlat`. **/
export type StringifyJsonFlatFn = StringifyJsonFn;

initStringifyJsonFlatCache(getJitUtils());

const validatorCache = new Map<string, StringifyJsonFlatFn>();

/** Optimised sibling of `createStringifyJson<T>()`. **/
export function createStringifyJsonFlat<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): StringifyJsonFlatFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'createStringifyJsonFlat(): no id injected. vite-plugin-runtypes must be active for createStringifyJsonFlat to dispatch to a precompiled factory.'
    );
  }
  const cached = validatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('sjf_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const stringifier: StringifyJsonFlatFn = (v) => JSON.stringify(v);
      validatorCache.set(id, stringifier);
      return stringifier;
    }
    throw new Error(
      `createStringifyJsonFlat(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a stringifier for that runtype.`
    );
  }
  const stringifier = entry.fn as StringifyJsonFlatFn;
  validatorCache.set(id, stringifier);
  return stringifier;
}

const deserializedValidatorCache = new Map<string, StringifyJsonFlatFn>();

/** Sibling of `deserializeStringifyJson<T>()`. **/
export function deserializeStringifyJsonFlat<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): StringifyJsonFlatFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'deserializeStringifyJsonFlat(): no id injected. vite-plugin-runtypes must be active for deserializeStringifyJsonFlat to dispatch to a precompiled factory.'
    );
  }
  const cached = deserializedValidatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('sjf_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const stringifier: StringifyJsonFlatFn = (v) => JSON.stringify(v);
      deserializedValidatorCache.set(id, stringifier);
      return stringifier;
    }
    throw new Error(
      `deserializeStringifyJsonFlat(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a stringifier for that runtype.`
    );
  }
  if (entry.isNoop) {
    const stringifier = entry.fn as StringifyJsonFlatFn;
    deserializedValidatorCache.set(id, stringifier);
    return stringifier;
  }
  const factory = buildFactoryFromCode(entry.code);
  const stringifier = factory(getJitUtils()) as StringifyJsonFlatFn;
  deserializedValidatorCache.set(id, stringifier);
  return stringifier;
}

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/stringifyJsonFlatCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
  });
}
