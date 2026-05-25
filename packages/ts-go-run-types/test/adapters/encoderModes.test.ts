// Encoder mode matrix — covers all five valid (strategy, stripExtras)
// combinations of the new orthogonal-options API. Pairs with the
// decoder mode coverage in decoderSafeMode.test.ts.
//
// Combinations validated:
//
//   strategy | stripExtras | family used                           |
//   clone    | true (def)  | pjs (prepareForJsonSafe)              |
//   clone    | false       | pjsp (prepareForJsonSafePreserve)     |
//   mutate   | true        | uku + pj (compose)                    |
//   mutate   | false       | pj (prepareForJson)                   |
//   direct   | (pinned T)  | sj (stringifyJson)                    |

import {describe, expect, it} from 'vitest';
import {createJsonEncoder, createJsonDecoder} from '@mionjs/ts-go-run-types';

type Sample = {a: string; n: bigint};

describe('encoder modes — clone strategy', () => {
  it('clone+strip (default): no mutation, extras stripped from output', () => {
    const encode = createJsonEncoder<Sample>();
    const input = {a: 'hi', n: 5n, evil: 'gone'} as Sample & {evil: string};
    const wire = encode(input)!;
    expect(JSON.parse(wire)).toEqual({a: 'hi', n: '5'});
    // input untouched
    expect((input as Record<string, unknown>).evil).toBe('gone');
    expect(input.n).toBe(5n);
  });

  it('clone+preserve: no mutation, extras survive in output', () => {
    const encode = createJsonEncoder<Sample>(undefined, {strategy: 'clone', stripExtras: false});
    const input = {a: 'hi', n: 5n, extra: 'survives'} as Sample & {extra: string};
    const wire = encode(input)!;
    expect(JSON.parse(wire)).toEqual({a: 'hi', n: '5', extra: 'survives'});
    // input untouched
    expect((input as Record<string, unknown>).extra).toBe('survives');
    expect(input.n).toBe(5n);
  });
});

describe('encoder modes — mutate strategy', () => {
  it('mutate+strip (NEW): mutates input, extras stripped from output', () => {
    const encode = createJsonEncoder<Sample>(undefined, {strategy: 'mutate', stripExtras: true});
    const input = {a: 'hi', n: 5n, evil: 'gone'} as Sample & {evil: string};
    const wire = encode(input)!;
    expect(JSON.parse(wire)).toEqual({a: 'hi', n: '5'});
    // input WAS mutated — bigint transformed to string, evil cleared
    expect(typeof input.n).toBe('string');
    expect((input as Record<string, unknown>).evil).toBeUndefined();
  });

  it('mutate+preserve (legacy unsafe): mutates input, extras survive', () => {
    const encode = createJsonEncoder<Sample>(undefined, {strategy: 'mutate', stripExtras: false});
    const input = {a: 'hi', n: 5n, extra: 'survives'} as Sample & {extra: string};
    const wire = encode(input)!;
    expect(JSON.parse(wire)).toEqual({a: 'hi', n: '5', extra: 'survives'});
    // input WAS mutated — bigint transformed in place
    expect(typeof input.n).toBe('string');
  });
});

describe('encoder modes — direct strategy', () => {
  it('direct: no mutation, stripExtras always true', () => {
    const encode = createJsonEncoder<Sample>(undefined, {strategy: 'direct'});
    const input = {a: 'hi', n: 5n, evil: 'gone'} as Sample & {evil: string};
    const wire = encode(input)!;
    expect(JSON.parse(wire)).toEqual({a: 'hi', n: '5'});
    // input untouched — single-pass stringify walks the type, not v
    expect((input as Record<string, unknown>).evil).toBe('gone');
    expect(input.n).toBe(5n);
  });
});

describe('encoder modes — round-trip with matching decoder', () => {
  // Every encoder shape should produce wire output that round-trips
  // through the safe decoder.
  it('mutate+strip round-trips correctly', () => {
    const encode = createJsonEncoder<Sample>(undefined, {strategy: 'mutate', stripExtras: true});
    const decode = createJsonDecoder<Sample>();
    const wire = encode({a: 'hi', n: 5n})!;
    const back = decode(wire);
    expect(back).toEqual({a: 'hi', n: 5n});
  });

  it('clone+preserve round-trips with extras surviving the decode', () => {
    const encode = createJsonEncoder<Sample>(undefined, {strategy: 'clone', stripExtras: false});
    // Decoder strips at union/object level only if stripExtras=true.
    // Use stripExtras: false so extras pass through.
    const decode = createJsonDecoder<Sample>(undefined, {stripExtras: false});
    const input = {a: 'hi', n: 5n, surplus: 'x'} as Sample & {surplus: string};
    const wire = encode(input)!;
    const back = decode(wire) as Record<string, unknown>;
    expect(back.a).toBe('hi');
    expect(back.n).toBe(5n);
    expect(back.surplus).toBe('x');
  });
});
