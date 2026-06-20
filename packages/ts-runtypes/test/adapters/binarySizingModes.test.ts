// Buffer-sizing strategies: createBinaryEncoder({sizeStrategy}) specializes the
// returned function's signature + overflow behavior. All four produce identical
// wire bytes and return a DataViewSerializer (read via getBufferView()/getLength();
// createBinaryDecoder also accepts the serializer directly, so decode(encode(v))
// round-trips):
//   - 'dynamic'      (default) (val) => Ser            grow as needed
//   - 'precalculate'           (val) => Ser            measure pass → exact, can't overflow
//   - 'initialSize'            (val, size) => Ser       caller size; throws on overflow
//   - 'into'                   (val, into) => Ser       caller buffer; throws on overflow (zero-copy)

import * as TF from 'ts-runtypes/formats';
import {describe, it, expect} from 'vitest';
import * as RT from 'ts-runtypes/schema';
import {
  createBinaryEncoder,
  createBinaryDecoder,
  createBinarySizer,
  RunTypeKind,
  type BinaryEncoderFn,
  type BinaryEncoderSizeFn,
  type BinaryEncoderIntoFn,
  type BinarySizerFn,
  type BinaryDecoderFn,
} from 'ts-runtypes';
import {createSizingSerializer, createDataViewSerializer} from '../../src/runtypes/dataView.ts';

describe('binary sizing — measure pass matches the encoder', () => {
  it('serString size math equals real bytes written', () => {
    const samples = ['', 'a', 'hello', 'café', '€uro', '𝔘nicode surrogate', 'x'.repeat(200), 'y'.repeat(20000)];
    for (const s of samples) {
      const sizer = createSizingSerializer('k');
      sizer.serString(s);
      const real = createDataViewSerializer('k', 1 << 20);
      real.serString(s);
      expect(sizer.getLength(), `serString(${JSON.stringify(s.slice(0, 12))}…)`).toBe(real.getLength());
    }
  });

  it('serLength size math equals real bytes written (varint boundaries)', () => {
    for (const n of [0, 1, 127, 128, 300, 16383, 16384, 2097151, 2097152, 1_000_000]) {
      const sizer = createSizingSerializer('k');
      sizer.serLength(n);
      const real = createDataViewSerializer('k', 16);
      real.serLength(n);
      expect(sizer.getLength(), `serLength(${n})`).toBe(real.getLength());
    }
  });
});

describe('binary sizing — fixed-size serializers never call ensureCapacity', () => {
  it("growing serializer has a grow fn; fixed-size, caller-buffer, and measure pass do not", () => {
    expect(createDataViewSerializer('k', {grow: true}).ensureCapacity, 'dynamic').toBeTypeOf('function');
    expect(createDataViewSerializer('k', {size: 64, grow: false}).ensureCapacity, 'fixed size').toBeUndefined();
    expect(createDataViewSerializer('k', {buffer: new ArrayBuffer(64)}).ensureCapacity, 'into buffer').toBeUndefined();
    expect(createSizingSerializer('k').ensureCapacity, 'measure pass').toBeUndefined();
  });
});

// The four encoders + sizer + decoder are created at the CALL SITE against a
// concrete schema (a generic RunType<T> helper would erase the type and inject the
// wrong entry), then handed in here. `createBinarySizer` gives the exact size for
// the fixed-size strategies.
interface StrategyBundle {
  dynamic: BinaryEncoderFn;
  precalculate: BinaryEncoderFn;
  initialSize: BinaryEncoderSizeFn;
  into: BinaryEncoderIntoFn;
  sizer: BinarySizerFn;
  dec: BinaryDecoderFn<unknown>;
}

function assertStrategiesAgree<T>(b: StrategyBundle, value: T): void {
  const size = b.sizer(value);
  const ref = Array.from(b.dynamic(value).getBufferView());
  expect(Array.from(b.precalculate(value).getBufferView()), 'precalculate == dynamic').toEqual(ref);
  expect(Array.from(b.initialSize(value, size).getBufferView()), 'initialSize == dynamic').toEqual(ref);
  expect(Array.from(b.into(value, new ArrayBuffer(size)).getBufferView()), 'into == dynamic').toEqual(ref);

  expect(b.dec(b.dynamic(value)), 'dynamic round-trips').toEqual(value);
  expect(b.dec(b.precalculate(value)), 'precalculate round-trips').toEqual(value);
  expect(b.dec(b.initialSize(value, size)), 'initialSize round-trips').toEqual(value);
  expect(b.dec(b.into(value, new ArrayBuffer(size))), 'into round-trips').toEqual(value);
}

