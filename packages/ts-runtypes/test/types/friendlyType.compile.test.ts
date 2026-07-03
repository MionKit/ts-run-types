// Per-branch correctness test for `FriendlyType<T>` (total contract: every field
// required; `$label` + `$errors` required on every node; `__rt_typeName`
// optional root meta) — including the PARAM-PRECISE `$errors` typing: a branded
// field's failable format params become REQUIRED template keys, count-bearing
// keys may pluralize, `$default` is the mutually exclusive catch-all mode, and
// non-failing params (isCurrency, transformers) never become keys.
//
// Each `it` compiles a representative snippet for ONE branch of `FriendlyNode`
// (src/enrich/friendlyType.ts) and asserts valid maps are assignable + invalid
// maps rejected (a `@ts-expect-error` that fails to fire becomes TS2578, so a
// too-loose type reds the test).
//
// Snippets brand fields with a LOCAL `__rtFormatParams` carrier (the only
// sentinel `ErrorTemplates<F>` reads) so the harness slice stays
// self-contained — the real `TF.*` aliases resolve to the same shape.
//
// Each budget IS the branch's current net instantiation count — a one-way
// ratchet, exactly like dataonly.compile.test.ts: after ANY change to the
// FriendlyType machinery, uncomment the log in `check`, compare each printed
// `net` to its budget, LOWER budgets that went down, and treat a raise as a
// cost regression to fix (never raise a budget to make the suite pass).
// Baseline (2026-07-03): the total-contract + param-precise `$errors` flip —
// measured 171 → 482 on the 4-field prototype; per-branch nets below. The
// counts are TERMINAL (a FriendlyType instantiates once per mirror const and
// never propagates through consumer code the way DataOnly does).

import {describe, it, expect} from 'vitest';
import {measureFriendly} from './enrichHarness.ts';

// Local format-brand carrier for snippets (matches TypeFormat's params sentinel).
const BRAND = `
      type Fmt<Base, P extends object> = Base & {readonly __rtFormatParams?: P};
`;

function check(snippet: string, budget: number): number {
  const r = measureFriendly(snippet);
  expect(r.errors, `snippet should type-check cleanly:\n${snippet}\n→ ${r.errors.join('\n  ')}`).toEqual([]);
  // console.log(`    net=${String(r.netInstantiations).padStart(5)}  budget=${budget}`);
  expect(
    r.netInstantiations,
    `net instantiations (${r.netInstantiations}) exceeded budget (${budget}) — possible FriendlyType recursion/cost regression`
  ).toBeLessThanOrEqual(budget);
  return r.netInstantiations;
}

