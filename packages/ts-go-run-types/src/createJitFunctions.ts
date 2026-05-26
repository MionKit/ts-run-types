// Single home for every JIT-backed factory exported by this package.
//
// Each createXxx<T>() is a thin wrapper over the private `createJitFunction`
// generic. The only thing that varies per family is the cache-key prefix
// (`it`, `te`, `pj`, …), the identity fallback used when a runtype is
// registered but its factory collapsed to a noop, and the return type
// alias.
//
// No local Maps live here. The jitUtils singleton is the only cache —
// `getJIT(hash)` returns the entry, `materializeJitFn` populates
// `entry.fn` once, and every subsequent lookup reads the same slot.
//
// JSON I/O lives behind exactly two public entry functions:
// `createJsonEncoder` and `createJsonDecoder`. Each takes an `options`
// object with orthogonal axes (encoder: strategy + stripExtras;
// decoder: stripExtras only) that pick between compiled variants. The
// underlying JIT primitives (prepareForJson / restoreFromJson /
// stringifyJson / prepareForJsonSafe / prepareForJsonSafePreserve /
// unknownKeysToUndefined / ukuWire) are emitted by the Go side and
// looked up internally; consumers never call them directly.
//
// The deserialize-from-code test twins live under
// `test/util/deserializeJitFunctions.ts` — production callers never need
// them (`addSerializedJitCaches` already writes the rebuilt fn onto
// `entry.fn` on jitUtils), so they don't belong in the package's public
// surface.

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
import {initCache as initToBinaryCache} from './caches/toBinaryCache.ts';
import {initCache as initFromBinaryCache} from './caches/fromBinaryCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import {
  createDataViewSerializer,
  createDataViewDeserializer,
  type DataViewSerializer,
  type DataViewDeserializer,
  type StrictArrayBuffer,
  type BinaryInput,
} from './jit/dataView.ts';
import type {AnyFn, JitCompiledFn} from './jit/types.ts';
import type {RuntypeId} from './index.ts';

// =============================================================================
// Type definitions
// =============================================================================

/** Subset of mion's RunTypeOptions
 *  (mion-run-types:packages/run-types/src/types.ts:110-127) that
 *  affects atomic-type isType validation. Currently only `noLiterals`
 *  is plumbed end-to-end; the other fields are typed for forward
 *  compatibility with mion's full surface.
 *
 *  Pass an OBJECT LITERAL at the call site — the Go-side marker
 *  scanner extracts the option values at build time from the literal
 *  AST node and bakes them into the validator's hash. Identifier or
 *  spread expressions are ignored; if you need dynamic options the
 *  v2 plan is to surface a separate factory API. **/
export interface RunTypeOptions {
  /** When true, compiled literal validators degrade to their base-type
   *  check — `literal 'a'` accepts any string, `literal 2` accepts any
   *  finite number, etc. Mirrors mion's literal.ts:56-59 behavior. **/
  noLiterals?: boolean;
  /** When true and the type is an array, the compiled validator skips
   *  the leading `Array.isArray(v)` guard and iterates `v` directly —
   *  trades safety for speed when the caller has already verified the
   *  input is array-like. Mirrors mion's array.ts:emitIsType behavior
   *  under `comp.opts.noIsArrayCheck`. Folded into the validator's hash
   *  at build time so `string[]` and `string[] + {noIsArrayCheck:true}`
   *  resolve to distinct validators. **/
  noIsArrayCheck?: boolean;
  /** Reserved — see mion's RunTypeOptions. Not yet plumbed. **/
  strictTypes?: boolean;
}

/** Validator function returned by `createIsType<T>()`. **/
export type IsTypeFn = (value: unknown) => boolean;

/** Mirror of mion's RunTypeError shape. Path segments are
 *  `string | number` for normal accessors; Map / Set emitters add
 *  `{key, index, failed: 'mapKey' | 'mapValue'}` segments. **/
