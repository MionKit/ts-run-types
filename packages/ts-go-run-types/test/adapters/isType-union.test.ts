// isType adapter for UNION cases — same shape as the other adapter
// files. Counter is module-scoped so the "all ran" guard counts only
// this file's active `it()` calls; vitest's `it.todo` is excluded
// automatically since it doesn't invoke `afterEach`.

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

describe('isType / UNION', () => {
  it('Date | number | string | null | bigint', () => assertIsType(VALIDATION_SUITE.UNION.atomic_union));
  it("'UNO' | 'DOS' | 'TRES'", () => assertIsType(VALIDATION_SUITE.UNION.string_literal_union));
  it('string | number', () => assertIsType(VALIDATION_SUITE.UNION.string_or_number));
  it('string[] | number[] | boolean[]', () => assertIsType(VALIDATION_SUITE.UNION.union_of_array_types));
  it('(string | bigint | boolean | Date)[]', () => assertIsType(VALIDATION_SUITE.UNION.array_of_union));

  // Deferred — features that need follow-up port work.
  it.todo('{a: string; aa: boolean} | {b: number} | {c: bigint} — verify object-union end-to-end');
  it.todo('{kind: "a"; n: number} | {kind: "b"; s: string} — needs discriminator-aware emit');
  it.todo('UnionC circular — needs circular-type detection');
  it.todo('{name; getName()} | {age; getAge()} — verify methods skipped under union');
  it.todo('{a: string} & {b: number} — intersection resolved at compile time (document only)');

  it('all union isType tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.UNION).filter((c) => c.isType).length;
    expect(ranTests).toBe(activeCount);
  });
});
