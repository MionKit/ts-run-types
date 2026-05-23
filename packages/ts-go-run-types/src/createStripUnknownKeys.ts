import {initCache as initStripUnknownKeysCache} from './caches/stripUnknownKeysCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import {buildFactoryFromCode} from './jit/restoreJitFns.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';
import type {RunTypeOptions} from './createIsType.ts';

/** Mutator returned by `createStripUnknownKeys<T>()`. Mutates the value
 *  by deleting any property not declared in the schema for `T`, then
 *  returns the same value reference. Atomic shapes are a passthrough. **/
export type StripUnknownKeysFn = (value: unknown) => unknown;

initStripUnknownKeysCache(getJitUtils());

const validatorCache = new Map<string, StripUnknownKeysFn>();

/** Returns a stripUnknownKeys mutator for `T`. **/
export function createStripUnknownKeys<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): StripUnknownKeysFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'createStripUnknownKeys(): no id injected. vite-plugin-runtypes must be active for createStripUnknownKeys to dispatch to a precompiled factory.'
    );
  }
  const cached = validatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('suk_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const mutator: StripUnknownKeysFn = (v) => v;
      validatorCache.set(id, mutator);
      return mutator;
    }
    throw new Error(
      `createStripUnknownKeys(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a mutator for that runtype.`
    );
  }
  const mutator = entry.fn as StripUnknownKeysFn;
  validatorCache.set(id, mutator);
  return mutator;
}

const deserializedValidatorCache = new Map<string, StripUnknownKeysFn>();

export function deserializeStripUnknownKeys<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): StripUnknownKeysFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'deserializeStripUnknownKeys(): no id injected. vite-plugin-runtypes must be active for deserializeStripUnknownKeys to dispatch to a precompiled factory.'
    );
  }
  const cached = deserializedValidatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('suk_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const mutator: StripUnknownKeysFn = (v) => v;
      deserializedValidatorCache.set(id, mutator);
      return mutator;
    }
    throw new Error(
      `deserializeStripUnknownKeys(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a mutator for that runtype.`
    );
  }
  if (entry.isNoop) {
    const mutator = entry.fn as StripUnknownKeysFn;
    deserializedValidatorCache.set(id, mutator);
    return mutator;
  }
  const factory = buildFactoryFromCode(entry.code);
  const mutator = factory(getJitUtils()) as StripUnknownKeysFn;
  deserializedValidatorCache.set(id, mutator);
  return mutator;
}

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/stripUnknownKeysCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
  });
}
