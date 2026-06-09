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
// trailing `id?: InjectTypeFnArgs<T, Fn>` slot, regardless of where the
// function is declared. The vitest config's `tsconfig.test.json` puts
// `test/**` in the plugin's scan scope, so calls to `deserializeXxx<T>()`
// from test files get the same compile-time `[typeId, fnHash]` tuple
// injection that `createXxx<T>()` calls do.
//
// HASHED-NAMING NOTE (Slice 4): the deserialize twins now route through the
// SAME `InjectTypeFnArgs<T, Fn>` marker as the production factories rather than
// the bare `InjectRunTypeId<T>` reflection marker. Pre-flip they reconstructed
// the variant cache-key suffix from the explicit `ValidateOptions` argument; with
// opaque fnHashes there is no runtime hashing, so they MUST read the precomputed
// fnHash the plugin injects (tuple[1]) — identical key derivation to
// `resolveTupleEntry`. The distinguishing behavior (rebuild from `entry.code`
// instead of reading the materialized `entry.fn`) is unchanged.

import {
  type InjectTypeFnArgs,
  type ValidateOptions,
  type ValidateFn,
  type GetValidationErrorsFn,
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
import {getRTUtils, isRunTypeSchema, buildFactoryFromCode} from '../../src/runtypes/rtUtils.ts';
import type {AnyFn, CompiledTypeFn} from '../../src/runtypes/types.ts';

/** Test-side mirror of the production `resolveTupleEntry`, but rebuilding the
 *  per-id closure from `entry.code` on every call instead of reading the
 *  materialized `entry.fn`. The plugin injects a `[typeId, fnHash]` tuple at the
 *  trailing slot; the key is `fnHash + '_' + typeId` — the fnHash already folds
 *  the ValidateOptions variant / strategy the build resolved, so nothing is
 *  recomputed here. Noop entries carry no code; they reuse the pre-populated
 *  `entry.fn`. **/
function resolveDeserializedEntry<F extends AnyFn>(fnName: string, identityFn: F, val: unknown, args: unknown): F {
  const tuple = args as [string, string] | undefined;
  const injectedId = tuple ? tuple[0] : undefined;
  const fnId = tuple ? tuple[1] : undefined;
  const effectiveId = isRunTypeSchema(val) ? val.id : injectedId;
  if (effectiveId === undefined) {
    throw new Error(
      `${fnName}(): no id injected. vite-plugin-runtypes must be active for ${fnName} to dispatch to a precompiled factory.`
    );
  }
  const utils = getRTUtils();
  const key = (fnId ?? '') + '_' + effectiveId;
  const entry = utils.getRT(key) as CompiledTypeFn | undefined;
  if (!entry) {
    if (utils.hasRunType(effectiveId)) return identityFn;
    throw new Error(
      `${fnName}(): no RTCompiledFn entry for "${key}" in rtUtils. The build pipeline didn't emit a factory for that runtype.`
    );
  }
  if (entry.isNoop) return entry.fn as F;
  return buildFactoryFromCode(entry.code)(utils) as F;
}

/** Three-arg deserialize wrapper for families that honour `ValidateOptions`
 *  (`deserializeValidate`, `deserializeGetValidationErrors`). The options bag is a
 *  compile-time arg folded into the injected fnHash; the runtime ignores it. **/
function deserializeRTFunctionWithOptions<F extends AnyFn>(
  fnName: string,
  identityFn: F
): (val?: unknown, options?: unknown, id?: unknown) => F {
  return (val, _options, id) => resolveDeserializedEntry(fnName, identityFn, val, id);
}

/** Two-arg deserialize wrapper for families that do NOT honour
 *  `ValidateOptions` — every non-validator family. **/
function deserializeRTFunction<F extends AnyFn>(fnName: string, identityFn: F): (val?: unknown, id?: unknown) => F {
  return (val, id) => resolveDeserializedEntry(fnName, identityFn, val, id);
}

const identityValueFn = (v: unknown) => v;
const getValidationErrorsIdentity: GetValidationErrorsFn = () => [];
const unknownKeyErrorsIdentity: UnknownKeyErrorsFn = () => [];
const stringifyJsonIdentity: StringifyJsonFn = (v) => JSON.stringify(v);

// The trailing `as unknown as <T>(...) => Fn` cast restores the generic <T>
// signature the Go-side marker scanner reads to identify call sites. The
// runtime function is a non-generic JS closure; <T> is type-checker-only.

export const deserializeValidate = deserializeRTFunctionWithOptions<ValidateFn>(
  'deserializeValidate',
  (_value): _value is unknown => true
) as unknown as <T>(val?: T, options?: ValidateOptions, id?: InjectTypeFnArgs<T, 'it'>) => ValidateFn;

export const deserializeGetValidationErrors = deserializeRTFunctionWithOptions<GetValidationErrorsFn>(
  'deserializeGetValidationErrors',
  getValidationErrorsIdentity
) as unknown as <T>(val?: T, options?: ValidateOptions, id?: InjectTypeFnArgs<T, 'te'>) => GetValidationErrorsFn;

export const deserializeHasUnknownKeys = deserializeRTFunction<HasUnknownKeysFn>(
  'deserializeHasUnknownKeys',
  () => false
) as unknown as <T>(val?: T, id?: InjectTypeFnArgs<T, 'huk'>) => HasUnknownKeysFn;

export const deserializeStripUnknownKeys = deserializeRTFunction<StripUnknownKeysFn>(
  'deserializeStripUnknownKeys',
  identityValueFn
) as unknown as <T>(val?: T, id?: InjectTypeFnArgs<T, 'suk'>) => StripUnknownKeysFn;

export const deserializeUnknownKeyErrors = deserializeRTFunction<UnknownKeyErrorsFn>(
  'deserializeUnknownKeyErrors',
  unknownKeyErrorsIdentity
) as unknown as <T>(val?: T, id?: InjectTypeFnArgs<T, 'uke'>) => UnknownKeyErrorsFn;

export const deserializeUnknownKeysToUndefined = deserializeRTFunction<UnknownKeysToUndefinedFn>(
  'deserializeUnknownKeysToUndefined',
  identityValueFn
) as unknown as <T>(val?: T, id?: InjectTypeFnArgs<T, 'uku'>) => UnknownKeysToUndefinedFn;

export const deserializePrepareForJson = deserializeRTFunction<PrepareForJsonFn>(
  'deserializePrepareForJson',
  identityValueFn
) as unknown as <T>(val?: T, id?: InjectTypeFnArgs<T, 'pj'>) => PrepareForJsonFn;

export const deserializeRestoreFromJson = deserializeRTFunction<RestoreFromJsonFn>(
  'deserializeRestoreFromJson',
  identityValueFn
) as unknown as <T>(val?: T, id?: InjectTypeFnArgs<T, 'rj'>) => RestoreFromJsonFn;

export const deserializeStringifyJson = deserializeRTFunction<StringifyJsonFn>(
  'deserializeStringifyJson',
  stringifyJsonIdentity
) as unknown as <T>(val?: T, id?: InjectTypeFnArgs<T, 'sj'>) => StringifyJsonFn;
