// @mionjs/ts-go-run-types — the public entry point. The marker family
// (`InjectRuntypeId`, `getRuntypeId`, `reflectRuntypeId`, and the Phase
// 2/3 siblings) lives in `./markers.ts`; this module re-exports it so
// downstream consumers continue importing from the package root.
export {type InjectRuntypeId, getRuntypeId, reflectRuntypeId} from './markers.ts';

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

// Binary I/O — re-exported from a dedicated module so bundlers can
// drop the binary subtree (the two binary cache modules, the encoder /
// decoder closures, the DataView helper classes' binary use) when the
// consumer's code never references either factory. Binary is a niche
// feature (typed-array RPC, router-driven binary transport); JSON /
// validation users shouldn't pay for it.
export {
  createBinaryEncoder,
  type BinaryEncoderFn,
  type BinaryEncoderOptions,
  createBinaryDecoder,
  type BinaryDecoderFn,
  type BinaryDecoderOptions,
  type ToBinaryFn,
  type FromBinaryFn,
} from './createBinary.ts';

// Mock-value generator — re-exported from `./mocking/createMockType.ts`
// so bundlers can drop the entire mock subtree (the walker, atomic
// generators, constant pools) when consumers don't reference
// `createMockType`. Mock is a dev/test feature; production code
// shouldn't pay for it.
export {createMockType} from './mocking/createMockType.ts';
export type {MockOptions, MockTypeFn, RunTypeMockOptions} from './mocking/mockTypes.ts';

// DataView helpers — exposed so consumers can pre-build a serializer /
// deserializer instance and pass it to the encoder / decoder. Useful
// when reusing buffers across many encodes (avoids the per-call
// allocation). `setSerializationOptions` tunes the string-bytes cache
// and the adaptive buffer-sizing knobs at runtime.
export {
  createDataViewSerializer,
  createDataViewDeserializer,
  setSerializationOptions,
  type CreateSerializerOptions,
  type SerializationOptions,
  type DataViewSerializer,
  type DataViewDeserializer,
  type StrictArrayBuffer,
  type BinaryInput,
} from './jit/dataView.ts';
