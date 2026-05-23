import {initCache as initHasUnknownKeysCache} from './caches/hasUnknownKeysCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import {buildFactoryFromCode} from './jit/restoreJitFns.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';
import type {RunTypeOptions} from './createIsType.ts';

/** Options bag passed to a HasUnknownKeysFn at runtime. Mirrors mion's
 *  `runTimeOptions.checkNonJitProps` (constants.functions.ts:152):
 *  when true, the known-keys list is expanded to include children the
 *  JIT skipped (static / function-typed properties). Defaults to false. **/
export interface HasUnknownKeysOptions {
  checkNonJitProps?: boolean;
}

/** Predicate returned by `createHasUnknownKeys<T>()`. Takes a runtime
 *  value (and optional runtime options bag) and returns true if the
 *  value has any property keys not declared in the schema for `T`. **/
export type HasUnknownKeysFn = (value: unknown, options?: HasUnknownKeysOptions) => boolean;

initHasUnknownKeysCache(getJitUtils());

const validatorCache = new Map<string, HasUnknownKeysFn>();

/** Returns a hasUnknownKeys predicate for `T`. Same dispatch pattern
 *  as createIsType / createGetTypeErrors — the vite plugin rewrites the
 *  call site to inject the trailing `RuntypeId<T>` hash. **/
export function createHasUnknownKeys<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): HasUnknownKeysFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'createHasUnknownKeys(): no id injected. vite-plugin-runtypes must be active for createHasUnknownKeys to dispatch to a precompiled factory.'
    );
  }
  const cached = validatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('huk_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const validator: HasUnknownKeysFn = () => false;
      validatorCache.set(id, validator);
      return validator;
    }
    throw new Error(
      `createHasUnknownKeys(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a predicate for that runtype.`
    );
  }
  const validator = entry.fn as HasUnknownKeysFn;
  validatorCache.set(id, validator);
  return validator;
}

const deserializedValidatorCache = new Map<string, HasUnknownKeysFn>();

/** Like `createHasUnknownKeys<T>()`, but rebuilds the predicate from
 *  the serialized `JitCompiledFnData.code` body via `new Function('utl',
 *  code)(jitUtils)`. **/
export function deserializeHasUnknownKeys<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): HasUnknownKeysFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'deserializeHasUnknownKeys(): no id injected. vite-plugin-runtypes must be active for deserializeHasUnknownKeys to dispatch to a precompiled factory.'
    );
  }
  const cached = deserializedValidatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('huk_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const validator: HasUnknownKeysFn = () => false;
      deserializedValidatorCache.set(id, validator);
      return validator;
    }
    throw new Error(
      `deserializeHasUnknownKeys(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a predicate for that runtype.`
    );
  }
  if (entry.isNoop) {
    const validator = entry.fn as HasUnknownKeysFn;
    deserializedValidatorCache.set(id, validator);
    return validator;
  }
  const factory = buildFactoryFromCode(entry.code);
  const validator = factory(getJitUtils()) as HasUnknownKeysFn;
  deserializedValidatorCache.set(id, validator);
  return validator;
}

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/hasUnknownKeysCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
  });
}
