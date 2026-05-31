// value-first define — runs every VALUE_FIRST_SUITE case through the precompiled validator the
// Go binary emits for the branded `typeof Model` type, proving the value-first authoring surface
// lowers to the same RunType graph as the type-first surface (hash-level convergence is asserted
// separately in test/adapters/valueFirstConvergence.test.ts). Each case runs `assertIsType`
// (static + reflect + deserialize forms) plus a light getTypeErrors check (valid → no errors,
// invalid → at least one error) so both RT families are exercised without brittle deep-equals.

import {describe, expect, it} from 'vitest';
import {VALUE_FIRST_SUITE, type ValueFirstCase} from './index.ts';
import {assertIsType} from '../../util/validationAsserts.ts';

function assertCase(c: ValueFirstCase): void {
  assertIsType(c);

  const {valid, invalid} = c.getSamples();
  const getErr = c.getTypeErrors();
  valid.forEach((v, i) => {
    expect(getErr(v), `${c.title} [getTypeErrors]: valid[${i}] → no errors`).toEqual([]);
  });
  invalid.forEach((v, i) => {
    expect(getErr(v).length, `${c.title} [getTypeErrors]: invalid[${i}] → ≥1 error`).toBeGreaterThan(0);
  });
}

describe('value-first define', () => {
  for (const c of Object.values(VALUE_FIRST_SUITE)) {
    it(c.title, () => assertCase(c));
  }
});
