/* ########
 * 2024 ma-jerez
 * Author: Ma-jerez
 * License: UNLICENSED - proprietary, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Low-level Protocol Buffers wire primitives over the DataView serializer /
 *  deserializer. These are the building blocks the protobuf-mode encoder /
 *  decoder bodies call; they are ADDITIVE — the fallback (current binary) codec
 *  is untouched, and the shipped package stays dependency-free.
 *
 *  Wire types: 0 = VARINT (int/uint/sint/bool), 1 = I64 (double / sfixed64),
 *  2 = LEN (string / bytes / embedded message / packed), 5 = I32 (float /
 *  sfixed32). All multi-byte numerics are little-endian, matching protobuf.
 *
 *  These target the `dynamic` size strategy (a real growable buffer with
 *  `ensureCapacity`); the two-pass `precalculate` strategy for protobuf is a
 *  follow-up (the length back-patch in `pbEndLen` needs the real buffer). **/

import type {DataViewSerializer, DataViewDeserializer} from './dataView.ts';

export const WIRE_VARINT = 0;
export const WIRE_I64 = 1;
export const WIRE_LEN = 2;
export const WIRE_I32 = 5;

/** Byte width of an unsigned LEB128 varint for n (n < 2**32). **/
function varintByteLen(n: number): number {
  if (n < 0x80) return 1;
  if (n < 0x4000) return 2;
  if (n < 0x200000) return 3;
  if (n < 0x10000000) return 4;
  return 5;
}

// ── writers ──────────────────────────────────────────────────────────────────

/** Unsigned LEB128 varint (32-bit range). **/
export function pbWriteVarint(ser: DataViewSerializer, value: number): void {
  ser.ensureCapacity?.(5);
  let v = value >>> 0;
  while (v > 0x7f) {
    ser.view.setUint8(ser.index++, (v & 0x7f) | 0x80);
    v >>>= 7;
  }
  ser.view.setUint8(ser.index++, v);
}

/** Unsigned LEB128 varint over a 64-bit value (int64 / uint64 / sint64 payload).
 *  Negative / signed inputs are taken as their two's-complement 64-bit pattern. **/
