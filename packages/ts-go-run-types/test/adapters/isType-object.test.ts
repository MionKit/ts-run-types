// isType adapter for OBJECT cases — same shape as isType.test.ts and
// isType-array.test.ts but scoped to VALIDATION_SUITE.OBJECT. Counter
// is module-scoped so the "all ran" guard counts only this file's
// active `it()` calls.
//
// Active cases (with an `isType` thunk) → `it()`. Deferred cases (no
// thunk — element kind not yet implemented) → `it.todo()` so their
// titles surface in vitest's reporter without trying to compile them.
// Activating a case = one-line edit: add `isType: () => createIsType<T>()`
// in validation-suite.ts and flip the matching `it.todo` to `it`.

import {afterEach, describe, expect, it} from 'vitest';
import {VALIDATION_SUITE, type ValidationCase} from '../suites/validation-suite.ts';

let ranTests = 0;
afterEach(() => {
  ranTests++;
});

async function assertIsType(c: ValidationCase): Promise<void> {
  if (!c.isType) throw new Error(`case ${c.title}: missing isType thunk`);
  const isType = await c.isType();
  const {valid, invalid} = c.getSamples();
  valid.forEach((v, i) => {
    expect(isType(v), `${c.title}: valid[${i}] should pass`).toBe(true);
  });
  invalid.forEach((v, i) => {
    expect(isType(v), `${c.title}: invalid[${i}] should fail`).toBe(false);
  });
}

describe('isType / OBJECT', () => {
  // Active cases — kinds in scope for the current Go emit.
  it('{a: string; b: number}', () => assertIsType(VALIDATION_SUITE.OBJECT.simple_interface));
  it('{a: string; b?: number}', () => assertIsType(VALIDATION_SUITE.OBJECT.interface_with_optional));
  it('{date: Date; name: string}', () => assertIsType(VALIDATION_SUITE.OBJECT.interface_with_date));
  it('{name: string; cb: () => any} — methods skipped', () => assertIsType(VALIDATION_SUITE.OBJECT.interface_with_method));
  it('{a: string; deep: {b: string; c: number}}', () => assertIsType(VALIDATION_SUITE.OBJECT.nested_object));
  it('{tags: string[]}', () => assertIsType(VALIDATION_SUITE.OBJECT.interface_string_array_prop));
  it('ICircular self-referential', () => assertIsType(VALIDATION_SUITE.OBJECT.circular_interface));
  it('ICircularArray via array', () => assertIsType(VALIDATION_SUITE.OBJECT.circular_interface_on_array));
  it('ICircularDeep nested', () => assertIsType(VALIDATION_SUITE.OBJECT.circular_interface_on_nested_object));
  it('{[key: string]: string}', () => assertIsType(VALIDATION_SUITE.OBJECT.index_signature_string));
  it('{a: string; b: number; [str|num]} index w/ union value', () => assertIsType(VALIDATION_SUITE.OBJECT.index_signature_named_props));
  it('{[key: string]: {[key: string]: number}}', () => assertIsType(VALIDATION_SUITE.OBJECT.index_signature_nested));
  it('{[key: string]: {[key: string]: Date}}', () => assertIsType(VALIDATION_SUITE.OBJECT.index_signature_date_value));
  it('() => void', () => assertIsType(VALIDATION_SUITE.OBJECT.function_top_level));

  it('{[key: string]: string | number}', () => assertIsType(VALIDATION_SUITE.OBJECT.union_value_index));
  it('{kind: "a" | "b"; n: number}', () => assertIsType(VALIDATION_SUITE.OBJECT.object_with_union_prop));

  it('{a?: string; b?: number}', () => assertIsType(VALIDATION_SUITE.OBJECT.interface_all_optional));

  // Deferred — features that haven't landed yet.
  it.todo('class MySerializableClass — needs prototype/global-leak filter in class projection');
  it.todo('CallableInterface — needs `isCallable()` branch in interface emit');
  it.todo('RpcError<"test-error"> — needs RpcError class flavor');
  it.todo('CallSignature params — needs explicit param-tuple validator');

  // Coverage guard. Mirrors isType.test.ts. it.todo does NOT invoke
  // afterEach, so the counter naturally measures only active cases.
  it('all object isType tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.OBJECT).filter((c) => c.isType).length;
    expect(ranTests).toBe(activeCount);
  });
});
