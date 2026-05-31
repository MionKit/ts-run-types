// Public entry point for @mionjs/ts-go-run-types.
export {type InjectRunTypeId, type CompTimeArgs, type PureFunction, getRunTypeId, reflectRunTypeId} from './markers.ts';

// RT registry — exported BEFORE `./createRTFunctions.ts` so rtUtils is a
// real function by the time downstream cache modules call `initCache(getRTUtils())`
// at module top level through any ESM cycle.
export {getRTUtils, getRTFnCaches, type RTUtils} from './runtypes/rtUtils.ts';

// The generic runtime type node + the helper that recovers the source TS type
// a `RunType<T>` carries (`Static<typeof schema>`). Both are part of the
// value-first surface: builders return `RunType<T>`, `Static` maps back.
export {type RunType} from './runtypes/types.ts';
export {type Static} from './schema/static.ts';

// Populate the run-type registry from the precompiled cache module before any
// consumer queries it. Idempotent — re-running overwrites entries by id.
import {initCache as initRunTypesCache} from './caches/runTypesCache.ts';
import {getRTUtils as _getRTUtilsForInit} from './runtypes/rtUtils.ts';
initRunTypesCache(_getRTUtilsForInit());

type _HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const _hot = (import.meta as unknown as {hot?: _HMR}).hot;
if (_hot) {
  _hot.accept('./caches/runTypesCache.ts', (newMod) => {
    newMod?.initCache?.(_getRTUtilsForInit());
  });
}

// `pureFn.ts` MUST evaluate before any cache factory that references pure-fn
// helpers (e.g. typeErrors needs `mion::newRunTypeErr`).
export {registerPureFnFactory} from './runtypes/pureFn.ts';

// Custom class serializer registry — register a serialize/deserialize pair
// for a user-defined class so the JSON + binary families route through it
// instead of the structural object emit. See classSerializerRegistry.ts.
export {registerClassSerializer, type ClassSerializer} from './runtypes/classSerializerRegistry.ts';

// Type-format base machinery — the per-format types live under
// `src/formats/` (the `@mionjs/ts-go-run-types/formats` subpath); the
// brand alias + the mock registry sit here at the root so the format
// modules can import them without a self-referential barrel cycle.
// Validation is build-time (Go); the runtime only needs the per-kind
// mock registry.
export {type TypeFormat, type TypeFormatBase, type TypeFormatParams} from './runtypes/typeFormat.ts';
export {type FormatAnnotation} from './runtypes/formatAnnotation.ts';
export {registerMockingFunction, type MockFormatFn} from './mocking/mockRegistry.ts';
export {
  registerFormatPattern,
  type FormatPattern,
  type FormatPatternArgs,
  type StringPatternArgs,
} from './runtypes/formatPattern.ts';
// Reflection-kind enum mirror. Re-exported so concrete formats under
// `src/formats/` can declare `readonly kind = RunTypeKind.string`
// without importing the internal module path.
export {RunTypeKind, type RunTypeKindValue} from './runTypeKind.ts';

// JSON I/O collapses to `createJsonEncoder` + `createJsonDecoder`; the lower-
// level prepareForJson / restoreFromJson / stringifyJson primitives stay internal.
export {
  // createIsType / createGetTypeErrors are overloaded: a value-first `RunType`
  // schema as the first arg (the value a `define` builder returns) is a distinct
  // overload from the type/value reflection form — both reflect `T`.
  createIsType,
  type IsTypeFn,
  type IsTypeOptions,
  createGetTypeErrors,
  type GetTypeErrorsFn,
  type RunTypeError,
  type TypeFormatError,
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
  createFormatTransform,
  type FormatTransformFn,
  createJsonEncoder,
  type JsonEncoderFn,
  type JsonEncoderOptions,
  createJsonDecoder,
  type JsonDecoderFn,
  type JsonDecoderOptions,
} from './createRTFunctions.ts';

// Binary I/O re-exported from a dedicated module so bundlers can drop the
// binary subtree when consumers never reference either factory.
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

// Mock-value generator re-exported from `./mocking/` so bundlers can drop the
// whole mock subtree when consumers don't reference `createMockType`.
export {createMockType} from './mocking/createMockType.ts';
export type {MockOptions, MockTypeFn, RunTypeMockOptions} from './mocking/mockTypes.ts';

// DataView helpers — exposed so consumers can pre-build a serializer /
// deserializer instance and pass it to the encoder / decoder for buffer reuse.
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
} from './runtypes/dataView.ts';
