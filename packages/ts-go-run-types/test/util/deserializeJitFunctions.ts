// Test-only twins of the `createXxx` factories. Each `deserializeXxx<T>()`
// rebuilds its per-id closure from the serialized `JitCompiledFnData.code`
// string via `new Function('utl', code)(jitUtils)` on every call — the same
// reconstruction path `materializeJitFn` (in src/jit/jitUtils.ts) runs
// lazily on the first `getJIT(hash)` lookup for a production caller.
//
// Lives under test/util/ rather than src/ because production code has no
// reason to call these directly: cache modules auto-register entries on
// import and `materializeJitFn` builds `entry.fn` on demand, so the
// regular `createXxx` factories already return the deserialized closure
// transparently. The wrappers exist purely so the test suites can assert
// that each `entry.code` round-trips to an equivalent fn.
//
// Marker scanning works the same as for the production factories — the
// Vite plugin walks every call site whose resolved signature has a
// trailing `id?: InjectRuntypeId<T>` slot, regardless of where the function is
// declared. The vitest config's `tsconfig.test.json` puts `test/**` in the
// plugin's scan scope, so calls to `deserializeXxx<T>()` from test files
// get the same compile-time id injection that `createXxx<T>()` calls do.

import {
  getJitUtils,
  type InjectRuntypeId,
  type RunTypeOptions,
  type IsTypeFn,
  type GetTypeErrorsFn,
  type HasUnknownKeysFn,
  type StripUnknownKeysFn,
  type UnknownKeyErrorsFn,
  type UnknownKeysToUndefinedFn,
} from '@mionjs/ts-go-run-types';
// PrepareForJsonFn / RestoreFromJsonFn / StringifyJsonFn live in
// createJitFunctions.ts but are no longer re-exported from index.ts
// (the underlying primitives are internal to the createJsonEncoder /
// createJsonDecoder pair). Test helpers still need them to type the
// deserialize twins that exercise the per-primitive `entry.code`
// round-trip.
import type {PrepareForJsonFn, RestoreFromJsonFn, StringifyJsonFn} from '../../src/createJitFunctions.ts';
import {buildFactoryFromCode} from '../../src/jit/jitUtils.ts';
import type {AnyFn, JitCompiledFn} from '../../src/jit/types.ts';

/** Test-side mirror of the production `createJitFunction` generic. Rebuilds
 *  the per-id closure from `entry.code` on every call instead of reading
 *  the materialized `entry.fn` straight off jitUtils. Noop entries carry
 *  no code; they reuse the cache module's pre-populated `entry.fn`. **/
function deserializeJitFunction<F extends AnyFn>(
  fnName: string,
  prefix: string,
  identityFn: F
): (val?: unknown, options?: unknown, id?: string) => F {
  return (val, options, id) => {
    void val;
    void options;
    if (id === undefined) {
      throw new Error(
        `${fnName}(): no id injected. vite-plugin-runtypes must be active for ${fnName} to dispatch to a precompiled factory.`
      );
    }
    const utils = getJitUtils();
    const entry = utils.getJIT(prefix + '_' + id) as JitCompiledFn | undefined;
    if (!entry) {
      if (utils.hasRunType(id)) return identityFn;
      throw new Error(
        `${fnName}(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a factory for that runtype.`
      );
    }
    if (entry.isNoop) return entry.fn as F;
    return buildFactoryFromCode(entry.code)(utils) as F;
  };
}

const identityValueFn = (v: unknown) => v;
const getTypeErrorsIdentity: GetTypeErrorsFn = () => [];
const unknownKeyErrorsIdentity: UnknownKeyErrorsFn = () => [];
const stringifyJsonIdentity: StringifyJsonFn = (v) => JSON.stringify(v);

// The trailing `as unknown as <T>(...) => Fn` cast restores the generic <T>
// signature the Go-side marker scanner reads to identify call sites. The
// runtime function is a non-generic JS closure; <T> is type-checker-only.

export const deserializeIsType = deserializeJitFunction<IsTypeFn>('deserializeIsType', 'it', () => true) as unknown as <T>(
  val?: T,
  options?: RunTypeOptions,
  id?: InjectRuntypeId<T>
) => IsTypeFn;

export const deserializeGetTypeErrors = deserializeJitFunction<GetTypeErrorsFn>(
  'deserializeGetTypeErrors',
  'te',
  getTypeErrorsIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: InjectRuntypeId<T>) => GetTypeErrorsFn;

export const deserializeHasUnknownKeys = deserializeJitFunction<HasUnknownKeysFn>(
  'deserializeHasUnknownKeys',
  'huk',
  () => false
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: InjectRuntypeId<T>) => HasUnknownKeysFn;

export const deserializeStripUnknownKeys = deserializeJitFunction<StripUnknownKeysFn>(
  'deserializeStripUnknownKeys',
  'suk',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: InjectRuntypeId<T>) => StripUnknownKeysFn;

export const deserializeUnknownKeyErrors = deserializeJitFunction<UnknownKeyErrorsFn>(
  'deserializeUnknownKeyErrors',
  'uke',
  unknownKeyErrorsIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: InjectRuntypeId<T>) => UnknownKeyErrorsFn;

export const deserializeUnknownKeysToUndefined = deserializeJitFunction<UnknownKeysToUndefinedFn>(
  'deserializeUnknownKeysToUndefined',
  'uku',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: InjectRuntypeId<T>) => UnknownKeysToUndefinedFn;

export const deserializePrepareForJson = deserializeJitFunction<PrepareForJsonFn>(
  'deserializePrepareForJson',
  'pj',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: InjectRuntypeId<T>) => PrepareForJsonFn;

export const deserializeRestoreFromJson = deserializeJitFunction<RestoreFromJsonFn>(
  'deserializeRestoreFromJson',
  'rj',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: InjectRuntypeId<T>) => RestoreFromJsonFn;

export const deserializeStringifyJson = deserializeJitFunction<StringifyJsonFn>(
  'deserializeStringifyJson',
  'sj',
  stringifyJsonIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: InjectRuntypeId<T>) => StringifyJsonFn;