describe('binary sizing — all four strategies are byte-identical + round-trip', () => {
  it('bare string', () => {
    const s = TF.string();
    assertStrategiesAgree(
      {
        dynamic: createBinaryEncoder(s),
        precalculate: createBinaryEncoder(s, {sizeStrategy: 'precalculate'}),
        initialSize: createBinaryEncoder(s, {sizeStrategy: 'initialSize'}),
        into: createBinaryEncoder(s, {sizeStrategy: 'into'}),
        sizer: createBinarySizer(s),
        dec: createBinaryDecoder(s),
      },
      'hello world'
    );
  });

  it('object with mixed scalars + array + optional', () => {
    const s = RT.object({
      id: TF.number(),
      name: TF.string(),
      active: RT.boolean(),
      tags: RT.array(TF.string()),
      note: RT.optional(TF.string()),
    });
    const b: StrategyBundle = {
      dynamic: createBinaryEncoder(s),
      precalculate: createBinaryEncoder(s, {sizeStrategy: 'precalculate'}),
      initialSize: createBinaryEncoder(s, {sizeStrategy: 'initialSize'}),
      into: createBinaryEncoder(s, {sizeStrategy: 'into'}),
      sizer: createBinarySizer(s),
      dec: createBinaryDecoder(s),
    };
    assertStrategiesAgree(b, {id: 7, name: 'Ada', active: true, tags: ['a', 'bb', 'ccc'], note: 'x'});
    assertStrategiesAgree(b, {id: 0, name: '', active: false, tags: []}); // note absent
  });

  it('array of numbers (inline fixed-width loop)', () => {
    const s = RT.array(TF.number());
    assertStrategiesAgree(
      {
        dynamic: createBinaryEncoder(s),
        precalculate: createBinaryEncoder(s, {sizeStrategy: 'precalculate'}),
        initialSize: createBinaryEncoder(s, {sizeStrategy: 'initialSize'}),
        into: createBinaryEncoder(s, {sizeStrategy: 'into'}),
        sizer: createBinarySizer(s),
        dec: createBinaryDecoder(s),
      },
      [1, 2.5, -3, 1e9, 0]
    );
  });

  it('union of object members', () => {
    const s = RT.union([RT.object({kind: RT.literal('a'), x: TF.number()}), RT.object({kind: RT.literal('b'), y: TF.string()})]);
    expect(s.kind).toBe(RunTypeKind.union);
    const b: StrategyBundle = {
      dynamic: createBinaryEncoder(s),
      precalculate: createBinaryEncoder(s, {sizeStrategy: 'precalculate'}),
      initialSize: createBinaryEncoder(s, {sizeStrategy: 'initialSize'}),
      into: createBinaryEncoder(s, {sizeStrategy: 'into'}),
      sizer: createBinarySizer(s),
      dec: createBinaryDecoder(s),
    };
    assertStrategiesAgree(b, {kind: 'a', x: 42});
    assertStrategiesAgree(b, {kind: 'b', y: 'hello'});
  });
});

describe("binary sizing — 'initialSize' enforces its fixed buffer", () => {
  it('throws RangeError when size is too small, succeeds at the exact size', () => {
    const s = RT.object({name: TF.string(), tags: RT.array(TF.string())});
    const value = {name: 'Ada Lovelace', tags: ['mathematician', 'programmer']};
    const exact = createBinarySizer(s)(value);
    const enc = createBinaryEncoder(s, {sizeStrategy: 'initialSize'});

    expect(() => enc(value, exact - 1)).toThrow(RangeError);
    expect(createBinaryDecoder(s)(enc(value, exact))).toEqual(value);
    expect(enc(value, exact).getLength()).toBe(exact);
  });
});

describe("binary sizing — 'into' writes into the caller's buffer", () => {
  it('zero-copy view into the supplied buffer; throws when it does not fit', () => {
    const s = RT.array(TF.string());
    const value = ['alpha', 'beta', 'gamma'];
    const exact = createBinarySizer(s)(value);
    const enc = createBinaryEncoder(s, {sizeStrategy: 'into'});

    const buf = new ArrayBuffer(exact);
    const view = enc(value, buf).getBufferView();
    expect(view.buffer, 'view aliases the caller buffer (zero-copy)').toBe(buf);
    expect(view.byteLength).toBe(exact);
    expect(createBinaryDecoder(s)(enc(value, new ArrayBuffer(exact)))).toEqual(value);

    expect(() => enc(value, new ArrayBuffer(exact - 1))).toThrow(RangeError);
  });
});

describe('createBinarySizer — exact byte count without allocating', () => {
  it('value-first form: sizer === encoder getLength', () => {
    const s = RT.object({id: TF.number(), name: TF.string(), tags: RT.array(TF.string())});
    const size = createBinarySizer(s);
    const enc = createBinaryEncoder(s);
    for (const v of [
      {id: 1, name: 'a', tags: []},
      {id: 2, name: 'hello', tags: ['x', 'yy', 'zzz']},
    ]) {
      expect(size(v)).toBe(enc(v).getLength());
    }
  });

  it('static form: sizer === encoder getLength', () => {
    const size = createBinarySizer<{a: number; b: string}>();
    const enc = createBinaryEncoder<{a: number; b: string}>();
    const v = {a: 42, b: 'hello world'};
    expect(size(v)).toBe(enc(v).getLength());
  });
});
