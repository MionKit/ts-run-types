// Home for every RT-backed factory exported by this package. Each
// `createXxx<T>()` is a thin wrapper over the private `createRTFunction`
// generic; only the cache-key prefix, identity fallback, and return type
// vary per family. The rtUtils singleton is the only cache.

import {initCache as initIsTypeCache} from './caches/isTypeCache.ts';
import {initCache as initGetTypeErrorsCache} from './caches/getTypeErrorsCache.ts';
import {initCache as initHasUnknownKeysCache} from './caches/hasUnknownKeysCache.ts';
import {initCache as initStripUnknownKeysCache} from './caches/stripUnknownKeysCache.ts';
import {initCache as initUnknownKeyErrorsCache} from './caches/unknownKeyErrorsCache.ts';
import {initCache as initUnknownKeysToUndefinedCache} from './caches/unknownKeysToUndefinedCache.ts';
import {initCache as initUnknownKeysToUndefinedWireCache} from './caches/unknownKeysToUndefinedWireCache.ts';
import {initCache as initPrepareForJsonCache} from './caches/prepareForJsonCache.ts';
import {initCache as initRestoreFromJsonCache} from './caches/restoreFromJsonCache.ts';
import {initCache as initStringifyJsonCache} from './caches/stringifyJsonCache.ts';
import {initCache as initPrepareForJsonSafeCache} from './caches/prepareForJsonSafeCache.ts';
import {initCache as initPrepareForJsonSafePreserveCache} from './caches/prepareForJsonSafePreserveCache.ts';
import {initCache as initFormatTransformCache} from './caches/formatTransformCache.ts';
import {buildVariantKey, getRTUtils, isRunTypeSchema, lookupRTFn} from './runtypes/rtUtils.ts';
import type {AnyFn, RunType} from './runtypes/types.ts';
import type {CompTimeArgs, InjectRunTypeId} from './index.ts';

// =============================================================================
// Type definitions
// =============================================================================

/** Subset of mion's RunTypeOptions that parameterises the generated
 *  `isType` / `getTypeErrors` validators (NOT a property of the type itself).
 *  Pass an OBJECT LITERAL at the call site — the Go-side marker scanner reads
 *  the values at build time and routes the call to a per-option variant of
 *  the validator factory (same structural type id, distinct function id). **/
export interface IsTypeOptions {
  /** Literal validators degrade to their base-type check
   *  (`literal 'a'` → any string, `literal 2` → any finite number). **/
  noLiterals?: boolean;
  /** Skip the leading `Array.isArray(v)` guard on array validators.
   *  The variant cache key changes (e.g. `it_<id>` → `itNA_<id>`) so
   *  the same type id can serve both the guarded and unguarded factory. **/
  noIsArrayCheck?: boolean;
}

/** Validator function returned by `createIsType<T>()`. **/
export type IsTypeFn = (value: unknown) => boolean;

/** Mirror of mion's RunTypeError shape. Map / Set emitters add
 *  `{key, index, failed: 'mapKey' | 'mapValue'}` path segments. **/
export type RunTypeErrorPathSegment = string | number | object;

/** Format-specific error detail attached to a RunTypeError when a
 *  TypeFormat constraint (pattern, length, version, …) fails. `name`
 *  is the format name (e.g. 'stringFormat', 'uuid'); `formatPath`
 *  locates the failing param; `val` is the param value/marker. **/
export interface TypeFormatError {
  name: string;
  val: RunTypeErrorPathSegment | boolean | bigint | (RunTypeErrorPathSegment | boolean | bigint)[];
  formatPath: (string | number)[];
}

export interface RunTypeError {
  path: RunTypeErrorPathSegment[];
  expected: string;
  /** Present when a TypeFormat constraint failed (emitted via cpf_formatErr). */
  format?: TypeFormatError;
}

/** Validator returned by `createGetTypeErrors<T>()`. Caller-optional `path`
 *  and `errors` slots so the validator can be chained or pre-seeded. **/
export type GetTypeErrorsFn = (value: unknown, path?: RunTypeErrorPathSegment[], errors?: RunTypeError[]) => RunTypeError[];