export type RunTypeErrorPathSegment = string | number | object;
export interface RunTypeError {
  path: RunTypeErrorPathSegment[];
  expected: string;
}

/** Validator function returned by `createGetTypeErrors<T>()`. Caller-
 *  optional `path` and `errors` slots so the validator can be chained
 *  or pre-seeded. **/
export type GetTypeErrorsFn = (value: unknown, path?: RunTypeErrorPathSegment[], errors?: RunTypeError[]) => RunTypeError[];

/** Options bag passed to a HasUnknownKeysFn at runtime. Mirrors mion's
 *  `runTimeOptions.checkNonJitProps` — when true, the known-keys list
 *  is expanded to include children the JIT skipped (static / function-
 *  typed properties). Defaults to false. **/
export interface HasUnknownKeysOptions {
  checkNonJitProps?: boolean;
}

/** Predicate returned by `createHasUnknownKeys<T>()`. **/
export type HasUnknownKeysFn = (value: unknown, options?: HasUnknownKeysOptions) => boolean;

/** Mutator returned by `createStripUnknownKeys<T>()`. Mutates the value
 *  by deleting any property not declared in the schema for `T`, then
 *  returns the same value reference. **/
export type StripUnknownKeysFn = (value: unknown) => unknown;

/** Validator returned by `createUnknownKeyErrors<T>()`. Same arg shape
 *  as createGetTypeErrors. Each unknown key produces one
 *  `{path, expected: 'never'}` entry. **/
export type UnknownKeyErrorsFn = (value: unknown, path?: RunTypeErrorPathSegment[], errors?: RunTypeError[]) => RunTypeError[];

/** Mutator returned by `createUnknownKeysToUndefined<T>()`. Sets every
 *  unknown property to `undefined` (instead of removing it). **/
export type UnknownKeysToUndefinedFn = (value: unknown) => unknown;

// Internal type aliases describing the underlying JIT-primitive
// signatures. These are referenced by createJsonEncoder /
// createJsonDecoder when composing closures, and by the test util's
// deserialize twins; they are NOT re-exported from `index.ts`.
export type PrepareForJsonFn = (value: unknown) => unknown;
export type RestoreFromJsonFn = (value: unknown) => unknown;
export type StringifyJsonFn = (value: unknown) => string | undefined;

/** Stringifier returned by `createJsonEncoder<T>()`. Returns the JSON
 *  string for `value`, OR `undefined` for top-level `undefined` inputs
 *  (matches `JSON.stringify` and the underlying `stringifyJson`
 *  primitive). Callers should handle the `undefined` return when the
 *  input type admits `undefined`. **/
export type JsonEncoderFn = (value: unknown) => string | undefined;

/** Parse function returned by `createJsonDecoder<T>()`. **/
export type JsonDecoderFn<T = unknown> = (serialized: string) => T;

/** Caller-controlled options for `createJsonEncoder<T>()`. Two
 *  orthogonal axes:
 *
 *  - `strategy`: how the encoder produces the output.
 *    - `'clone'` (default): walk the type, build a NEW value, hand to
 *      native `JSON.stringify`. Non-mutating. Allocates per nested
 *      object literal.
 *    - `'mutate'`: walk `v`, transform leaves in place, hand to
 *      native `JSON.stringify`. Mutates the input. No clone allocation.
 *    - `'direct'`: single-pass `stringifyJson` JIT — walks the type
 *      and builds the JSON string directly. Never mutates, no clone
 *      allocation, but slower than the native stringify path on
 *      non-trivial shapes. Always strips extras (the JIT walks the
 *      type, so it can't see undeclared keys).
 *
 *  - `stripExtras`: whether undeclared keys are removed from the
 *    output (defaults to `true`). For `strategy: 'direct'` this is
 *    pinned to `true` at the type level — passing `false` is a
 *    compile error.
 *
 *  Combinations:
 *
 *  | strategy | stripExtras | behaviour                                |
 *  |----------|-------------|-------------------------------------------|
 *  | clone    | true (def)  | clone + transform + strip (default)       |
 *  | clone    | false       | clone + transform + preserve extras       |
 *  | mutate   | true        | mutate + strip extras + transform         |
 *  | mutate   | false       | mutate + preserve extras + transform      |
 *  | direct   | true (only) | single-pass stringify, strips by walking  |
 */
