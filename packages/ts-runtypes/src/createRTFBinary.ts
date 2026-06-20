// Binary I/O public surface — separated from `createRTFunctions.ts` so
// bundlers can leave the binary subtree (encoder, decoder, DataView helper
// classes) out of bundles that never touch `createBinaryEncoder` /
// `createBinaryDecoder`. Entries arrive as per-entry virtual-module tuples
// injected at each call site (see runtypes/entryTuple.ts).

import {isRunTypeSchema} from './runtypes/rtUtils.ts';
import {entryTupleKey, isEntryTuple, resolveEntryTupleFn, FN_HASH_LEN} from './runtypes/entryTuple.ts';
import type {RunType} from './runtypes/types.ts';
import {
  createDataViewSerializer,
  createSizingSerializer,
  createDataViewDeserializer,
  type DataViewSerializer,
  type DataViewDeserializer,
  type StrictArrayBuffer,
  type BinaryInput,
} from './runtypes/dataView.ts';
import type {InjectTypeFnArgs} from './index.ts';
import type {DataOnly} from './runtypes/dataOnly.ts';

// =============================================================================
// Type definitions
// =============================================================================

/** toBinary RT primitive. Writes bytes for `value` into the supplied
 *  serializer and returns the same instance (mirrors the `sεr` convention). **/
export type ToBinaryFn = (value: unknown, Ser: DataViewSerializer) => DataViewSerializer;

/** fromBinary RT primitive. Reads bytes from the supplied deserializer and
 *  returns the decoded value. `ret` is a placeholder the RT body writes into. **/
export type FromBinaryFn<T = unknown> = (ret: unknown, Des: DataViewDeserializer) => T;

/** Encoder returned by `createBinaryEncoder<T>()`. Writes into the supplied
 *  serializer (or a fresh one) and returns the trimmed ArrayBuffer. **/
export type BinaryEncoderFn = (value: unknown, serializer?: DataViewSerializer) => StrictArrayBuffer;

/** Decoder returned by `createBinaryDecoder<T>()`. Accepts a raw buffer, a
 *  typed-array view, or a pre-built `DataViewDeserializer`. **/
export type BinaryDecoderFn<T = unknown> = (input: BinaryInput | DataViewDeserializer) => T;

/** Caller-controlled options for `createBinaryEncoder<T>()`. **/
export interface BinaryEncoderOptions {
  /** Stable string used to bucket adaptive-sizing history. Defaults to the
   *  runtype hash so every encoder for the same `T` shares size history. **/
  cacheKey?: string;
  /** Per-call circular-reference guard — overrides the global `setRejectCircularRefs`
   *  for THIS encoder (`true` arms, `false` disables). Runtime-only (binary
   *  options are not compile-time args), so it never affects the cache key. **/
  rejectCircularRefs?: boolean;
  /** Buffer-sizing strategy when the encoder owns the serializer:
   *  - `'dynamic'` (default): predict the size from per-key history and grow in
   *    place on a miss. Fast; the prediction can under-allocate but the serializer
   *    self-grows.
   *  - `'precalculate'`: run a no-op measure pass first (`createSizingSerializer`)
   *    to compute the precise byte count, then allocate exactly that with growth
   *    OFF. One extra traversal, but the buffer can never overflow, is never
   *    over-allocated, and `ensureCapacity` is never called.
   *  - `'initial'`: allocate exactly `bufferSize` bytes (required) every call with
   *    growth OFF — `ensureCapacity` is never called. A payload larger than
   *    `bufferSize` throws a `RangeError`; use `createBinarySizer<T>()` to compute a
   *    safe size. The lowest-overhead owned path.
   *  Ignored when the caller supplies their own serializer. Runtime-only, so it
   *  never affects the cache key. **/
  sizing?: 'precalculate' | 'dynamic' | 'initial';
  /** Required when `sizing: 'initial'` — the fixed buffer size in bytes, allocated
   *  on every encode. Ignored by the other modes. Runtime-only (never affects the
   *  cache key). **/
  bufferSize?: number;
}

/** Caller-controlled options for `createBinaryDecoder<T>()`. **/
export interface BinaryDecoderOptions {
  /** Stable string used as a diagnostic label. Defaults to the runtype hash. **/
  cacheKey?: string;
}

// =============================================================================
// Public binary encode / decode entry functions.
// =============================================================================

const noopToBinaryFn: ToBinaryFn = (_v, Ser) => Ser;
const noopFromBinaryFn: FromBinaryFn = (ret) => ret;

