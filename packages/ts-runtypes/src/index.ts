// Public entry point for ts-runtypes.
export {
  type InjectRunTypeId,
  type InjectTypeFnArgs,
  type CompTimeArgs,
  type CompTimeFnArgs,
  type PureFunction,
  getRunTypeId,
} from './markers.ts';

// RT registry — exported BEFORE `./createRTFunctions.ts` so rtUtils is a
// real function by the time downstream cache modules call `initCache(getRTUtils())`
// at module top level through any ESM cycle.
export {getRTUtils, getRTFnCaches, type RTUtils} from './runtypes/rtUtils.ts';

// The generic runtime type node + the helper that recovers the source TS type
// a `RunType<T>` carries (`InferType<typeof schema>`). Both are part of the
// value-first surface: builders return `RunType<T>`, `InferType` maps back.
export {type RunType} from './runtypes/types.ts';
// `getRunType` is the value-bearing twin of `getRunTypeId` — same two call
// shapes, but returns the traversable RunType<T> node instead of its id string.
// Exported after getRTUtils so the registry is initialised first.
export {getRunType} from './getRunType.ts';
export {type DataOnly} from './runtypes/dataOnly.ts';
export {type InferType} from './schema/static.ts';

// AI enrichment — type-keyed, committed maps validated against `T` at scan time
// (see docs/AI_ENRICHMENT.md). `FriendlyText<T>` combines labels + error
// templates; `MockData<T>` carries sample pools/ranges feeding `createMockData`.
export {
  type FriendlyText,
  type FriendlyNode,
  type FriendlyMeta,
  type ErrorTemplates,
  type FriendlyTemplate,
  type PluralCategory,
  type PluralTemplate,
  type TemplateLeaf,
} from './enrich/friendlyText.ts';
import type {FriendlyText} from './enrich/friendlyText.ts';
/** @deprecated Renamed to `FriendlyText`. This alias is kept for one release; migrate `FriendlyType<T>` → `FriendlyText<T>`. */
export type FriendlyType<T> = FriendlyText<T>;
export {type MockData, type MockNode} from './enrich/mockData.ts';
// Pure-data runtime: render `getValidationErrors` output into human messages.
// `createFriendlyTextI18n` is the locale-selecting wrapper over the same walk: the
// source map is the source language + terminal fallback, translations are
// same-tree per-locale consts, plurals select via Intl.PluralRules, and
// `$[val]` renders type-driven (an isCurrency-marked bound via the app-supplied
// `currency` option, date-family bounds via Intl.DateTimeFormat).
export {
  createFriendlyText,
  createFriendlyTextI18n,
  resolveLocale,
  type FriendlyMessage,
  type FriendlyRenderer,
  type FriendlyI18nOptions,
} from './enrich/createFriendlyText.ts';

// Run-type registration is per-entry now: each marker call site imports its
// type's virtual entry module and registers it (plus transitive children) on
// first use — there is no monolithic cache module to populate up front.

// `pureFn.ts` MUST evaluate before any cache factory that references pure-fn
// helpers (e.g. validationErrors needs `rt::newRunTypeErr`).
export {registerPureFnFactory, type PureFnId} from './runtypes/pureFn.ts';
// Side-effect import: the `rt::` built-in pure fns (newRunTypeErr,
// getUnknownKeysFromArray, …) register at their own registerPureFnFactory
// call sites now — there is no monolithic pureFnsCache module delivering
// their bodies — so the package entry MUST load the registration file
// before any materialised factory calls utl.getPureFn('rt::…').
import './runtypes/pure-fns-utils.ts';

// Custom class serializer registry — register a class (with an optional
// serialize/deserialize handler) so the JSON + binary families rebuild a real
// instance instead of decoding to a plain object. See classSerializerRegistry.ts.
export {
  registerClassSerializer,
  type ClassSerializerHandler,
  type AnyClass,
  type SerializableClass,
  type DeserializeClassFn,
} from './runtypes/classSerializerRegistry.ts';

// Type-format base machinery — the per-format types live under
// `src/formats/` (the `ts-runtypes/formats` subpath); the
// brand alias + the mock registry sit here at the root so the format
// modules can import them without a self-referential barrel cycle.
// Validation is build-time (Go); the runtime only needs the per-kind
// mock registry.
export {type TypeFormat, type TypeFormatBase, type TypeFormatParams} from './runtypes/typeFormat.ts';
export {type FormatAnnotation} from './runtypes/formatAnnotation.ts';
export {registerMockingFunction, type MockFormatFn} from './mocking/mockRegistry.ts';
export {registerFormatPattern, type FormatPattern, type StringPatternArgs} from './runtypes/formatPattern.ts';
// Reflection-kind enum mirror. Re-exported so concrete formats under
// `src/formats/` can declare `readonly kind = RunTypeKind.string`
// without importing the internal module path.
export {RunTypeKind, type RunTypeKindValue} from './runTypeKind.ts';

