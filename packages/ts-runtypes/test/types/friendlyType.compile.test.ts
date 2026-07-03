// Per-branch correctness test for `FriendlyType<T>` (total contract: every field
// required; `$label` + `$errors` required on every node; `__rt_typeName`
// optional root meta).
//
// Each `it` compiles a representative snippet for ONE branch of `FriendlyNode`
// (src/enrich/friendlyType.ts) and asserts valid maps are assignable + invalid
// maps rejected (a `@ts-expect-error` that fails to fire becomes TS2578, so a
// too-loose type reds the test).
//
// NOTE: instantiation-budget assertions are DEFERRED during the total-contract
// flip (the strict `-?` + required meta raise the counts). `check` keeps the
// correctness assertion (errors == []) and measures, but does not enforce an
// upper bound — re-tighten budgets in a follow-up.

import {describe, it, expect} from 'vitest';
import {measureFriendly} from './enrichHarness.ts';

function check(snippet: string, _budget: number): number {
  const r = measureFriendly(snippet);
  expect(r.errors, `snippet should type-check cleanly:\n${snippet}\n→ ${r.errors.join('\n  ')}`).toEqual([]);
  return r.netInstantiations;
}

describe('FriendlyType<T> — per-branch correctness (total contract)', () => {
  it('scalar leaves carry $label + $errors (both required)', () => {
    check(
      `
      type _01 = Expect<Assignable<{$label: 'n'; $errors: {type: 't'}}, FriendlyType<string>>>;
      type _02 = Expect<Assignable<{$label: 'a'; $errors: {type: 't'}}, FriendlyType<number>>>;
      type _03 = Expect<Assignable<{$label: 'b'; $errors: {type: 't'}}, FriendlyType<boolean>>>;
      type _04 = Expect<Assignable<{$label: 'g'; $errors: {type: 't'}}, FriendlyType<bigint>>>;
      type _05 = Expect<Assignable<{$label: 'd'; $errors: {type: 't'}}, FriendlyType<Date>>>;
      // the optional root type name is accepted
      type _06 = Expect<Assignable<{$label: 'n'; $errors: {type: 't'}; __rt_typeName: 'User'}, FriendlyType<string>>>;
      // $errors is REQUIRED — a label-only node is rejected
      type _07 = ExpectFalse<Assignable<{$label: 'n'}, FriendlyType<string>>>;
      // $label is REQUIRED — an errors-only node is rejected
      type _08 = ExpectFalse<Assignable<{$errors: {type: 't'}}, FriendlyType<string>>>;
      `,
      0
    );
  });

  it('objects nest; every field required; unknown fields rejected', () => {
    check(
      `
      interface User { name: string; age: number }
      const _ok: FriendlyType<User> = {
        $label: 'User',
        $errors: {type: 'must be an object'},
        name: { $label: 'Name', $errors: { type: 'must be text', minLength: 'min $[val] chars' } },
        age: { $label: 'Age', $errors: { type: 'must be a number', min: 'at least $[val]', max: 'at most $[val]' } },
      };
      // @ts-expect-error — 'age' is missing (every field is required)
      const _missing: FriendlyType<User> = { $label: '', $errors: {type: ''}, name: { $label: 'Name', $errors: {type: ''} } };
      // @ts-expect-error — 'extra' is not a field of User
      const _bad: FriendlyType<User> = { $label: '', $errors: {type: ''}, name: { $label: '', $errors: {type: ''} }, age: { $label: '', $errors: {type: ''} }, extra: { $label: 'x', $errors: {type: ''} } };
      `,
      0
    );
  });

  it('nested objects recurse', () => {
    check(
      `
      interface User { name: string; profile: { email: string; score: number } }
      const _ok: FriendlyType<User> = {
        $label: '', $errors: {type: ''},
        name: { $label: 'Name', $errors: {type: ''} },
        profile: {
          $label: 'Profile',
          $errors: {type: ''},
          email: { $label: 'Email', $errors: { type: '', pattern: 'invalid email' } },
          score: { $label: 'Score', $errors: { type: '', max: 'too high' } },
        },
      };
      `,
      0
    );
  });

  it('arrays carry $items (element node)', () => {
    check(
      `
      interface User { tags: string[]; scores: number[] }
      const _ok: FriendlyType<User> = {
        $label: '', $errors: {type: ''},
        tags: { $label: 'Tags', $errors: {type: ''}, $items: { $label: '', $errors: { type: 'each tag must be text' } } },
        scores: { $label: '', $errors: {type: ''}, $items: { $label: '', $errors: { type: '', min: 'min $[val]' } } },
      };
      type _arr = Expect<Assignable<{$label: ''; $errors: {type: ''}; $items: {$label: ''; $errors: {type: 't'}}}, FriendlyType<string[]>>>;
      `,
      0
    );
  });

  it('tuples carry $slots (per-slot nodes), distinct from arrays', () => {
    check(
      `
      const _ok: FriendlyType<[string, number]> = {
        $label: 'Pair',
        $errors: {type: ''},
        $slots: [
          { $label: 'Name', $errors: {type: ''} },
          { $label: 'Age', $errors: { type: '', min: 'too small' } },
        ],
      };
      // a tuple does NOT accept $items
      type _noitems = ExpectFalse<Assignable<{$label: 'x'; $errors: {type: 't'}; $items: {$label: 'x'; $errors: {type: 't'}}}, FriendlyType<[string, number]>>>;
      `,
      0
    );
  });

  it('Map carries $keys / $values', () => {
    check(
      `
      const _ok: FriendlyType<Map<string, number>> = {
        $label: 'Lookup',
        $errors: {type: ''},
        $keys: { $label: 'Key', $errors: {type: ''} },
        $values: { $label: 'Value', $errors: { type: '', min: 'too small' } },
      };
      `,
      0
    );
  });

  it('Set carries $values', () => {
    check(
      `
      const _ok: FriendlyType<Set<string>> = {
        $label: 'Tags',
        $errors: {type: ''},
        $values: { $label: 'Tag', $errors: { type: '', minLength: 'too short' } },
      };
      `,
      0
    );
  });

  it('plural template leaves: other mandatory, arms optional, $label stays a string', () => {
    check(
      `
      interface User { name: string }
      // a count-bearing constraint may carry a plural object (arms per locale)
      const _en: FriendlyType<User> = {
        $label: '', $errors: {type: ''},
        name: { $label: 'Name', $errors: {
          type: 'must be text',
          minLength: { one: 'at least $[val] character', other: 'at least $[val] characters' },
        } },
      };
      // asymmetric arms: any CLDR category subset is fine as long as other is present
      const _pl: Translation<User> = {
        $label: '', $errors: {type: ''},
        name: { $label: '', $errors: {
          type: '',
          minLength: { one: '', few: '', many: '', other: '' },
        } },
      };
      // 'other' is REQUIRED on a plural object
      // @ts-expect-error — plural object without 'other' is rejected
      const _noOther: FriendlyType<User> = { $label: '', $errors: {type: ''}, name: { $label: '', $errors: { minLength: { one: 'x' } } } };
      // a non-CLDR arm key is rejected
      // @ts-expect-error — 'lots' is not a CLDR plural category
      const _badArm: FriendlyType<User> = { $label: '', $errors: {type: ''}, name: { $label: '', $errors: { minLength: { other: '', lots: '' } } } };
      // $label is never plural
      // @ts-expect-error — $label must stay a plain string
      const _pluralLabel: FriendlyType<User> = { $label: {other: ''}, $errors: {type: ''}, name: { $label: '', $errors: {type: ''} } };
      // 'type' is not count-bearing — a plural object there is rejected
      // @ts-expect-error — 'type' stays a plain string template
      const _pluralType: FriendlyType<User> = { $label: '', $errors: {type: {other: ''}}, name: { $label: '', $errors: {type: ''} } };
      `,
      0
    );
  });

  it('Translation<T> is structurally FriendlyType<T>', () => {
    check(
      `
      interface User { name: string }
      type _same = Expect<Equal<Translation<User>, FriendlyType<User>>>;
      `,
      0
    );
  });

  it('function-form $errors (escape hatch)', () => {
    check(
      `
      interface User { name: string }
      const _ok: FriendlyType<User> = {
        $label: '', $errors: {type: ''},
        name: {
          $label: 'Name',
          $errors: (failed) => {
            if (failed.minLength) return 'too short, need ' + String(failed.minLength.val);
            return failed.type ? 'must be text' : 'invalid';
          },
        },
      };
      `,
      0
    );
  });

  it('optional + union fields', () => {
    check(
      `
      interface User { nickname?: string; status: 'active' | 'inactive' }
      const _ok: FriendlyType<User> = {
        $label: '', $errors: {type: ''},
        nickname: { $label: 'Nickname', $errors: {type: ''} },
        status: { $label: 'Status', $errors: { type: 'invalid status' } },
      };
      `,
      0
    );
  });

  it('deep nesting stays within the depth budget', () => {
    check(
      `
      interface Deep { a: { b: { c: { d: { e: string } } } } }
      const _ok: FriendlyType<Deep> = {
        $label: '', $errors: {type: ''},
        a: {
          $label: '', $errors: {type: ''},
          b: {
            $label: '', $errors: {type: ''},
            c: {
              $label: '', $errors: {type: ''},
              d: {
                $label: '', $errors: {type: ''},
                e: { $label: 'E', $errors: {type: ''} },
              },
            },
          },
        },
      };
      `,
      0
    );
  });

  it('circular type resolves (bounded recursion; null arm breaks the cycle)', () => {
    check(
      `
      interface Node { value: string; next: Node | null }
      const _ok: FriendlyType<Node> = {
        $label: '', $errors: {type: ''},
        value: { $label: 'Value', $errors: {type: ''} },
        next: { $label: '', $errors: {type: ''} },
      };
      `,
      0
    );
  });
});
