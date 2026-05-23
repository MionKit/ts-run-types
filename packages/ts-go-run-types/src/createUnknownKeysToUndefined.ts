import {initCache as initUnknownKeysToUndefinedCache} from './caches/unknownKeysToUndefinedCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import {buildFactoryFromCode} from './jit/restoreJitFns.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';
import type {RunTypeOptions} from './createIsType.ts';

/** Mutator returned by `createUnknownKeysToUndefined<T>()`. Sets every
 *  unknown property to `undefined` (instead of removing it). Atomic
 *  shapes are passthrough. **/
export type UnknownKeysToUndefinedFn = (value: unknown) => unknown;

initUnknownKeysToUndefinedCache(getJitUtils());

const validatorCache = new Map<string, UnknownKeysToUndefinedFn>();

/** Returns an unknownKeysToUndefined mutator for `T`. **/
export function createUnknownKeysToUndefined<T>(
  val?: T,
  options?: RunTypeOptions,
  id?: RuntypeId<T>
): UnknownKeysToUndefinedFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'createUnknownKeysToUndefined(): no id injected. vite-plugin-runtypes must be active for createUnknownKeysToUndefined to dispatch to a precompiled factory.'
    );
  }
  const cached = validatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('uku_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const mutator: UnknownKeysToUndefinedFn = (v) => v;
      validatorCache.set(id, mutator);
      return mutator;
    }
    throw new Error(
      `createUnknownKeysToUndefined(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a mutator for that runtype.`
    );
  }
  const mutator = entry.fn as UnknownKeysToUndefinedFn;
  validatorCache.set(id, mutator);
  return mutator;
}

const deserializedValidatorCache = new Map<string, UnknownKeysToUndefinedFn>();

export function deserializeUnknownKeysToUndefined<T>(
  val?: T,
  options?: RunTypeOptions,
  id?: RuntypeId<T>
): UnknownKeysToUndefinedFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'deserializeUnknownKeysToUndefined(): no id injected. vite-plugin-runtypes must be active for deserializeUnknownKeysToUndefined to dispatch to a precompiled factory.'
    );
  }
  const cached = deserializedValidatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('uku_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const mutator: UnknownKeysToUndefinedFn = (v) => v;
      deserializedValidatorCache.set(id, mutator);
      return mutator;
    }
    throw new Error(
      `deserializeUnknownKeysToUndefined(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a mutator for that runtype.`
    );
  }
  if (entry.isNoop) {
    const mutator = entry.fn as UnknownKeysToUndefinedFn;
    deserializedValidatorCache.set(id, mutator);
    return mutator;
  }
  const factory = buildFactoryFromCode(entry.code);
  const mutator = factory(getJitUtils()) as UnknownKeysToUndefinedFn;
  deserializedValidatorCache.set(id, mutator);
  return mutator;
}

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/unknownKeysToUndefinedCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
  });
}
