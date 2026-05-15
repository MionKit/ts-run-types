import {install} from 'virtual:runtypes-isType';
import {getJitUtils} from './jit/jitUtils.ts';
import type {RuntypeId} from './index.ts';

/** Validator function returned by `createIsType<T>()`. Same shape as
 *  mion's `IsTypeFn` in run-types/src/types.ts. **/
export type IsTypeFn = (value: unknown) => boolean;

// Factory-name prefix for the isType virtual module's entries. Mirrors
// `CacheModules["isType"].VarPrefix` in internal/constants/constants.go,
// which is also surfaced via the generated TS constants file at
// packages/vite-plugin-runtypes/src/runtypes-constants.generated.ts.
// Hardcoded here so the marker package doesn't depend on the plugin
// package just to read this string — the value is stable and a drift
// would surface immediately as a "no factory for <hash>" runtime error.
const ISTYPE_FACTORY_PREFIX = 'get_isType_';

// One-shot call to the virtual module's `install` export. The Go-emitted
// module is pure: importing it does nothing on its own. `install(utl)`
// materializes every JitCompiledFn entry against the supplied utl,
// registers each via `utl.addToJitCache`, and returns the entries map
// keyed by `get_isType_<hash>`. We pin to this package's `jitUtils`
// singleton since the validators are local to this package's runtime.
const entries = install(getJitUtils()) as Record<string, {fn: IsTypeFn} | undefined>;

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
 *  reads the precompiled `JitCompiledFn` entry off the install-time
 *  entries map and caches its `.fn` validator.
 *
 *  Throws when called without the plugin active (no `id` injected) or
 *  when the install map doesn't contain an entry for the expected hash —
 *  both indicate the build pipeline didn't wire correctly. **/
export async function createIsType<T>(id?: RuntypeId<T>): Promise<IsTypeFn> {
  if (id === undefined) {
    throw new Error(
      'createIsType(): no id injected. vite-plugin-runtypes must be active for createIsType to dispatch to a precompiled factory.'
    );
  }
  const cached = validatorCache.get(id);
  if (cached) return cached;
  const factoryName = ISTYPE_FACTORY_PREFIX + id;
  const entry = entries[factoryName];
  if (!entry) {
    throw new Error(
      `createIsType(): no entry named "${factoryName}" in virtual:runtypes-isType. The build pipeline didn't emit a validator for runtype "${id}".`
    );
  }
  const validator = entry.fn;
  validatorCache.set(id, validator);
  return validator;
}
