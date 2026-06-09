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
import {initCache as initFormatTransformCache} from './caches/formatTransformCache.ts';
import {getRTUtils, isRunTypeSchema} from './runtypes/rtUtils.ts';
import type {AnyFn, RunType} from './runtypes/types.ts';
import type {DataOnly} from './runtypes/dataOnly.ts';
import type {CompTimeFnArgs, InjectTypeFnArgs} from './index.ts';

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

/** Validator function returned by `createIsType<T>()`. The type guard narrows
 *  to `DataOnly<T>` — the serialisable projection of `T` the validator actually
 *  enforces (non-data members like functions / methods / symbols are silently
 *  dropped from the validated shape; see CLAUDE.md "isType contract"). `T`
 *  defaults to `unknown` so the bare `IsTypeFn` alias (`DataOnly<unknown>` ≡
 *  `unknown`) stays a plain `(value) => boolean`-shaped guard for the cache
 *  typedefs that don't carry a source type. **/
export type IsTypeFn<T = unknown> = (value: unknown) => value is DataOnly<T>;

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

/** Caller-controlled `strategy` for `createJsonEncoder<T>()`. The walk mode:
 *
 *  - `'clone'` (default): walk the type and build a NEW value from the declared
 *    shape (`{a: v.a, b: prepareForJson(v.b)}`, never `{...v}`), then hand to
 *    native `JSON.stringify`. Because the clone is built from the type shape,
 *    undeclared keys are dropped by construction — a clone is stripped for free,
 *    so there is no separate "strip" variant. Non-mutating.
 *  - `'mutate'`: transform leaves in place (no clone allocation), then
 *    `JSON.stringify`. Mutates the input and PRESERVES undeclared keys on the wire.
 *  - `'direct'`: single-pass `stringifyJson` RT. Never mutates, no clone
 *    allocation, slower on non-trivial shapes; always strips undeclared keys.
 */
export type JsonEncoderStrategy = 'clone' | 'mutate' | 'direct';
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
initFormatTransformCache(_utils);
// Binary cache init lives in `./createBinary.ts` so binary cache modules
// don't get pulled into bundles that never reference the binary encoder/decoder.

// =============================================================================
// Private generic factories
// =============================================================================

/** Resolves the per-(id, fnId) closure for a createX factory routed through the
 *  InjectTypeFnArgs marker. The plugin injects a `[typeId, fnId]` tuple at the
 *  trailing slot; this reads it and resolves `fnId + '_' + typeId` directly —
 *  the fnId already encodes the family (+ IsTypeOptions variant for it/te, e.g.
 *  `it`, `itNL`), so no key is recomputed here (this replaces the old
 *  `buildVariantKey` round-trip). Slot 0 (`val`) may be a value-first schema
 *  whose runtime `.id` overrides the injected typeId (correct even for recursive
 *  schemas); the fnId still comes from the injected tuple. `fallbackPrefix` is
 *  the bare family tag used defensively when no tuple/fnId is present. **/
function resolveTupleEntry<F extends AnyFn>(
  fnName: string,
  fallbackPrefix: string,
  identityFn: F,
  val: unknown,
  args: unknown
): F {
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
  const key = (fnId ?? fallbackPrefix) + '_' + effectiveId;
  const entry = utils.getRT(key);
  if (entry) return entry.fn as F;
  if (utils.hasRunType(effectiveId)) return identityFn;
  throw new Error(
    `${fnName}(): no RTCompiledFn entry for "${key}" in rtUtils. The build pipeline didn't emit a factory for that runtype.`
  );
}

/** Returns the per-(id, fnId) closure for an option-carrying createX factory
 *  (`createIsType` / `createGetTypeErrors`, 3-arg `(val, options, args)`). The
 *  injected `[typeId, fnId]` tuple sits at the trailing slot; options @slot1 are
 *  baked into the fnId at build time so the runtime ignores them. **/
function createTypeFnArgsFunction<F extends AnyFn>(
  fnName: string,
  fallbackPrefix: string,
  identityFn: F
): (val?: unknown, options?: unknown, args?: unknown) => F {
  return (val, _options, args) => resolveTupleEntry(fnName, fallbackPrefix, identityFn, val, args);
}