/** Options bag for HasUnknownKeysFn. When `checkNonRTProps` is true the
 *  known-keys list expands to include children the RT skipped. **/
export interface HasUnknownKeysOptions {
  checkNonRTProps?: boolean;
}

/** Predicate returned by `createHasUnknownKeys<T>()`. **/
export type HasUnknownKeysFn = (value: unknown, options?: HasUnknownKeysOptions) => boolean;

/** Mutator returned by `createStripUnknownKeys<T>()`. Deletes properties
 *  not declared in the schema and returns the same value reference. **/
export type StripUnknownKeysFn = (value: unknown) => unknown;

/** Validator returned by `createUnknownKeyErrors<T>()`. Each unknown key
 *  produces one `{path, expected: 'never'}` entry. **/
export type UnknownKeyErrorsFn = (value: unknown, path?: RunTypeErrorPathSegment[], errors?: RunTypeError[]) => RunTypeError[];

/** Mutator returned by `createUnknownKeysToUndefined<T>()`. Sets every
 *  unknown property to `undefined` instead of removing it. **/
export type UnknownKeysToUndefinedFn = (value: unknown) => unknown;

/** FormatTransformValue<T> reduces a type to the plain runtime value the format
 *  transform operates on: TypeFormat brands collapse to their base
 *  (string formats → `string`), nested objects / arrays recurse. The
 *  brand exists only at the type level (erased at runtime), so callers
 *  pass and receive plain data — `createFormatTransform<FormatLowercase>()` is
 *  `(value: string) => string`, not a branded-in/branded-out fn. **/
export type FormatTransformValue<T> = T extends string
  ? string
  : T extends number
    ? number
    : T extends boolean
      ? boolean
      : T extends readonly (infer E)[]
        ? FormatTransformValue<E>[]
        : T extends object
          ? {[K in keyof T]: FormatTransformValue<T[K]>}
          : T;

/** Transform function returned by `createFormatTransform<T>()`. Applies the value
 *  mutations declared by any TypeFormat in `T` (string trim / lowercase /
 *  uppercase / capitalize; domain / ip / url lowercasing) and returns the
 *  transformed value. Identity when `T` carries no transforming format. **/
export type FormatTransformFn<T> = (value: FormatTransformValue<T>) => FormatTransformValue<T>;

// Internal RT-primitive signatures consumed by the JSON encoder/decoder.
export type PrepareForJsonFn = (value: unknown) => unknown;
export type RestoreFromJsonFn = (value: unknown) => unknown;
export type StringifyJsonFn = (value: unknown) => string | undefined;

/** Stringifier returned by `createJsonEncoder<T>()`. Returns the JSON string,
 *  OR `undefined` for top-level `undefined` inputs (matches `JSON.stringify`). **/
export type JsonEncoderFn = (value: unknown) => string | undefined;

/** Parse function returned by `createJsonDecoder<T>()`. **/
export type JsonDecoderFn<T = unknown> = (serialized: string) => T;

/** Caller-controlled `strategy` for `createJsonEncoder<T>()`. One enum folds the
 *  walk mode and whether undeclared keys are stripped:
 *
 *  - `'stripClone'` (default): walk the type, build a new value dropping
 *    undeclared keys, hand to native `JSON.stringify`. Non-mutating.
 *  - `'clone'`: same clone walk, but undeclared keys are PRESERVED on the wire.
 *  - `'stripMutate'`: transform leaves in place dropping undeclared keys, then
 *    `JSON.stringify`. Mutates the input, no clone allocation.
 *  - `'mutate'`: same in-place transform, undeclared keys PRESERVED.
 *  - `'direct'`: single-pass `stringifyJson` RT. Never mutates, no clone
 *    allocation, slower on non-trivial shapes; always strips undeclared keys.
 */
export type JsonEncoderStrategy = 'clone' | 'stripClone' | 'mutate' | 'stripMutate' | 'direct';
export type JsonEncoderOptions = {strategy?: JsonEncoderStrategy};

