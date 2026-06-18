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
// a `RunType<T>` carries (`Static<typeof schema>`). Both are part of the
// value-first surface: builders return `RunType<T>`, `Static` maps back.
export {type RunType} from './runtypes/types.ts';
// `getRunType` is the value-bearing twin of `getRunTypeId` — same two call
// shapes, but returns the traversable RunType<T> node instead of its id string.
// Exported after getRTUtils so the registry is initialised first.
export {getRunType} from './getRunType.ts';
export {type DataOnly} from './runtypes/dataOnly.ts';
export {type Static} from './schema/static.ts';

// AI enrichment — type-keyed, committed maps validated against `T` at scan time
// (see docs/AI_ENRICHMENT.md). `FriendlyType<T>` combines labels + error
// templates; `MockData<T>` carries sample pools/ranges feeding `createMockType`.
export {
  type FriendlyType,
  type FriendlyNode,
  type FriendlyMeta,
  type ErrorTemplates,
  type FriendlyTemplate,
  type FailedConstraint,
  type FailedConstraints,
} from './enrich/friendlyType.ts';
export {type MockData, type MockNode} from './enrich/mockData.ts';
// Pure-data runtime: render `getValidationErrors` output into human messages.
export {createFriendly, type FriendlyMessage, type FriendlyRenderer} from './enrich/createFriendly.ts';

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

// Custom class serializer registry — register a serialize/deserialize pair
// for a user-defined class so the JSON + binary families route through it
// instead of the structural object emit. See classSerializerRegistry.ts.
export {registerClassSerializer, type ClassSerializer} from './runtypes/classSerializerRegistry.ts';

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

// JSON I/O collapses to `createJsonEncoder` + `createJsonDecoder`; the lower-
// level prepareForJson / restoreFromJson / stringifyJson primitives stay internal.
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
} from './createRTFBinary.ts';

// Mock-value generator re-exported from `./mocking/` so bundlers can drop the
// whole mock subtree when consumers don't reference `createMockType`.
export {createMockType} from './mocking/createMockType.ts';
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
