// isType adapter for ARRAY cases — same shape as isType.test.ts but
// scoped to VALIDATION_SUITE.ARRAY. Counter is module-scoped (vitest
// runs each test file as its own module), so the "all ran" guard
// counts only the ARRAY adapter's `it()` calls — drift detection
// stays independent from the ATOMIC suite's counter.
//
// Active cases (with an `isType` thunk) become `it()` lines.
// Deferred cases (no thunk — element kind not yet implemented) become
// `it.todo()` lines so their titles surface in vitest's reporter and
// no test runs for them. Activating a case is a one-line edit: add
// `isType: () => createIsType<T>()` in validation-suite.ts and flip
// the matching `it.todo(...)` to `it(...)` here.

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

describe('isType / ARRAY', () => {
  // Active cases — element kind is supported by the Go emit.
  it('string[]', () => assertIsType(VALIDATION_SUITE.ARRAY.string_array));
  it('number[]', () => assertIsType(VALIDATION_SUITE.ARRAY.number_array));
  it('boolean[]', () => assertIsType(VALIDATION_SUITE.ARRAY.boolean_array));
  it('bigint[]', () => assertIsType(VALIDATION_SUITE.ARRAY.bigint_array));
  it('Date[]', () => assertIsType(VALIDATION_SUITE.ARRAY.date_array));
  it('RegExp[]', () => assertIsType(VALIDATION_SUITE.ARRAY.regexp_array));
  it('undefined[]', () => assertIsType(VALIDATION_SUITE.ARRAY.undefined_array));
  it('null[]', () => assertIsType(VALIDATION_SUITE.ARRAY.null_array));
  it('Array<string>', () => assertIsType(VALIDATION_SUITE.ARRAY.array_generic));
  it('string[][]', () => assertIsType(VALIDATION_SUITE.ARRAY.string_array_2d));
  it('string[][][]', () => assertIsType(VALIDATION_SUITE.ARRAY.string_array_3d));
  it('string[] (noIsArrayCheck)', () => assertIsType(VALIDATION_SUITE.ARRAY.string_array_noIsArrayCheck));

  it('{a: string}[]', () => assertIsType(VALIDATION_SUITE.ARRAY.object_array));
  it('(string | number)[]', () => assertIsType(VALIDATION_SUITE.ARRAY.union_array));
  it('[string, number][]', () => assertIsType(VALIDATION_SUITE.ARRAY.tuple_array));

  it('CircularArray = CircularArray[]', () => assertIsType(VALIDATION_SUITE.ARRAY.circular_array));
  it('ObjectType (Block 13) — recursive object with array prop', () => assertIsType(VALIDATION_SUITE.ARRAY.circular_object_with_array));

  // Deferred — features that haven't landed yet.
  it.todo('symbol[] — non-serializable, build-time error');

  // Coverage guard. Mirrors isType.test.ts. Vitest's `it.todo` does
  // NOT invoke `afterEach`, so the counter naturally measures only
  // active cases — drift detection still catches a forgotten `it()`.
  it('all array isType tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.ARRAY).filter((c) => c.isType).length;
    expect(ranTests).toBe(activeCount);
  });
});