describe('FriendlyType<T> — per-branch correctness (total contract)', () => {
  it('scalar leaves carry $label + $errors (both required); $default is the exclusive mode', () => {
    check(
      `
      type _01 = Expect<Assignable<{$label: 'n'; $errors: {type: 't'}}, FriendlyType<string>>>;
      type _02 = Expect<Assignable<{$label: 'a'; $errors: {type: 't'}}, FriendlyType<number>>>;
      type _03 = Expect<Assignable<{$label: 'b'; $errors: {type: 't'}}, FriendlyType<boolean>>>;
      type _04 = Expect<Assignable<{$label: 'g'; $errors: {type: 't'}}, FriendlyType<bigint>>>;
      type _05 = Expect<Assignable<{$label: 'd'; $errors: {type: 't'}}, FriendlyType<Date>>>;
      // the optional root type name is accepted
      type _06 = Expect<Assignable<{$label: 'n'; $errors: {type: 't'}; __rt_typeName: 'User'}, FriendlyType<string>>>;
      // $default mode: one catch-all message instead of per-constraint keys
      type _07 = Expect<Assignable<{$label: 'n'; $errors: {$default: 'x'}}, FriendlyType<string>>>;
      // $errors is REQUIRED — a label-only node is rejected
      type _08 = ExpectFalse<Assignable<{$label: 'n'}, FriendlyType<string>>>;
      // $label is REQUIRED — an errors-only node is rejected
      type _09 = ExpectFalse<Assignable<{$errors: {type: 't'}}, FriendlyType<string>>>;
      // $default NEVER mixes with per-constraint keys (mutually exclusive)
      type _10 = ExpectFalse<Assignable<{$label: 'n'; $errors: {type: 't'; $default: 'x'}}, FriendlyType<string>>>;
      `,
      130
    );
  });

  it('param-precise $errors: declared format params become REQUIRED keys', () => {
    check(
      BRAND +
        `
      interface User { name: Fmt<string, {minLength: 2; maxLength: 60}>; age: number }
      const _ok: FriendlyType<User> = {
        $label: 'User',
        $errors: {type: 'must be an object'},
        name: { $label: 'Name', $errors: {
          type: 'must be text',
          minLength: 'min $[val] chars',
          maxLength: '', // blank = no custom message; the key is still REQUIRED
        } },
        age: { $label: 'Age', $errors: {type: 'must be a number'} },
      };
      const _missingKey: FriendlyType<User> = { $label: '', $errors: {type: ''},
        // @ts-expect-error — maxLength is declared by the format, so its key is required
        name: { $label: '', $errors: { type: '', minLength: '' } },
        age: { $label: '', $errors: {type: ''} } };
      const _unknownKey: FriendlyType<User> = { $label: '', $errors: {type: ''},
        // @ts-expect-error — 'pattern' is not a constraint of this field (no index signature)
        name: { $label: '', $errors: { type: '', minLength: '', maxLength: '', pattern: 'x' } },
        age: { $label: '', $errors: {type: ''} } };
      const _bareWithKeys: FriendlyType<User> = { $label: '', $errors: {type: ''},
        name: { $label: '', $errors: { type: '', minLength: '', maxLength: '' } },
        // @ts-expect-error — a plain (unbranded) field only fails as 'type'
        age: { $label: '', $errors: { type: '', min: '' } } };
      // $default mode is a legal alternative on a branded field too
      const _defaultMode: FriendlyType<User> = { $label: '', $errors: {type: ''},
        name: { $label: '', $errors: { $default: 'Enter a valid name' } },
        age: { $label: '', $errors: {type: ''} } };
      `,
      153
    );
  });

  it('non-failing params (isCurrency, transformers) never become $errors keys', () => {
    check(
      BRAND +
        `
      interface Order { total: Fmt<number, {max: 100; isCurrency: true}>; code: Fmt<string, {lowercase: true}> }
      const _ok: FriendlyType<Order> = {
        $label: '', $errors: {type: ''},
        total: { $label: 'Total', $errors: { type: '', max: 'at most $[val]' } },
        code: { $label: 'Code', $errors: { type: '' } },
      };
      const _currencyKey: FriendlyType<Order> = { $label: '', $errors: {type: ''},
        // @ts-expect-error — isCurrency is presentation metadata, not a template key
        total: { $label: '', $errors: { type: '', max: '', isCurrency: 'x' } },
        code: { $label: '', $errors: { type: '' } } };
      const _transformerKey: FriendlyType<Order> = { $label: '', $errors: {type: ''},
        total: { $label: '', $errors: { type: '', max: '' } },
        // @ts-expect-error — lowercase is a transformer, not a template key
        code: { $label: '', $errors: { type: '', lowercase: 'x' } } };
      `,
      204
    );
  });

  it('objects nest; every field required; unknown fields rejected', () => {
    check(
      BRAND +
        `
      interface User { name: Fmt<string, {minLength: 2}>; age: number }
      const _ok: FriendlyType<User> = {
        $label: 'User',
        $errors: {type: 'must be an object'},
        name: { $label: 'Name', $errors: { type: 'must be text', minLength: 'min $[val] chars' } },
        age: { $label: 'Age', $errors: { type: 'must be a number' } },
      };
      // @ts-expect-error — 'age' is missing (every field is required)
      const _missing: FriendlyType<User> = { $label: '', $errors: {type: ''}, name: { $label: 'Name', $errors: {type: '', minLength: ''} } };
      // @ts-expect-error — 'extra' is not a field of User
      const _bad: FriendlyType<User> = { $label: '', $errors: {type: ''}, name: { $label: '', $errors: {type: '', minLength: ''} }, age: { $label: '', $errors: {type: ''} }, extra: { $label: 'x', $errors: {type: ''} } };
      `,
      139
    );
  });

  it('nested objects recurse', () => {
    check(
      BRAND +
        `
      interface User { name: string; profile: { email: Fmt<string, {pattern: {source: 'x'}}>; score: Fmt<number, {max: 100}> } }
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
      242
    );
  });

  it('arrays carry $items (element node)', () => {
    check(
      BRAND +
        `
      interface User { tags: string[]; scores: Fmt<number, {min: 0}>[] }
      const _ok: FriendlyType<User> = {
        $label: '', $errors: {type: ''},
        tags: { $label: 'Tags', $errors: {type: ''}, $items: { $label: '', $errors: { type: 'each tag must be text' } } },
        scores: { $label: '', $errors: {type: ''}, $items: { $label: '', $errors: { type: '', min: 'min $[val]' } } },
      };
      type _arr = Expect<Assignable<{$label: ''; $errors: {type: ''}; $items: {$label: ''; $errors: {type: 't'}}}, FriendlyType<string[]>>>;
      `,
      222
    );
  });

  it('tuples carry $slots (per-slot nodes), distinct from arrays', () => {
    check(
      BRAND +
        `
      const _ok: FriendlyType<[string, Fmt<number, {min: 1}>]> = {
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
      180
    );
  });

  it('Map carries $keys / $values', () => {
    check(
      BRAND +
        `
      const _ok: FriendlyType<Map<string, Fmt<number, {min: 0}>>> = {
        $label: 'Lookup',
        $errors: {type: ''},
        $keys: { $label: 'Key', $errors: {type: ''} },
        $values: { $label: 'Value', $errors: { type: '', min: 'too small' } },
      };
      `,
      368
    );
  });

  it('Set carries $values', () => {
    check(
      BRAND +
        `
      const _ok: FriendlyType<Set<Fmt<string, {minLength: 1}>>> = {
        $label: 'Tags',
        $errors: {type: ''},
        $values: { $label: 'Tag', $errors: { type: '', minLength: 'too short' } },
      };
      `,
      318
    );
  });

  it('plural template leaves: other mandatory, arms optional, $label stays a string', () => {
    check(
      BRAND +
        `
      interface User { name: Fmt<string, {minLength: 2}> }
      // a count-bearing constraint may carry a plural object (arms per locale)
      const _en: FriendlyType<User> = {
        $label: '', $errors: {type: ''},
        name: { $label: 'Name', $errors: {
          type: 'must be text',
          minLength: { one: 'at least $[val] character', other: 'at least $[val] characters' },
        } },
      };
      // asymmetric arms: any CLDR category subset is fine as long as other is present
      const _pl: FriendlyType<User> = {
        $label: '', $errors: {type: ''},
        name: { $label: '', $errors: {
          type: '',
          minLength: { one: '', few: '', many: '', other: '' },
        } },
      };
      // 'other' is REQUIRED on a plural object
      // @ts-expect-error — plural object without 'other' is rejected
      const _noOther: FriendlyType<User> = { $label: '', $errors: {type: ''}, name: { $label: '', $errors: { type: '', minLength: { one: 'x' } } } };
      // a non-CLDR arm key is rejected
      // @ts-expect-error — 'lots' is not a CLDR plural category
      const _badArm: FriendlyType<User> = { $label: '', $errors: {type: ''}, name: { $label: '', $errors: { type: '', minLength: { other: '', lots: '' } } } };
      // $label is never plural
      // @ts-expect-error — $label must stay a plain string
      const _pluralLabel: FriendlyType<User> = { $label: {other: ''}, $errors: {type: ''}, name: { $label: '', $errors: {type: '', minLength: ''} } };
      // 'type' is not count-bearing — a plural object there is rejected
      // @ts-expect-error — 'type' stays a plain string template
      const _pluralType: FriendlyType<User> = { $label: '', $errors: {type: {other: ''}}, name: { $label: '', $errors: {type: '', minLength: ''} } };
      `,
      157
    );
  });

  it('a plural object on a NON-count-bearing declared param is rejected', () => {
    check(
      BRAND +
        `
      interface User { age: Fmt<number, {integer: true; max: 120}> }
      const _ok: FriendlyType<User> = {
        $label: '', $errors: {type: ''},
        age: { $label: '', $errors: { type: '', integer: 'whole numbers', max: {other: 'at most $[val]'} } },
      };
      const _bad: FriendlyType<User> = { $label: '', $errors: {type: ''},
        // @ts-expect-error — 'integer' never pluralizes (only min/max/lt/gt/minLength/maxLength do)
        age: { $label: '', $errors: { type: '', integer: {one: '', other: ''}, max: '' } } };
      `,
      160
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
      91
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
      159
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
      84
    );
  });
});