// String JSON I/O is `createJsonEncoder` + `createJsonDecoder`; the VALUE-level
// pair `createPrepareForJson` + `createRestoreFromJson` (what those build on) is
// public for frameworks that own their own JSON envelope. The remaining
// primitives (stringifyJson / prepareForJsonSafe / the compact + unknown-keys
// wire helpers) stay internal.
export {
  // createValidate / createGetValidationErrors are overloaded: a value-first `RunType`
  // schema as the first arg (the value a `define` builder returns) is a distinct
  // overload from the type/value reflection form — both reflect `T`.
  createValidate,
  type ValidateFn,
  type ValidateOptions,
  createGetValidationErrors,
  type GetValidationErrorsFn,
  type RTValidationError,
  type TypeFormatError,
  type RTValidationErrorPathSegment,
  type RTPathSegment,
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
  createPrepareForJson,
  type PrepareForJsonFn,
  createRestoreFromJson,
  type RestoreFromJsonFn,
} from './createRTFunctions.ts';

// Binary I/O re-exported from a dedicated module so bundlers can drop the
// binary subtree when consumers never reference either factory.
export {
  createBinaryEncoder,
  type BinaryEncoderFn,
  type BinaryEncoderSizeFn,
  type BinaryEncoderIntoFn,
  type BinaryEncoderOptions,
  createBinarySizer,
  type BinarySizerFn,
  createBinaryDecoder,
  type BinaryDecoderFn,
  type BinaryDecoderOptions,
  type ToBinaryFn,
  type FromBinaryFn,
} from './createRTFBinary.ts';

// Per-type custom function overrides — the WRITE side of the createX routing.
// Registers a custom pure function for one T; every createX<T>() then returns
// it. Declared after createRTFunctions / createRTFBinary so the Fn aliases they
// export are initialized first.
export {
  overrideValidate,
  overrideGetValidationErrors,
  overrideHasUnknownKeys,
  overrideStripUnknownKeys,
  overrideUnknownKeyErrors,
  overrideUnknownKeysToUndefined,
  overrideFormatTransform,
  overrideBinaryEncoder,
  overrideBinaryDecoder,
  overrideJsonEncoder,
  overrideJsonDecoder,
} from './overrideRTFunctions.ts';

// Mock-value generator re-exported from `./mocking/` so bundlers can drop the
// whole mock subtree when consumers don't reference `createMockData`.
export {createMockData} from './mocking/createMockData.ts';
export type {MockOptions, MockTypeFn, RunTypeMockOptions} from './mocking/mockTypes.ts';

// Standard Schema v1 adapter — re-exported from `./standard/` so bundlers can
// drop the adapter subtree when consumers never call createStandardSchema. The
// StandardSchemaV1 interface is copied in (./standard/spec.ts) to preserve the
// package's zero-runtime-dependency posture.
export {
  createStandardSchema,
  type RTStandardSchemaV1,
  type RTValidationResult,
  type RTValidationFailureResult,
} from './standard/createStandardSchema.ts';
export {runTypeErrorsToIssues, type IssueMappingOptions, type RTValidationIssue} from './standard/issueMapping.ts';
export {
  type StandardSchemaV1,
  type StandardSchemaProps,
  type StandardSchemaResult,
  type StandardSchemaSuccessResult,
  type StandardSchemaFailureResult,
  type StandardSchemaIssue,
  type StandardSchemaPathSegment,
  type StandardSchemaTypes,
  type StandardSchemaInferInput,
  type StandardSchemaInferOutput,
} from './standard/spec.ts';

// Circular-reference guard for the live-object families (validate /
// getValidationErrors / jsonEncode / binaryEncode). Opt-in and OFF by default;
// `setRejectCircularRefs(true)` arms it. The guard only engages for types whose
// graph can actually cycle (the resolver links the RunType graph for those).
export {
  setRejectCircularRefs,
  isRejectCircularRefsEnabled,
  CircularReferenceError,
  type CircularPath,
} from './runtypes/circular.ts';

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