// Process-wide default sizing, mirroring setRejectCircularRefs: a global default
// that a per-call `{sizing}` / `{bufferSize}` option on createBinaryEncoder
// overrides. `bufferSize` is only meaningful together with `sizing: 'initial'`.
let defaultSizingMode: NonNullable<BinaryEncoderOptions['sizing']> = 'dynamic';
let defaultSizingBufferSize: number | undefined;

/** Sets the process-wide default binary buffer-sizing mode (and, for `'initial'`,
 *  a default `bufferSize`). A per-call `{sizing}` / `{bufferSize}` option on
 *  `createBinaryEncoder` overrides it. Resets to `'dynamic'` when called with no
 *  arguments. **/
export function setDefaultBinarySizing(sizing: NonNullable<BinaryEncoderOptions['sizing']> = 'dynamic', bufferSize?: number): void {
  defaultSizingMode = sizing;
  defaultSizingBufferSize = bufferSize;
}

/** The current process-wide default binary sizing mode + buffer size. **/
export function getDefaultBinarySizing(): {sizing: NonNullable<BinaryEncoderOptions['sizing']>; bufferSize: number | undefined} {
  return {sizing: defaultSizingMode, bufferSize: defaultSizingBufferSize};
}

// 'initial' overflow message — the caller's fixed buffer was too small.
function initialTooSmall(bufferSize: number): RangeError {
  return new RangeError(
    `createBinaryEncoder: the payload does not fit in the ${bufferSize}-byte buffer for sizing 'initial'. ` +
      `Use createBinarySizer<T>() to compute the exact size, raise bufferSize, or use sizing 'dynamic' / 'precalculate'.`
  );
}

// binarySizingKey derives the adaptive-sizing bucket from the schema id or the
// injected tuple's `<fnHash>_<typeId>` key — the bare type id, so every
// encoder/decoder for the same `T` shares size history (the pre-migration
// default). Falls back to 'unknown' when the plugin is inactive (the resolve
// call right after throws anyway).
function binarySizingKey(schemaId: string | undefined, injected: unknown): string {
  if (schemaId !== undefined) return schemaId;
  if (isEntryTuple(injected)) return entryTupleKey(injected).slice(FN_HASH_LEN + 1);
  return 'unknown';
}

/** Returns a binary encoder for `T`. Accepts either a value-first schema
 *  (`createBinaryEncoder(rt)`) or the value/static form. **/
export function createBinaryEncoder<T>(
  schema: RunType<T>,
  options?: BinaryEncoderOptions,
  id?: InjectTypeFnArgs<T, 'tb'>
): BinaryEncoderFn;
export function createBinaryEncoder<T>(val?: T, options?: BinaryEncoderOptions, id?: InjectTypeFnArgs<T, 'tb'>): BinaryEncoderFn;
export function createBinaryEncoder<T>(
  valOrSchema?: T | RunType<T>,
  options?: BinaryEncoderOptions,
  id?: InjectTypeFnArgs<T, 'tb'>
): BinaryEncoderFn {
  const schemaId = isRunTypeSchema(valOrSchema) ? valOrSchema.id : undefined;
  const cacheKey = options?.cacheKey ?? binarySizingKey(schemaId, id);
  const encodeFn = resolveEntryTupleFn<ToBinaryFn>(
    'createBinaryEncoder',
    noopToBinaryFn,
    schemaId,
    id,
    options?.rejectCircularRefs
  );
  const sizing = options?.sizing ?? defaultSizingMode;
  const bufferSize = options?.bufferSize ?? defaultSizingBufferSize;
  return (value, serializer) => {
    // Caller-supplied serializer: they own sizing + end-of-payload semantics,
    // so we don't record history on their behalf.
    if (serializer !== undefined) {
      encodeFn(value, serializer);
      return serializer.getBuffer();
    }

    // 'precalculate': a no-op measure pass over the SAME encode body computes the
    // precise byte count, then we allocate exactly that with growth OFF (the
    // serializer's `ensureCapacity` is undefined, so every reserve short-circuits).
    // No write can overflow, so there is no backstop.
    if (sizing === 'precalculate') {
      const sizer = createSizingSerializer(cacheKey);
      encodeFn(value, sizer);
      const ser = createDataViewSerializer(cacheKey, {size: sizer.getLength(), grow: false});
      encodeFn(value, ser);
      ser.markAsEnded();
      return ser.getBuffer();
    }

    // 'initial': the caller fixes the size; growth is OFF. A throwing inline write
    // (DataView OOB) is caught here; a silent Uint8Array OOB write still advances
    // `index` past the buffer, so the post-encode length check catches that too.
    // Either way the caller gets a clear RangeError — no retry, no history recorded.
    if (sizing === 'initial') {
      if (bufferSize === undefined) throw new Error("createBinaryEncoder: sizing 'initial' requires a numeric `bufferSize` option.");
      const ser = createDataViewSerializer(cacheKey, {size: bufferSize, grow: false});
      try {
        encodeFn(value, ser);
      } catch (err) {
        if (err instanceof RangeError) throw initialTooSmall(bufferSize);
        throw err;
      }
      if (ser.getLength() > bufferSize) throw initialTooSmall(bufferSize);
      return ser.getBuffer();
    }

    // 'dynamic' (default): predict from per-key Welford history; EVERY write — the
    // serializer's own methods (serString, serLength, serEnum, temporal helpers)
    // AND the Go-emitted inline scalar/framing writes — reserves via
    // `Ser.ensureCapacity?.(n)`, so the buffer grows in place on a miss. No backstop
    // retry loop: a single pass always fits (or throws at the 2**32 ceiling, which a
    // payload that genuinely cannot be encoded should).
    const ser = createDataViewSerializer(cacheKey, {grow: true});
    encodeFn(value, ser);
    ser.markAsEnded();
    return ser.getBuffer();
  };
}

