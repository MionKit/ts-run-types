import {initCache as initUnknownKeyErrorsCache} from './caches/unknownKeyErrorsCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import {buildFactoryFromCode} from './jit/restoreJitFns.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';
import type {RunTypeOptions} from './createIsType.ts';
import type {RunTypeError, RunTypeErrorPathSegment} from './createGetTypeErrors.ts';

/** Validator returned by `createUnknownKeyErrors<T>()`. Same arg shape
 *  as createGetTypeErrors — caller can pre-seed path/errors. Returns
 *  the accumulated error array. Each unknown key produces one
 *  `{path, expected: 'never'}` entry. **/
export type UnknownKeyErrorsFn = (value: unknown, path?: RunTypeErrorPathSegment[], errors?: RunTypeError[]) => RunTypeError[];

initUnknownKeyErrorsCache(getJitUtils());

const validatorCache = new Map<string, UnknownKeyErrorsFn>();

/** Returns an unknownKeyErrors validator for `T`. **/
export function createUnknownKeyErrors<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): UnknownKeyErrorsFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'createUnknownKeyErrors(): no id injected. vite-plugin-runtypes must be active for createUnknownKeyErrors to dispatch to a precompiled factory.'
    );
  }
  const cached = validatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('uke_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const validator: UnknownKeyErrorsFn = () => [];
      validatorCache.set(id, validator);
      return validator;
    }
    throw new Error(
      `createUnknownKeyErrors(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a validator for that runtype.`
    );
  }
  const validator = entry.fn as UnknownKeyErrorsFn;
  validatorCache.set(id, validator);
  return validator;
}

const deserializedValidatorCache = new Map<string, UnknownKeyErrorsFn>();

export function deserializeUnknownKeyErrors<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): UnknownKeyErrorsFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'deserializeUnknownKeyErrors(): no id injected. vite-plugin-runtypes must be active for deserializeUnknownKeyErrors to dispatch to a precompiled factory.'
    );
  }
  const cached = deserializedValidatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('uke_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const validator: UnknownKeyErrorsFn = () => [];
      deserializedValidatorCache.set(id, validator);
      return validator;
    }
    throw new Error(
      `deserializeUnknownKeyErrors(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a validator for that runtype.`
    );
  }
  if (entry.isNoop) {
    const validator = entry.fn as UnknownKeyErrorsFn;
    deserializedValidatorCache.set(id, validator);
    return validator;
  }
  const factory = buildFactoryFromCode(entry.code);
  const validator = factory(getJitUtils()) as UnknownKeyErrorsFn;
  deserializedValidatorCache.set(id, validator);
  return validator;
}

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/unknownKeyErrorsCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
  });
}
