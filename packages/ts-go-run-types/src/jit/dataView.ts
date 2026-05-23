// DataView-based binary serializer + deserializer ported from
// mion/packages/core/src/binary/dataView.ts. Kept self-contained
// (no @mionjs/core dependency) so the marker package stays runtime-
// dependency-free.
//
// Wire format details live alongside the encode/decode in mion's
// binarySPEC.md; the short version:
//   - Always little-endian (LE = true).
//   - Strings: `[uint32 length, utf8 bytes]` via `serString` / `desString`.
//   - Numbers: float64 via `serFloat64` / `desFloat64`.
//   - Enums: `[uint32 typeTag, value]` where typeTag is 1 (string) or 2
//     (number); decoded via `desEnum`.
//   - Optional-property bitmaps: 1 bit per optional prop, 8 per byte.
//     Encoder primes the bitmap byte(s) to zero via the buffer's
//     `setUint8` then flips bits via `setBitMask`. Decoder reads the
//     bitmap byte(s) and tests each bit before decoding the matching
//     prop.
//
// The classes are exposed at runtime so emitted JIT bodies can construct
// them via the `utl.createSerializer(...)` / `utl.createDeserializer(...)`
// bindings (see jitUtils.ts).
//
// Two performance optimisations ported from mion:
//   - **String bytes cache** — short strings (default <64 chars) are
//     UTF-8-encoded once and blitted on repeat encodes, skipping the
//     `TextEncoder` round-trip. Bounded by `maxCacheSize` with a half-
//     LRU eviction. Optional `skipCache` bypass.
//   - **Adaptive buffer sizing** — `createDataViewSerializer(cacheKey)`
//     pre-allocates `historicalAverage × sizeMultiplier`, with a cold-
//     start fallback of `defaultBufferSize`. The rolling average is fed
//     by `markAsEnded()`. Keyed on the caller-supplied `cacheKey`
//     (generic string — typically the runtype hash for ts-go-run-types
//     callers; not coupled to any router concept).
//
// Tune via `setSerializationOptions({...})`. The optional `sizeHistory`
// and `stringBytesCache` overrides let tests / multi-tenant consumers
// scope state instead of sharing the module-level maps.

const STR = 1;
const NUM = 2;
const POW_2_32 = 2 ** 32;
const LE = true;