/** Caller-controlled `strategy` for `createJsonDecoder<T>()`. The decoder always
 *  allocates fresh via `JSON.parse`, so the only axis is undeclared keys:
 *  `'strip'` (default) sets them to `undefined` before restore walks the
 *  declared shape; `'preserve'` passes them through untouched. **/
export type JsonDecoderStrategy = 'strip' | 'preserve';
export type JsonDecoderOptions = {strategy?: JsonDecoderStrategy};

// =============================================================================
// Cache bootstrap
// =============================================================================
// initCache is idempotent (addToRTCache overwrites by rtFnHash), so HMR can
// safely re-run any of these. Each call only registers entries; fn closures
// are built lazily by materializeRTFn on first getRT() lookup.

const _utils = getRTUtils();
initIsTypeCache(_utils);
initGetTypeErrorsCache(_utils);
initHasUnknownKeysCache(_utils);
initStripUnknownKeysCache(_utils);
initUnknownKeyErrorsCache(_utils);
initUnknownKeysToUndefinedCache(_utils);
initUnknownKeysToUndefinedWireCache(_utils);
initPrepareForJsonCache(_utils);
initRestoreFromJsonCache(_utils);
initStringifyJsonCache(_utils);
initPrepareForJsonSafeCache(_utils);
initPrepareForJsonSafePreserveCache(_utils);
initFormatTransformCache(_utils);
// Binary cache init lives in `./createBinary.ts` so binary cache modules
// don't get pulled into bundles that never reference the binary encoder/decoder.

// =============================================================================
// Private generic factories
// =============================================================================

/** Resolves the per-id closure for `prefix + variantSuffix + '_' + id`,
 *  shared by both `createRTFunction` shapes below. Falls back to
 *  `identityFn` when the runtype is registered but its Go-side
 *  factory collapsed to a noop; throws when the runtype is missing
 *  entirely. **/
function resolveRTEntry<F extends AnyFn>(
  fnName: string,
  prefix: string,
  identityFn: F,
  id: string | undefined,
  options: Record<string, unknown> | undefined
): F {
  if (id === undefined) {
    throw new Error(
      `${fnName}(): no id injected. vite-plugin-runtypes must be active for ${fnName} to dispatch to a precompiled factory.`
    );
  }
  const utils = getRTUtils();
  const key = buildVariantKey(prefix, id, options);
  const entry = utils.getRT(key);
  if (entry) return entry.fn as F;
  if (utils.hasRunType(id)) return identityFn;
  throw new Error(
    `${fnName}(): no RTCompiledFn entry for "${key}" in rtUtils. The build pipeline didn't emit a factory for that runtype.`
  );
}

/** Returns the per-id closure for a family that honours `IsTypeOptions`
 *  — currently `createIsType` and `createGetTypeErrors`. The `options`
 *  slot drives the variant cache-key suffix so the same structural id
 *  can serve multiple factories (plain `it_<id>`, `itNL_<id>`,
 *  `itNA_<id>`, …). **/
function createRTFunctionWithOptions<F extends AnyFn>(
  fnName: string,
  prefix: string,
  identityFn: F
): (val?: unknown, options?: unknown, id?: string) => F {
  return (val, options, id) => {
    // SCHEMA overload (`createIsType(rt)`): dispatch on the schema's runtime
    // `.id` (the value-first builder's structural id) rather than the injected
    // id. For a non-recursive schema the two coincide (convergence), but the
    // injected id is reflected from the inferred `T`, which can diverge into a
    // broken factory for a RECURSIVE schema; the builder's `.id` is always the
    // correct, emitted entry. The value/static forms pass a non-RunType `val`
    // (or undefined) and fall through to the injected id.
    const effectiveId = isRunTypeSchema(val) ? val.id : id;
    return resolveRTEntry(fnName, prefix, identityFn, effectiveId, options as Record<string, unknown> | undefined);
  };
}

/** Returns the per-id closure for a family that does NOT honour
 *  `IsTypeOptions` — every non-validator factory (`createHasUnknownKeys`,
 *  `createStripUnknownKeys`, `createUnknownKeyErrors`,
 *  `createUnknownKeysToUndefined`, `createFormatTransform`). The injected id
 *  sits at slot 1; the cache key is the plain `<prefix>_<id>`. Slot 0 may be a
 *  value-first schema (`createStripUnknownKeys(rt)`) — see the dispatch note in
 *  `createRTFunctionWithOptions`. **/
