import {initCache as initPrepareForJsonFlatCache} from './caches/prepareForJsonFlatCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import {buildFactoryFromCode} from './jit/restoreJitFns.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';
import type {RunTypeOptions} from './createIsType.ts';
import type {PrepareForJsonFn} from './createPrepareForJson.ts';

/** Transformer returned by `createPrepareForJsonFlat<T>()`. Same shape
 *  and contract as the non-flat variant — same input value, same
 *  JSON-serialisable output — but the on-the-wire union encoding
 *  collapses object members into a `[-1, mergedObject]` envelope so
 *  encode skips the per-object isType walk. Decode via
 *  `createRestoreFromJsonFlat`; stringify via `createStringifyJsonFlat`. **/
export type PrepareForJsonFlatFn = PrepareForJsonFn;

initPrepareForJsonFlatCache(getJitUtils());

const validatorCache = new Map<string, PrepareForJsonFlatFn>();

/** Optimised sibling of `createPrepareForJson<T>()`. Wire shape diverges
 *  only at unions — see `createPrepareForJsonFlat.ts` module comment. **/
export function createPrepareForJsonFlat<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): PrepareForJsonFlatFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'createPrepareForJsonFlat(): no id injected. vite-plugin-runtypes must be active for createPrepareForJsonFlat to dispatch to a precompiled factory.'
    );
  }
  const cached = validatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('pjf_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const transformer: PrepareForJsonFlatFn = (v) => v;
      validatorCache.set(id, transformer);
      return transformer;
    }
    throw new Error(
      `createPrepareForJsonFlat(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a transformer for that runtype.`
    );
  }
  const transformer = entry.fn as PrepareForJsonFlatFn;
  validatorCache.set(id, transformer);
  return transformer;
}

const deserializedValidatorCache = new Map<string, PrepareForJsonFlatFn>();

/** Sibling of `deserializePrepareForJson<T>()`. **/
export function deserializePrepareForJsonFlat<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): PrepareForJsonFlatFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'deserializePrepareForJsonFlat(): no id injected. vite-plugin-runtypes must be active for deserializePrepareForJsonFlat to dispatch to a precompiled factory.'
    );
  }
  const cached = deserializedValidatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('pjf_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const transformer: PrepareForJsonFlatFn = (v) => v;
      deserializedValidatorCache.set(id, transformer);
      return transformer;
    }
    throw new Error(
      `deserializePrepareForJsonFlat(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a transformer for that runtype.`
    );
  }
  if (entry.isNoop) {
    const transformer = entry.fn as PrepareForJsonFlatFn;
    deserializedValidatorCache.set(id, transformer);
    return transformer;
  }
  const factory = buildFactoryFromCode(entry.code);
  const transformer = factory(getJitUtils()) as PrepareForJsonFlatFn;
  deserializedValidatorCache.set(id, transformer);
  return transformer;
}

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/prepareForJsonFlatCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
  });
}