/** Returns the per-(id, fnId) closure for a leaf family that does NOT honour
 *  `IsTypeOptions` — every non-validator factory (`createHasUnknownKeys`,
 *  `createStripUnknownKeys`, `createUnknownKeyErrors`,
 *  `createUnknownKeysToUndefined`, `createFormatTransform`). The injected
 *  `[typeId, fnId]` tuple sits at slot 1; the fnId is the plain family tag (no
 *  variant axis). Slot 0 may be a value-first schema (`createStripUnknownKeys(rt)`)
 *  whose `.id` overrides the injected typeId. **/
function createRTFunction<F extends AnyFn>(fnName: string, prefix: string, identityFn: F): (val?: unknown, args?: unknown) => F {
  return (val, args) => resolveTupleEntry(fnName, prefix, identityFn, val, args);
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
export const createIsType = createTypeFnArgsFunction<IsTypeFn>(
  'createIsType',
  'it',
  // The runtime fallback is a plain `() => true`; `IsTypeFn` is now a type
  // guard, so cast through `unknown` (a direct cast is rejected — a boolean fn
  // doesn't structurally overlap a type predicate).
  (() => true) as unknown as IsTypeFn
) as unknown as (<T>(
  schema: RunType<T>,
  options?: CompTimeFnArgs<IsTypeOptions>,
  id?: InjectTypeFnArgs<T, 'it'>
) => IsTypeFn<T>) &
  (<T>(val?: T, options?: CompTimeFnArgs<IsTypeOptions>, id?: InjectTypeFnArgs<T, 'it'>) => IsTypeFn<T>);

export const createGetTypeErrors = createTypeFnArgsFunction<GetTypeErrorsFn>(
  'createGetTypeErrors',
  'te',
  getTypeErrorsIdentity
) as unknown as (<T>(
  schema: RunType<T>,
  options?: CompTimeFnArgs<IsTypeOptions>,
  id?: InjectTypeFnArgs<T, 'te'>
) => GetTypeErrorsFn) &
  (<T>(val?: T, options?: CompTimeFnArgs<IsTypeOptions>, id?: InjectTypeFnArgs<T, 'te'>) => GetTypeErrorsFn);

// IsTypeOptions does not affect these families' validators — the
// options bag is exclusive to `createIsType` / `createGetTypeErrors`.
// Leaving the slot here would let callers pass values that the Go
// emitter silently ignores; dropping it surfaces the limitation at
// the type-checker level.

export const createHasUnknownKeys = createRTFunction<HasUnknownKeysFn>(
  'createHasUnknownKeys',
  'huk',
  () => false
) as unknown as (<T>(schema: RunType<T>, id?: InjectTypeFnArgs<T, 'huk'>) => HasUnknownKeysFn) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'huk'>) => HasUnknownKeysFn);

export const createStripUnknownKeys = createRTFunction<StripUnknownKeysFn>(
  'createStripUnknownKeys',
  'suk',
  identityValueFn
) as unknown as (<T>(schema: RunType<T>, id?: InjectTypeFnArgs<T, 'suk'>) => StripUnknownKeysFn) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'suk'>) => StripUnknownKeysFn);

export const createUnknownKeyErrors = createRTFunction<UnknownKeyErrorsFn>(
  'createUnknownKeyErrors',
  'uke',
  unknownKeyErrorsIdentity
) as unknown as (<T>(schema: RunType<T>, id?: InjectTypeFnArgs<T, 'uke'>) => UnknownKeyErrorsFn) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'uke'>) => UnknownKeyErrorsFn);

export const createUnknownKeysToUndefined = createRTFunction<UnknownKeysToUndefinedFn>(
  'createUnknownKeysToUndefined',
  'uku',
  identityValueFn
) as unknown as (<T>(schema: RunType<T>, id?: InjectTypeFnArgs<T, 'uku'>) => UnknownKeysToUndefinedFn) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'uku'>) => UnknownKeysToUndefinedFn);

// createFormatTransform returns a `(value) => transformedValue` for `T`. Identity
// fallback covers both noop-format types and the no-plugin case.
export const createFormatTransform = createRTFunction<FormatTransformFn<unknown>>(
  'createFormatTransform',
  'fmt',
  identityValueFn
) as unknown as (<T>(schema: RunType<T>, id?: InjectTypeFnArgs<T, 'fmt'>) => FormatTransformFn<T>) &
  (<T>(val?: T, id?: InjectTypeFnArgs<T, 'fmt'>) => FormatTransformFn<T>);