function createRTFunction<F extends AnyFn>(fnName: string, prefix: string, identityFn: F): (val?: unknown, id?: string) => F {
  return (val, id) => {
    // SCHEMA overload: a value-first RunType in slot 0 carries the correct
    // structural `.id` (right even for recursive schemas); the value/static
    // forms pass a non-RunType `val` and fall through to the injected id.
    const effectiveId = isRunTypeSchema(val) ? val.id : id;
    return resolveRTEntry(fnName, prefix, identityFn, effectiveId, undefined);
  };
}

// =============================================================================
// Standard family wrappers.
//
// The trailing `as unknown as <T>(...) => Fn` cast restores the generic <T>
// signature the Go-side marker scanner reads to identify call sites. <T>
// only exists at the type-checker layer and is erased before execution.
// =============================================================================

const identityValueFn = (v: unknown) => v;
const getTypeErrorsIdentity: GetTypeErrorsFn = () => [];
const unknownKeyErrorsIdentity: UnknownKeyErrorsFn = () => [];

// Two overloads, schema form FIRST (TS resolves intersected call signatures
// top-to-bottom, and a `RunType<T>` arg must be tried before the `val?: T`
// reflection form, which would otherwise absorb it as `T = RunType<…>`):
//   - SCHEMA form `createIsType(rt)` — a value-first builder schema. `T` is
//     inferred from `rt: RunType<T>` and reflected off the trailing
//     `InjectRunTypeId<T>`, exactly like the type/value forms. No `schema.id`
//     read, no ref-tracing — the call IS the injection site.
//   - VALUE / static form `createIsType<T>()` / `createIsType(value)`.
// Both share the runtime impl (`val`/`schema` @slot0 ignored, options @slot1,
// injected id @slot2).
export const createIsType = createRTFunctionWithOptions<IsTypeFn>('createIsType', 'it', () => true) as unknown as (<T>(
  schema: RunType<T>,
  options?: CompTimeArgs<IsTypeOptions>,
  id?: InjectRunTypeId<T>
) => IsTypeFn) &
  (<T>(val?: T, options?: CompTimeArgs<IsTypeOptions>, id?: InjectRunTypeId<T>) => IsTypeFn);

export const createGetTypeErrors = createRTFunctionWithOptions<GetTypeErrorsFn>(
  'createGetTypeErrors',
  'te',
  getTypeErrorsIdentity
) as unknown as (<T>(schema: RunType<T>, options?: CompTimeArgs<IsTypeOptions>, id?: InjectRunTypeId<T>) => GetTypeErrorsFn) &
  (<T>(val?: T, options?: CompTimeArgs<IsTypeOptions>, id?: InjectRunTypeId<T>) => GetTypeErrorsFn);

// IsTypeOptions does not affect these families' validators — the
// options bag is exclusive to `createIsType` / `createGetTypeErrors`.
// Leaving the slot here would let callers pass values that the Go
// emitter silently ignores; dropping it surfaces the limitation at
// the type-checker level.

export const createHasUnknownKeys = createRTFunction<HasUnknownKeysFn>(
  'createHasUnknownKeys',
  'huk',
  () => false
) as unknown as (<T>(schema: RunType<T>, id?: InjectRunTypeId<T>) => HasUnknownKeysFn) &
  (<T>(val?: T, id?: InjectRunTypeId<T>) => HasUnknownKeysFn);

export const createStripUnknownKeys = createRTFunction<StripUnknownKeysFn>(
  'createStripUnknownKeys',
  'suk',
  identityValueFn
) as unknown as (<T>(schema: RunType<T>, id?: InjectRunTypeId<T>) => StripUnknownKeysFn) &
  (<T>(val?: T, id?: InjectRunTypeId<T>) => StripUnknownKeysFn);

