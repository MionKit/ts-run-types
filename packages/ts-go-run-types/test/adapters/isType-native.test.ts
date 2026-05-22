// isType adapter for NATIVE runtime container types — Map, Set,
// Promise (+ Awaited<Promise<T>> as a regression check that
// TypeScript's built-in utility resolves cleanly through our
// cache). Date / RegExp / Error are native too but project as
// atomic kinds and live in the ATOMIC adapter.

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

describe('isType / NATIVE', () => {
  it('Map<string, number>', () => assertIsType(VALIDATION_SUITE.NATIVE.map_string_number));
  it('Set<string>', () => assertIsType(VALIDATION_SUITE.NATIVE.set_string));
  it('Promise<string> — thenable check', () => assertIsType(VALIDATION_SUITE.NATIVE.promise_string));
  it('Awaited<Promise<string>> — resolves to string', () => assertIsType(VALIDATION_SUITE.NATIVE.awaited_promise));

  it('all native isType tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.NATIVE).filter((c) => c.isType).length;
    expect(ranTests).toBe(activeCount);
  });
});