// =============================================================================
// JSON encode / decode — the only two public JSON entry functions.
//
// Composition moved to the Go backend (Slice 4): the plugin emits one composite
// cache entry per (typeId, strategy) — keyed by the strategy's opaque composite
// fnHash — that wraps the underlying RT primitives (prepareForJson /
// stringifyJson / unknownKeysToUndefined / restoreFromJson / ukuWire) with
// native JSON. So both factories collapse to the same pure `resolveTupleEntry`
// lookup as binary: the injected `[typeId, fnId]` tuple's `fnId` is the composite
// fnHash, and the runtime just resolves `<fnId>_<typeId>`. No runtime strategy
// branching, no per-primitive `lookupRTFn` composition.
// =============================================================================

const jsonStringifyFallback: JsonEncoderFn = (v) => JSON.stringify(v);
const jsonParseFallback: JsonDecoderFn = (s) => JSON.parse(s);

/** Returns a JSON encoder for `T`. Default `strategy: 'clone'`. See
 *  `JsonEncoderStrategy` for the full matrix. Accepts either a value-first
 *  schema (`createJsonEncoder(rt)`) or the value/static form.
 *
 *  The trailing slot is the `InjectTypeFnArgs` marker — the plugin injects a
 *  `[typeId, fnId]` tuple where `fnId` IS the composite fnHash the backend
 *  computed from the comptime-resolved `strategy`. The runtime resolves that
 *  composite entry directly; the fallback (`JSON.stringify`) covers the
 *  no-plugin case. **/
export function createJsonEncoder<T>(
  schema: RunType<T>,
  options?: CompTimeFnArgs<JsonEncoderOptions>,
  id?: InjectTypeFnArgs<T, 'jsonEncoder'>
): JsonEncoderFn;
export function createJsonEncoder<T>(
  val?: T,
  options?: CompTimeFnArgs<JsonEncoderOptions>,
  id?: InjectTypeFnArgs<T, 'jsonEncoder'>
): JsonEncoderFn;
export function createJsonEncoder<T>(
  valOrSchema?: T | RunType<T>,
  options?: CompTimeFnArgs<JsonEncoderOptions>,
  id?: InjectTypeFnArgs<T, 'jsonEncoder'>
): JsonEncoderFn {
  return resolveTupleEntry<JsonEncoderFn>('createJsonEncoder', '', jsonStringifyFallback, valOrSchema, id);
}

/** Returns a JSON decoder for `T`. Default `strategy: 'strip'` — undeclared
 *  properties become `undefined` before restore walks the declared shape.
 *  Accepts either a value-first schema (`createJsonDecoder(rt)`) or the
 *  value/static form.
 *
 *  As with the encoder, the trailing `InjectTypeFnArgs` slot carries the
 *  `[typeId, fnId]` tuple whose `fnId` is the composite fnHash; the runtime
 *  resolves that entry directly. The fallback (`JSON.parse`) covers the
 *  no-plugin case. **/
export function createJsonDecoder<T>(
  schema: RunType<T>,
  options?: CompTimeFnArgs<JsonDecoderOptions>,
  id?: InjectTypeFnArgs<T, 'jsonDecoder'>
): JsonDecoderFn<DataOnly<T>>;
export function createJsonDecoder<T>(
  val?: T,
  options?: CompTimeFnArgs<JsonDecoderOptions>,
  id?: InjectTypeFnArgs<T, 'jsonDecoder'>
): JsonDecoderFn<DataOnly<T>>;
export function createJsonDecoder<T>(
  valOrSchema?: T | RunType<T>,
  options?: CompTimeFnArgs<JsonDecoderOptions>,
  id?: InjectTypeFnArgs<T, 'jsonDecoder'>
): JsonDecoderFn<DataOnly<T>> {
  // A decoded value is reconstructed from JSON, so it only ever holds
  // serialisable data — the return is the data-only projection `DataOnly<T>`
  // (identity on clean DTOs). Runtime is unchanged; this is the type boundary.
  return resolveTupleEntry<JsonDecoderFn<DataOnly<T>>>(
    'createJsonDecoder',
    '',
    jsonParseFallback as JsonDecoderFn<DataOnly<T>>,
    valOrSchema,
    id
  );
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
  hot.accept('./caches/formatTransformCache.ts', (m) => m?.initCache?.(getRTUtils()));
}
