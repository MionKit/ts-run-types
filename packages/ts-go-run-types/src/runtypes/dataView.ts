// DataView-based binary serializer + deserializer ported from mion. Wire format:
//   - Little-endian.
//   - Strings: `[uint32 length, utf8 bytes]`.
//   - Numbers: float64.
//   - Enums: `[uint32 typeTag (1=string, 2=number), value]`.
//   - Optional-property bitmaps: 1 bit per optional prop, 8 per byte.
//
// Two ported optimisations:
//   - String bytes cache — short strings (<64 chars) are UTF-8-encoded once
//     and blitted on repeat encodes. Bounded with half-LRU eviction.
//   - Adaptive buffer sizing — pre-allocates `historicalAverage × multiplier`,
//     falling back to `defaultBufferSize` on a cold cache. Keyed on the
//     caller-supplied `cacheKey`.
//
// Tune via `setSerializationOptions({...})`. The `sizeHistory` and
// `stringBytesCache` overrides let tests / multi-tenant consumers scope state.

const STR = 1;
const NUM = 2;
const POW_2_32 = 2 ** 32;
const LE = true;

// Ambient declarations — the package's tsconfig sets `types: []` so DOM
// globals aren't visible. TextEncoder/Decoder are universally available.
declare const TextEncoder: {
  new (): {encodeInto(input: string, dest: Uint8Array): {written?: number; read?: number}};
};
declare const TextDecoder: {
  new (): {decode(input?: ArrayBufferView | ArrayBuffer): string};
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Tagged ArrayBuffer with the SharedArrayBuffer carve-out. **/
export type StrictArrayBuffer = ArrayBuffer & {__brand?: 'StrictArrayBuffer'};

/** Buffer-like input for the deserializer. **/
export type BinaryInput = StrictArrayBuffer | ArrayBufferView;

/** Tunable serializer behaviour. **/
export interface SerializationOptions {
  /** Cold-start buffer size. Default 16 MiB (`2 ** 24`). **/
  defaultBufferSize: number;
  /** Safety headroom factor: `allocSize = avg * sizeMultiplier`. Default 2. **/
  sizeMultiplier: number;
  /** Strings shorter than this bypass the bytes cache. Default 64. **/
  maxStrCacheLength: number;
  /** Half-LRU eviction triggers above this. Default 1000. **/
  maxCacheSize: number;
  /** Cache-key → rolling-average bytes-written. Pass a fresh `Map` to scope. **/
  sizeHistory: Map<string, number>;
  /** Source-string → cached UTF-8 bytes. Pass a fresh `Map` to scope. **/
  stringBytesCache: Map<string, Uint8Array>;
}

const moduleSizeHistory = new Map<string, number>();
const moduleStringBytesCache = new Map<string, Uint8Array>();

const DEFAULTS: SerializationOptions = {
  defaultBufferSize: 2 ** 24,
  sizeMultiplier: 2,
  maxStrCacheLength: 64,
  maxCacheSize: 1000,
  sizeHistory: moduleSizeHistory,
  stringBytesCache: moduleStringBytesCache,
};

let opts: SerializationOptions = {...DEFAULTS};

/** Patches the active serialization options. Unspecified fields keep their
 *  current value. **/
export function setSerializationOptions(patch: Partial<SerializationOptions>): void {
  opts = {...opts, ...patch};
}

/** Public interface implemented by DataViewSerializerImpl. **/
export interface DataViewSerializer {
  readonly buffer: ArrayBuffer;
  /** Stable string used for size-history bucketing — typically the runtype hash. **/
  readonly cacheKey: string;
  index: number;
  view: DataView;
  hasEnded: boolean;
  reset(): void;
  resize(size: number): void;
  getBuffer(): StrictArrayBuffer;
  getBufferView(): Uint8Array;
  markAsEnded(): void;
  getLength(): number;
  serString(str: string, skipCache?: boolean): void;
  serFloat64(n: number): void;
  serEnum(n: number | string): void;
  setBitMask(bitMaskIndex: number, bitIndex: number): void;
}

/** Public interface implemented by DataViewDeserializerImpl. **/
export interface DataViewDeserializer {
  readonly buffer: StrictArrayBuffer;
  readonly cacheKey: string;
  index: number;
  view: DataView;
  hasEnded: boolean;
  reset(): void;
  setBuffer(buffer: StrictArrayBuffer, byteOffset?: number, byteLength?: number): void;
  markAsEnded(): void;
  getLength(): number;
  desString(): string;
  desSafePropName(): string;
  desFloat64(): number;
  desEnum(): number | string;
}

/** Optional args for `createDataViewSerializer`. `size` is an explicit
 *  override; `relatedKeys` predicts via sum-of-averages. **/
export interface CreateSerializerOptions {
  size?: number;
  relatedKeys?: string[];
}

/** Creates a DataView-based serializer. **/
export function createDataViewSerializer(cacheKey: string, options?: CreateSerializerOptions | number): DataViewSerializer {
  // Number overload kept for back-compat with mion-style callers.
  const explicitSize = typeof options === 'number' ? options : options?.size;
  const relatedKeys = typeof options === 'object' ? options.relatedKeys : undefined;
  const size = explicitSize ?? predictBufferSize(cacheKey, relatedKeys);
  if (size >= POW_2_32) throw new Error('bufferSize must be strictly less than 2 ** 32');
  return new DataViewSerializerImpl(cacheKey, size);
}

/** Creates a deserializer from ArrayBuffer or any typed-array view. **/
export function createDataViewDeserializer(cacheKey: string, input: BinaryInput): DataViewDeserializer {
  if (ArrayBuffer.isView(input)) {
    const buffer = input.buffer as StrictArrayBuffer;
    return new DataViewDeserializerImpl(cacheKey, buffer, input.byteOffset, input.byteLength);
  }
  return new DataViewDeserializerImpl(cacheKey, input as StrictArrayBuffer);
}

/** Sum of historical averages for related keys, or the single key's average,
 *  falling back to `defaultBufferSize` on a cold cache. **/
function predictBufferSize(cacheKey: string, relatedKeys?: string[]): number {
  if (relatedKeys && relatedKeys.length) {
    let total = 0;
    for (const key of relatedKeys) total += sizeForKey(key);
    return total;
  }
  return sizeForKey(cacheKey);
}

function sizeForKey(key: string): number {
  const avg = opts.sizeHistory.get(key);
  if (avg === undefined) return opts.defaultBufferSize;
  return avg * opts.sizeMultiplier;
}

/** EMA-against-default: the cold-start sample blends against
 *  `defaultBufferSize` so predicted size never drops below half the
 *  default — preventing under-allocation when the first observation is tiny. **/
function recordObservedSize(cacheKey: string, observed: number): void {
  const prev = opts.sizeHistory.get(cacheKey) ?? opts.defaultBufferSize;
  opts.sizeHistory.set(cacheKey, Math.floor((prev + observed) / 2));
}

/** Half-LRU eviction. **/
function evictStringBytesCache(): void {
  const cache = opts.stringBytesCache;
  const entries = Array.from(cache.entries());
  cache.clear();
  for (let i = Math.floor(entries.length / 2); i < entries.length; i++) {
    cache.set(entries[i][0], entries[i][1]);
  }
}

class DataViewSerializerImpl implements DataViewSerializer {
  buffer: ArrayBuffer;
  private uint8View: Uint8Array;
  readonly cacheKey: string;
  index: number = 0;
  view: DataView;
  hasEnded: boolean = false;
  constructor(cacheKey: string, size: number) {
    this.cacheKey = cacheKey;
    this.buffer = new ArrayBuffer(size);
    this.view = new DataView(this.buffer);
    this.uint8View = new Uint8Array(this.buffer);
  }
  reset(): void {
    this.index = 0;
    this.hasEnded = false;
  }
  resize(size: number): void {
    this.buffer = new ArrayBuffer(size);
    this.view = new DataView(this.buffer);
    this.uint8View = new Uint8Array(this.buffer);
  }
  getBuffer(): StrictArrayBuffer {
    return this.buffer.slice(0, this.index) as StrictArrayBuffer;
  }
  getBufferView(): Uint8Array {
    return new Uint8Array(this.buffer, 0, this.index);
  }
  markAsEnded(): void {
    this.hasEnded = true;
    recordObservedSize(this.cacheKey, this.index);
  }
  getLength(): number {
    return this.index;
  }
  serString(str: string, skipCache?: boolean): void {
    // Long strings or explicit bypass: encode straight into the buffer.
    if (str.length >= opts.maxStrCacheLength || skipCache) {
      const targetView = this.uint8View.subarray(this.index + 4);
      const result = textEncoder.encodeInto(str, targetView);
      const read = result.read ?? 0;
      // `encodeInto` silently truncates on small destinations; surface as
      // RangeError so callers don't persist a corrupted length prefix.
      if (read < str.length)
        throw new RangeError(
          `DataViewSerializer: buffer too small to encode string (wrote ${read}/${str.length} chars). Call resize() and retry.`
        );
      const written = result.written ?? 0;
      this.view.setUint32(this.index, written, LE);
      this.index += 4 + written;
      return;
    }
    const cached = opts.stringBytesCache.get(str);
    if (cached) {
      if (this.index + 4 + cached.length > this.buffer.byteLength)
        throw new RangeError(
          `DataViewSerializer: buffer too small for cached string (need ${4 + cached.length} bytes, have ${this.buffer.byteLength - this.index}). Call resize() and retry.`
        );
      this.uint8View.set(cached, this.index + 4);
      this.view.setUint32(this.index, cached.length, LE);
      this.index += 4 + cached.length;
      return;
    }
    // Cache miss: encode in place, then snapshot the written bytes. The slice
    // copies (mandatory — the working buffer is overwritten on later writes).
    const targetView = this.uint8View.subarray(this.index + 4);
    const result = textEncoder.encodeInto(str, targetView);
    const read = result.read ?? 0;
    if (read < str.length)
      throw new RangeError(
        `DataViewSerializer: buffer too small to encode string (wrote ${read}/${str.length} chars). Call resize() and retry.`
      );
    const written = result.written ?? 0;
    this.view.setUint32(this.index, written, LE);
    this.index += 4 + written;
    if (opts.stringBytesCache.size >= opts.maxCacheSize) evictStringBytesCache();
    opts.stringBytesCache.set(str, this.uint8View.slice(this.index - written, this.index));
  }
  serFloat64(n: number): void {
    this.view.setFloat64(this.index, n, LE);
    this.index += 8;
  }
  serEnum(n: number | string): void {
    if (typeof n === 'number') {
      this.view.setUint32(this.index, NUM, LE);
      this.index += 4;
      this.view.setUint32(this.index, n, LE);
      this.index += 4;
      return;
    }
    this.view.setUint32(this.index, STR, LE);
    this.index += 4;
    this.serString(n);
  }
  setBitMask(bitMaskIndex: number, bitIndex: number): void {
    const newBitmask = this.view.getUint8(bitMaskIndex) | (1 << bitIndex);
    this.view.setUint8(bitMaskIndex, newBitmask);
  }
}

class DataViewDeserializerImpl implements DataViewDeserializer {
  buffer: StrictArrayBuffer;
  private uint8View: Uint8Array;
  readonly cacheKey: string;
  index: number = 0;
  view: DataView;
  hasEnded: boolean = false;
  constructor(cacheKey: string, buffer: StrictArrayBuffer, byteOffset?: number, byteLength?: number) {
    this.cacheKey = cacheKey;
    this.buffer = buffer;
    this.index = 0;
    this.view = new DataView(buffer, byteOffset, byteLength);
    this.uint8View = new Uint8Array(buffer, byteOffset, byteLength);
  }
  reset(): void {
    this.index = 0;
    this.hasEnded = false;
  }
  setBuffer(buffer: StrictArrayBuffer, byteOffset?: number, byteLength?: number): void {
    this.index = 0;
    this.buffer = buffer;
    this.view = new DataView(buffer, byteOffset, byteLength);
    this.uint8View = new Uint8Array(buffer, byteOffset, byteLength);
    this.hasEnded = false;
  }
  markAsEnded(): void {
    this.hasEnded = true;
  }
  getLength(): number {
    return this.index;
  }
  desString(): string {
    const len = this.view.getUint32(this.index, LE);
    this.index += 4;
    const decoded = textDecoder.decode(this.uint8View.subarray(this.index, this.index + len));
    this.index += len;
    return decoded;
  }
  desSafePropName(): string {
    const key = this.desString();
    const len = key.length;
    if (len === 9) {
      if (key === '__proto__' || key === 'prototype') throw new Error(`Unsafe property name: ${key}`);
    } else if (len === 11) {
      if (key === 'constructor') throw new Error(`Unsafe property name: ${key}`);
    }
    return key;
  }
  desFloat64(): number {
    const value = this.view.getFloat64(this.index, LE);
    this.index += 8;
    return value;
  }
  desEnum(): number | string {
    const type = this.view.getUint32(this.index, LE);
    this.index += 4;
    if (type === NUM) {
      const value = this.view.getUint32(this.index, LE);
      this.index += 4;
      return value;
    }
    return this.desString();
  }
}
