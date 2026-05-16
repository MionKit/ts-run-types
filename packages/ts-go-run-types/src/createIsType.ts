import {initCache as initIsTypeCache} from 'virtual:runtypes-isType';
import {getJitUtils} from './jit/jitUtils.ts';
import type {RuntypeId} from './index.ts';

/** Validator function returned by `createIsType<T>()`. Same shape as
 *  mion's `IsTypeFn` in run-types/src/types.ts. **/
export type IsTypeFn = (value: unknown) => boolean;

// One-shot call to the virtual module's `initCache(jitUtils)` export.
// Materialises every JitCompiledFn entry against the supplied jitUtils,
// registers each via `jitUtils.addToJitCache`, and returns the
// module-local cache table keyed by raw `jitFnHash`. The legacy
// `get_isType_<hash>` factory prefix is no longer part of the cache
// key — entries are looked up by the canonical hash directly.
const cache = initIsTypeCache(getJitUtils()) as Record<string, {fn: IsTypeFn} | undefined>;

// Validator cache keyed by runtype id (the hash injected at compile
// time by vite-plugin-runtypes). Two `createIsType<T>()` calls for the
// same T share one validator instance — both because there's no point
// rebuilding the closure (its body is identical), and because
// reference-equality lets consumers memoize on the returned function.
const validatorCache = new Map<string, IsTypeFn>();

/** Returns a validator for `T`. Mirrors mion's contract from
 *  run-types/src/createRunTypeFunctions.ts:31
 *  (`createIsTypeFn<T>(): Promise<IsTypeFn>`). Async only for signature
 *  parity with mion — our AOT pipeline resolves synchronously.
 *
 *  At compile time `vite-plugin-runtypes` rewrites every call site to
 *  inject the trailing `RuntypeId<T>` hash, so the runtime path just
 *  reads the precompiled `JitCompiledFn` entry off the cache by raw
 *  hash and caches its `.fn` validator.
 *
 *  Throws when called without the plugin active (no `id` injected) or
 *  when the cache doesn't contain an entry for the expected hash —
 *  both indicate the build pipeline didn't wire correctly. **/
export async function createIsType<T>(id?: RuntypeId<T>): Promise<IsTypeFn> {
  if (id === undefined) {
    throw new Error(
      'createIsType(): no id injected. vite-plugin-runtypes must be active for createIsType to dispatch to a precompiled factory.'
    );
  }
  const cached = validatorCache.get(id);
  if (cached) return cached;
  const entry = cache[id];
  if (!entry) {
    throw new Error(
      `createIsType(): no entry for "${id}" in virtual:runtypes-isType. The build pipeline didn't emit a validator for that runtype.`
    );
  }
  const validator = entry.fn;
  validatorCache.set(id, validator);
  return validator;
}
