// Binary I/O public surface — separated from `createJitFunctions.ts` so
// bundlers can leave the binary code (encoder, decoder, types, the two
// binary cache modules, the DataView helper classes) out of consumer
// bundles that never touch `createBinaryEncoder` / `createBinaryDecoder`.
// Binary is a specific feature for a specific scenario (typed-array RPC,
// router-driven binary transport); JSON / validation consumers shouldn't
// pay for it.
//
// Cache initialisation (`initToBinaryCache` / `initFromBinaryCache`) and
// the HMR `hot.accept` wiring for those two cache modules live here as
// well, so loading this module is what registers the binary entries on
// the jitUtils singleton. If nothing in the consumer's bundle references
// anything from this file, Rollup / esbuild / webpack drop the whole
// subtree — the cache modules included.
//
// Cross-family helpers (`lookupJitFn`, the DataView factory functions)
// live in standalone modules consumed by both this file and
// `createJitFunctions.ts`.

import {initCache as initToBinaryCache} from './caches/toBinaryCache.ts';
import {initCache as initFromBinaryCache} from './caches/fromBinaryCache.ts';
import {getJitUtils} from './jit/jitUtils.ts';
import {lookupJitFn} from './jit/lookupJitFn.ts';
import {
  createDataViewSerializer,
  createDataViewDeserializer,
  type DataViewSerializer,
  type DataViewDeserializer,
  type StrictArrayBuffer,
  type BinaryInput,
} from './jit/dataView.ts';
import type {InjectRuntypeId} from './index.ts';

// =============================================================================
// Type definitions
// =============================================================================

/** Internal type alias for the toBinary JIT primitive. Writes bytes for
 *  `value` into the supplied `DataViewSerializer` and returns the same
 *  serializer instance (mirrors mion's `sεr` convention). **/
export type ToBinaryFn = (value: unknown, Ser: DataViewSerializer) => DataViewSerializer;

/** Internal type alias for the fromBinary JIT primitive. Reads bytes
 *  from the supplied `DataViewDeserializer` and returns the decoded
 *  value. The first parameter (`ret`) is a placeholder the JIT body
 *  writes the result into. **/
export type FromBinaryFn<T = unknown> = (ret: unknown, Des: DataViewDeserializer) => T;

/** Encoder returned by `createBinaryEncoder<T>()`. Writes the value's
 *  binary representation into the supplied `DataViewSerializer` (or a
 *  fresh one if omitted) and returns the trimmed underlying
 *  ArrayBuffer ready to ship over the wire / persist to disk. **/
export type BinaryEncoderFn = (value: unknown, serializer?: DataViewSerializer) => StrictArrayBuffer;

/** Decoder returned by `createBinaryDecoder<T>()`. Reads bytes from the
 *  supplied buffer / deserializer and returns the reconstructed value.
 *  Accepts either a raw `StrictArrayBuffer` (the encoder's output) or
 *  a pre-built `DataViewDeserializer`. **/
export type BinaryDecoderFn<T = unknown> = (input: BinaryInput | DataViewDeserializer) => T;

/** Caller-controlled options for `createBinaryEncoder<T>()`. **/
export interface BinaryEncoderOptions {
  /** Stable string used to bucket adaptive-sizing history (and as a
   *  diagnostic label on the auto-allocated serializer). Defaults to
   *  the runtype hash, so every encoder for the same `T` shares size
   *  history transparently. Pass an explicit value to group several
   *  unrelated types under one bucket. **/
  cacheKey?: string;
}

/** Caller-controlled options for `createBinaryDecoder<T>()`. **/
export interface BinaryDecoderOptions {
  /** Stable string used as a diagnostic label on the auto-allocated
   *  deserializer. Defaults to the runtype hash. **/
  cacheKey?: string;
}

// =============================================================================
// Cache initialisation — side effect on module load.
// =============================================================================
// Loading this module registers the binary JIT entries on the jitUtils
// singleton. Consumers that don't import anything from this file get
// the cache modules dropped at bundle time.

const _utils = getJitUtils();
initToBinaryCache(_utils);
initFromBinaryCache(_utils);

// =============================================================================
// Public binary encode / decode entry functions.
// =============================================================================

const noopToBinaryFn: ToBinaryFn = (_v, Ser) => Ser;
const noopFromBinaryFn: FromBinaryFn = (ret) => ret;

/** Returns a binary encoder for `T`. The compiled encoder walks `T`
 *  and writes bytes to a `DataViewSerializer`; the returned wrapper
 *  allocates one if the caller doesn't supply it, runs the encoder,
 *  and returns the trimmed `ArrayBuffer`. **/
export function createBinaryEncoder<T>(val?: T, options?: BinaryEncoderOptions, id?: InjectRuntypeId<T>): BinaryEncoderFn {
  void val;
  if (id === undefined) {
    throw new Error(
      'createBinaryEncoder(): no id injected. vite-plugin-runtypes must be active for createBinaryEncoder to dispatch to a precompiled factory.'
    );
  }
  const cacheKey = options?.cacheKey ?? id;
  const encodeFn = lookupJitFn<ToBinaryFn>('createBinaryEncoder', 'tb', id, noopToBinaryFn);
  return (value, serializer) => {
    const ownsSer = serializer === undefined;
    const ser = serializer ?? createDataViewSerializer(cacheKey);
    encodeFn(value, ser);
    // Only feed adaptive-sizing history when we own the serializer —
    // a caller-supplied instance may be reused across multiple encodes
    // and is responsible for its own end-of-payload semantics.
    if (ownsSer) ser.markAsEnded();
    return ser.getBuffer();
  };
}

/** Returns a binary decoder for `T`. Accepts either a raw
 *  `StrictArrayBuffer` (the encoder's output), any typed-array view, or
 *  a pre-built `DataViewDeserializer`. **/
export function createBinaryDecoder<T>(val?: T, options?: BinaryDecoderOptions, id?: InjectRuntypeId<T>): BinaryDecoderFn<T> {
  void val;
  if (id === undefined) {
    throw new Error(
      'createBinaryDecoder(): no id injected. vite-plugin-runtypes must be active for createBinaryDecoder to dispatch to a precompiled factory.'
    );
  }
  const cacheKey = options?.cacheKey ?? id;
  const decodeFn = lookupJitFn<FromBinaryFn<T>>('createBinaryDecoder', 'fb', id, noopFromBinaryFn as FromBinaryFn<T>);
  return (input) => {
    // Distinguish DataViewDeserializer from raw buffer by checking for
    // the `desString` method — the public interface guarantees it.
    let des: DataViewDeserializer;
    if (input && typeof (input as DataViewDeserializer).desString === 'function') {
      des = input as DataViewDeserializer;
    } else {
      des = createDataViewDeserializer(cacheKey, input as BinaryInput);
    }
    return decodeFn(undefined, des);
  };
}

// =============================================================================
// HMR — refresh the binary entries when their cache modules re-evaluate.
// Production builds tree-shake the entire `if (hot)` block at bundle time.
// =============================================================================

type HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const hot = (import.meta as unknown as {hot?: HMR}).hot;
if (hot) {
  hot.accept('./caches/toBinaryCache.ts', (m) => m?.initCache?.(getJitUtils()));
  hot.accept('./caches/fromBinaryCache.ts', (m) => m?.initCache?.(getJitUtils()));
}
