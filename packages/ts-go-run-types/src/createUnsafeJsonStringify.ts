import {initCache as initPrepareForJsonCache} from './caches/prepareForJsonCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';
import type {RunTypeOptions} from './createIsType.ts';

/** Stringify function returned by `createUnsafeJsonStringify<T>()`.
 *  Composes `prepareForJson + JSON.stringify` — fast but extras-leaky:
 *    - **Mutates `v` in place** via prepareForJson's declared-children
 *      transforms (bigint → decimal string, symbol → "Symbol:<desc>", etc).
 *    - Extras (properties not in `T`) are never visited by prepareForJson;
 *      JSON.stringify then includes JSON-compatible extras unchanged,
 *      **throws** on bigint extras, and silently drops symbol-/function-
 *      valued extras per ECMAScript spec.
 *  Pair with `createUnsafeJsonParse` for the matching round-trip.
 *  Use the safe variants (`createSafeJsonStringify`) when callers may
 *  pass extras that include non-serialisable values. **/
export type UnsafeJsonStringifyFn = (value: unknown) => string;

initPrepareForJsonCache(getJitUtils());

const composedCache = new Map<string, UnsafeJsonStringifyFn>();

/** Returns an unsafe JSON-stringify for `T`. Mirrors mion's
 *  jsonHelpers.ts `createSerializationFns` serialize half (uses
 *  prepareForJson + JSON.stringify). Does NOT strip extras. **/
export function createUnsafeJsonStringify<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): UnsafeJsonStringifyFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'createUnsafeJsonStringify(): no id injected. vite-plugin-runtypes must be active for createUnsafeJsonStringify to dispatch to a precompiled factory.'
    );
  }
  const cached = composedCache.get(id);
  if (cached) return cached;
  const prepareFn = lookupPrepareFn(id);
  const composed: UnsafeJsonStringifyFn = (value) => JSON.stringify(prepareFn(value));
  composedCache.set(id, composed);
  return composed;
}

/** Looks up the prepareForJson JIT entry for `id`, with the same
 *  identity-fallback as `createPrepareForJson` — when the runtype is
 *  registered but no fn entry exists (atomic noops, unsupported
 *  shapes), returns an identity passthrough so the wrapper still
 *  composes to `JSON.stringify(v)`. **/
function lookupPrepareFn(id: string): (v: unknown) => unknown {
  const entry = getJitUtils().getJIT('pj_' + id) as JitCompiledFn | undefined;
  if (entry) return entry.fn as (v: unknown) => unknown;
  if (getJitUtils().hasRunType(id)) return (v) => v;
  throw new Error(
    `createUnsafeJsonStringify(): no prepareForJson JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a transformer for that runtype.`
  );
}

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/prepareForJsonCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
    composedCache.clear();
  });
}
