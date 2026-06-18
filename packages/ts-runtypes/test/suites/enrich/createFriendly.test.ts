// Runtime behaviour of `createFriendly<T>(map)` — pure-data rendering of
// `getValidationErrors` output into human messages. Errors are hand-built
// `RTValidationError[]` so the suite needs no Go pipeline (createFriendly does no
// type-id injection). Covers: base type failure, format-constraint failure +
// `$[val]`, nested paths, array `$items` + `$[index]`, label fallback,
// accumulation (one message per constraint), the function escape hatch (one
// aggregated message), `$default`, and missing-entry fallback.

import {describe, it, expect} from 'vitest';
import {createFriendly, type FriendlyType, type RTValidationError} from 'ts-runtypes';

interface User {
  name: string;
  age: number;
  tags: string[];
  profile: {email: string; score: number};
}

const map: FriendlyType<User> = {
  $label: 'User account',
  name: {
    $label: 'Full name',
    $errors: {type: '$[label] must be text', minLength: '$[label] needs at least $[val] characters'},
  },
  age: {
    $label: 'Age',
    $errors: {
      type: '$[label] must be a number',
      min: '$[label] must be at least $[val]',
      max: '$[label] must be no more than $[val]',
    },
  },
  tags: {$label: 'Tags', $items: {$errors: {type: 'tag #$[index] must be text'}}},
  profile: {
    $label: 'Profile',
    email: {$label: 'Email', $errors: {pattern: 'Enter a valid email'}},
    score: {
      $label: 'Score',
      $errors: (failed) => {
        const parts: string[] = [];
        if (failed.min) parts.push('at least ' + String(failed.min.val));
        if (failed.max) parts.push('at most ' + String(failed.max.val));
        return parts.length ? 'Score must be ' + parts.join(' and ') : 'Score invalid';
      },
    },
  },
};

const friendly = createFriendly<User>(map);

describe('createFriendly — error rendering', () => {
  it('base type failure → `type` template with $[label]', () => {
    const errs: RTValidationError[] = [{path: ['name'], expected: 'string'}];
    expect(friendly.errors(errs)).toEqual([{path: 'name', label: 'Full name', message: 'Full name must be text'}]);
  });

  it('format failure → constraint template with $[val] = bound', () => {
    const errs: RTValidationError[] = [
      {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 2, formatPath: ['minLength']}},
    ];
    expect(friendly.errors(errs)[0].message).toBe('Full name needs at least 2 characters');
  });

  it('nested path resolves to the nested node', () => {
    const errs: RTValidationError[] = [
      {path: ['profile', 'email'], expected: 'string', format: {name: 'stringFormat', val: 'msg', formatPath: ['pattern']}},
    ];
    expect(friendly.errors(errs)).toEqual([{path: 'profile.email', label: 'Email', message: 'Enter a valid email'}]);
  });

  it('array element uses $items + $[index]', () => {
    const errs: RTValidationError[] = [{path: ['tags', 1], expected: 'string'}];
    const out = friendly.errors(errs);
    expect(out[0].path).toBe('tags.1');
    expect(out[0].message).toBe('tag #1 must be text');
  });

  it('label falls back to the raw field name when $label is absent', () => {
    const m: FriendlyType<{widget: string}> = {widget: {$errors: {type: 'bad'}}};
    const out = createFriendly(m).errors([{path: ['widget'], expected: 'string'}]);
    expect(out[0].label).toBe('widget');
    expect(out[0].message).toBe('bad');
  });

  it('accumulates: multiple constraint failures → one message each (data form)', () => {
    const errs: RTValidationError[] = [
      {path: ['age'], expected: 'number', format: {name: 'numberFormat', val: 0, formatPath: ['min']}},
      {path: ['age'], expected: 'number', format: {name: 'numberFormat', val: 120, formatPath: ['max']}},
    ];
    expect(friendly.errors(errs).map((m) => m.message)).toEqual(['Age must be at least 0', 'Age must be no more than 120']);
  });

  it('function-form $errors → one aggregated message per field', () => {
    const errs: RTValidationError[] = [
      {path: ['profile', 'score'], expected: 'number', format: {name: 'numberFormat', val: 0, formatPath: ['min']}},
      {path: ['profile', 'score'], expected: 'number', format: {name: 'numberFormat', val: 100, formatPath: ['max']}},
    ];
    const out = friendly.errors(errs);
    expect(out).toHaveLength(1);
    expect(out[0].message).toBe('Score must be at least 0 and at most 100');
  });

  it('$default catches an unlisted constraint', () => {
    const m: FriendlyType<{name: string}> = {name: {$label: 'Name', $errors: {$default: '$[label] is wrong ($[path])'}}};
    const out = createFriendly(m).errors([
      {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 5, formatPath: ['maxLength']}},
    ]);
    expect(out[0].message).toBe('Name is wrong (name)');
  });

  it('missing map entry → graceful fallback message', () => {
    const m: FriendlyType<{a: string; b: string}> = {a: {$label: 'A'}};
    const out = createFriendly(m).errors([{path: ['b'], expected: 'string'}]);
    expect(out[0].label).toBe('b');
    expect(out[0].message).toBe('b is invalid');
  });
});

describe('createFriendly — label()', () => {
  it('resolves dotted + nested paths, root, and unknown', () => {
    expect(friendly.label('name')).toBe('Full name');
    expect(friendly.label('profile.email')).toBe('Email');
    expect(friendly.label('')).toBe('User account');
    expect(friendly.label('unknown')).toBe('unknown');
  });
});
