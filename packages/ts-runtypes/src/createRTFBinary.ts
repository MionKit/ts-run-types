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

// Hard ceiling for the backstop grow-and-retry loop. Matches the serializer's
// own guard (`createDataViewSerializer` rejects size >= 2**32); a single payload
// above this can't be encoded, so we re-throw the RangeError.
const MAX_BUFFER_BYTES = 2 ** 32;

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
  return (value, serializer) => {
    // Caller-supplied serializer: they own sizing + end-of-payload semantics,
    // so we don't record history on their behalf.
    if (serializer !== undefined) {
      encodeFn(value, serializer);
      return serializer.getBuffer();
    }
    // We own the serializer. Adaptive sizing predicts from per-key Welford
    // history. The serializer's own writers (serString, serEnum, the temporal
    // helpers) GROW IN PLACE on a miss, so the common string-driven overflow —
    // the case the regression test pins — never throws or re-encodes.
    //
    // The Go-emitted bodies still write scalars + container framing (numbers,
    // length prefixes, union tags, optional bitmaps) inline to the DataView,
    // bypassing those writers. If the prediction under-allocates for such a
    // payload the raw write throws a RangeError; this loop is the backstop —
    // grow (prefix-preserving resize) and re-encode from a clean index until it
    // fits or hits the 2**32 ceiling. (Reserving capacity at container
    // boundaries in the emitter would retire this loop — see docs/binary-buffer-sizing.md.)
    const ser = createDataViewSerializer(cacheKey);
    for (;;) {
      try {
        encodeFn(value, ser);
        ser.markAsEnded();
        return ser.getBuffer();
      } catch (err) {
        const nextSize = ser.buffer.byteLength * 2;
        if (!(err instanceof RangeError) || nextSize >= MAX_BUFFER_BYTES) throw err;
        ser.resize(nextSize);
        ser.reset();
      }
    }
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
