// Explicit FE coverage for the DataOnly union-member drop contract: a union
// member that DataOnly strips (symbol / function / Promise / non-serializable /
// never) is DROPPED, so the union validates and serializes as its data members
// (was: whole-union alwaysThrow). An all-stripped union (DataOnly = never) and
// other collapse-to-never/empty positions still throw. Drives the full
// vite-plugin pipeline, complementing the Go emitter tests in
// internal/compiled/typefns/union_dataonly_test.go.
//
// The collapse cases below also guard against a fixed facts-cache poisoning bug
// (isJsonCompatible on an unresolved Map/Set inner ref) that corrupted unrelated
// merged-prop unions in the same scan — see json_compat.go's isJsonCompatible.

import {describe, test, expect} from 'vitest';
import {
  createValidate,
  createGetValidationErrors,
  createJsonEncoder,
  createJsonDecoder,
  createBinaryEncoder,
  createBinaryDecoder,
} from 'ts-runtypes';

describe('DataOnly union-member drop', () => {
  test('Date | symbol — symbol arm dropped, validates as Date', () => {
    const isit = createValidate<Date | symbol>();
    expect(isit(new Date())).toBe(true);
    expect(isit(Symbol('x'))).toBe(false);
    expect(isit(123)).toBe(false);
  });

  test('Date | symbol — JSON + binary round-trip the surviving Date', () => {
    const d = new Date('2020-01-01T00:00:00.000Z');
    expect(createJsonDecoder<Date | symbol>()(createJsonEncoder<Date | symbol>()(d) as string)).toEqual(d);
    expect(createBinaryDecoder<Date | symbol>()(createBinaryEncoder<Date | symbol>()(d))).toEqual(d);
  });

  test('string | bigint | symbol — drops symbol, keeps string | bigint', () => {
    const isit = createValidate<string | bigint | symbol>();
    expect(isit('hello')).toBe(true);
    expect(isit(5n)).toBe(true);
    expect(isit(Symbol('x'))).toBe(false);
    const enc = createJsonEncoder<string | bigint | symbol>();
    const dec = createJsonDecoder<string | bigint | symbol>();
    expect(dec(enc('hello') as string)).toEqual('hello');
    expect(dec(enc(5n) as string)).toEqual(5n);
  });

  test('getValidationErrors reports the surviving-union shape, not a throw', () => {
    const errs = createGetValidationErrors<Date | symbol>();
    expect(errs(new Date())).toEqual([]);
    expect(errs(Symbol('x')).length).toBeGreaterThan(0);
  });

  test('(Date | symbol)[] — element union drops symbol, round-trips Date[]', () => {
    const arr = [new Date('2020-01-01T00:00:00.000Z'), new Date('2021-06-15T12:00:00.000Z')];
    const enc = createJsonEncoder<(Date | symbol)[]>();
    const dec = createJsonDecoder<(Date | symbol)[]>();
    expect(dec(enc(arr) as string)).toEqual(arr);
  });
});

describe('DataOnly collapse-to-never / empty still throws', () => {
  test('all members of a union stripped (DataOnly = never)', () => {
    expect(() => createValidate<symbol | (() => void)>()).toThrow();
    expect(() => createJsonEncoder<symbol | (() => void)>()).toThrow();
  });

  test('array / tuple / Map / Set whose element collapses to never', () => {
    expect(() => createJsonEncoder<symbol[]>()).toThrow();
    expect(() => createJsonEncoder<[string, symbol]>()).toThrow();
    expect(() => createJsonEncoder<Map<string, symbol>>()).toThrow();
    expect(() => createJsonEncoder<Set<symbol>>()).toThrow();
  });
});
