// Binary I/O public surface — separated from `createRTFunctions.ts` so
// bundlers can leave the binary subtree (encoder, decoder, the two binary
// cache modules, DataView helper classes) out of bundles that never touch
// `createBinaryEncoder` / `createBinaryDecoder`. Loading this module is what
// registers the binary entries on the rtUtils singleton.

import {initCache as initToBinaryCache} from './caches/toBinaryCache.ts';
import {initCache as initFromBinaryCache} from './caches/fromBinaryCache.ts';
import {getRTUtils} from './runtypes/rtUtils.ts';
import {isRunTypeSchema, lookupRTFn} from './runtypes/rtUtils.ts';
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
 *  serializer and returns the same instance (mirrors mion's `sεr` convention). **/
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
}

/** Caller-controlled options for `createBinaryDecoder<T>()`. **/
export interface BinaryDecoderOptions {
  /** Stable string used as a diagnostic label. Defaults to the runtype hash. **/
  cacheKey?: string;
}

// =============================================================================
// Cache initialisation — side effect on module load.
// =============================================================================

const _utils = getRTUtils();
initToBinaryCache(_utils);
initFromBinaryCache(_utils);

// =============================================================================
// Public binary encode / decode entry functions.
// =============================================================================

const noopToBinaryFn: ToBinaryFn = (_v, Ser) => Ser;
const noopFromBinaryFn: FromBinaryFn = (ret) => ret;

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
  const tuple = id as unknown as [string, string] | undefined;
  const effectiveId = isRunTypeSchema(valOrSchema) ? valOrSchema.id : tuple?.[0];
  const fnId = tuple?.[1];
  if (effectiveId === undefined) {
    throw new Error(
      'createBinaryEncoder(): no id injected. vite-plugin-runtypes must be active for createBinaryEncoder to dispatch to a precompiled factory.'
    );
  }
  const cacheKey = options?.cacheKey ?? effectiveId;
  // fnId is the opaque toBinary fnHash the plugin injects; when the plugin is
  // inactive the `effectiveId === undefined` guard above already threw, so the
  // empty-string fallback only feeds lookupRTFn's registered-but-no-factory →
  // identity path. No static `'tb'` tag exists post-hashing.
  const encodeFn = lookupRTFn<ToBinaryFn>('createBinaryEncoder', fnId ?? '', effectiveId, noopToBinaryFn);
  return (value, serializer) => {
    const ownsSer = serializer === undefined;
    const ser = serializer ?? createDataViewSerializer(cacheKey);
    encodeFn(value, ser);
    // Only feed adaptive-sizing history when we own the serializer — a
    // caller-supplied instance may be reused across encodes and is responsible
    // for its own end-of-payload semantics.
    if (ownsSer) ser.markAsEnded();
    return ser.getBuffer();
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
  const tuple = id as unknown as [string, string] | undefined;
  const effectiveId = isRunTypeSchema(valOrSchema) ? valOrSchema.id : tuple?.[0];
  const fnId = tuple?.[1];
  if (effectiveId === undefined) {
    throw new Error(
      'createBinaryDecoder(): no id injected. vite-plugin-runtypes must be active for createBinaryDecoder to dispatch to a precompiled factory.'
    );
  }
  const cacheKey = options?.cacheKey ?? effectiveId;
  // See createBinaryEncoder: fnId is the opaque fromBinary fnHash; the empty
  // fallback only reaches lookupRTFn's identity path. No static `'fb'` tag.
  const decodeFn = lookupRTFn<FromBinaryFn<T>>(
    'createBinaryDecoder',
    fnId ?? '',
    effectiveId,
    noopFromBinaryFn as FromBinaryFn<T>
  );
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

// =============================================================================
// HMR — refresh binary entries when their cache modules re-evaluate.
// =============================================================================

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/toBinaryCache.ts', (m) => m?.initCache?.(getRTUtils()));
  hot.accept('./caches/fromBinaryCache.ts', (m) => m?.initCache?.(getRTUtils()));
}
