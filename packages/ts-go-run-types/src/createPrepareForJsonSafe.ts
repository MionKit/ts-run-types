import {initCache as initPrepareForJsonSafeCache} from './caches/prepareForJsonSafeCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import {buildFactoryFromCode} from './jit/restoreJitFns.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';
import type {RunTypeOptions} from './createIsType.ts';
import type {PrepareForJsonFn} from './createPrepareForJson.ts';

/** Transformer returned by `createPrepareForJsonSafe<T>()`. Same input
 *  and output JSON shape as `createPrepareForJson<T>()`, but **does
 *  not mutate** the input value — returns a new value containing only
 *  the declared keys with transformed leaves (Date → ISO string,
 *  bigint → decimal string, etc.). Pairs with `createRestoreFromJson`
 *  on the decode side (wire format is identical to
 *  `prepareForJson + JSON.stringify`). **/
export type PrepareForJsonSafeFn = PrepareForJsonFn;

initPrepareForJsonSafeCache(getJitUtils());

const validatorCache = new Map<string, PrepareForJsonSafeFn>();

/** Non-mutating sibling of `createPrepareForJson<T>()`. Returns a NEW
 *  JSON-serializable value built from the declared schema — the input
 *  is untouched. Extra (undeclared) properties on object literals /
 *  classes are stripped from the output. Allocates one object per
 *  nested declared shape; sub-values for noop leaves stay shared by
 *  reference. **/
export function createPrepareForJsonSafe<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): PrepareForJsonSafeFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'createPrepareForJsonSafe(): no id injected. vite-plugin-runtypes must be active for createPrepareForJsonSafe to dispatch to a precompiled factory.'
    );
  }
  const cached = validatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('pjs_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const transformer: PrepareForJsonSafeFn = (v) => v;
      validatorCache.set(id, transformer);
      return transformer;
    }
    throw new Error(
      `createPrepareForJsonSafe(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a transformer for that runtype.`
    );
  }
  const transformer = entry.fn as PrepareForJsonSafeFn;
  validatorCache.set(id, transformer);
  return transformer;
}

const deserializedValidatorCache = new Map<string, PrepareForJsonSafeFn>();

/** Sibling of `deserializePrepareForJson<T>()`. **/
export function deserializePrepareForJsonSafe<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): PrepareForJsonSafeFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'deserializePrepareForJsonSafe(): no id injected. vite-plugin-runtypes must be active for deserializePrepareForJsonSafe to dispatch to a precompiled factory.'
    );
  }
  const cached = deserializedValidatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('pjs_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const transformer: PrepareForJsonSafeFn = (v) => v;
      deserializedValidatorCache.set(id, transformer);
      return transformer;
    }
    throw new Error(
      `deserializePrepareForJsonSafe(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a transformer for that runtype.`
    );
  }
  if (entry.isNoop) {
    const transformer = entry.fn as PrepareForJsonSafeFn;
    deserializedValidatorCache.set(id, transformer);
    return transformer;
  }
  const factory = buildFactoryFromCode(entry.code);
  const transformer = factory(getJitUtils()) as PrepareForJsonSafeFn;
  deserializedValidatorCache.set(id, transformer);
  return transformer;
}

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/prepareForJsonSafeCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
  });
}