export function pbWriteVarint64(ser: DataViewSerializer, value: bigint): void {
  ser.ensureCapacity?.(10);
  let v = BigInt.asUintN(64, value);
  while (v > 0x7fn) {
    ser.view.setUint8(ser.index++, Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  ser.view.setUint8(ser.index++, Number(v));
}

/** Field tag: (fieldNumber << 3) | wireType, as a varint. **/
export function pbWriteTag(ser: DataViewSerializer, fieldNumber: number, wireType: number): void {
  pbWriteVarint(ser, ((fieldNumber << 3) | wireType) >>> 0);
}

/** sint32 (zigzag then varint). **/
export function pbWriteZigzag(ser: DataViewSerializer, value: number): void {
  pbWriteVarint(ser, ((value << 1) ^ (value >> 31)) >>> 0);
}

/** sint64 (zigzag then varint). **/
export function pbWriteZigzag64(ser: DataViewSerializer, value: bigint): void {
  pbWriteVarint64(ser, (value << 1n) ^ (value >> 63n));
}

/** double (I64, little-endian). **/
export function pbWriteDouble(ser: DataViewSerializer, value: number): void {
  ser.ensureCapacity?.(8);
  ser.view.setFloat64(ser.index, value, true);
  ser.index += 8;
}

/** float (I32, little-endian). **/
export function pbWriteFloat(ser: DataViewSerializer, value: number): void {
  ser.ensureCapacity?.(4);
  ser.view.setFloat32(ser.index, value, true);
  ser.index += 4;
}

/** bool as a single-byte varint (0 / 1). **/
export function pbWriteBool(ser: DataViewSerializer, value: boolean): void {
  ser.ensureCapacity?.(1);
  ser.view.setUint8(ser.index++, value ? 1 : 0);
}

/** LEN bytes: varint length prefix + raw bytes (zero-copy blit). **/
export function pbWriteBytes(ser: DataViewSerializer, bytes: Uint8Array): void {
  pbWriteVarint(ser, bytes.length);
  ser.ensureCapacity?.(bytes.length);
  new Uint8Array(ser.buffer).set(bytes, ser.index);
  ser.index += bytes.length;
}

/** Open a LEN block (embedded message / packed field): reserve a 1-byte length
 *  slot at the cursor and return its position. The caller writes the field tag
 *  BEFORE calling this, then writes the body, then `pbEndLen(ser, pos)`. **/
export function pbBeginLen(ser: DataViewSerializer): number {
  ser.ensureCapacity?.(1);
  const lenPos = ser.index;
  ser.index += 1;
  return lenPos;
}

/** Close a LEN block opened by `pbBeginLen`: back-patch the body length as a
 *  varint, widening the reserved slot (shifting the body right) when the length
 *  needs more than one byte — the same optimistic-slot trick the string encoder
 *  uses. **/
export function pbEndLen(ser: DataViewSerializer, lenPos: number): void {
  const len = ser.index - lenPos - 1;
  const width = varintByteLen(len);
  if (width === 1) {
    new Uint8Array(ser.buffer)[lenPos] = len;
    return;
  }
  const extra = width - 1;
  ser.ensureCapacity?.(extra);
  const buf = new Uint8Array(ser.buffer);
  buf.copyWithin(lenPos + width, lenPos + 1, ser.index);
  let v = len;
  let pos = lenPos;
  while (v > 0x7f) {
    buf[pos++] = (v & 0x7f) | 0x80;
    v >>>= 7;
  }
  buf[pos] = v;
  ser.index += extra;
}

// ── readers ──────────────────────────────────────────────────────────────────

/** Unsigned LEB128 varint (up to the safe-integer range). **/
export function pbReadVarint(des: DataViewDeserializer): number {
  let value = 0;
  let shift = 0;
  let byte = 0;
  do {
    byte = des.view.getUint8(des.index++);
    value += (byte & 0x7f) * 2 ** shift;
    shift += 7;
  } while (byte & 0x80);
  return value;
}

/** Unsigned 64-bit varint (raw bit pattern; the caller reinterprets as
 *  int64/uint64/sint64). **/
export function pbReadVarint64(des: DataViewDeserializer): bigint {
  let value = 0n;
  let shift = 0n;
  let byte = 0;
  do {
    byte = des.view.getUint8(des.index++);
    value |= BigInt(byte & 0x7f) << shift;
    shift += 7n;
  } while (byte & 0x80);
  return BigInt.asUintN(64, value);
}

/** A field tag varint; the caller splits `tag >>> 3` (field number) and
 *  `tag & 7` (wire type). **/
export function pbReadTag(des: DataViewDeserializer): number {
  return pbReadVarint(des);
}

/** sint32 (varint then zigzag-decode). **/
export function pbReadZigzag(des: DataViewDeserializer): number {
  const v = pbReadVarint(des);
  return (v >>> 1) ^ -(v & 1);
}

/** sint64 (varint then zigzag-decode). **/
export function pbReadZigzag64(des: DataViewDeserializer): bigint {
  const v = pbReadVarint64(des);
  return (v >> 1n) ^ -(v & 1n);
}

/** uint64 (raw unsigned). **/
export function pbReadUint64(des: DataViewDeserializer): bigint {
  return pbReadVarint64(des);
}

/** double (I64, little-endian). **/
export function pbReadDouble(des: DataViewDeserializer): number {
  const v = des.view.getFloat64(des.index, true);
  des.index += 8;
  return v;
}

/** float (I32, little-endian). **/
export function pbReadFloat(des: DataViewDeserializer): number {
  const v = des.view.getFloat32(des.index, true);
  des.index += 4;
  return v;
}

/** bool (varint; any nonzero is true). **/
export function pbReadBool(des: DataViewDeserializer): boolean {
  return pbReadVarint(des) !== 0;
}

/** LEN bytes: read the varint length, return an owned copy of the bytes. **/
export function pbReadBytes(des: DataViewDeserializer): Uint8Array {
  const len = pbReadVarint(des);
  const start = des.view.byteOffset + des.index;
  const out = new Uint8Array(des.view.buffer.slice(start, start + len));
  des.index += len;
  return out;
}

/** A LEN length prefix (e.g. before reading an embedded message body). **/
export function pbReadLen(des: DataViewDeserializer): number {
  return pbReadVarint(des);
}
