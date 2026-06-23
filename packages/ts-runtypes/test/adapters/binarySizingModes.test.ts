// Buffer-sizing modes: createBinaryEncoder(value, {sizing}) supports three modes
// that differ only in how the buffer is sized and whether the serializer grows —
// the wire bytes are identical across all of them:
//   - 'dynamic'      (default) predict per-key + grow in place
//   - 'precalculate'          measure pass → allocate exactly, never grows
//   - 'initial'               caller-fixed bufferSize, never grows, throws on overflow
//
// What must hold:
//   1. the sizer's serString/serLength size math equals the real bytes written;
//   2. all three modes are byte-identical to each other and round-trip;
//   3. the fixed-size modes leave `ensureCapacity` undefined (never called), while
//      dynamic has it defined;
//   4. 'initial' throws a RangeError when bufferSize is too small, and succeeds at
//      the exact size.

import * as TF from 'ts-runtypes/formats';
import {describe, it, expect} from 'vitest';
import * as RT from 'ts-runtypes/schema';
import {createBinaryEncoder, createBinaryDecoder, createBinarySizer, RunTypeKind} from 'ts-runtypes';
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

describe('binary sizing — the fixed-size modes never call ensureCapacity', () => {
  it("'dynamic' serializer has a grow function; fixed-size + measure pass do not", () => {
    expect(createDataViewSerializer('k', {grow: true}).ensureCapacity, 'dynamic').toBeTypeOf('function');
    expect(createDataViewSerializer('k', {size: 64, grow: false}).ensureCapacity, 'precalculate/initial').toBeUndefined();
    expect(createSizingSerializer('k').ensureCapacity, 'measure pass').toBeUndefined();
  });
});

// Each case inlines a concrete schema so the plugin resolves the encoder type.
// `bufferSize` is set generously; getBuffer() slices to the actual length, so the
// 'initial' bytes still match the other modes exactly.
function assertModesAgree<T>(
  encDynamic: (v: T) => ArrayBuffer,
  encPrecalculate: (v: T) => ArrayBuffer,
  encInitial: (v: T) => ArrayBuffer,
  decode: (b: ArrayBuffer) => unknown,
  value: T
): void {
  const dynamic = Array.from(new Uint8Array(encDynamic(value)));
  expect(Array.from(new Uint8Array(encPrecalculate(value))), 'precalculate == dynamic').toEqual(dynamic);
  expect(Array.from(new Uint8Array(encInitial(value))), 'initial == dynamic').toEqual(dynamic);
  expect(decode(encPrecalculate(value)), 'precalculate round-trips').toEqual(value);
  expect(decode(encInitial(value)), 'initial round-trips').toEqual(value);
}

describe('binary sizing — all three modes are byte-identical + round-trip', () => {
  it('bare string', () => {
    const s = TF.string();
    assertModesAgree(
      createBinaryEncoder(s),
      createBinaryEncoder(s, {sizing: 'precalculate'}),
      createBinaryEncoder(s, {sizing: 'initial', bufferSize: 4096}),
      createBinaryDecoder(s),
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
    const dyn = createBinaryEncoder(s);
    const pre = createBinaryEncoder(s, {sizing: 'precalculate'});
    const init = createBinaryEncoder(s, {sizing: 'initial', bufferSize: 4096});
    const dec = createBinaryDecoder(s);
    assertModesAgree(dyn, pre, init, dec, {id: 7, name: 'Ada', active: true, tags: ['a', 'bb', 'ccc'], note: 'x'});
    assertModesAgree(dyn, pre, init, dec, {id: 0, name: '', active: false, tags: []}); // note absent
  });

  it('array of numbers (inline fixed-width loop)', () => {
    const s = RT.array(TF.number());
    assertModesAgree(
      createBinaryEncoder(s),
      createBinaryEncoder(s, {sizing: 'precalculate'}),
      createBinaryEncoder(s, {sizing: 'initial', bufferSize: 4096}),
      createBinaryDecoder(s),
      [1, 2.5, -3, 1e9, 0]
    );
  });

  it('union of object members', () => {
    const s = RT.union([RT.object({kind: RT.literal('a'), x: TF.number()}), RT.object({kind: RT.literal('b'), y: TF.string()})]);
    expect(s.kind).toBe(RunTypeKind.union);
    const dyn = createBinaryEncoder(s);
    const pre = createBinaryEncoder(s, {sizing: 'precalculate'});
    const init = createBinaryEncoder(s, {sizing: 'initial', bufferSize: 4096});
    const dec = createBinaryDecoder(s);
    assertModesAgree(dyn, pre, init, dec, {kind: 'a', x: 42});
    assertModesAgree(dyn, pre, init, dec, {kind: 'b', y: 'hello'});
  });
});

describe("binary sizing — 'initial' enforces its fixed buffer", () => {
  it('throws RangeError when bufferSize is too small, succeeds at the exact size', () => {
    const s = RT.object({name: TF.string(), tags: RT.array(TF.string())});
    const value = {name: 'Ada Lovelace', tags: ['mathematician', 'programmer']};
    const exactSize = createBinaryEncoder(s)(value).byteLength;

    const tooSmall = createBinaryEncoder(s, {sizing: 'initial', bufferSize: exactSize - 1});
    expect(() => tooSmall(value)).toThrow(RangeError);

    const exact = createBinaryEncoder(s, {sizing: 'initial', bufferSize: exactSize});
    expect(createBinaryDecoder(s)(exact(value))).toEqual(value);
    expect(exact(value).byteLength).toBe(exactSize);
  });

  it('throws a helpful error when bufferSize is omitted', () => {
    const s = TF.string();
    // bufferSize is optional at the type level; the requirement is a runtime guard.
    const enc = createBinaryEncoder(s, {sizing: 'initial'});
    expect(() => enc('x')).toThrow(/requires a numeric `bufferSize`/);
  });
});

describe('createBinarySizer — exact byte count without allocating', () => {
  // The sizer runs the SAME 'tb' body as the encoder against a measure serializer,
  // so it must equal the encoder's byteLength for every value. Both call forms are
  // covered (value-first + static), which also pins that the plugin injects the
  // InjectTypeFnArgs slot at the right position for this two-arg factory.
  it('value-first form: sizer === encoder byteLength', () => {
    const s = RT.object({id: TF.number(), name: TF.string(), tags: RT.array(TF.string())});
    const size = createBinarySizer(s);
    const enc = createBinaryEncoder(s);
    for (const v of [
      {id: 1, name: 'a', tags: []},
      {id: 2, name: 'hello', tags: ['x', 'yy', 'zzz']},
    ]) {
      expect(size(v)).toBe(enc(v).byteLength);
    }
  });

  it('static form: sizer === encoder byteLength', () => {
    const size = createBinarySizer<{a: number; b: string}>();
    const enc = createBinaryEncoder<{a: number; b: string}>();
    const v = {a: 42, b: 'hello world'};
    expect(size(v)).toBe(enc(v).byteLength);
  });

  it("feeds sizing:'initial' bufferSize exactly", () => {
    const s = RT.array(TF.string());
    const size = createBinarySizer(s);
    const v = ['alpha', 'beta', 'gamma'];
    const enc = createBinaryEncoder(s, {sizing: 'initial', bufferSize: size(v)});
    expect(createBinaryDecoder(s)(enc(v))).toEqual(v);
  });
});
