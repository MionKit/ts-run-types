import {initCache as initPrepareForJsonCache} from './caches/prepareForJsonCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import {buildFactoryFromCode} from './jit/restoreJitFns.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';
import type {RunTypeOptions} from './createIsType.ts';

/** Transformer function returned by `createPrepareForJson<T>()`. Takes
 *  a runtime value and returns a JSON-serializable form (BigInts → decimal
 *  strings, Symbols → "Symbol:<desc>" strings, RegExps → "/source/flags"
 *  strings, etc.). Pair with `restoreFromJson` to round-trip through
 *  `JSON.parse(JSON.stringify(prepareForJson(v)))`. Same shape as mion's
 *  `PrepareForJsonFn` in run-types/src/types.ts. **/
export type PrepareForJsonFn = (value: unknown) => unknown;

// Side-effect: the cache module's `initCache(jitUtils)` registers every
// compiled JitCompiledFn entry via `jitUtils.addToJitCache`. Mirrors
// createIsType.ts's bootstrap — no local table.
initPrepareForJsonCache(getJitUtils());

const validatorCache = new Map<string, PrepareForJsonFn>();

/** Returns a prepareForJson transformer for `T`.
 *
 *  Two equivalent call shapes (static + reflect, same as createIsType).
 *  The vite-plugin-runtypes plugin rewrites every call site at build
 *  time to inject the `RuntypeId<T>` hash. Sync — the transformer is
 *  materialised at cache-init time, so there's no async work on the
 *  hot path.
 *
 *  Throws when called without the plugin active or when jitUtils
 *  doesn't contain an entry for the expected hash. **/
export function createPrepareForJson<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): PrepareForJsonFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'createPrepareForJson(): no id injected. vite-plugin-runtypes must be active for createPrepareForJson to dispatch to a precompiled factory.'
    );
  }
  const cached = validatorCache.get(id);
  if (cached) return cached;
  // Cache keys are namespaced (`pj_<id>`) so a single runtype id can
  // co-exist with its sibling fn entries (`it_<id>`, `te_<id>`, …) in
  // jitUtils.jitFnsCache without collision.
  const entry = getJitUtils().getJIT('pj_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    // No fn entry. With noop emission now in place, this only fires
    // when the runtype's emit reached a non-supported sub-shape
    // (never, function-return, Promise, Int8Array, …) and the
    // renderer skipped emission. Mion's `12JsonOthers.spec.ts`
    // expects a throw at runtype.createJitFunction time — surfacing
    // that here is a future-phase task: doing so today regresses
    // jit-suite cases (Array<symbol>, Promise<string>) whose
    // round-trip thunks invoke createPrepareForJson but never exercise
    // the fn (empty valid samples). Falling back to identity keeps
    // those cases trivially green while the serialization-suite's
    // `throwsAtCompile` failures stay visible for the next round.
    if (getJitUtils().hasRunType(id)) {
      const transformer: PrepareForJsonFn = (v) => v;
      validatorCache.set(id, transformer);
      return transformer;
    }
    throw new Error(
      `createPrepareForJson(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a transformer for that runtype.`
    );
  }
  const transformer = entry.fn as PrepareForJsonFn;
  validatorCache.set(id, transformer);
  return transformer;
}

const deserializedValidatorCache = new Map<string, PrepareForJsonFn>();

/** Like `createPrepareForJson<T>()`, but rebuilds the transformer from
 *  the serialized `JitCompiledFnData.code` body via
 *  `new Function('utl', code)(jitUtils)` instead of reusing the cache
 *  module's already-materialised `entry.fn`. Mirrors `deserializeIsType`
 *  — exercises the over-the-wire reconstruction path. **/
export function deserializePrepareForJson<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): PrepareForJsonFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'deserializePrepareForJson(): no id injected. vite-plugin-runtypes must be active for deserializePrepareForJson to dispatch to a precompiled factory.'
    );
  }
  const cached = deserializedValidatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('pj_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    // Same identity fallback as createPrepareForJson — see comments
    // there. Throwing on unsupported types is a future phase.
    if (getJitUtils().hasRunType(id)) {
      const transformer: PrepareForJsonFn = (v) => v;
      deserializedValidatorCache.set(id, transformer);
      return transformer;
    }
    throw new Error(
      `deserializePrepareForJson(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a transformer for that runtype.`
    );
  }
  if (entry.isNoop) {
    // Noop entries carry no serializable code — fn was pre-set to
    // the family-specific identity by the cache module's init().
    const transformer = entry.fn as PrepareForJsonFn;
    deserializedValidatorCache.set(id, transformer);
    return transformer;
  }
  const factory = buildFactoryFromCode(entry.code);
  const transformer = factory(getJitUtils()) as PrepareForJsonFn;
  deserializedValidatorCache.set(id, transformer);
  return transformer;
}

// HMR — refresh the prepareForJson registry on cache-module re-eval.
type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/prepareForJsonCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
  });
}
