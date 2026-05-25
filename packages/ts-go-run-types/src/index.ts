// @mionjs/ts-go-run-types — the sentinel-marker primitives that opt a function
// into compile-time type-id injection by `vite-plugin-runtypes`.
//
// Any generic function whose trailing parameter is `id?: RuntypeId<T>` is
// scanned by the Go binary; every call site has the resolved hash id
// injected into that slot at build time. Users can wrap either helper
// below freely — declare the same trailing parameter on the wrapper and
// the transformer treats it identically.

/**
 * Sentinel marker. The `T` is a phantom type parameter used only by the
 * checker / transformer; at runtime a `RuntypeId<T>` is just a short
 * alphanumeric hash string assigned by the build step.
 *
 * The brand prevents stringly-typed APIs from accidentally satisfying the
 * marker. Without it, any `string` would be assignable to `RuntypeId<X>`,
 * which would defeat the type-safety story for callers reading ids back.
 */
export type RuntypeId<T> = string & {
  readonly __mionRuntypeBrand?: T;
};

/**
 * Static marker. Use when you have an explicit type and no runtime value:
 * `getRuntypeId<User>()`. The vite plugin rewrites the call to
 * `getRuntypeId<User>("<hash>")` — injecting the build-time-resolved id at
 * the trailing slot.
 *
 * Calling without the transformer active (i.e. without
 * `vite-plugin-runtypes` in the chain) throws: the helper depends on the
 * id being injected at compile time and has no way to compute one at
 * runtime in plain JS.
 */
export function getRuntypeId<T>(id?: RuntypeId<T>): RuntypeId<T> {
  if (id === undefined) {
    throw new Error('getRuntypeId(): no id injected. vite-plugin-runtypes must be active.');
  }
  return id;
}

/**
 * Reflection marker. Use when you have a runtime value and want `T`
 * inferred from it: `reflectRuntypeId(user)`. The vite plugin rewrites the
 * call to `reflectRuntypeId(user, "<hash>")`.
 *
 * Same runtime contract as `getRuntypeId`: throws if the transformer is
 * not active. The `value` is purely for type inference and is ignored at
 * runtime.
 */
export function reflectRuntypeId<T>(_value: T, id?: RuntypeId<T>): RuntypeId<T> {
  if (id === undefined) {
    throw new Error('reflectRuntypeId(): no id injected. vite-plugin-runtypes must be active.');
  }
  return id;
}

// JIT runtime registry — migrated from `@mionjs/core`. Consumers (currently
// `createIsType`) build a `JITUtils` via `getJitUtils()` and hand it to the
// cache modules' `initCache(jitUtils)` export, which registers every
// entry via the corresponding `add*` method on the jitUtils singleton.
//
// Exported BEFORE `./createIsType.ts` so the jit module's evaluation
// completes before createIsType.ts and pureFn.ts trigger their cache-
// module imports — those modules call `initCache(getJitUtils())` at
// module top level, and we want `getJitUtils` to be a real function by
// then through any ESM cycle.
export {getJitUtils, addAOTCaches, addSerializedJitCaches, getJitFnCaches, type JITUtils} from './jit/jitUtils.ts';

// Side-effect: populate the run-type registry from the precompiled cache
// module. Pulled in here so the registry is ready before any consumer
// queries it via `getJitUtils().getRunType(id)`. Idempotent — calling
// initCache again (e.g. after HMR) overwrites entries by id.
import {initCache as initRunTypesCache} from './caches/runTypesCache.ts';
import {getJitUtils as _getJitUtilsForInit} from './jit/jitUtils.ts';
initRunTypesCache(_getJitUtilsForInit());

// HMR: refresh the run-type registry whenever the cache module
// re-evaluates after a user-file change. Production builds strip the
// `if (hot)` block at bundle time.
type _HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const _hot = (import.meta as unknown as {hot?: _HMR}).hot;
if (_hot) {
  _hot.accept('./caches/runTypesCache.ts', (newMod) => {
    newMod?.initCache?.(_getJitUtilsForInit());
  });
}

export {
  flattenUnionDiscriminators,
  type DiscriminatorPropLike,
  type DiscriminatorUnionLike,
  type FlattenedDiscriminator,
} from './unionDiscriminator.ts';

// `pureFn.ts` MUST evaluate before any module whose cache factories
// reference pure-fn helpers (typeErrors needs `mion::newRunTypeErr`).
// Importing it before createIsType / createGetTypeErrors ensures the
// pure-fn registry is populated by the time their `initCache` runs the
// `createJitFn(jitUtils)` materialisation loop. Mirrors mion's
// constraint that pure-fns register at module load time (run-types/src/
// run-types-pure-fns.ts), not lazily.
export {registerPureFnFactory} from './jit/pureFn.ts';

// Public createXxx surface. JSON I/O collapses to exactly two entry
// functions — createJsonEncoder + createJsonDecoder. Each dispatches to
// one or two underlying JIT primitives based on the `mode` option
// (`'safe'` default vs `'unsafe'` fast path). The lower-level
// prepareForJson / restoreFromJson / stringifyJson primitives remain
// internal — the encoder/decoder pair is the only public JSON API.
//
// The deserialize-from-code test twins (`deserializeXxx`) are NOT part of
// the public API — they live under `test/util/deserializeJitFunctions.ts`
// and are only consumed by the validation/serialization test suites.
export {
  createIsType,
  type IsTypeFn,
  type RunTypeOptions,
  createGetTypeErrors,
  type GetTypeErrorsFn,
  type RunTypeError,
  type RunTypeErrorPathSegment,
  createHasUnknownKeys,
  type HasUnknownKeysFn,
  type HasUnknownKeysOptions,
  createStripUnknownKeys,
  type StripUnknownKeysFn,
  createUnknownKeyErrors,
  type UnknownKeyErrorsFn,
  createUnknownKeysToUndefined,
  type UnknownKeysToUndefinedFn,
  // JSON I/O.
  createJsonEncoder,
  type JsonEncoderFn,
  type JsonEncoderOptions,
  createJsonDecoder,
  type JsonDecoderFn,
  type JsonDecoderOptions,
} from './createJitFunctions.ts';
