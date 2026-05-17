import {initCache as initStringifyJsonCache} from './caches/stringifyJsonCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';
import type {RunTypeOptions} from './createIsType.ts';

/** Stringify function returned by `createSafeJsonStringify<T>()`.
 *  Backed by the single-pass `stringifyJson` JIT family — mion's
 *  per-type emitter that walks the type and builds the JSON string
 *  directly, without mutating `v` and stripping extras by
 *  construction.
 *
 *  **Does not mutate `v`** — stringifyJson reads but never writes.
 *  (Pre-port, this wrapper composed strip + prepare + JSON.stringify
 *  which mutated `v` via both primitives; the swap to the single
 *  JIT call removes that surface entirely.)
 *
 *  Extras are stripped in the EMIT — declared members only ever
 *  reach the output. JSON-incompatible extras (bigint) that would
 *  crash a `JSON.stringify(prepareForJson(v))` chain silently
 *  disappear here. Pair with `createSafeJsonParse` for the matching
 *  round-trip.
 *
 *  Returns `undefined` for top-level `undefined` inputs (matches
 *  mion); for every other supported kind the result is a JSON
 *  string. **/
export type SafeJsonStringifyFn = (value: unknown) => string | undefined;

// Side-effect: register every compiled stringifyJson factory entry
// on jitUtils before any caller runs through createSafeJsonStringify.
initStringifyJsonCache(getJitUtils());

const stringifierCache = new Map<string, SafeJsonStringifyFn>();

/** Returns a safe JSON-stringify for `T`. Single JIT call into the
 *  ported `stringifyJson` family — no mutation, extras stripped at
 *  emit time. **/
export function createSafeJsonStringify<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): SafeJsonStringifyFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'createSafeJsonStringify(): no id injected. vite-plugin-runtypes must be active for createSafeJsonStringify to dispatch to a precompiled factory.'
    );
  }
  const cached = stringifierCache.get(id);
  if (cached) return cached;
  const stringifier = lookupStringifyFn(id);
  stringifierCache.set(id, stringifier);
  return stringifier;
}

/** Identity-fallback lookup for the stringifyJson JIT entry. **/
function lookupStringifyFn(id: string): SafeJsonStringifyFn {
  const entry = getJitUtils().getJIT('sj_' + id) as JitCompiledFn | undefined;
  if (entry) return entry.fn as SafeJsonStringifyFn;
  if (getJitUtils().hasRunType(id)) return (v) => JSON.stringify(v);
  throw new Error(
    `createSafeJsonStringify(): no stringifyJson JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a stringifier for that runtype.`
  );
}

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/stringifyJsonCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
    stringifierCache.clear();
  });
}
