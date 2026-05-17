import {initCache as initStringifyJsonCache} from './caches/stringifyJsonCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import {buildFactoryFromCode} from './jit/restoreJitFns.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';
import type {RunTypeOptions} from './createIsType.ts';

/** Stringifier function returned by `createStringifyJson<T>()`. Takes
 *  a runtime value and returns its JSON string representation —
 *  mion's single-pass serialiser that walks the TYPE rather than `v`,
 *  so extras are stripped by construction and `v` is never mutated.
 *
 *  Observable contract differences from
 *  `JSON.stringify(prepareForJson(v))`:
 *
 *   - **No mutation of `v`** — stringifyJson reads but never writes.
 *   - **Extras stripped** — declared members only ever reach the
 *     output. A bigint extra that would crash JSON.stringify is
 *     silently dropped.
 *   - **Property order** — we keep declaration order (mion sorts
 *     optional members first; see docs/port-status.md "Intentional
 *     deviations from mion" — parsed equality holds regardless).
 *   - **Returns `undefined`** for top-level `undefined` inputs
 *     (matches mion).
 *
 *  Pair with `createRestoreFromJson` for the round-trip
 *  `restoreFromJson(JSON.parse(stringifyJson(v)))`. **/
export type StringifyJsonFn = (value: unknown) => string | undefined;

// Side-effect: the cache module's `initCache(jitUtils)` registers
// every compiled JitCompiledFn entry via `jitUtils.addToJitCache`.
// Mirrors createPrepareForJson.ts's bootstrap.
initStringifyJsonCache(getJitUtils());

const validatorCache = new Map<string, StringifyJsonFn>();

/** Returns a stringifyJson serialiser for `T`.
 *
 *  Two equivalent call shapes (static + reflect, same as
 *  createIsType). The vite-plugin-runtypes plugin rewrites every
 *  call site at build time to inject the `RuntypeId<T>` hash. Sync
 *  — the serialiser is materialised at cache-init time, so there's
 *  no async work on the hot path.
 *
 *  Throws when called without the plugin active or when jitUtils
 *  doesn't contain an entry for the expected hash. **/
export function createStringifyJson<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): StringifyJsonFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'createStringifyJson(): no id injected. vite-plugin-runtypes must be active for createStringifyJson to dispatch to a precompiled factory.'
    );
  }
  const cached = validatorCache.get(id);
  if (cached) return cached;
  // Cache keys are namespaced (`sj_<id>`) so a single runtype id can
  // co-exist with its sibling fn entries (`it_<id>`, `pj_<id>`, …) in
  // jitUtils.jitFnsCache without collision.
  const entry = getJitUtils().getJIT('sj_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    // No fn entry. Identity fallback when the runtype IS registered
    // but the precompiler didn't emit a stringifyJson factory for
    // it (unsupported sub-shape). Fall back to JSON.stringify so the
    // contract "input value → JSON string" still holds in degenerate
    // cases. Matches mion's behavior for the same shapes.
    if (getJitUtils().hasRunType(id)) {
      const stringifier: StringifyJsonFn = (v) => JSON.stringify(v);
      validatorCache.set(id, stringifier);
      return stringifier;
    }
    throw new Error(
      `createStringifyJson(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a stringifier for that runtype.`
    );
  }
  const stringifier = entry.fn as StringifyJsonFn;
  validatorCache.set(id, stringifier);
  return stringifier;
}

const deserializedValidatorCache = new Map<string, StringifyJsonFn>();

/** Like `createStringifyJson<T>()`, but rebuilds the serialiser from
 *  the serialized `JitCompiledFnData.code` body via
 *  `new Function('utl', code)(jitUtils)` instead of reusing the cache
 *  module's already-materialised `entry.fn`. Mirrors
 *  `deserializePrepareForJson` — exercises the over-the-wire
 *  reconstruction path. **/
export function deserializeStringifyJson<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): StringifyJsonFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'deserializeStringifyJson(): no id injected. vite-plugin-runtypes must be active for deserializeStringifyJson to dispatch to a precompiled factory.'
    );
  }
  const cached = deserializedValidatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('sj_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const stringifier: StringifyJsonFn = (v) => JSON.stringify(v);
      deserializedValidatorCache.set(id, stringifier);
      return stringifier;
    }
    throw new Error(
      `deserializeStringifyJson(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a stringifier for that runtype.`
    );
  }
  if (entry.isNoop) {
    // Noop entries carry no serializable code — fn was pre-set to
    // the family-specific noop (JSON.stringify) by the cache module's
    // init().
    const stringifier = entry.fn as StringifyJsonFn;
    deserializedValidatorCache.set(id, stringifier);
    return stringifier;
  }
  const factory = buildFactoryFromCode(entry.code);
  const stringifier = factory(getJitUtils()) as StringifyJsonFn;
  deserializedValidatorCache.set(id, stringifier);
  return stringifier;
}

// HMR — refresh the stringifyJson registry on cache-module re-eval.
type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/stringifyJsonCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
  });
}
