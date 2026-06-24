// Runtime behaviour of `createFriendly<T>(map)` — pure-data rendering of
// `getValidationErrors` output into human messages. Errors are hand-built
// `RTValidationError[]` so the suite needs no Go pipeline (createFriendly does no
// type-id injection). Covers: base type failure, format-constraint failure +
// `$[val]`, nested paths, array `$items` + `$[index]`, Map/Set `$keys`/`$values`
// routing (by the entry's `failed` role) + the entry index, label fallback,
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
  $errors: {type: 'Account is invalid'},
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
  tags: {
    $label: 'Tags',
    $errors: {type: 'Tags must be a list'},
    $items: {$label: 'Tag', $errors: {type: 'tag #$[index] must be text'}},
  },
  profile: {
    $label: 'Profile',
    $errors: {type: 'Profile is invalid'},
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
    // Intentionally degenerate map: omits every `$label` (and root meta) so the renderer
    // must fall back to the raw field name. The `as` cast opts past the total `FriendlyType`
    // contract — real callers pass a filled map; this probes the missing-`$label` safety net.
    const m = {widget: {$errors: {type: 'bad'}}} as unknown as FriendlyType<{widget: string}>;
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
    const m: FriendlyType<{name: string}> = {
      $label: 'Form',
      $errors: {type: 'Form is invalid'},
      name: {$label: 'Name', $errors: {$default: '$[label] is wrong ($[path])'}},
    };
    const out = createFriendly(m).errors([
      {path: ['name'], expected: 'string', format: {name: 'stringFormat', val: 5, formatPath: ['maxLength']}},
    ]);
    expect(out[0].message).toBe('Name is wrong (name)');
  });

  it('missing map entry → graceful fallback message', () => {
    // Intentionally degenerate map: omits field `b` entirely (and root meta) so the renderer
    // must fall back to the raw name + generic message for an unmapped field. The `as` cast
    // opts past the total `FriendlyType` contract — this probes the missing-entry safety net.
    const m = {a: {$label: 'A', $errors: {type: 'A is invalid'}}} as unknown as FriendlyType<{a: string; b: string}>;
    const out = createFriendly(m).errors([{path: ['b'], expected: 'string'}]);
    expect(out[0].label).toBe('b');
    expect(out[0].message).toBe('b is invalid');
  });
});

describe('createFriendly — Map / Set entries', () => {
  it('Map value failure resolves to $values + carries the entry index', () => {
    const m: FriendlyType<Map<string, number>> = {
      $label: 'Settings',
      $errors: {type: 'Settings must be a map'},
      $keys: {$label: 'Setting key', $errors: {type: 'key must be text'}},
      $values: {$label: 'Setting value', $errors: {type: 'value must be a number'}},
    };
    const out = createFriendly(m).errors([{path: [{key: 0, failed: 'mapValue'}], expected: 'number'}]);
    expect(out).toEqual([{path: '0', label: 'Setting value', message: 'value must be a number'}]);
  });

  it('Map key failure resolves to $keys', () => {
    const m: FriendlyType<Map<string, number>> = {
      $label: 'Settings',
      $errors: {type: 'Settings must be a map'},
      $keys: {$label: 'Setting key', $errors: {type: 'key must be text'}},
      $values: {$label: 'Setting value', $errors: {type: 'value must be a number'}},
    };
    const out = createFriendly(m).errors([{path: [{key: 0, failed: 'mapKey'}], expected: 'string'}]);
    expect(out[0]).toEqual({path: '0', label: 'Setting key', message: 'key must be text'});
  });

  it('key + value failures at the same entry do not collide ($keys vs $values)', () => {
    const m: FriendlyType<Map<string, number>> = {
      $label: 'Settings',
      $errors: {type: 'Settings must be a map'},
      $keys: {$label: 'K', $errors: {type: 'bad key'}},
      $values: {$label: 'V', $errors: {type: 'bad value'}},
    };
    const out = createFriendly(m).errors([
      {path: [{key: 0, failed: 'mapKey'}], expected: 'string'},
      {path: [{key: 0, failed: 'mapValue'}], expected: 'number'},
    ]);
    expect(out.map((message) => message.message)).toEqual(['bad key', 'bad value']);
  });

  it('Set item uses $values + $[index]', () => {
    interface Form {
      tags: Set<string>;
    }
    const m: FriendlyType<Form> = {
      $label: 'Form',
      $errors: {type: 'Form is invalid'},
      tags: {
        $label: 'Tags',
        $errors: {type: 'Tags must be a set'},
        $values: {$label: 'Tag', $errors: {type: 'tag #$[index] must be text'}},
      },
    };
    const out = createFriendly(m).errors([{path: ['tags', {key: 2, failed: 'setKey'}], expected: 'string'}]);
    expect(out[0].path).toBe('tags.2');
    expect(out[0].message).toBe('tag #2 must be text');
  });
});

describe('createFriendly — tuples', () => {
  it('fixed-tuple slot failure resolves to $slots[i] (not $items)', () => {
    const m: FriendlyType<[string, number]> = {
      $label: 'Coordinate',
      $errors: {type: 'Coordinate must be a pair'},
      $slots: [
        {$label: 'X', $errors: {type: 'X must be text'}},
        {$label: 'Y', $errors: {type: 'Y must be a number'}},
      ],
    };
    const out = createFriendly(m).errors([{path: [1], expected: 'number'}]);
    expect(out).toEqual([{path: '1', label: 'Y', message: 'Y must be a number'}]);
  });

  it('rest-tuple element falls back to $items + $[index] (broad length)', () => {
    const m: FriendlyType<[string, ...number[]]> = {
      $label: 'Args',
      $errors: {type: 'Args must be a list'},
      $items: {$label: 'Arg', $errors: {type: 'arg #$[index] must match'}},
    };
    const out = createFriendly(m).errors([{path: [2], expected: 'number'}]);
    expect(out[0].path).toBe('2');
    expect(out[0].message).toBe('arg #2 must match');
  });

  it('array of tuples: outer $items then inner $slots', () => {
    const m: FriendlyType<[string, number][]> = {
      $label: 'Pairs',
      $errors: {type: 'Pairs must be a list'},
      $items: {
        $label: 'Pair',
        $errors: {type: 'Pair must be a tuple'},
        $slots: [
          {$label: 'Name', $errors: {type: 'name must be text'}},
          {$label: 'Count', $errors: {type: 'count must be a number'}},
        ],
      },
    };
    const out = createFriendly(m).errors([{path: [0, 1], expected: 'number'}]);
    expect(out[0].path).toBe('0.1');
    expect(out[0].message).toBe('count must be a number');
  });

  it('tuple inside an object field routes through the field then $slots', () => {
    interface Form {
      coord: [number, number];
    }
    const m: FriendlyType<Form> = {
      $label: 'Form',
      $errors: {type: 'Form is invalid'},
      coord: {
        $label: 'Coord',
        $errors: {type: 'Coord must be a pair'},
        $slots: [
          {$label: 'Latitude', $errors: {type: 'lat bad'}},
          {$label: 'Longitude', $errors: {type: 'lng bad'}},
        ],
      },
    };
    const out = createFriendly(m).errors([{path: ['coord', 0], expected: 'number'}]);
    expect(out[0].path).toBe('coord.0');
    expect(out[0].message).toBe('lat bad');
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
