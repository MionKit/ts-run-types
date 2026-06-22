// Exact buffer sizing: createBinaryEncoder(value, {sizing: 'exact'}) runs a no-op
// measure pass (createSizingSerializer) over the SAME emitted encode body, then
// allocates the precise byte count. Two things must hold:
//   1. the sizer's serString/serLength size math equals the bytes the real
//      serializer writes (the only methods the sizer overrides);
//   2. an exact-sized encode is byte-identical to the adaptive encode and
//      round-trips — proving the measure pass neither under- nor over-counts.

import * as TF from 'ts-runtypes/formats';
import {describe, it, expect} from 'vitest';
import * as RT from 'ts-runtypes/schema';
import {createBinaryEncoder, createBinaryDecoder} from 'ts-runtypes';
import {createSizingSerializer, createDataViewSerializer} from '../../src/runtypes/dataView.ts';

describe('exact binary sizing — measure pass matches the encoder', () => {
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

// Each case inlines a concrete schema so the plugin resolves the encoder type.
function assertExactMatchesAdaptive<T>(
  encAdaptive: (v: T) => ArrayBuffer,
  encExact: (v: T) => ArrayBuffer,
  decode: (b: ArrayBuffer) => unknown,
  value: T
): void {
  const adaptive = new Uint8Array(encAdaptive(value));
  const exact = new Uint8Array(encExact(value));
  expect(Array.from(exact)).toEqual(Array.from(adaptive)); // byte-identical
  expect(decode(encExact(value))).toEqual(value); // round-trips
}

describe('exact binary sizing — byte-identical + round-trips', () => {
  it('bare string', () => {
    const s = TF.string();
    assertExactMatchesAdaptive(
      createBinaryEncoder(s),
      createBinaryEncoder(s, {sizing: 'exact'}),
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
    const enc = createBinaryEncoder(s);
    const encEx = createBinaryEncoder(s, {sizing: 'exact'});
    const dec = createBinaryDecoder(s);
    assertExactMatchesAdaptive(enc, encEx, dec, {id: 7, name: 'Ada', active: true, tags: ['a', 'bb', 'ccc'], note: 'x'});
    assertExactMatchesAdaptive(enc, encEx, dec, {id: 0, name: '', active: false, tags: []}); // note absent
  });

  it('array of numbers (fixed-width loop)', () => {
    const s = RT.array(TF.number());
    assertExactMatchesAdaptive(
      createBinaryEncoder(s),
      createBinaryEncoder(s, {sizing: 'exact'}),
      createBinaryDecoder(s),
      [1, 2.5, -3, 1e9, 0]
    );
  });

  it('union of object members', () => {
    const s = RT.union(RT.object({kind: RT.literal('a'), x: TF.number()}), RT.object({kind: RT.literal('b'), y: TF.string()}));
    const enc = createBinaryEncoder(s);
    const encEx = createBinaryEncoder(s, {sizing: 'exact'});
    const dec = createBinaryDecoder(s);
    assertExactMatchesAdaptive(enc, encEx, dec, {kind: 'a', x: 42});
    assertExactMatchesAdaptive(enc, encEx, dec, {kind: 'b', y: 'hello'});
  });
});
