// Binary round-trip adapter — drives a focused subset of types
// through createBinaryEncoder → createBinaryDecoder and asserts the
// decoded value deep-equals the original. Mirrors the
// serialization-suite pattern but stays narrow until the binary port's
// emit logic is verified across every bucket.
//
// Success criterion: decoder(encoder(v)) deep-equals v. Cases where
// the round-trip is asymmetric (e.g. functions stripped on decode)
// document the asymmetry inline.

import {describe, expect, it} from 'vitest';
import {
  createBinaryEncoder,
  createBinaryDecoder,
  createDataViewSerializer,
} from '@mionjs/ts-go-run-types';

describe('binary round-trip: atomic', () => {
  it('string', () => {
    const enc = createBinaryEncoder<string>();
    const dec = createBinaryDecoder<string>();
    for (const v of ['', 'hello', '🌍', 'مرحبا', '你好', 'Здравствуйте']) {
      expect(dec(enc(v))).toBe(v);
    }
  });

  it('number', () => {
    const enc = createBinaryEncoder<number>();
    const dec = createBinaryDecoder<number>();
    for (const v of [0, 1, -1, 1.5, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]) {
      expect(dec(enc(v))).toBe(v);
    }
  });

  it('boolean', () => {
    const enc = createBinaryEncoder<boolean>();
    const dec = createBinaryDecoder<boolean>();
    expect(dec(enc(true))).toBe(true);
    expect(dec(enc(false))).toBe(false);
  });

  it('bigint', () => {
    const enc = createBinaryEncoder<bigint>();
    const dec = createBinaryDecoder<bigint>();
    for (const v of [0n, 1n, -1n, 1234567890123456789n]) {
      expect(dec(enc(v))).toBe(v);
    }
  });

  it('null', () => {
    const enc = createBinaryEncoder<null>();
    const dec = createBinaryDecoder<null>();
    expect(dec(enc(null))).toBe(null);
  });

  it('Date', () => {
    const enc = createBinaryEncoder<Date>();
    const dec = createBinaryDecoder<Date>();
    const v = new Date('2024-06-15T12:30:00Z');
    const out = dec(enc(v)) as Date;
    expect(out instanceof Date).toBe(true);
    expect(out.getTime()).toBe(v.getTime());
  });

  it('RegExp', () => {
    const enc = createBinaryEncoder<RegExp>();
    const dec = createBinaryDecoder<RegExp>();
    const v = /hello-(world)+/gi;
    const out = dec(enc(v)) as RegExp;
    expect(out instanceof RegExp).toBe(true);
    expect(out.source).toBe(v.source);
    expect(out.flags).toBe(v.flags);
  });
});

describe('binary round-trip: arrays', () => {
  it('string[]', () => {
    const enc = createBinaryEncoder<string[]>();
    const dec = createBinaryDecoder<string[]>();
    const v = ['a', 'b', 'c', 'd'];
    expect(dec(enc(v))).toEqual(v);
  });

  it('number[]', () => {
    const enc = createBinaryEncoder<number[]>();
    const dec = createBinaryDecoder<number[]>();
    const v = [1, 2, 3, 4.5, -7];
    expect(dec(enc(v))).toEqual(v);
  });

  it('empty array', () => {
    const enc = createBinaryEncoder<string[]>();
    const dec = createBinaryDecoder<string[]>();
    expect(dec(enc([]))).toEqual([]);
  });
});

describe('binary round-trip: object literals', () => {
  it('flat required props', () => {
    interface U {
      name: string;
      age: number;
    }
    const enc = createBinaryEncoder<U>();
    const dec = createBinaryDecoder<U>();
    const v: U = {name: 'Alice', age: 30};
    expect(dec(enc(v))).toEqual(v);
  });

  it('mixed required + optional', () => {
    interface U {
      name: string;
      nickname?: string;
      age: number;
    }
    const enc = createBinaryEncoder<U>();
    const dec = createBinaryDecoder<U>();
    const present: U = {name: 'Alice', nickname: 'Al', age: 30};
    const absent: U = {name: 'Bob', age: 25};
    expect(dec(enc(present))).toEqual(present);
    // Absent optional should decode without the nickname property OR
    // with nickname === undefined. The latter is the natural shape from
    // the bitmap-skip codepath.
    const decoded = dec(enc(absent)) as U;
    expect(decoded.name).toBe('Bob');
    expect(decoded.age).toBe(25);
    expect(decoded.nickname).toBeUndefined();
  });

  it('nested objects', () => {
    interface Inner {
      x: number;
    }
    interface Outer {
      inner: Inner;
      label: string;
    }
    const enc = createBinaryEncoder<Outer>();
    const dec = createBinaryDecoder<Outer>();
    const v: Outer = {inner: {x: 42}, label: 'root'};
    expect(dec(enc(v))).toEqual(v);
  });
});

