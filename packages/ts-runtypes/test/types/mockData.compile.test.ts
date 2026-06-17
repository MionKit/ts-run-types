// Per-branch correctness + instantiation-budget test for `MockData<T>`.
//
// Same shape as friendlyType.compile.test.ts: each `it` compiles a representative
// snippet for ONE branch of `MockNode` (src/enrichment/mockData.ts) and asserts
// (1) valid maps are assignable + invalid maps rejected (`@ts-expect-error` →
// TS2578 if the type is too loose), and (2) net instantiations stay under a
// one-way-ratchet budget. See dataonly.compile.test.ts for the budget protocol.

import {describe, it, expect} from 'vitest';
import {measureMock} from './enrichmentHarness.ts';

function check(snippet: string, budget: number): number {
  const r = measureMock(snippet);
  expect(r.errors, `snippet should type-check cleanly:\n${snippet}\n→ ${r.errors.join('\n  ')}`).toEqual([]);
  expect(
    r.netInstantiations,
    `net instantiations (${r.netInstantiations}) exceeded budget (${budget}) — possible MockNode recursion/cost regression`
  ).toBeLessThanOrEqual(budget);
  return r.netInstantiations;
}

describe('MockData<T> — per-branch correctness + instantiation budget', () => {
  it('scalar pools / ranges', () => {
    check(
      `
      type _01 = Expect<Assignable<{pool: string[]}, MockData<string>>>;
      type _02 = Expect<Assignable<{pool: number[]; min: 0; max: 100}, MockData<number>>>;
      type _03 = Expect<Assignable<{pool: boolean[]}, MockData<boolean>>>;
      type _04 = Expect<Assignable<{pool: Date[]; min: Date; max: Date}, MockData<Date>>>;
      // number must not accept a string min
      type _05 = ExpectFalse<Assignable<{min: 'x'}, MockData<number>>>;
      `,
      81
    );
  });

  it('objects with per-field nodes; unknown fields rejected', () => {
    check(
      `
      interface User { name: string; age: number }
      const _ok: MockData<User> = {
        name: { pool: ['Alice', 'Liang', 'Fatima'] },
        age: { min: 18, max: 95 },
        $optional: 0.5,
      };
      // @ts-expect-error — 'missing' is not a field of User
      const _bad: MockData<User> = { missing: { pool: [] } };
      // @ts-expect-error — age is a number; a string pool is wrong
      const _bad2: MockData<User> = { age: { pool: ['nope'] } };
      `,
      100
    );
  });

  it('arrays carry $items + $length', () => {
    check(
      `
      interface User { tags: string[]; scores: number[] }
      const _ok: MockData<User> = {
        tags: { $items: { pool: ['a', 'b'] }, $length: [1, 4] },
        scores: { $items: { min: 0, max: 10 }, $length: 3 },
      };
      `,
      110
    );
  });

  it('tuples carry $slots (per-slot nodes), distinct from arrays', () => {
    check(
      `
      const _ok: MockData<[string, number]> = {
        $slots: [{ pool: ['a', 'b'] }, { min: 0, max: 9 }],
      };
      type _slots = Expect<Assignable<{$slots: [{pool: string[]}, {pool: number[]}]}, MockData<[string, number]>>>;
      // an array still gets $items (NOT $slots) — tuple/array discrimination
      type _items = Expect<Assignable<{$items: {pool: string[]}; $length: 3}, MockData<string[]>>>;
      // an array does NOT accept $slots
      type _noslots = ExpectFalse<Assignable<{$slots: [{pool: string[]}]}, MockData<string[]>>>;
      // a tuple does NOT accept $length (fixed length)
      type _nolength = ExpectFalse<Assignable<{$length: 3}, MockData<[string, number]>>>;
      `,
      108
    );
  });

  it('Map carries $keys / $values / $size', () => {
    check(
      `
      const _ok: MockData<Map<string, number>> = {
        $keys: { pool: ['a', 'b'] },
        $values: { min: 0, max: 9 },
        $size: [0, 3],
      };
      type _map = Expect<Assignable<{$keys: {pool: string[]}; $values: {pool: number[]}; $size: [0, 3]}, MockData<Map<string, number>>>>;
      `,
      272
    );
  });

  it('Set carries $values / $size', () => {
    check(
      `
      const _ok: MockData<Set<string>> = {
        $values: { pool: ['a', 'b'] },
        $size: 3,
      };
      type _set = Expect<Assignable<{$values: {pool: string[]}; $size: 3}, MockData<Set<string>>>>;
      `,
      212
    );
  });

  it('nested objects recurse', () => {
    check(
      `
      interface User { profile: { email: string; score: number } }
      const _ok: MockData<User> = {
        profile: {
          email: { pool: ['a@b.com'] },
          score: { min: 0, max: 100 },
        },
      };
      `,
      85
    );
  });

  it('deep nesting stays within the depth budget', () => {
    check(
      `
      interface Deep { a: { b: { c: { d: { e: string } } } } }
      const _ok: MockData<Deep> = { a: { b: { c: { d: { e: { pool: ['x'] } } } } } };
      `,
      166
    );
  });

  it('circular type resolves (bounded recursion)', () => {
    check(
      `
      interface Node { value: string; next: Node | null }
      const _ok: MockData<Node> = { value: { pool: ['v'] }, next: { value: { pool: ['v'] } } };
      `,
      96
    );
  });
});
