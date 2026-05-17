import {initCache as initGetTypeErrorsCache} from './caches/getTypeErrorsCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import {buildFactoryFromCode} from './jit/restoreJitFns.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';
import type {RunTypeOptions} from './createIsType.ts';

/** Mirror of mion's RunTypeError shape
 *  (mion-run-types:packages/core/src/types/general.types.ts). Path
 *  segments are `string | number` for normal accessors; Map / Set
 *  emitters add object segments of the shape
 *  `{key, index, failed: 'mapKey' | 'mapValue'}` per mion's
 *  `getStaticPathLiteral` — segments are JSON-serializable but not
 *  always primitive, so the array type allows `object`.
 *  `expected` is mion's ReflectionKindName string (e.g. 'string',
 *  'objectLiteral', 'tuple'). The `format` field mion's full type
 *  ships with is intentionally NOT surfaced here — format validation
 *  is out of scope for the v1 port. **/
export type RunTypeErrorPathSegment = string | number | object;
export interface RunTypeError {
  path: RunTypeErrorPathSegment[];
  expected: string;
}

/** Validator function returned by `createGetTypeErrors<T>()`. Mirrors
 *  mion's `getTypeErrors` jit signature — caller-optional `path` and
 *  `errors` slots so the validator can be chained / pre-seeded.
 *  Default behaviour with no extra args matches what mion's
 *  createJitFunction(typeErrors) returns. **/
export type GetTypeErrorsFn = (value: unknown, path?: RunTypeErrorPathSegment[], errors?: RunTypeError[]) => RunTypeError[];

// Side-effect: the cache module's `initCache(jitUtils)` registers every
// compiled JitCompiledFn entry via `jitUtils.addToJitCache`. Mirrors
// createIsType.ts's bootstrap — no local table, every lookup goes through
// the jitUtils singleton so HMR refreshes cleanly.
initGetTypeErrorsCache(getJitUtils());

// Validator cache keyed by runtype id. Two `createGetTypeErrors<T>()`
// calls for the same T share one validator instance — reference-equality
// lets consumers memoize on the returned function.
const validatorCache = new Map<string, GetTypeErrorsFn>();

/** Returns a typeErrors validator for `T`.
 *
 *  Two equivalent call shapes:
 *    - Static  : `createGetTypeErrors<T>()` — caller supplies `T` explicitly.
 *    - Reflect : `const v: T = …; createGetTypeErrors(v)` — `T` is inferred
 *                from the value's declared static type. The value itself
 *                is discarded at runtime; only the type checker uses it
 *                to infer `T`. Same dispatch as `createIsType`.
 *
 *  At compile time `vite-plugin-runtypes` rewrites every call site to
 *  inject the trailing `RuntypeId<T>` hash. Sync — the validator is
 *  materialised at cache-init time (when the typeErrors cache module
 *  is evaluated), so there is no async work on the hot path.
 *
 *  Throws when called without the plugin active (no `id` injected) or
 *  when jitUtils doesn't contain an entry for the expected hash. **/
export function createGetTypeErrors<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): GetTypeErrorsFn {
  void val; // runtime-ignored; only used by type-checker to infer T
  void options; // runtime-ignored; baked into id at compile time
  if (id === undefined) {
    throw new Error(
      'createGetTypeErrors(): no id injected. vite-plugin-runtypes must be active for createGetTypeErrors to dispatch to a precompiled factory.'
    );
  }
  const cached = validatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('te_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    // Same fallback semantics as createIsType: registered runtypes with
    // no factory (noop-collapsed body, e.g. `any` / `unknown`) get a
    // trivial passthrough that reports zero errors. The Go renderer
    // skips emitting factories whose body collapses to `return er`.
    if (getJitUtils().hasRunType(id)) {
      const validator: GetTypeErrorsFn = () => [];
      validatorCache.set(id, validator);
      return validator;
    }
    throw new Error(
      `createGetTypeErrors(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a validator for that runtype.`
    );
  }
  const validator = entry.fn as GetTypeErrorsFn;
  validatorCache.set(id, validator);
  return validator;
}

// Deserialize-path companion cache — same role as createIsType's
// `deserializedValidatorCache`. Rebuilds the validator from the
// serialized `JitCompiledFnData.code` string via
// `new Function('utl', code)(jitUtils)`, exercising the over-the-wire
// reconstruction path.
const deserializedValidatorCache = new Map<string, GetTypeErrorsFn>();

/** Like `createGetTypeErrors<T>()`, but rebuilds the validator from the
 *  serialized `JitCompiledFnData.code` body via `new Function('utl',
 *  code)(jitUtils)` instead of reusing the cache module's already-
 *  materialised `entry.fn`. Mirrors deserializeIsType. **/
export function deserializeGetTypeErrors<T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>): GetTypeErrorsFn {
  void val;
  void options;
  if (id === undefined) {
    throw new Error(
      'deserializeGetTypeErrors(): no id injected. vite-plugin-runtypes must be active for deserializeGetTypeErrors to dispatch to a precompiled factory.'
    );
  }
  const cached = deserializedValidatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT('te_' + id) as JitCompiledFn | undefined;
  if (!entry) {
    if (getJitUtils().hasRunType(id)) {
      const validator: GetTypeErrorsFn = () => [];
      deserializedValidatorCache.set(id, validator);
      return validator;
    }
    throw new Error(
      `deserializeGetTypeErrors(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a validator for that runtype.`
    );
  }
  if (entry.isNoop) {
    // Noop entries carry no serializable code — fn was pre-set to the
    // family-specific identity by the cache module's init().
    const validator = entry.fn as GetTypeErrorsFn;
    deserializedValidatorCache.set(id, validator);
    return validator;
  }
  const factory = buildFactoryFromCode(entry.code);
  const validator = factory(getJitUtils()) as GetTypeErrorsFn;
  deserializedValidatorCache.set(id, validator);
  return validator;
}

// HMR: refresh the typeErrors registry whenever the cache module
// re-evaluates after a user-file change. Mirrors createIsType.ts's HMR
// block — production builds strip the `if (hot)` block at bundle time.
type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/getTypeErrorsCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
  });
}