describe('binary round-trip: with shared serializer', () => {
  it('allows passing a pre-built serializer', () => {
    const enc = createBinaryEncoder<string>();
    const dec = createBinaryDecoder<string>();
    const ser = createDataViewSerializer('test');
    const buf = enc('hello', ser);
    expect(dec(buf)).toBe('hello');
  });
});

describe('binary round-trip: tuples', () => {
  it('fixed tuple [string, number]', () => {
    type T = [string, number];
    const enc = createBinaryEncoder<T>();
    const dec = createBinaryDecoder<T>();
    const v: T = ['hello', 42];
    expect(dec(enc(v))).toEqual(v);
  });

  it('tuple with optional [string, number?]', () => {
    type T = [string, number?];
    const enc = createBinaryEncoder<T>();
    const dec = createBinaryDecoder<T>();
    const present: T = ['x', 1];
    expect(dec(enc(present))).toEqual(present);
  });
});

describe('binary round-trip: Map / Set', () => {
  it('Map<string, number>', () => {
    type T = Map<string, number>;
    const enc = createBinaryEncoder<T>();
    const dec = createBinaryDecoder<T>();
    const v = new Map<string, number>([
      ['a', 1],
      ['b', 2],
      ['c', 3],
    ]);
    const out = dec(enc(v)) as Map<string, number>;
    expect(out instanceof Map).toBe(true);
    expect([...out.entries()]).toEqual([...v.entries()]);
  });

  it('Set<string>', () => {
    type T = Set<string>;
    const enc = createBinaryEncoder<T>();
    const dec = createBinaryDecoder<T>();
    const v = new Set<string>(['a', 'b', 'c']);
    const out = dec(enc(v)) as Set<string>;
    expect(out instanceof Set).toBe(true);
    expect([...out]).toEqual([...v]);
  });

  it('empty Map', () => {
    type T = Map<string, number>;
    const enc = createBinaryEncoder<T>();
    const dec = createBinaryDecoder<T>();
    const v = new Map<string, number>();
    const out = dec(enc(v)) as Map<string, number>;
    expect(out instanceof Map).toBe(true);
    expect(out.size).toBe(0);
  });
});

describe('binary round-trip: unions (flat-prop format)', () => {
  it('atomic union string | number', () => {
    type T = string | number;
    const enc = createBinaryEncoder<T>();
    const dec = createBinaryDecoder<T>();
    expect(dec(enc('hello'))).toBe('hello');
    expect(dec(enc(42))).toBe(42);
  });

  it('atomic union string | boolean | number', () => {
    type T = string | boolean | number;
    const enc = createBinaryEncoder<T>();
    const dec = createBinaryDecoder<T>();
    expect(dec(enc('s'))).toBe('s');
    expect(dec(enc(true))).toBe(true);
    expect(dec(enc(42))).toBe(42);
  });

  it('object union with shared props', () => {
    type T = {kind: 'a'; value: number} | {kind: 'b'; label: string};
    const enc = createBinaryEncoder<T>();
    const dec = createBinaryDecoder<T>();
    const a: T = {kind: 'a', value: 1};
    const b: T = {kind: 'b', label: 'hi'};
    // The flat-prop encoder merges these into one envelope with kind +
    // value (when present) + label (when present). Decoded shape carries
    // every merged prop slot, with undefined for the branch that didn't
    // match.
    const aOut = dec(enc(a)) as Record<string, unknown>;
    expect(aOut.kind).toBe('a');
    expect(aOut.value).toBe(1);
    const bOut = dec(enc(b)) as Record<string, unknown>;
    expect(bOut.kind).toBe('b');
    expect(bOut.label).toBe('hi');
  });
});