export type JsonEncoderOptions = {strategy?: 'clone' | 'mutate'; stripExtras?: boolean} | {strategy: 'direct'};

// =============================================================================
// Binary I/O — types
// =============================================================================

/** Internal type alias for the toBinary JIT primitive. Writes bytes for
 *  `value` into `Ser`'s underlying buffer (mutates `Ser.index`) and
 *  returns the serializer instance so callers can chain `.getBuffer()`. **/
export type ToBinaryFn = (value: unknown, Ser: DataViewSerializer) => DataViewSerializer;

/** Internal type alias for the fromBinary JIT primitive. Reads bytes
 *  from `Des` (advancing `Des.index`) and returns the reconstructed
 *  value. The first arg is the value slot — passed as `undefined` by
 *  the caller; the inner body assigns + returns it. **/
export type FromBinaryFn<T = unknown> = (ret: unknown, Des: DataViewDeserializer) => T;

/** Encoder returned by `createBinaryEncoder<T>()`. Writes the value's
 *  bytes into the supplied serializer and returns the trimmed
 *  ArrayBuffer ready to ship over the wire / persist to disk. **/
export type BinaryEncoderFn = (value: unknown, serializer?: DataViewSerializer) => StrictArrayBuffer;

/** Decoder returned by `createBinaryDecoder<T>()`. Reads bytes from the
 *  supplied buffer / deserializer and returns the reconstructed value.
 *  Accepts either a raw `StrictArrayBuffer` (the encoder's output) or
 *  a pre-built `DataViewDeserializer`. **/
export type BinaryDecoderFn<T = unknown> = (input: BinaryInput | DataViewDeserializer) => T;

/** Caller-controlled options for `createBinaryEncoder<T>()`. Reserved
 *  for future extension (e.g. routeId, buffer-size hints). **/
export interface BinaryEncoderOptions {
  /** Identifier for the encoder's auto-allocated buffer. Defaults to
   *  `'binary'`. Surfaces in error messages and is preserved on the
   *  serializer instance. **/
  routeId?: string;
}

/** Caller-controlled options for `createBinaryDecoder<T>()`. Reserved
 *  for future extension. **/
export interface BinaryDecoderOptions {
  /** Identifier for the decoder. Defaults to `'binary'`. **/
  routeId?: string;
}

/** Caller-controlled options for `createJsonDecoder<T>()`. The decoder
 *  always allocates fresh via `JSON.parse`, so there's no
 *  clone-vs-mutate axis — only the strip knob applies.
 *
 *  `stripExtras` (default `true`): undeclared properties on the parsed
 *  wire value are set to `undefined` (closing the safety hole when the
 *  encoder didn't strip them — e.g. an unsafe-encoded payload). `false`:
 *  undeclared properties pass through untouched. **/
export interface JsonDecoderOptions {
  stripExtras?: boolean;
}

// =============================================================================
// Cache bootstrap — register every JIT family on the jitUtils singleton.
// initCache is idempotent (addToJitCache overwrites by jitFnHash), so HMR
// can safely re-run any of these on cache-module re-eval. Each call only
// registers entries; the actual fn closures are built lazily by
// materializeJitFn on first getJIT() lookup, which keeps cross-family
// dependencies happy regardless of registration order.
// =============================================================================

const _utils = getJitUtils();
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
initToBinaryCache(_utils);
initFromBinaryCache(_utils);

// =============================================================================
// Private generic factories
// =============================================================================

