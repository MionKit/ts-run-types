// Runtime behaviour of `createFriendly<T>(map)` — pure-data rendering of
// `getValidationErrors` output into human messages. Errors are hand-built
// `RTValidationError[]` so the suite needs no Go pipeline (createFriendly does no
// type-id injection). Covers: base type failure, format-constraint failure +
// `$[val]`, nested paths, array `rt$items` + `$[index]`, Map/Set `rt$keys`/`rt$values`
// routing (by the entry's `failed` role) + the entry index, label fallback,
// accumulation (one message per constraint), the exclusive `rt$default` mode
// (one catch-all message), and missing-entry fallback. Fields carry REAL
// format brands — the precise `ErrorTemplates<F>` typing derives each node's
// required `rt$errors` keys from them.

import {describe, it, expect} from 'vitest';
import type * as TF from 'ts-runtypes/formats';
import {createFriendly, type FriendlyType, type RTValidationError} from 'ts-runtypes';

interface User {
  name: TF.String<{minLength: 2}>;
  age: TF.Number<{min: 0; max: 120}>;
  tags: string[];
  profile: {email: TF.String<{maxLength: 60}>; score: TF.Number<{min: 0; max: 100}>};
}

const map: FriendlyType<User> = {
  rt$label: 'User account',
  rt$errors: {type: 'Account is invalid'},
  name: {
    rt$label: 'Full name',
    rt$errors: {type: '$[label] must be text', minLength: '$[label] needs at least $[val] characters'},
  },
  age: {
    rt$label: 'Age',
    rt$errors: {
      type: '$[label] must be a number',
      min: '$[label] must be at least $[val]',
      max: '$[label] must be no more than $[val]',
    },
  },
  tags: {
    rt$label: 'Tags',
    rt$errors: {type: 'Tags must be a list'},
    rt$items: {rt$label: 'Tag', rt$errors: {type: 'tag #$[index] must be text'}},
  },
  profile: {
    rt$label: 'Profile',
    rt$errors: {type: 'Profile is invalid'},
    email: {rt$label: 'Email', rt$errors: {type: '', maxLength: 'Enter a valid email'}},
    // The exclusive rt$default mode: ONE catch-all message, whatever failed
    // (the replacement for the removed function form).
    score: {rt$label: 'Score', rt$errors: {rt$default: 'Score must be valid'}},
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
      {path: ['profile', 'email'], expected: 'string', format: {name: 'stringFormat', val: 60, formatPath: ['maxLength']}},
    ];
    expect(friendly.errors(errs)).toEqual([{path: 'profile.email', label: 'Email', message: 'Enter a valid email'}]);
  });

  it('array element uses rt$items + $[index]', () => {
    const errs: RTValidationError[] = [{path: ['tags', 1], expected: 'string'}];
    const out = friendly.errors(errs);
    expect(out[0].path).toBe('tags.1');
    expect(out[0].message).toBe('tag #1 must be text');
  });

  it('label falls back to the raw field name when rt$label is absent', () => {
    // Intentionally degenerate map: omits every `rt$label` (and root meta) so the renderer
    // must fall back to the raw field name. The `as` cast opts past the total `FriendlyType`
    // contract — real callers pass a filled map; this probes the missing-`rt$label` safety net.
    const m = {widget: {rt$errors: {type: 'bad'}}} as unknown as FriendlyType<{widget: string}>;
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

  it('rt$default mode → the one catch-all message renders for every failure', () => {
    const errs: RTValidationError[] = [
      {path: ['profile', 'score'], expected: 'number', format: {name: 'numberFormat', val: 0, formatPath: ['min']}},
      {path: ['profile', 'score'], expected: 'number', format: {name: 'numberFormat', val: 100, formatPath: ['max']}},
    ];
    const out = friendly.errors(errs);
    expect(out).toHaveLength(2); // per-constraint accumulation, same catch-all text
    expect(out.map((m) => m.message)).toEqual(['Score must be valid', 'Score must be valid']);
  });

  it('rt$default catches an unlisted constraint', () => {
    const m: FriendlyType<{name: string}> = {
      rt$label: 'Form',
      rt$errors: {type: 'Form is invalid'},
      name: {rt$label: 'Name', rt$errors: {rt$default: '$[label] is wrong ($[path])'}},
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
    const m = {a: {rt$label: 'A', rt$errors: {type: 'A is invalid'}}} as unknown as FriendlyType<{a: string; b: string}>;
    const out = createFriendly(m).errors([{path: ['b'], expected: 'string'}]);
    expect(out[0].label).toBe('b');
    expect(out[0].message).toBe('b is invalid');
  });
});

describe('createFriendly — Map / Set entries', () => {
  it('Map value failure resolves to rt$values + carries the entry index', () => {
    const m: FriendlyType<Map<string, number>> = {
      rt$label: 'Settings',
      rt$errors: {type: 'Settings must be a map'},
      rt$keys: {rt$label: 'Setting key', rt$errors: {type: 'key must be text'}},
      rt$values: {rt$label: 'Setting value', rt$errors: {type: 'value must be a number'}},
    };
    const out = createFriendly(m).errors([{path: [{key: 0, failed: 'mapValue'}], expected: 'number'}]);
    expect(out).toEqual([{path: '0', label: 'Setting value', message: 'value must be a number'}]);
  });

  it('Map key failure resolves to rt$keys', () => {
    const m: FriendlyType<Map<string, number>> = {
      rt$label: 'Settings',
      rt$errors: {type: 'Settings must be a map'},
      rt$keys: {rt$label: 'Setting key', rt$errors: {type: 'key must be text'}},
      rt$values: {rt$label: 'Setting value', rt$errors: {type: 'value must be a number'}},
    };
    const out = createFriendly(m).errors([{path: [{key: 0, failed: 'mapKey'}], expected: 'string'}]);
    expect(out[0]).toEqual({path: '0', label: 'Setting key', message: 'key must be text'});
  });

  it('key + value failures at the same entry do not collide (rt$keys vs rt$values)', () => {
    const m: FriendlyType<Map<string, number>> = {
      rt$label: 'Settings',
      rt$errors: {type: 'Settings must be a map'},
      rt$keys: {rt$label: 'K', rt$errors: {type: 'bad key'}},
      rt$values: {rt$label: 'V', rt$errors: {type: 'bad value'}},
    };
    const out = createFriendly(m).errors([
      {path: [{key: 0, failed: 'mapKey'}], expected: 'string'},
      {path: [{key: 0, failed: 'mapValue'}], expected: 'number'},
    ]);
    expect(out.map((message) => message.message)).toEqual(['bad key', 'bad value']);
  });

  it('Set item uses rt$values + $[index]', () => {
    interface Form {
      tags: Set<string>;
    }
    const m: FriendlyType<Form> = {
      rt$label: 'Form',
      rt$errors: {type: 'Form is invalid'},
      tags: {
        rt$label: 'Tags',
        rt$errors: {type: 'Tags must be a set'},
        rt$values: {rt$label: 'Tag', rt$errors: {type: 'tag #$[index] must be text'}},
      },
    };
    const out = createFriendly(m).errors([{path: ['tags', {key: 2, failed: 'setKey'}], expected: 'string'}]);
    expect(out[0].path).toBe('tags.2');
    expect(out[0].message).toBe('tag #2 must be text');
  });
});

describe('createFriendly — tuples', () => {
  it('fixed-tuple slot failure resolves to rt$slots[i] (not rt$items)', () => {
    const m: FriendlyType<[string, number]> = {
      rt$label: 'Coordinate',
      rt$errors: {type: 'Coordinate must be a pair'},
      rt$slots: [
        {rt$label: 'X', rt$errors: {type: 'X must be text'}},
        {rt$label: 'Y', rt$errors: {type: 'Y must be a number'}},
      ],
    };
    const out = createFriendly(m).errors([{path: [1], expected: 'number'}]);
    expect(out).toEqual([{path: '1', label: 'Y', message: 'Y must be a number'}]);
  });

  it('rest-tuple element falls back to rt$items + $[index] (broad length)', () => {
    const m: FriendlyType<[string, ...number[]]> = {
      rt$label: 'Args',
      rt$errors: {type: 'Args must be a list'},
      rt$items: {rt$label: 'Arg', rt$errors: {type: 'arg #$[index] must match'}},
    };
    const out = createFriendly(m).errors([{path: [2], expected: 'number'}]);
    expect(out[0].path).toBe('2');
    expect(out[0].message).toBe('arg #2 must match');
  });

  it('array of tuples: outer rt$items then inner rt$slots', () => {
    const m: FriendlyType<[string, number][]> = {
      rt$label: 'Pairs',
      rt$errors: {type: 'Pairs must be a list'},
      rt$items: {
        rt$label: 'Pair',
        rt$errors: {type: 'Pair must be a tuple'},
        rt$slots: [
          {rt$label: 'Name', rt$errors: {type: 'name must be text'}},
          {rt$label: 'Count', rt$errors: {type: 'count must be a number'}},
        ],
      },
    };
    const out = createFriendly(m).errors([{path: [0, 1], expected: 'number'}]);
    expect(out[0].path).toBe('0.1');
    expect(out[0].message).toBe('count must be a number');
  });

  it('tuple inside an object field routes through the field then rt$slots', () => {
    interface Form {
      coord: [number, number];
    }
    const m: FriendlyType<Form> = {
      rt$label: 'Form',
      rt$errors: {type: 'Form is invalid'},
      coord: {
        rt$label: 'Coord',
        rt$errors: {type: 'Coord must be a pair'},
        rt$slots: [
          {rt$label: 'Latitude', rt$errors: {type: 'lat bad'}},
          {rt$label: 'Longitude', rt$errors: {type: 'lng bad'}},
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
