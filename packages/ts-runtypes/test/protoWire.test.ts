import {describe, it, expect} from 'vitest';
import {
  createDataViewSerializer,
  createDataViewDeserializer,
  type DataViewSerializer,
  type DataViewDeserializer,
} from '../src/runtypes/dataView.ts';
import {
  WIRE_VARINT,
  WIRE_LEN,
  pbWriteVarint,
  pbWriteVarint64,
  pbWriteTag,
  pbWriteZigzag,
  pbWriteZigzag64,
  pbWriteDouble,
  pbWriteFloat,
  pbWriteBool,
  pbWriteBytes,
  pbBeginLen,
  pbEndLen,
  pbReadVarint,
  pbReadUint64,
  pbReadTag,
  pbReadZigzag,
  pbReadZigzag64,
  pbReadDouble,
  pbReadFloat,
  pbReadBool,
  pbReadBytes,
  pbReadLen,
} from '../src/runtypes/protoWire.ts';

function encode(write: (ser: DataViewSerializer) => void): Uint8Array {
  const ser = createDataViewSerializer('proto-wire-test');
  write(ser);
  return ser.getBufferView();
}

function roundtrip<T>(write: (ser: DataViewSerializer, v: T) => void, read: (des: DataViewDeserializer) => T, value: T): T {
  const bytes = encode((ser) => write(ser, value));
  const des = createDataViewDeserializer('proto-wire-test', bytes);
  return read(des);
}

describe('protoWire — known wire bytes', () => {
  it('encodes varints canonically', () => {
    expect([...encode((s) => pbWriteVarint(s, 0))]).toEqual([0x00]);
    expect([...encode((s) => pbWriteVarint(s, 1))]).toEqual([0x01]);
    expect([...encode((s) => pbWriteVarint(s, 300))]).toEqual([0xac, 0x02]);
  });

  it('encodes a field tag as (field << 3) | wire', () => {
    expect([...encode((s) => pbWriteTag(s, 1, WIRE_VARINT))]).toEqual([0x08]);
    expect([...encode((s) => pbWriteTag(s, 2, WIRE_LEN))]).toEqual([0x12]);
  });

  it('zigzag-encodes signed values', () => {
    expect([...encode((s) => pbWriteZigzag(s, 0))]).toEqual([0x00]);
    expect([...encode((s) => pbWriteZigzag(s, -1))]).toEqual([0x01]);
    expect([...encode((s) => pbWriteZigzag(s, 1))]).toEqual([0x02]);
    expect([...encode((s) => pbWriteZigzag(s, -2))]).toEqual([0x03]);
  });
});

describe('protoWire — round-trips', () => {
  it('varint u32 across widths', () => {
    for (const v of [0, 1, 127, 128, 16383, 16384, 300, 2 ** 28, 0xffffffff]) {
      expect(roundtrip(pbWriteVarint, pbReadVarint, v)).toBe(v);
    }
  });

  it('uint64 and sint64 (bigint)', () => {
    for (const v of [0n, 1n, 18446744073709551615n, 9007199254740993n]) {
      expect(roundtrip(pbWriteVarint64, pbReadUint64, v)).toBe(v);
    }
    for (const v of [0n, -1n, 1n, -123456789012345n, 9223372036854775807n, -9223372036854775808n]) {
      expect(roundtrip(pbWriteZigzag64, pbReadZigzag64, v)).toBe(v);
    }
  });

  it('zigzag32, double, float, bool', () => {
    for (const v of [0, -1, 1, -2147483648, 2147483647]) {
      expect(roundtrip(pbWriteZigzag, pbReadZigzag, v)).toBe(v);
    }
    expect(roundtrip(pbWriteDouble, pbReadDouble, 3.141592653589793)).toBe(3.141592653589793);
    expect(roundtrip(pbWriteFloat, pbReadFloat, 0.5)).toBe(0.5);
    expect(roundtrip(pbWriteBool, pbReadBool, true)).toBe(true);
    expect(roundtrip(pbWriteBool, pbReadBool, false)).toBe(false);
  });

  it('bytes', () => {
    const value = new Uint8Array([0, 1, 2, 254, 255]);
    expect([...roundtrip(pbWriteBytes, pbReadBytes, value)]).toEqual([...value]);
  });
});

describe('protoWire — embedded message length framing', () => {
  it('back-patches a 1-byte length', () => {
    const bytes = encode((ser) => {
      pbWriteTag(ser, 3, WIRE_LEN);
      const pos = pbBeginLen(ser);
      pbWriteTag(ser, 1, WIRE_VARINT);
      pbWriteVarint(ser, 7);
      pbWriteTag(ser, 2, WIRE_VARINT);
      pbWriteVarint(ser, 9);
      pbEndLen(ser, pos);
    });
    const des = createDataViewDeserializer('proto-wire-test', bytes);
    const tag = pbReadTag(des);
    expect(tag >>> 3).toBe(3);
    expect(tag & 7).toBe(WIRE_LEN);
    const len = pbReadLen(des);
    expect(len).toBe(4); // tag+val, tag+val
    expect(pbReadTag(des) >>> 3).toBe(1);
    expect(pbReadVarint(des)).toBe(7);
    expect(pbReadTag(des) >>> 3).toBe(2);
    expect(pbReadVarint(des)).toBe(9);
  });

  it('widens to a 2-byte length when the body exceeds 127 bytes (shift)', () => {
    const big = new Uint8Array(200).fill(7);
    const bytes = encode((ser) => {
      pbWriteTag(ser, 1, WIRE_LEN);
      const pos = pbBeginLen(ser);
      pbWriteTag(ser, 1, WIRE_LEN);
      pbWriteBytes(ser, big);
      pbEndLen(ser, pos);
    });
    const des = createDataViewDeserializer('proto-wire-test', bytes);
    expect(pbReadTag(des) & 7).toBe(WIRE_LEN);
    const len = pbReadLen(des);
    expect(len).toBeGreaterThan(127);
    expect(pbReadTag(des) & 7).toBe(WIRE_LEN);
    const inner = pbReadBytes(des);
    expect(inner.length).toBe(200);
    expect([...inner.slice(0, 3)]).toEqual([7, 7, 7]);
  });
});