/** Production-path generic. Returns the per-id closure for the given
 *  family by looking up `<prefix>_<id>` on the jitUtils singleton.
 *  Falls back to `identityFn` when the runtype is registered but the
 *  Go-side emit collapsed the factory to a noop. Throws otherwise. **/
function createJitFunction<F extends AnyFn>(
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
    if (entry) return entry.fn as F;
    if (utils.hasRunType(id)) return identityFn;
    throw new Error(
      `${fnName}(): no JitCompiledFn entry for "${id}" in jitUtils. The build pipeline didn't emit a factory for that runtype.`
    );
  };
}

/** Shared lookup helper for composite wrappers. Same fallback semantics
 *  as `createJitFunction` but returns the fn directly so callers can
 *  compose it with sibling lookups. **/
function lookupJitFn<F extends AnyFn>(callerName: string, prefix: string, id: string, identityFn: F): F {
  const utils = getJitUtils();
  const entry = utils.getJIT(prefix + '_' + id) as JitCompiledFn | undefined;
  if (entry) return entry.fn as F;
  if (utils.hasRunType(id)) return identityFn;
  throw new Error(
    `${callerName}(): no JitCompiledFn entry for "${prefix}_${id}" in jitUtils. The build pipeline didn't emit a factory for that runtype.`
  );
}

// =============================================================================
// Standard family wrappers.
//
// The trailing `as unknown as <T>(...) => Fn` cast restores the generic <T>
// signature the Go-side marker scanner reads to identify call sites. The
// runtime function is a non-generic JS closure; <T> only ever exists at the
// type-checker layer and is erased before execution.
// =============================================================================

const identityValueFn = (v: unknown) => v;
const getTypeErrorsIdentity: GetTypeErrorsFn = () => [];
const unknownKeyErrorsIdentity: UnknownKeyErrorsFn = () => [];

export const createIsType = createJitFunction<IsTypeFn>('createIsType', 'it', () => true) as unknown as <T>(
  val?: T,
  options?: RunTypeOptions,
  id?: RuntypeId<T>
) => IsTypeFn;

