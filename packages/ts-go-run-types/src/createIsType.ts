import {initCache as initIsTypeCache} from './caches/isTypeCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import type {JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';

/** Validator function returned by `createIsType<T>()`. Same shape as
 *  mion's `IsTypeFn` in run-types/src/types.ts. **/
export type IsTypeFn = (value: unknown) => boolean;

// Side-effect: the cache module's `initCache(jitUtils)` registers every
// compiled JitCompiledFn entry via `jitUtils.addToJitCache`. No local
// table is held here — every lookup goes through the jitUtils singleton,
// which is what makes HMR work cleanly (re-evaluating the cache module
// just rewrites entries on the same singleton).
initIsTypeCache(getJitUtils());

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
 *  reads the precompiled `JitCompiledFn` entry off jitUtils by raw
 *  hash and caches its `.fn` validator.
 *
 *  Throws when called without the plugin active (no `id` injected) or
 *  when jitUtils doesn't contain an entry for the expected hash —
 *  both indicate the build pipeline didn't wire correctly. **/
export async function createIsType<T>(id?: RuntypeId<T>): Promise<IsTypeFn> {
  if (id === undefined) {
    throw new Error(
      'createIsType(): no id injected. vite-plugin-runtypes must be active for createIsType to dispatch to a precompiled factory.'
    );
  }
  const cached = validatorCache.get(id);
  if (cached) return cached;
  const entry = getJitUtils().getJIT(id) as JitCompiledFn | undefined;
  if (!entry) {
    // Two cases produce a missing isType entry:
    //   1. The id IS a registered runtype but its emitIsType body
    //      collapsed to a noop (always-true kinds: `any`, `unknown`).
    //      The Go-side renderer skips emitting a factory whose body is
    //      just `return true`, so consumers default to a trivial
    //      passthrough validator here — see
    //      internal/caches/jitfn/istype.go Finalize + module.go
    //      renderEntry's `if isNoop { return "" }` skip.
    //   2. The id is not registered at all — wiring bug. Throw loudly.
    if (getJitUtils().hasRunType(id)) {
      const validator: IsTypeFn = () => true;
      validatorCache.set(id, validator);
      return validator;
    }
    throw new Error(
      `createIsType(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a validator for that runtype.`
    );
  }
  const validator = entry.fn as IsTypeFn;
  validatorCache.set(id, validator);
  return validator;
}

// HMR: when the isType cache module re-evaluates (because the plugin's
// handleHotUpdate invalidated it after a user-file change), re-register
// every entry against the live jitUtils. `initCache` is idempotent —
// `addToJitCache` overwrites by jitFnHash — so existing entries are
// safely refreshed and any new ones come online. The `validatorCache`
// here keeps its old entries; new types get new structural ids so the
// cache lookup for any new id misses → a fresh validator is built.
// In a production build `import.meta.hot` is statically undefined and
// Rollup tree-shakes the whole `if (hot)` block out.
type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/isTypeCache.ts', (newMod) => {
    newMod?.initCache?.(getJitUtils());
  });
}
