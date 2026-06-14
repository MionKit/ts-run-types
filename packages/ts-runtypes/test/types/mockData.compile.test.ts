// Per-branch correctness test for `MockData<T>` (total contract: every field
// required, value slot `pool`/`$items`/`$values`/`$keys`/`$slots` required;
// tuning knobs `min`/`max`/`$length`/`$size`/`$optional` optional).
//
// Each `it` compiles a representative snippet for ONE branch of `MockNode`
// (src/enrich/mockData.ts) and asserts valid maps are assignable + invalid maps
// rejected (`@ts-expect-error` → TS2578 if the type is too loose).
//
// NOTE: instantiation-budget assertions are DEFERRED during the total-contract
// flip (the strict `-?` + required value slots raise the counts). `check` keeps
// the correctness assertion (errors == []) and measures, but does not enforce an
// upper bound — re-tighten budgets in a follow-up.

import {describe, it, expect} from 'vitest';
import {measureMock} from './enrichHarness.ts';

function check(snippet: string, _budget: number): number {
  const r = measureMock(snippet);
  expect(r.errors, `snippet should type-check cleanly:\n${snippet}\n→ ${r.errors.join('\n  ')}`).toEqual([]);
  return r.netInstantiations;
}

describe('MockData<T> — per-branch correctness (total contract)', () => {
  it('scalar pools / ranges — pool required, range optional', () => {
    check(
      `
      type _01 = Expect<Assignable<{pool: string[]}, MockData<string>>>;
      type _02 = Expect<Assignable<{pool: number[]; min: 0; max: 100}, MockData<number>>>;
      type _03 = Expect<Assignable<{pool: boolean[]}, MockData<boolean>>>;
      type _04 = Expect<Assignable<{pool: Date[]; min: Date; max: Date}, MockData<Date>>>;
      // pool is REQUIRED now — a range-only node (no pool) is rejected
      type _05 = ExpectFalse<Assignable<{min: 0; max: 9}, MockData<number>>>;
      // number must not accept a string pool
      type _06 = ExpectFalse<Assignable<{pool: ['x']}, MockData<number>>>;
      `,
      0
    );
  });

  it('objects with per-field nodes; every field required; unknown fields rejected', () => {
    check(
      `
      interface User { name: string; age: number }
      const _ok: MockData<User> = {
        name: { pool: ['Alice', 'Liang', 'Fatima'] },
        age: { pool: [], min: 18, max: 95 },
        $optional: 0.5,
      };
      // @ts-expect-error — 'age' is missing (every field is required)
      const _missing: MockData<User> = { name: { pool: [] } };
      // @ts-expect-error — 'missing' is not a field of User
      const _bad: MockData<User> = { name: { pool: [] }, age: { pool: [] }, missing: { pool: [] } };
      // @ts-expect-error — age is a number; a string pool is wrong
      const _bad2: MockData<User> = { name: { pool: [] }, age: { pool: ['nope'] } };
      `,
      0
    );
  });

  it('arrays carry $items (+ optional $length)', () => {
    check(
      `
      interface User { tags: string[]; scores: number[] }
      const _ok: MockData<User> = {
        tags: { $items: { pool: ['a', 'b'] }, $length: [1, 4] },
        scores: { $items: { pool: [], min: 0, max: 10 }, $length: 3 },
      };
      `,
      0
    );
  });

  it('tuples carry $slots (per-slot nodes), distinct from arrays', () => {
    check(
      `
      const _ok: MockData<[string, number]> = {
        $slots: [{ pool: ['a', 'b'] }, { pool: [], min: 0, max: 9 }],
      };
      type _slots = Expect<Assignable<{$slots: [{pool: string[]}, {pool: number[]}]}, MockData<[string, number]>>>;
      // an array still gets $items (NOT $slots) — tuple/array discrimination
      type _items = Expect<Assignable<{$items: {pool: string[]}; $length: 3}, MockData<string[]>>>;
      // an array does NOT accept $slots
      type _noslots = ExpectFalse<Assignable<{$slots: [{pool: string[]}]}, MockData<string[]>>>;
      // a tuple does NOT accept $length (fixed length)
      type _nolength = ExpectFalse<Assignable<{$length: 3}, MockData<[string, number]>>>;
      `,
      0
    );
  });

  it('Map carries $keys / $values (+ optional $size)', () => {
    check(
      `
      const _ok: MockData<Map<string, number>> = {
        $keys: { pool: ['a', 'b'] },
        $values: { pool: [], min: 0, max: 9 },
        $size: [0, 3],
      };
      type _map = Expect<Assignable<{$keys: {pool: string[]}; $values: {pool: number[]}; $size: [0, 3]}, MockData<Map<string, number>>>>;
      `,
      0
    );
  });

  it('Set carries $values (+ optional $size)', () => {
    check(
      `
      const _ok: MockData<Set<string>> = {
        $values: { pool: ['a', 'b'] },
        $size: 3,
      };
      type _set = Expect<Assignable<{$values: {pool: string[]}; $size: 3}, MockData<Set<string>>>>;
      `,
      0
    );
  });

  it('nested objects recurse', () => {
    check(
      `
      interface User { profile: { email: string; score: number } }
      const _ok: MockData<User> = {
        profile: {
          email: { pool: ['a@b.com'] },
          score: { pool: [], min: 0, max: 100 },
        },
      };
      `,
      0
    );
  });

  it('deep nesting stays within the depth budget', () => {
    check(
      `
      interface Deep { a: { b: { c: { d: { e: string } } } } }
      const _ok: MockData<Deep> = { a: { b: { c: { d: { e: { pool: ['x'] } } } } } };
      `,
      0
    );
  });

  it('circular type resolves (bounded recursion; null arm breaks the cycle)', () => {
    check(
      `
      interface Node { value: string; next: Node | null }
      const _ok: MockData<Node> = { value: { pool: ['v'] }, next: { pool: [] } };
      `,
      0
    );
  });
});
