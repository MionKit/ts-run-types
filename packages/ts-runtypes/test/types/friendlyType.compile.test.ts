// Per-branch correctness + instantiation-budget test for `FriendlyType<T>`.
//
// Each `it` compiles a representative snippet for ONE branch of `FriendlyNode`
// (src/enrich/friendlyType.ts) through the real TypeScript compiler (see
// enrichHarness.ts) and asserts two things:
//   1. it type-checks cleanly — valid maps are assignable, and INVALID maps are
//      rejected (a `@ts-expect-error` that fails to fire becomes a TS2578 error,
//      so a too-loose type reds the test);
//   2. the NET instantiation count stays under an absolute budget — a recursion /
//      blowup spikes the number long before it trips the hard TS2589 cap.
//
// Budgets are a one-way RATCHET — lower them when a branch gets cheaper, never
// raise them to make a regression pass. See dataonly.compile.test.ts for the full
// budget-update protocol. Counts are deterministic (typescript is exact-pinned).

import {describe, it, expect} from 'vitest';
import {measureFriendly} from './enrichHarness.ts';

function check(snippet: string, budget: number): number {
  const r = measureFriendly(snippet);
  expect(r.errors, `snippet should type-check cleanly:\n${snippet}\n→ ${r.errors.join('\n  ')}`).toEqual([]);
  expect(
    r.netInstantiations,
    `net instantiations (${r.netInstantiations}) exceeded budget (${budget}) — possible FriendlyNode recursion/cost regression`
  ).toBeLessThanOrEqual(budget);
  return r.netInstantiations;
}

describe('FriendlyType<T> — per-branch correctness + instantiation budget', () => {
  it('scalar leaves carry only meta', () => {
    check(
      `
      type _01 = Expect<Assignable<{$label: 'n'}, FriendlyType<string>>>;
      type _02 = Expect<Assignable<{$errors: {type: 't'}}, FriendlyType<number>>>;
      type _03 = Expect<Assignable<{$label: 'b'; $errors: {type: 't'}}, FriendlyType<boolean>>>;
      type _04 = Expect<Assignable<{}, FriendlyType<bigint>>>;
      type _05 = Expect<Assignable<{$label: 'd'}, FriendlyType<Date>>>;
      `,
      44
    );
  });

  it('objects nest; unknown fields rejected', () => {
    check(
      `
      interface User { name: string; age: number }
      const _ok: FriendlyType<User> = {
        $label: 'User',
        name: { $label: 'Name', $errors: { type: 'must be text', minLength: 'min $[val] chars' } },
        age: { $label: 'Age', $errors: { type: 'must be a number', min: 'at least $[val]', max: 'at most $[val]' } },
      };
      // @ts-expect-error — 'missing' is not a field of User
      const _bad: FriendlyType<User> = { missing: { $label: 'x' } };
      `,
      38
    );
  });

  it('nested objects recurse', () => {
    check(
      `
      interface User { name: string; profile: { email: string; score: number } }
      const _ok: FriendlyType<User> = {
        name: { $label: 'Name' },
        profile: {
          $label: 'Profile',
          email: { $label: 'Email', $errors: { pattern: 'invalid email' } },
          score: { $label: 'Score', $errors: { max: 'too high' } },
        },
      };
      // @ts-expect-error — 'nope' is not a field of profile
      const _bad: FriendlyType<User> = { profile: { nope: { $label: 'x' } } };
      `,
      78
    );
  });

  it('arrays carry $items (element node)', () => {
    check(
      `
      interface User { tags: string[]; scores: number[] }
      const _ok: FriendlyType<User> = {
        tags: { $label: 'Tags', $items: { $errors: { type: 'each tag must be text' } } },
        scores: { $items: { $errors: { min: 'min $[val]' } } },
      };
      type _arr = Expect<Assignable<{$items: {$errors: {type: 't'}}}, FriendlyType<string[]>>>;
      `,
      105
    );
  });

  it('tuples carry $slots (per-slot nodes), distinct from arrays', () => {
    check(
      `
      const _ok: FriendlyType<[string, number]> = {
        $label: 'Pair',
        $slots: [{ $label: 'Name' }, { $label: 'Age', $errors: { min: 'too small' } }],
      };
      type _slots = Expect<Assignable<{$slots: [{$label: 'n'}, {$label: 'a'}]}, FriendlyType<[string, number]>>>;
      // an array still gets $items (NOT $slots) — tuple/array discrimination
      type _items = Expect<Assignable<{$items: {$errors: {type: 't'}}}, FriendlyType<string[]>>>;
      // an array does NOT accept $slots
      type _noslots = ExpectFalse<Assignable<{$slots: [{$label: 'n'}]}, FriendlyType<string[]>>>;
      // a tuple does NOT accept $items
      type _noitems = ExpectFalse<Assignable<{$items: {$label: 'x'}}, FriendlyType<[string, number]>>>;
      `,
      97
    );
  });

  it('Map carries $keys / $values', () => {
    check(
      `
      const _ok: FriendlyType<Map<string, number>> = {
        $label: 'Lookup',
        $keys: { $label: 'Key' },
        $values: { $label: 'Value', $errors: { min: 'too small' } },
      };
      type _map = Expect<Assignable<{$keys: {$label: 'k'}; $values: {$label: 'v'}}, FriendlyType<Map<string, number>>>>;
      `,
      250
    );
  });

  it('Set carries $values', () => {
    check(
      `
      const _ok: FriendlyType<Set<string>> = {
        $label: 'Tags',
        $values: { $label: 'Tag', $errors: { minLength: 'too short' } },
      };
      type _set = Expect<Assignable<{$values: {$label: 'v'}}, FriendlyType<Set<string>>>>;
      `,
      209
    );
  });

  it('function-form $errors (escape hatch)', () => {
    check(
      `
      interface User { name: string }
      const _ok: FriendlyType<User> = {
        name: {
          $label: 'Name',
          $errors: (failed) => {
            if (failed.minLength) return 'too short, need ' + String(failed.minLength.val);
            return failed.type ? 'must be text' : 'invalid';
          },
        },
      };
      `,
      29
    );
  });

  it('optional + union fields', () => {
    check(
      `
      interface User { nickname?: string; status: 'active' | 'inactive' }
      const _ok: FriendlyType<User> = {
        nickname: { $label: 'Nickname' },
        status: { $label: 'Status', $errors: { type: 'invalid status' } },
      };
      `,
      42
    );
  });

  it('deep nesting stays within the depth budget', () => {
    check(
      `
      interface Deep { a: { b: { c: { d: { e: string } } } } }
      const _ok: FriendlyType<Deep> = {
        a: { b: { c: { d: { e: { $label: 'E' } } } } },
      };
      `,
      131
    );
  });

  it('circular type resolves (bounded recursion)', () => {
    check(
      `
      interface Node { value: string; next: Node | null }
      const _ok: FriendlyType<Node> = {
        value: { $label: 'Value' },
        next: { value: { $label: 'Value' } },
      };
      `,
      64
    );
  });
});