/** Sizer returned by `createBinarySizer<T>()`. Returns the exact on-wire byte
 *  count without allocating an output buffer. **/
export type BinarySizerFn = (value: unknown) => number;

/** Returns the exact on-wire byte count `createBinaryEncoder<T>()` would produce
 *  for `value`, WITHOUT allocating an output buffer. Runs the SAME emitted `'tb'`
 *  body as the encoder against a no-op measure serializer, so the count is exact:
 *  `createBinarySizer(v) === createBinaryEncoder(v).byteLength`. Use it to size a
 *  `{sizing: 'initial', bufferSize}` encoder, or a pooled caller-supplied
 *  serializer, up front. Reuses the encoder's `'tb'` cache entry — no new family. **/
export function createBinarySizer<T>(schema: RunType<T>, id?: InjectTypeFnArgs<T, 'tb'>): BinarySizerFn;
export function createBinarySizer<T>(val?: T, id?: InjectTypeFnArgs<T, 'tb'>): BinarySizerFn;
export function createBinarySizer<T>(valOrSchema?: T | RunType<T>, id?: InjectTypeFnArgs<T, 'tb'>): BinarySizerFn {
  const schemaId = isRunTypeSchema(valOrSchema) ? valOrSchema.id : undefined;
  const cacheKey = binarySizingKey(schemaId, id);
  const encodeFn = resolveEntryTupleFn<ToBinaryFn>('createBinarySizer', noopToBinaryFn, schemaId, id);
  return (value) => {
    const sizer = createSizingSerializer(cacheKey);
    encodeFn(value, sizer);
    return sizer.getLength();
  };
}

/** Returns a binary decoder for `T`. Accepts either a value-first schema
 *  (`createBinaryDecoder(rt)`) or the value/static form. **/
export function createBinaryDecoder<T>(
  schema: RunType<T>,
  options?: BinaryDecoderOptions,
  id?: InjectTypeFnArgs<T, 'fb'>
): BinaryDecoderFn<DataOnly<T>>;
export function createBinaryDecoder<T>(
  val?: T,
  options?: BinaryDecoderOptions,
  id?: InjectTypeFnArgs<T, 'fb'>
): BinaryDecoderFn<DataOnly<T>>;
export function createBinaryDecoder<T>(
  valOrSchema?: T | RunType<T>,
  options?: BinaryDecoderOptions,
  id?: InjectTypeFnArgs<T, 'fb'>
): BinaryDecoderFn<DataOnly<T>> {
  const schemaId = isRunTypeSchema(valOrSchema) ? valOrSchema.id : undefined;
  const cacheKey = options?.cacheKey ?? binarySizingKey(schemaId, id);
  const decodeFn = resolveEntryTupleFn<FromBinaryFn<T>>('createBinaryDecoder', noopFromBinaryFn as FromBinaryFn<T>, schemaId, id);
  // A decoded value is reconstructed from bytes, so it only ever holds
  // serialisable data — the return is the data-only projection `DataOnly<T>`
  // (identity on clean DTOs). The runtime value is unchanged; the single cast
  // is the type boundary bridging the `=> T` decodeFn to the projected return.
  return ((input) => {
    // Distinguish DataViewDeserializer from raw buffer by the `desString` method.
    let des: DataViewDeserializer;
    if (input && typeof (input as DataViewDeserializer).desString === 'function') {
      des = input as DataViewDeserializer;
    } else {
      des = createDataViewDeserializer(cacheKey, input as BinaryInput);
    }
    return decodeFn(undefined, des);
  }) as BinaryDecoderFn<DataOnly<T>>;
}