// Minimal ambient declarations — the package's tsconfig sets `types: []`
// so the standard `lib.dom.d.ts` globals aren't visible by default.
// TextEncoder / TextDecoder are universally available in both Node (>=
// 11) and every browser, so the typing surface here matches what we
// actually call.
declare const TextEncoder: {
  new (): {encodeInto(input: string, dest: Uint8Array): {written?: number; read?: number}};
};
declare const TextDecoder: {
  new (): {decode(input?: ArrayBufferView | ArrayBuffer): string};
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Tagged ArrayBuffer with the SharedArrayBuffer carve-out — the same
 *  shape mion uses to keep TS happy when slicing typed arrays. **/
export type StrictArrayBuffer = ArrayBuffer & {__brand?: 'StrictArrayBuffer'};

/** Acceptable buffer-like input for the deserializer. Accepts a raw
 *  ArrayBuffer or any typed-array view (Uint8Array, Node Buffer, …). **/
export type BinaryInput = StrictArrayBuffer | ArrayBufferView;

/** Tunable serializer behaviour. All knobs default to the values mion
 *  ships; override via `setSerializationOptions({...})`. **/
export interface SerializationOptions {
  /** Cold-start buffer size when no `sizeHistory` entry exists for the
   *  serializer's cache key. Default 16 MiB (`2 ** 24`). **/
  defaultBufferSize: number;
  /** Safety headroom factor applied to historical averages on warm
   *  paths: `allocSize = avg * sizeMultiplier`. Default 2. **/
  sizeMultiplier: number;
  /** Strings strictly shorter than this bypass the bytes cache (the
   *  cost of the map lookup + slice outweighs the encode for long
   *  payloads). Default 64. **/
  maxStrCacheLength: number;
  /** Maximum entries in the bytes cache before half-LRU eviction
   *  triggers. Default 1000. **/
  maxCacheSize: number;
  /** Cache-key → rolling-average bytes-written map. Defaults to a
   *  module-level singleton; pass a fresh `Map` to scope history
   *  (tests, multi-tenant runtimes). **/
  sizeHistory: Map<string, number>;
  /** Source-string → cached UTF-8 bytes. Same scoping story as
   *  `sizeHistory`. **/
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

/** Patches the active serialization options. Unspecified fields keep
 *  their current value (initialised from `DEFAULTS`). Passing a fresh
 *  `Map` for `sizeHistory` or `stringBytesCache` lets a caller scope
 *  state so it doesn't share with other consumers in the same process —
 *  e.g. between unit tests or per-tenant servers. **/
export function setSerializationOptions(patch: Partial<SerializationOptions>): void {
  opts = {...opts, ...patch};
}

/** Public interface implemented by DataViewSerializerImpl. Mirrors the
 *  shape mion exposes from `@mionjs/core` so user code can be typed
 *  against it without depending on the concrete class. **/
export interface DataViewSerializer {
  readonly buffer: ArrayBuffer;
  /** Generic cache key the size-history and (any) diagnostics are
   *  keyed by. Not tied to any router concept — callers typically pass
   *  the runtype hash or any other stable per-payload-shape string. **/
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

/** Optional `createDataViewSerializer` arguments. `size` is an explicit
 *  override; when omitted, `relatedKeys` (if any) sum-of-averages is
 *  used, otherwise the single `cacheKey` average is used; falling back
 *  to `defaultBufferSize` on a cold cache. **/
export interface CreateSerializerOptions {
  size?: number;
  relatedKeys?: string[];
}

/** Creates a DataView-based serializer. `cacheKey` is used both for
 *  diagnostics and as the size-history bucket — typically the runtype
 *  hash for ts-go-run-types callers, but any stable string works. **/
export function createDataViewSerializer(cacheKey: string, options?: CreateSerializerOptions | number): DataViewSerializer {
  // Number overload preserved for back-compat with mion-style callers
  // that pass an explicit size as the second positional arg.
  const explicitSize = typeof options === 'number' ? options : options?.size;
  const relatedKeys = typeof options === 'object' ? options.relatedKeys : undefined;
  const size = explicitSize ?? predictBufferSize(cacheKey, relatedKeys);
  if (size >= POW_2_32) throw new Error('bufferSize must be strictly less than 2 ** 32');
  return new DataViewSerializerImpl(cacheKey, size);
}

/** Creates a deserializer from ArrayBuffer or any typed-array view
 *  (including Node.js Buffer). **/
export function createDataViewDeserializer(cacheKey: string, input: BinaryInput): DataViewDeserializer {
  if (ArrayBuffer.isView(input)) {
    const buffer = input.buffer as StrictArrayBuffer;
    return new DataViewDeserializerImpl(cacheKey, buffer, input.byteOffset, input.byteLength);
  }
  return new DataViewDeserializerImpl(cacheKey, input as StrictArrayBuffer);
}

/** Computes the predicted buffer size for a fresh serializer. Sum of
 *  historical averages × multiplier for related keys, or the single
 *  key's history × multiplier, falling back to `defaultBufferSize`. **/
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

/** Updates the rolling average for `cacheKey`. Uses mion's EMA-against-
 *  default approach: the cold-start sample blends against
 *  `defaultBufferSize` rather than replacing it, so the predicted size
 *  for the *next* call never drops below half the default — preventing
 *  under-allocation when the first observation is tiny. Convergence is
 *  slow (~5 iterations) but always safe. **/
function recordObservedSize(cacheKey: string, observed: number): void {
  const prev = opts.sizeHistory.get(cacheKey) ?? opts.defaultBufferSize;
  opts.sizeHistory.set(cacheKey, Math.floor((prev + observed) / 2));
}

/** Half-LRU eviction — drops the older half of the bytes cache when it
 *  exceeds `maxCacheSize`. Mion's heuristic; cheap and good enough. **/
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
      // `encodeInto` silently truncates when the destination is too
      // small. We need the explicit read-length check to surface the
      // failure as a RangeError — otherwise callers persist a corrupted
      // length prefix and round-trips silently lose data.
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
    // Cache miss: encode in place, then snapshot the written bytes for
    // future hits. The slice copies (mandatory — the working buffer is
    // overwritten on subsequent writes).
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
