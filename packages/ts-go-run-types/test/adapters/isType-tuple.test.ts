// isType adapter for TUPLE cases — same shape as the atomic / array /
// object adapter files. Counter is module-scoped so the "all ran"
// guard counts only this file's active `it()` calls; vitest's
// `it.todo` does NOT invoke `afterEach`, so deferred cases are
// excluded automatically.

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

describe('isType / TUPLE', () => {
  it('[string, number]', () => assertIsType(VALIDATION_SUITE.TUPLE.string_number_pair));
  it('[Date, number, string, null, string[], bigint]', () => assertIsType(VALIDATION_SUITE.TUPLE.full_mion_tuple));
  it('[number, bigint?, boolean?, number?]', () => assertIsType(VALIDATION_SUITE.TUPLE.tuple_with_optional));
  it('[string, number][]', () => assertIsType(VALIDATION_SUITE.TUPLE.nested_tuple_in_array));

  it('TupleCircular = [..., TupleCircular?]', () => assertIsType(VALIDATION_SUITE.TUPLE.tuple_circular));
  it('[number, () => any] — function slot must be undefined', () => assertIsType(VALIDATION_SUITE.TUPLE.tuple_with_non_serializable));
  it('[number, ...string[]] — Rest tuple member', () => assertIsType(VALIDATION_SUITE.TUPLE.tuple_rest));
  it('[number, bigint?, boolean?, number?] — multiple trailing optionals', () => assertIsType(VALIDATION_SUITE.TUPLE.tuple_multiple_trailing_optionals));
  it('[name: string, age: number] — named labels', () => assertIsType(VALIDATION_SUITE.TUPLE.tuple_named_labels));

  it('all tuple isType tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.TUPLE).filter((c) => c.isType).length;
    expect(ranTests).toBe(activeCount);
  });
});
