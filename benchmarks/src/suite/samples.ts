// Valid / invalid sample data for every benchmark case, keyed by case name.
//
// The runner feeds these to each library's validator: every `valid` sample
// must pass, every `invalid` sample must fail. The same samples drive the
// throughput benchmark, so all libraries are measured on identical inputs.

export interface Samples {
  valid: unknown[];
  invalid: unknown[];
}

// The ordered case list. `group` only drives reporting/sectioning.
export const CASES = [
  {name: 'string', group: 'atomic'},
  {name: 'number', group: 'atomic'},
  {name: 'boolean', group: 'atomic'},
  {name: 'bigint', group: 'atomic'},
  {name: 'user', group: 'object'},
  {name: 'userOptional', group: 'object'},
  {name: 'company', group: 'object'},
  {name: 'numberArray', group: 'array'},
  {name: 'stringOrNumber', group: 'union'},
  {name: 'status', group: 'union'},
  {name: 'pair', group: 'tuple'},
  {name: 'scoreMap', group: 'record'},
  {name: 'nullable', group: 'union'},
  {name: 'order', group: 'dto'},
] as const;

export type CaseName = (typeof CASES)[number]['name'];

const user = (id: number, name: string, active = true) => ({id, name, active});

export const SAMPLES: Record<CaseName, Samples> = {
  string: {
    valid: ['', 'hello', 'a longer string'],
    invalid: [42, true, null, undefined, {}, []],
  },
  number: {
    valid: [0, -1, 3.14, 1000000],
    invalid: ['1', true, null, undefined, {}],
  },
  boolean: {
    valid: [true, false],
    invalid: [0, 1, 'true', null, undefined, {}],
  },
  bigint: {
    valid: [0n, 42n, BigInt(9007199254740993)],
    invalid: [42, '42', true, null, undefined],
  },
  user: {
    valid: [user(1, 'Ann'), user(2, 'Bob', false)],
    invalid: [
      {id: '1', name: 'Ann', active: true},
      {id: 1, name: 2, active: true},
      {id: 1, name: 'Ann'},
      null,
      42,
    ],
  },
  userOptional: {
    valid: [{id: 1, name: 'Ann'}, {id: 2, name: 'Bob', nickname: 'B'}],
    invalid: [{id: 1, name: 'Ann', nickname: 5}, {id: 1}, null],
  },
  company: {
    valid: [
      {
        name: 'Acme',
        address: {street: '1 Main', city: 'Springfield', zip: '00001'},
        employees: [user(1, 'Ann'), user(2, 'Bob')],
      },
    ],
    invalid: [
      {name: 'Acme', address: {street: '1 Main', city: 'Springfield'}, employees: []},
      {name: 'Acme', address: {street: '1 Main', city: 'Springfield', zip: '00001'}, employees: [{id: 1}]},
      {name: 'Acme', employees: []},
      null,
    ],
  },
  numberArray: {
    valid: [[], [1], [1, 2, 3]],
    invalid: [[1, '2', 3], ['a'], {}, null, 'nope'],
  },
  stringOrNumber: {
    valid: ['hello', 42, 0, ''],
    invalid: [true, null, undefined, {}, []],
  },
  status: {
    valid: ['active', 'inactive', 'pending'],
    invalid: ['ACTIVE', 'done', '', 0, null],
  },
  pair: {
    valid: [['a', 1], ['', 0]],
    invalid: [['a', 'b'], [1, 'a'], ['a'], ['a', 1, 2], null, 'a'],
  },
  scoreMap: {
    // NB: an array's values are numbers, so a structural `Record<string,number>`
    // check (ts-go-run-types) accepts `[1,2]` — TS's "object accepts arrays"
    // semantics. Keep invalid samples to shapes every library agrees on.
    valid: [{}, {a: 1}, {a: 1, b: 2}],
    invalid: [{a: '1'}, {a: 1, b: 'x'}, null, 42],
  },
  nullable: {
    valid: [{value: 'hi'}, {value: null}],
    invalid: [{value: 42}, {value: undefined}, {}, null],
  },
  order: {
    valid: [
      {
        id: 1,
        customer: user(1, 'Ann'),
        items: [{sku: 'A1', qty: 2, price: 9.99}],
        status: 'active',
        total: 19.98,
      },
      {
        id: 2,
        customer: user(2, 'Bob', false),
        items: [],
        status: 'pending',
        note: 'gift',
        total: 0,
      },
    ],
    invalid: [
      {id: 1, customer: user(1, 'Ann'), items: [{sku: 'A1', qty: 2}], status: 'active', total: 1},
      {id: 1, customer: user(1, 'Ann'), items: [], status: 'unknown', total: 1},
      {id: 1, customer: {id: 1}, items: [], status: 'active', total: 1},
      null,
    ],
  },
};