export const createGetTypeErrors = createJitFunction<GetTypeErrorsFn>(
  'createGetTypeErrors',
  'te',
  getTypeErrorsIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => GetTypeErrorsFn;

export const createHasUnknownKeys = createJitFunction<HasUnknownKeysFn>(
  'createHasUnknownKeys',
  'huk',
  () => false
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => HasUnknownKeysFn;

export const createStripUnknownKeys = createJitFunction<StripUnknownKeysFn>(
  'createStripUnknownKeys',
  'suk',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => StripUnknownKeysFn;

export const createUnknownKeyErrors = createJitFunction<UnknownKeyErrorsFn>(
  'createUnknownKeyErrors',
  'uke',
  unknownKeyErrorsIdentity
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => UnknownKeyErrorsFn;

export const createUnknownKeysToUndefined = createJitFunction<UnknownKeysToUndefinedFn>(
  'createUnknownKeysToUndefined',
  'uku',
  identityValueFn
) as unknown as <T>(val?: T, options?: RunTypeOptions, id?: RuntypeId<T>) => UnknownKeysToUndefinedFn;

// =============================================================================
// JSON encode / decode — the only two public JSON entry functions.
//
// Each composes one or two underlying JIT primitives based on the
// runtime `options` shape. The Go-side marker scanner injects a
// canonical runtype id for `T` — option fields (strategy / stripExtras)
// are NOT folded into the typeid, so every encoder shape against the
// same `T` shares one type id; the runtime picks the right family
// (`sj` / `pj` / `pjs` / `pjsp` + optional `uku` compose) based on the
// caller's options.
//
// No closure cache here — composition is one allocation per call. The
// underlying JIT primitives ARE cached on the jitUtils singleton, so
// the heavy code runs once per type.
// =============================================================================

const jsonStringifyFallback: JsonEncoderFn = (v) => JSON.stringify(v);

/** Returns a JSON encoder for `T`. See `JsonEncoderOptions` for the
 *  full 5-combination matrix. Defaults: `strategy: 'clone',
 *  stripExtras: true`. **/
export function createJsonEncoder<T>(val?: T, options?: JsonEncoderOptions, id?: RuntypeId<T>): JsonEncoderFn {
  void val;
  if (id === undefined) {
    throw new Error(
      'createJsonEncoder(): no id injected. vite-plugin-runtypes must be active for createJsonEncoder to dispatch to a precompiled factory.'
    );
  }
  const strategy = options?.strategy ?? 'clone';
  // direct strategy is type-pinned to stripExtras: true (the JIT walks
  // the type, can't see undeclared keys). For other strategies the
  // default is true.
  const stripExtras = strategy === 'direct' ? true : ((options as {stripExtras?: boolean})?.stripExtras ?? true);

  if (strategy === 'direct') {
    // Single-pass stringifyJson — returns `string | undefined`; callers
    // handle the undefined for top-level-undefined inputs the same way
    // they would for `JSON.stringify`.
    return lookupJitFn<JsonEncoderFn>('createJsonEncoder', 'sj', id, jsonStringifyFallback);
  }

  if (strategy === 'clone') {
    if (stripExtras) {
      // clone + strip — pjs (prepareForJsonSafe). Default path.
      const prepareSafeFn = lookupJitFn<PrepareForJsonFn>('createJsonEncoder', 'pjs', id, identityValueFn);
      return (value) => JSON.stringify(prepareSafeFn(value));
    }
    // clone + preserve — pjsp (prepareForJsonSafePreserve). Same clone
    // codegen as pjs but every object literal spreads `...v` so
    // undeclared keys survive.
    const prepareSafePreserveFn = lookupJitFn<PrepareForJsonFn>('createJsonEncoder', 'pjsp', id, identityValueFn);
    return (value) => JSON.stringify(prepareSafePreserveFn(value));
  }

  // strategy === 'mutate'
  const prepareFn = lookupJitFn<PrepareForJsonFn>('createJsonEncoder', 'pj', id, identityValueFn);
  if (!stripExtras) {
    // mutate + preserve — pj (prepareForJson) directly.
    return (value) => JSON.stringify(prepareFn(value));
  }
  // mutate + strip — composition: uku sets undeclared keys to undefined,
  // then pj transforms declared leaves, then JSON.stringify skips
  // undefined-valued keys naturally. Same wire output as the clone+strip
  // path but no clone allocation.
  const ukuFn = lookupJitFn<UnknownKeysToUndefinedFn>('createJsonEncoder', 'uku', id, identityValueFn);
  return (value) => {
    ukuFn(value);
    return JSON.stringify(prepareFn(value));
  };
}

/** Returns a JSON decoder for `T`. Default `stripExtras: true` —
 *  undeclared properties on the parsed wire value become `undefined`
 *  before restore walks the declared shape (closing the safety hole
 *  when the encoder didn't strip them). `stripExtras: false` skips the
 *  unknown-keys pass and passes undeclared properties through to the
 *  restored value untouched. **/
export function createJsonDecoder<T>(val?: T, options?: JsonDecoderOptions, id?: RuntypeId<T>): JsonDecoderFn<T> {
  void val;
  if (id === undefined) {
    throw new Error(
      'createJsonDecoder(): no id injected. vite-plugin-runtypes must be active for createJsonDecoder to dispatch to a precompiled factory.'
    );
  }
  const stripExtras = options?.stripExtras ?? true;
  const restoreFn = lookupJitFn<RestoreFromJsonFn>('createJsonDecoder', 'rj', id, identityValueFn);
  if (!stripExtras) {
    return (serialized) => restoreFn(JSON.parse(serialized)) as T;
  }
  // Use ukuWire (not the public uku) so the union-arm emit reaches
  // into the flat-union wire wrapper `[-1, mergedObject]` instead of
  // corrupting its `0`/`1` indices.
  const ukuFn = lookupJitFn<UnknownKeysToUndefinedFn>('createJsonDecoder', 'ukuw', id, identityValueFn);
  return (serialized) => restoreFn(ukuFn(JSON.parse(serialized))) as T;
}

// =============================================================================
// Binary encode / decode — the only two public binary entry functions.
//
// Each looks up the matching JIT primitive (`tb_<id>` for encode,
// `fb_<id>` for decode) and wraps it with the boilerplate of allocating
// a serializer / deserializer instance and trimming the buffer at the
// end. The underlying JIT primitives mutate a passed-in
// DataViewSerializer / DataViewDeserializer; the wrapper takes care of
// the framing.
//
// The first arg `val` exists purely for the marker's reflection-form
// inference (`reflectRuntypeId(value)`); it's ignored at runtime.
// =============================================================================

const noopToBinaryFn: ToBinaryFn = (_v, Ser) => Ser;
const noopFromBinaryFn: FromBinaryFn = (ret) => ret;

/** Returns a binary encoder for `T`. The compiled encoder walks `T`
 *  and writes bytes to a `DataViewSerializer`; the returned wrapper
 *  allocates one if the caller doesn't supply it, runs the encoder,
 *  and returns the trimmed `ArrayBuffer`. **/
export function createBinaryEncoder<T>(
  val?: T,
  options?: BinaryEncoderOptions,
  id?: RuntypeId<T>
): BinaryEncoderFn {
  void val;
  if (id === undefined) {
    throw new Error(
      'createBinaryEncoder(): no id injected. vite-plugin-runtypes must be active for createBinaryEncoder to dispatch to a precompiled factory.'
    );
  }
  const routeId = options?.routeId ?? 'binary';
  const encodeFn = lookupJitFn<ToBinaryFn>('createBinaryEncoder', 'tb', id, noopToBinaryFn);
  return (value, serializer) => {
    const ser = serializer ?? createDataViewSerializer(routeId);
    encodeFn(value, ser);
    return ser.getBuffer();
  };
}

/** Returns a binary decoder for `T`. Accepts either a raw
 *  `StrictArrayBuffer` (the encoder's output), any typed-array view, or
 *  a pre-built `DataViewDeserializer`. **/
export function createBinaryDecoder<T>(
  val?: T,
  options?: BinaryDecoderOptions,
  id?: RuntypeId<T>
): BinaryDecoderFn<T> {
  void val;
  if (id === undefined) {
    throw new Error(
      'createBinaryDecoder(): no id injected. vite-plugin-runtypes must be active for createBinaryDecoder to dispatch to a precompiled factory.'
    );
  }
  const routeId = options?.routeId ?? 'binary';
  const decodeFn = lookupJitFn<FromBinaryFn<T>>('createBinaryDecoder', 'fb', id, noopFromBinaryFn as FromBinaryFn<T>);
  return (input) => {
    // Distinguish DataViewDeserializer from raw buffer by checking for
    // the `desString` method — the public interface guarantees it.
    let des: DataViewDeserializer;
    if (
      input &&
      typeof (input as DataViewDeserializer).desString === 'function'
    ) {
      des = input as DataViewDeserializer;
    } else {
      des = createDataViewDeserializer(routeId, input as BinaryInput);
    }
    return decodeFn(undefined, des);
  };
}

// =============================================================================
// HMR — refresh the JIT registry whenever any cache module re-evaluates.
// Production builds tree-shake the entire `if (hot)` block at bundle time.
// =============================================================================

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/isTypeCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/getTypeErrorsCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/hasUnknownKeysCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/stripUnknownKeysCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/unknownKeyErrorsCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/unknownKeysToUndefinedCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/unknownKeysToUndefinedWireCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/prepareForJsonCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/restoreFromJsonCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/stringifyJsonCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/prepareForJsonSafeCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/prepareForJsonSafePreserveCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/toBinaryCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/fromBinaryCache.ts', (m) => m?.initCache?.(getJitUtils()));
}
