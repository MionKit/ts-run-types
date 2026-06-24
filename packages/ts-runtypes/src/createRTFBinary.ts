// Binary I/O public surface — separated from `createRTFunctions.ts` so
// bundlers can leave the binary subtree (encoder, decoder, DataView helper
// classes) out of bundles that never touch `createBinaryEncoder` /
// `createBinaryDecoder`. Entries arrive as per-entry virtual-module tuples
// injected at each call site (see runtypes/entryTuple.ts).

import {isRunTypeSchema} from './runtypes/rtUtils.ts';
import {
  entryTupleKey,
  isEntryTuple,
  resolveEntryTupleFn,
  binarySizeEstimateFromTuple,
  FN_HASH_LEN,
} from './runtypes/entryTuple.ts';
import type {RunType} from './runtypes/types.ts';
import {
  createDataViewSerializer,
  createSizingSerializer,
  createDataViewDeserializer,
  type DataViewSerializer,
  type DataViewDeserializer,
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

// Encoder returned by `createBinaryEncoder<T>()`. The exact signature depends on
// the `sizeStrategy` (see the per-strategy overloads): all return a `Uint8Array` VIEW of the
// written bytes — zero-copy, with `byteLength` the exact byte count (`.slice()`
// for an owned copy). For the `into` strategy the view aliases the caller's
// buffer; consume it before the next encode overwrites those bytes.

/** `dynamic` / `precalculate` encoder — sizes the buffer itself. **/
export type BinaryEncoderFn = (value: unknown) => Uint8Array;
/** `initialSize` encoder — caller supplies the initial buffer size each call. **/
export type BinaryEncoderSizeFn = (value: unknown, size: number) => Uint8Array;
/** `into` encoder — caller supplies the buffer to write into each call. **/
export type BinaryEncoderIntoFn = (value: unknown, into: ArrayBuffer) => Uint8Array;

/** Options narrowed to a specific `sizeStrategy` literal. These drive the
 *  per-strategy overloads of `createBinaryEncoder`: overload resolution matches
 *  on the OPTIONS argument, so the returned signature specialises whether `T` is
 *  inferred (from a schema or value) OR supplied explicitly as
 *  `createBinaryEncoder<T>()` — an explicit type argument would otherwise defeat
 *  inference of a return-shaping type parameter. **/
type InitialSizeOptions = BinaryEncoderOptions & {sizeStrategy: 'initialSize'};
type IntoOptions = BinaryEncoderOptions & {sizeStrategy: 'into'};

/** Decoder returned by `createBinaryDecoder<T>()`. Accepts a raw buffer, a
 *  typed-array view (e.g. the encoder's `Uint8Array` output, so `decode(encode(v))`
 *  round-trips), or a pre-built `DataViewDeserializer`. **/
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
  /** How the encoder's buffer is sized + what happens on overflow. A STATIC
   *  literal: it specialises the returned function's signature (per-strategy
   *  overloads) and never affects the cache key.
   *  - `'dynamic'` (default): `(val) => Uint8Array` — predict from per-key history,
   *    grow in place on a miss.
   *  - `'precalculate'`: `(val) => Uint8Array` — measure pass first, allocate
   *    exactly, can't overflow (one extra traversal).
   *  - `'initialSize'`: `(val, size) => Uint8Array` — allocate `size` bytes; THROW
   *    on overflow (never resizes).
   *  - `'into'`: `(val, into) => Uint8Array` — write into the caller's `ArrayBuffer`
   *    (the returned view aliases it); THROW on overflow (a fixed buffer can't be
   *    grown without breaking the caller's reference). **/
  sizeStrategy?: 'dynamic' | 'precalculate' | 'initialSize' | 'into';
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

// Overflow message for the fixed-size strategies (`initialSize` / `into`).
function fixedBufferTooSmall(capacity: number): RangeError {
  return new RangeError(
    `createBinaryEncoder: the payload does not fit in the ${capacity}-byte buffer. ` +
      `Use createBinarySizer<T>() to compute the exact size, enlarge the buffer, or use sizeStrategy 'dynamic' / 'precalculate'.`
  );
}

// Run a fixed-capacity (non-growing) encode and convert any overflow into a clear
// RangeError. A throwing inline DataView write is caught here; a silent Uint8Array
// OOB write still advances `index` past the buffer, so the post-encode length check
// catches that too. No history is recorded (the caller owns sizing). Returns the
// zero-copy view of the written bytes.
function encodeFixed(encodeFn: ToBinaryFn, value: unknown, ser: DataViewSerializer, capacity: number): Uint8Array {
  try {
    encodeFn(value, ser);
  } catch (err) {
    if (err instanceof RangeError) throw fixedBufferTooSmall(capacity);
    throw err;
  }
  if (ser.getLength() > capacity) throw fixedBufferTooSmall(capacity);
  return ser.getBufferView();
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

/** Returns a binary encoder for `T`. Accepts a value-first schema
 *  (`createBinaryEncoder(rt, …)`), the value form (`createBinaryEncoder(val, …)`),
 *  or the static form (`createBinaryEncoder<T>(undefined, …)`). The `sizeStrategy`
 *  option (a static literal) selects the returned function's signature + behaviour;
 *  these per-strategy overloads specialise the return for every call form. **/
// 'initialSize' → (value, size) => Uint8Array
export function createBinaryEncoder<T>(
  schema: RunType<T>,
  options: InitialSizeOptions,
  id?: InjectTypeFnArgs<T, 'tb'>
): BinaryEncoderSizeFn;
export function createBinaryEncoder<T>(
  val: T | undefined,
  options: InitialSizeOptions,
  id?: InjectTypeFnArgs<T, 'tb'>
): BinaryEncoderSizeFn;
// 'into' → (value, into) => Uint8Array
export function createBinaryEncoder<T>(
  schema: RunType<T>,
  options: IntoOptions,
  id?: InjectTypeFnArgs<T, 'tb'>
): BinaryEncoderIntoFn;
export function createBinaryEncoder<T>(
  val: T | undefined,
  options: IntoOptions,
  id?: InjectTypeFnArgs<T, 'tb'>
): BinaryEncoderIntoFn;
// 'dynamic' (default) / 'precalculate' → (value) => Uint8Array
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
): BinaryEncoderFn | BinaryEncoderSizeFn | BinaryEncoderIntoFn {
  const schemaId = isRunTypeSchema(valOrSchema) ? valOrSchema.id : undefined;
  const cacheKey = options?.cacheKey ?? binarySizingKey(schemaId, id);
  const encodeFn = resolveEntryTupleFn<ToBinaryFn>(
    'createBinaryEncoder',
    noopToBinaryFn,
    schemaId,
    id,
    options?.rejectCircularRefs
  );
  const sizeStrategy = options?.sizeStrategy ?? 'dynamic';

  // 'precalculate': measure pass over the SAME body → allocate exactly, growth OFF.
  if (sizeStrategy === 'precalculate') {
    const fn: BinaryEncoderFn = (value) => {
      const sizer = createSizingSerializer(cacheKey);
      encodeFn(value, sizer);
      const ser = createDataViewSerializer(cacheKey, {size: sizer.getLength(), grow: false});
      encodeFn(value, ser);
      ser.markAsEnded();
      return ser.getBufferView();
    };
    return fn;
  }

  // 'initialSize': caller fixes the size each call; growth OFF, throw on overflow.
  if (sizeStrategy === 'initialSize') {
    const fn: BinaryEncoderSizeFn = (value, size) => {
      if (typeof size !== 'number')
        throw new Error("createBinaryEncoder: sizeStrategy 'initialSize' requires a numeric `size` argument.");
      return encodeFixed(encodeFn, value, createDataViewSerializer(cacheKey, {size, grow: false}), size);
    };
    return fn;
  }

  // 'into': caller supplies the buffer each call; growth OFF, throw on overflow.
  if (sizeStrategy === 'into') {
    const fn: BinaryEncoderIntoFn = (value, into) => {
      if (!(into instanceof ArrayBuffer))
        throw new Error("createBinaryEncoder: sizeStrategy 'into' requires an ArrayBuffer `into` argument.");
      return encodeFixed(encodeFn, value, createDataViewSerializer(cacheKey, {buffer: into}), into.byteLength);
    };
    return fn;
  }

  // 'dynamic' (default): predict from per-key Welford history, seeded on a cold
  // cache by the compile-time per-type estimate the `tb` tuple carries (a tight
  // per-type size instead of the flat `defaultBufferSize` fallback — critical
  // for short-lived/serverless where history never warms). Every write reserves
  // via `Ser.ensureCapacity?.(n)`, so the buffer still grows in place if a
  // payload outruns the estimate.
  const coldStartSize = binarySizeEstimateFromTuple(id);
  const fn: BinaryEncoderFn = (value) => {
    const ser = createDataViewSerializer(cacheKey, {grow: true, coldStartSize});
    encodeFn(value, ser);
    ser.markAsEnded();
    return ser.getBufferView();
  };
  return fn;
}

/** Sizer returned by `createBinarySizer<T>()`. Returns the exact on-wire byte
 *  count without allocating an output buffer. **/
export type BinarySizerFn = (value: unknown) => number;

/** Returns the exact on-wire byte count `createBinaryEncoder<T>()` would produce
 *  for `value`, WITHOUT allocating an output buffer. Runs the SAME emitted `'tb'`
 *  body as the encoder against a no-op measure serializer, so the count is exact:
 *  `createBinarySizer(v) === createBinaryEncoder(v)(…).byteLength`. Use it to size a
 *  `sizeStrategy: 'initialSize'` encoder or to allocate an exact `into` buffer.
 *  Reuses the encoder's `'tb'` cache entry — no new family. **/
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
    let des: DataViewDeserializer;
    if (input && typeof (input as DataViewDeserializer).desString === 'function') {
      des = input as DataViewDeserializer; // already a deserializer
    } else {
      // buffer / typed-array view — incl. the encoder's Uint8Array output.
      des = createDataViewDeserializer(cacheKey, input as BinaryInput);
    }
    return decodeFn(undefined, des);
  }) as BinaryDecoderFn<DataOnly<T>>;
}