export const createUnknownKeyErrors = createRTFunction<UnknownKeyErrorsFn>(
  'createUnknownKeyErrors',
  'uke',
  unknownKeyErrorsIdentity
) as unknown as (<T>(schema: RunType<T>, id?: InjectRunTypeId<T>) => UnknownKeyErrorsFn) &
  (<T>(val?: T, id?: InjectRunTypeId<T>) => UnknownKeyErrorsFn);

export const createUnknownKeysToUndefined = createRTFunction<UnknownKeysToUndefinedFn>(
  'createUnknownKeysToUndefined',
  'uku',
  identityValueFn
) as unknown as (<T>(schema: RunType<T>, id?: InjectRunTypeId<T>) => UnknownKeysToUndefinedFn) &
  (<T>(val?: T, id?: InjectRunTypeId<T>) => UnknownKeysToUndefinedFn);

// createFormatTransform returns a `(value) => transformedValue` for `T`. Identity
// fallback covers both noop-format types and the no-plugin case.
export const createFormatTransform = createRTFunction<FormatTransformFn<unknown>>(
  'createFormatTransform',
  'fmt',
  identityValueFn
) as unknown as (<T>(schema: RunType<T>, id?: InjectRunTypeId<T>) => FormatTransformFn<T>) &
  (<T>(val?: T, id?: InjectRunTypeId<T>) => FormatTransformFn<T>);

// =============================================================================
// JSON encode / decode — the only two public JSON entry functions.
//
// Each composes one or two underlying RT primitives based on the runtime
// `strategy`. The `strategy` is NOT folded into the typeid, so every encoder
// shape against the same `T` shares one type id; the runtime picks the right
// family (`sj` / `pj` / `pjs` / `pjsp` + optional `uku` compose) from it.
// =============================================================================

const jsonStringifyFallback: JsonEncoderFn = (v) => JSON.stringify(v);

/** Returns a JSON encoder for `T`. Default `strategy: 'stripClone'`. See
 *  `JsonEncoderStrategy` for the full matrix. Accepts either a value-first
 *  schema (`createJsonEncoder(rt)`) or the value/static form. **/
export function createJsonEncoder<T>(
  schema: RunType<T>,
  options?: CompTimeArgs<JsonEncoderOptions>,
  id?: InjectRunTypeId<T>
): JsonEncoderFn;
export function createJsonEncoder<T>(val?: T, options?: CompTimeArgs<JsonEncoderOptions>, id?: InjectRunTypeId<T>): JsonEncoderFn;
export function createJsonEncoder<T>(
  valOrSchema?: T | RunType<T>,
  options?: CompTimeArgs<JsonEncoderOptions>,
  id?: InjectRunTypeId<T>
): JsonEncoderFn {
  const effectiveId = isRunTypeSchema(valOrSchema) ? valOrSchema.id : id;
  if (effectiveId === undefined) {
    throw new Error(
      'createJsonEncoder(): no id injected. vite-plugin-runtypes must be active for createJsonEncoder to dispatch to a precompiled factory.'
    );
  }
  const strategy = options?.strategy ?? 'stripClone';

  if (strategy === 'direct') {
    return lookupRTFn<JsonEncoderFn>('createJsonEncoder', 'sj', effectiveId, jsonStringifyFallback);
  }

  // clone strategies — non-mutating. `pjs` strips undeclared keys; `pjsp` is the
  // same clone codegen with a `...v` spread so undeclared keys survive.
  if (strategy === 'stripClone') {
    const prepareSafeFn = lookupRTFn<PrepareForJsonFn>('createJsonEncoder', 'pjs', effectiveId, identityValueFn);
    return (value) => JSON.stringify(prepareSafeFn(value));
  }
  if (strategy === 'clone') {
    const prepareSafePreserveFn = lookupRTFn<PrepareForJsonFn>('createJsonEncoder', 'pjsp', effectiveId, identityValueFn);
    return (value) => JSON.stringify(prepareSafePreserveFn(value));
  }

  // mutate strategies — transform declared leaves in place.
  const prepareFn = lookupRTFn<PrepareForJsonFn>('createJsonEncoder', 'pj', effectiveId, identityValueFn);
  if (strategy === 'mutate') {
    return (value) => JSON.stringify(prepareFn(value));
  }
  // stripMutate: uku sets undeclared keys to undefined, pj transforms declared
  // leaves, then JSON.stringify skips undefined-valued keys naturally.
  const ukuFn = lookupRTFn<UnknownKeysToUndefinedFn>('createJsonEncoder', 'uku', effectiveId, identityValueFn);
  return (value) => {
    ukuFn(value);
    return JSON.stringify(prepareFn(value));
  };
}

