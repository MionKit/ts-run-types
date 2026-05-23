// Test-only twins of the `createXxx` factories. Each `deserializeXxx<T>()`
// rebuilds its per-id closure from the serialized `RTCompiledFnData.code`
// string via `new Function('utl', code)(rtUtils)` on every call — the same
// reconstruction path `materializeRTFn` (in src/runtypes/rtUtils.ts) runs
// lazily on the first `getRT(hash)` lookup for a production caller.
//
// Lives under test/util/ rather than src/ because production code has no
// reason to call these directly: cache modules auto-register entries on
// import and `materializeRTFn` builds `entry.fn` on demand, so the
// regular `createXxx` factories already return the deserialized closure
// transparently. The wrappers exist purely so the test suites can assert
// that each `entry.code` round-trips to an equivalent fn.
//
// Marker scanning works the same as for the production factories — the
// Vite plugin walks every call site whose resolved signature has a
// trailing `id?: InjectRunTypeId<T>` slot, regardless of where the function is
// declared. The vitest config's `tsconfig.test.json` puts `test/**` in the
// plugin's scan scope, so calls to `deserializeXxx<T>()` from test files
// get the same compile-time id injection that `createXxx<T>()` calls do.

import {
  getRTUtils,
  type InjectRunTypeId,
  type RunTypeOptions,
  type IsTypeFn,
  type GetTypeErrorsFn,
  type HasUnknownKeysFn,
  type StripUnknownKeysFn,
  type UnknownKeyErrorsFn,
  type UnknownKeysToUndefinedFn,
} from '@mionjs/ts-go-run-types';
// PrepareForJsonFn / RestoreFromJsonFn / StringifyJsonFn live in
// createRTFunctions.ts but are no longer re-exported from index.ts
// (the underlying primitives are internal to the createJsonEncoder /
// createJsonDecoder pair). Test helpers still need them to type the
// deserialize twins that exercise the per-primitive `entry.code`
// round-trip.
import type {PrepareForJsonFn, RestoreFromJsonFn, StringifyJsonFn} from '../../src/createRTFunctions.ts';
import {buildFactoryFromCode} from '../../src/runtypes/rtUtils.ts';
import type {AnyFn, RTCompiledFn} from '../../src/runtypes/types.ts';

/** Test-side mirror of the production `createRTFunction` generic. Rebuilds
 *  the per-id closure from `entry.code` on every call instead of reading
 *  the materialized `entry.fn` straight off rtUtils. Noop entries carry
 *  no code; they reuse the cache module's pre-populated `entry.fn`. **/
function deserializeRTFunction<F extends AnyFn>(
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
    const utils = getRTUtils();
    const entry = utils.getRT(prefix + '_' + id) as RTCompiledFn | undefined;
    if (!entry) {
      if (utils.hasRunType(id)) return identityFn;
      throw new Error(
        `${fnName}(): no RTCompiledFn entry for "${id}" in rtUtils. The build pipeline didn't emit a factory for that runtype.`
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

export const deserializeIsType = deserializeRTFunction<IsTypeFn>('deserializeIsType', 'it', () => true) as unknown as <T>(
  val?: T,
  options?: RunTypeOptions,
  id?: InjectRunTypeId<T>
) => IsTypeFn;

export const deserializeGetTypeErrors = deserializeRTFunction<GetTypeErrorsFn>(
  'deserializeGetTypeErrors',
  'te',
  getTypeErrorsIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: InjectRunTypeId<T>) => GetTypeErrorsFn;

export const deserializeHasUnknownKeys = deserializeRTFunction<HasUnknownKeysFn>(
  'deserializeHasUnknownKeys',
  'huk',
  () => false
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: InjectRunTypeId<T>) => HasUnknownKeysFn;

export const deserializeStripUnknownKeys = deserializeRTFunction<StripUnknownKeysFn>(
  'deserializeStripUnknownKeys',
  'suk',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: InjectRunTypeId<T>) => StripUnknownKeysFn;

export const deserializeUnknownKeyErrors = deserializeRTFunction<UnknownKeyErrorsFn>(
  'deserializeUnknownKeyErrors',
  'uke',
  unknownKeyErrorsIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: InjectRunTypeId<T>) => UnknownKeyErrorsFn;

export const deserializeUnknownKeysToUndefined = deserializeRTFunction<UnknownKeysToUndefinedFn>(
  'deserializeUnknownKeysToUndefined',
  'uku',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: InjectRunTypeId<T>) => UnknownKeysToUndefinedFn;

export const deserializePrepareForJson = deserializeRTFunction<PrepareForJsonFn>(
  'deserializePrepareForJson',
  'pj',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: InjectRunTypeId<T>) => PrepareForJsonFn;

export const deserializeRestoreFromJson = deserializeRTFunction<RestoreFromJsonFn>(
  'deserializeRestoreFromJson',
  'rj',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: InjectRunTypeId<T>) => RestoreFromJsonFn;

export const deserializeStringifyJson = deserializeRTFunction<StringifyJsonFn>(
  'deserializeStringifyJson',
  'sj',
  stringifyJsonIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: InjectRunTypeId<T>) => StringifyJsonFn;
