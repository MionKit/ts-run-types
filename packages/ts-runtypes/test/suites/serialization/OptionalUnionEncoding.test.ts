// Regression: optional / literal-union members must NOT serialize through the
// `[index, value]` discriminated-union envelope. Asserts the actual JSON string
// the encoder produces (not just a round-trip), so a re-introduced envelope
// (`{"active":[1,false]}`) fails loudly.
// See docs/todos/optional-boolean-union-encoding.md.
import {describe, expect, it} from 'vitest';
import {createJsonDecoder, createJsonEncoder} from 'ts-runtypes';

// A property value encoded as `:[<digit>…` is the union-envelope artifact.
const ENVELOPE = /:\[\d/;

describe('serialization / optional-union JSON encoding (regression)', () => {
  it('optional boolean → plain boolean, never [index, value]', () => {
    const clone = createJsonEncoder<{active?: boolean}>();
    const direct = createJsonEncoder<{active?: boolean}>(undefined, {strategy: 'direct'});
    const mutate = createJsonEncoder<{active?: boolean}>(undefined, {strategy: 'mutate'});

    for (const enc of [clone, direct, mutate]) {
      expect(enc({active: false})).toBe('{"active":false}');
      expect(enc({active: true})).toBe('{"active":true}');
      expect(enc({})).toBe('{}');
      expect(enc({active: false})).not.toMatch(ENVELOPE);
    }
  });

  it('required literal-string union → plain string, no dispatch envelope', () => {
    const clone = createJsonEncoder<{x: 'a' | 'b' | 'c'}>();
    const direct = createJsonEncoder<{x: 'a' | 'b' | 'c'}>(undefined, {strategy: 'direct'});

    expect(clone({x: 'b'})).toBe('{"x":"b"}');
    expect(direct({x: 'c'})).toBe('{"x":"c"}');
    expect(clone({x: 'a'})).not.toMatch(ENVELOPE);
    expect(direct({x: 'a'})).not.toMatch(ENVELOPE);
  });

  it('optional string | number union → plain value, no envelope', () => {
    const clone = createJsonEncoder<{x?: string | number}>();
    expect(clone({x: 'hi'})).toBe('{"x":"hi"}');
    expect(clone({x: 7})).toBe('{"x":7}');
    expect(clone({})).toBe('{}');
    expect(clone({x: 'hi'})).not.toMatch(ENVELOPE);
    expect(clone({x: 7})).not.toMatch(ENVELOPE);
  });

  it('optional T | null keeps null and encodes plainly', () => {
    const clone = createJsonEncoder<{x?: string | null}>();
    expect(clone({x: null})).toBe('{"x":null}');
    expect(clone({x: 'hi'})).toBe('{"x":"hi"}');
    expect(clone({})).toBe('{}');
    expect(clone({x: null})).not.toMatch(ENVELOPE);
  });

  it('optional boolean | null keeps null and encodes plainly', () => {
    const clone = createJsonEncoder<{x?: boolean | null}>();
    expect(clone({x: null})).toBe('{"x":null}');
    expect(clone({x: true})).toBe('{"x":true}');
    expect(clone({})).toBe('{}');
    expect(clone({x: null})).not.toMatch(ENVELOPE);
    expect(clone({x: false})).not.toMatch(ENVELOPE);
  });

  it('optional boolean in a tuple slot → plain array element, no nested envelope', () => {
    const clone = createJsonEncoder<{t: [string, boolean?]}>();
    expect(clone({t: ['a', true]})).toBe('{"t":["a",true]}');
    expect(clone({t: ['a', false]})).toBe('{"t":["a",false]}');
    expect(clone({t: ['a']})).toBe('{"t":["a"]}');
  });

  it('all shapes still round-trip through the decoder', () => {
    const encBool = createJsonEncoder<{active?: boolean}>();
    const decBool = createJsonDecoder<{active?: boolean}>();
    expect(decBool(encBool({active: false})!)).toEqual({active: false});
    expect(decBool(encBool({active: true})!)).toEqual({active: true});
    expect(decBool(encBool({})!)).toEqual({});

    const encNull = createJsonEncoder<{x?: string | null}>();
    const decNull = createJsonDecoder<{x?: string | null}>();
    expect(decNull(encNull({x: null})!)).toEqual({x: null});
    expect(decNull(encNull({x: 'hi'})!)).toEqual({x: 'hi'});
    expect(decNull(encNull({})!)).toEqual({});
  });
});
