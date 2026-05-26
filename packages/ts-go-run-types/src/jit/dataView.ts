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

const STR = 1;
const NUM = 2;
const POW_2_32 = 2 ** 32;
const LE = true;

const DEFAULT_BUFFER_SIZE = 2 ** 24; // 16 MiB

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

/** Public interface implemented by DataViewSerializerImpl. Mirrors the
 *  shape mion exposes from `@mionjs/core` so user code can be typed
 *  against it without depending on the concrete class. **/
export interface DataViewSerializer {
  readonly buffer: ArrayBuffer;
  readonly routeId: string;
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
  readonly routeId: string;
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

/** Creates a DataView-based serializer for binary serialization. The
 *  routeId is preserved on the instance for diagnostics; `size` controls
 *  the backing buffer size (defaults to 16 MiB). **/
export function createDataViewSerializer(routeId: string, size: number = DEFAULT_BUFFER_SIZE): DataViewSerializer {
  if (size >= POW_2_32) throw new Error('bufferSize must be strictly less than 2 ** 32');
  return new DataViewSerializerImpl(routeId, size);
}

/** Creates a deserializer from ArrayBuffer or any typed-array view
 *  (including Node.js Buffer). **/
export function createDataViewDeserializer(routeId: string, input: BinaryInput): DataViewDeserializer {
  if (ArrayBuffer.isView(input)) {
    const buffer = input.buffer as StrictArrayBuffer;
    return new DataViewDeserializerImpl(routeId, buffer, input.byteOffset, input.byteLength);
  }
  return new DataViewDeserializerImpl(routeId, input as StrictArrayBuffer);
}

class DataViewSerializerImpl implements DataViewSerializer {
  buffer: ArrayBuffer;
  private uint8View: Uint8Array;
  readonly routeId: string;
  index: number = 0;
  view: DataView;
  hasEnded: boolean = false;
  constructor(routeId: string, size: number) {
    this.routeId = routeId;
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
  }
  getLength(): number {
    return this.index;
  }
  serString(str: string, _skipCache?: boolean): void {
    const targetView = this.uint8View.subarray(this.index + 4);
    const result = textEncoder.encodeInto(str, targetView);
    const written = result.written ?? 0;
    this.view.setUint32(this.index, written, LE);
    this.index += 4 + written;
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
  readonly routeId: string;
  index: number = 0;
  view: DataView;
  hasEnded: boolean = false;
  constructor(routeId: string, buffer: StrictArrayBuffer, byteOffset?: number, byteLength?: number) {
    this.routeId = routeId;
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