/** Returns a JSON decoder for `T`. Default `strategy: 'strip'` — undeclared
 *  properties become `undefined` before restore walks the declared shape.
 *  Accepts either a value-first schema (`createJsonDecoder(rt)`) or the
 *  value/static form. **/
export function createJsonDecoder<T>(
  schema: RunType<T>,
  options?: CompTimeArgs<JsonDecoderOptions>,
  id?: InjectRunTypeId<T>
): JsonDecoderFn<T>;
export function createJsonDecoder<T>(
  val?: T,
  options?: CompTimeArgs<JsonDecoderOptions>,
  id?: InjectRunTypeId<T>
): JsonDecoderFn<T>;
export function createJsonDecoder<T>(
  valOrSchema?: T | RunType<T>,
  options?: CompTimeArgs<JsonDecoderOptions>,
  id?: InjectRunTypeId<T>
): JsonDecoderFn<T> {
  const effectiveId = isRunTypeSchema(valOrSchema) ? valOrSchema.id : id;
  if (effectiveId === undefined) {
    throw new Error(
      'createJsonDecoder(): no id injected. vite-plugin-runtypes must be active for createJsonDecoder to dispatch to a precompiled factory.'
    );
  }
  const strategy = options?.strategy ?? 'strip';
  const restoreFn = lookupRTFn<RestoreFromJsonFn>('createJsonDecoder', 'rj', effectiveId, identityValueFn);
  if (strategy === 'preserve') {
    return (serialized) => restoreFn(JSON.parse(serialized)) as T;
  }
  // strip — ukuWire (not public uku): union-arm emit reaches into the flat-union
  // wire wrapper `[-1, mergedObject]` instead of corrupting its `0`/`1` indices.
  const ukuFn = lookupRTFn<UnknownKeysToUndefinedFn>('createJsonDecoder', 'ukuw', effectiveId, identityValueFn);
  return (serialized) => restoreFn(ukuFn(JSON.parse(serialized))) as T;
}

// =============================================================================
// HMR — refresh the RT registry whenever any cache module re-evaluates.
// Tree-shaken at bundle time. Binary HMR lives in `./createBinary.ts`.
// =============================================================================

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/isTypeCache.ts', (m) => m?.initCache?.(getRTUtils()));
  hot.accept('./caches/getTypeErrorsCache.ts', (m) => m?.initCache?.(getRTUtils()));
  hot.accept('./caches/hasUnknownKeysCache.ts', (m) => m?.initCache?.(getRTUtils()));
  hot.accept('./caches/stripUnknownKeysCache.ts', (m) => m?.initCache?.(getRTUtils()));
  hot.accept('./caches/unknownKeyErrorsCache.ts', (m) => m?.initCache?.(getRTUtils()));
  hot.accept('./caches/unknownKeysToUndefinedCache.ts', (m) => m?.initCache?.(getRTUtils()));
  hot.accept('./caches/unknownKeysToUndefinedWireCache.ts', (m) => m?.initCache?.(getRTUtils()));
  hot.accept('./caches/prepareForJsonCache.ts', (m) => m?.initCache?.(getRTUtils()));
  hot.accept('./caches/restoreFromJsonCache.ts', (m) => m?.initCache?.(getRTUtils()));
  hot.accept('./caches/stringifyJsonCache.ts', (m) => m?.initCache?.(getRTUtils()));
  hot.accept('./caches/prepareForJsonSafeCache.ts', (m) => m?.initCache?.(getRTUtils()));
  hot.accept('./caches/prepareForJsonSafePreserveCache.ts', (m) => m?.initCache?.(getRTUtils()));
  hot.accept('./caches/formatTransformCache.ts', (m) => m?.initCache?.(getRTUtils()));
}
