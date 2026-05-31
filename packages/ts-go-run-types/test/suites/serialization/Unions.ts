import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {SerializationCase} from './types.ts';

export const UNIONS = {
  union: {
    title: 'atomic union',
    mutateEncoder: () => createJsonEncoder<Date | number | string | null | bigint>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Date | number | string | null | bigint>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<Date | number | string | null | bigint>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<Date | number | string | null | bigint>(),
    directEncoder: () => createJsonEncoder<Date | number | string | null | bigint>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Date | number | string | null | bigint>(),
    preserveDecoder: () => createJsonDecoder<Date | number | string | null | bigint>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Date | number | string | null | bigint>(),
    binaryDecoder: () => createBinaryDecoder<Date | number | string | null | bigint>(),
    getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z'), 123, 'hello', null, 3n]}),
  },
  union_array: {
    title: 'union of arrays',
    mutateEncoder: () => createJsonEncoder<string[] | number[] | boolean[] | Date[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<string[] | number[] | boolean[] | Date[]>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<string[] | number[] | boolean[] | Date[]>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<string[] | number[] | boolean[] | Date[]>(),
    directEncoder: () => createJsonEncoder<string[] | number[] | boolean[] | Date[]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<string[] | number[] | boolean[] | Date[]>(),
    preserveDecoder: () => createJsonDecoder<string[] | number[] | boolean[] | Date[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<string[] | number[] | boolean[] | Date[]>(),
    binaryDecoder: () => createBinaryDecoder<string[] | number[] | boolean[] | Date[]>(),
    getTestData: () => ({
      values: [
        ['a', 'b', 'c'],
        [1, 2, 3],
        [true, false, true],
        [new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')],
        [],
      ],
    }),
  },
  with_discriminator: {
    title: 'array of union with discriminator',
    mutateEncoder: () => createJsonEncoder<(string | bigint | boolean | Date)[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<(string | bigint | boolean | Date)[]>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<(string | bigint | boolean | Date)[]>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<(string | bigint | boolean | Date)[]>(),
    directEncoder: () => createJsonEncoder<(string | bigint | boolean | Date)[]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<(string | bigint | boolean | Date)[]>(),
    preserveDecoder: () => createJsonDecoder<(string | bigint | boolean | Date)[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<(string | bigint | boolean | Date)[]>(),
    binaryDecoder: () => createBinaryDecoder<(string | bigint | boolean | Date)[]>(),
    getTestData: () => {
      const date = new Date('2000-08-06T02:13:00.000Z');
      return {
        values: [
          ['a', 'b', 'c'],
          [1n, 2n, 3n],
          [true, false, true],
          [1n, 'b', date],
        ],
      };
    },
  },
  union_object_with_discriminator: {
    title: 'union of object shapes',
    mutateEncoder: () =>
      createJsonEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () =>
      createJsonEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(undefined, {
        strategy: 'stripMutate',
      }),
    stripCloneEncoder: () => createJsonEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
    directEncoder: () =>
      createJsonEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
    preserveDecoder: () =>
      createJsonDecoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
    getTestData: () => ({values: [{a: 'world', aa: true}, {c: 1n}, {d: 'hello'}, {}]}),
  },
  union_with_discriminator_property: {
    title: 'union with discriminator property',
    mutateEncoder: () =>
      createJsonEncoder<
        | {type: 'a'; otherProp: boolean}
        | {type: 'b'; otherProp: number}
        | {type: 'c'; otherProp: string; time: Date}
        | {type: boolean; otherProp: string}
      >(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<
        | {type: 'a'; otherProp: boolean}
        | {type: 'b'; otherProp: number}
        | {type: 'c'; otherProp: string; time: Date}
        | {type: boolean; otherProp: string}
      >(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () =>
      createJsonEncoder<
        | {type: 'a'; otherProp: boolean}
        | {type: 'b'; otherProp: number}
        | {type: 'c'; otherProp: string; time: Date}
        | {type: boolean; otherProp: string}
      >(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () =>
      createJsonEncoder<
        | {type: 'a'; otherProp: boolean}
        | {type: 'b'; otherProp: number}
        | {type: 'c'; otherProp: string; time: Date}
        | {type: boolean; otherProp: string}
      >(),
    directEncoder: () =>
      createJsonEncoder<
        | {type: 'a'; otherProp: boolean}
        | {type: 'b'; otherProp: number}
        | {type: 'c'; otherProp: string; time: Date}
        | {type: boolean; otherProp: string}
      >(undefined, {strategy: 'direct'}),
    stripDecoder: () =>
      createJsonDecoder<
        | {type: 'a'; otherProp: boolean}
        | {type: 'b'; otherProp: number}
        | {type: 'c'; otherProp: string; time: Date}
        | {type: boolean; otherProp: string}
      >(),
    preserveDecoder: () =>
      createJsonDecoder<
        | {type: 'a'; otherProp: boolean}
        | {type: 'b'; otherProp: number}
        | {type: 'c'; otherProp: string; time: Date}
        | {type: boolean; otherProp: string}
      >(undefined, {strategy: 'preserve'}),
    binaryEncoder: () =>
      createBinaryEncoder<
        | {type: 'a'; otherProp: boolean}
        | {type: 'b'; otherProp: number}
        | {type: 'c'; otherProp: string; time: Date}
        | {type: boolean; otherProp: string}
      >(),
    binaryDecoder: () =>
      createBinaryDecoder<
        | {type: 'a'; otherProp: boolean}
        | {type: 'b'; otherProp: number}
        | {type: 'c'; otherProp: string; time: Date}
        | {type: boolean; otherProp: string}
      >(),
    getTestData: () => ({
      values: [
        {type: 'a', otherProp: true},
        {type: 'b', otherProp: 123},
        {type: 'c', otherProp: 'hello', time: new Date('2000-08-06T02:13:00.000Z')},
        {type: true, otherProp: 'typeD'},
      ],
    }),
  },
  union_mixed_with_discriminator: {
    title: 'union mixed arrays and objects',
    mutateEncoder: () =>
      createJsonEncoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(
        undefined,
        {strategy: 'mutate'}
      ),
    cloneEncoder: () =>
      createJsonEncoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(
        undefined,
        {strategy: 'clone'}
      ),
    stripMutateEncoder: () =>
      createJsonEncoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(
        undefined,
        {strategy: 'stripMutate'}
      ),
    stripCloneEncoder: () =>
      createJsonEncoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
    directEncoder: () =>
      createJsonEncoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(
        undefined,
        {strategy: 'direct'}
      ),
    stripDecoder: () =>
      createJsonDecoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
    preserveDecoder: () =>
      createJsonDecoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(
        undefined,
        {strategy: 'preserve'}
      ),
    binaryEncoder: () =>
      createBinaryEncoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
    binaryDecoder: () =>
      createBinaryDecoder<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
    getTestData: () => ({values: [['a', 'b', 'c'], {a: 'hello', aa: true}]}),
  },
  union_index_property_with_discriminator: {
    title: 'union with index property and discriminator',
    mutateEncoder: () =>
      createJsonEncoder<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () =>
      createJsonEncoder<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () =>
      createJsonEncoder<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    directEncoder: () =>
      createJsonEncoder<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(undefined, {strategy: 'direct'}),
    stripDecoder: () =>
      createJsonDecoder<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    preserveDecoder: () =>
      createJsonDecoder<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(undefined, {strategy: 'preserve'}),
    binaryEncoder: () =>
      createBinaryEncoder<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    binaryDecoder: () =>
      createBinaryDecoder<
        | string[]
        | {a: string; aa: boolean}
        | {b: number}
        | {a: string; [key: string]: string}
        | {[key: string]: bigint; b: bigint}
      >(),
    getTestData: () => ({values: [['a', 'b', 'c'], {a: 'hello', aa: true}, {b: 1n, c: 2n}]}),
  },
  circular_union_with_discriminator: {
    title: 'Circular union with discriminator',
    mutateEncoder: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createJsonEncoder<UnionC>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createJsonEncoder<UnionC>(undefined, {strategy: 'clone'});
    },
    stripMutateEncoder: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createJsonEncoder<UnionC>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createJsonEncoder<UnionC>();
    },
    directEncoder: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createJsonEncoder<UnionC>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createJsonDecoder<UnionC>();
    },
    preserveDecoder: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createJsonDecoder<UnionC>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createBinaryEncoder<UnionC>();
    },
    binaryDecoder: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createBinaryDecoder<UnionC>();
    },
    getTestData: () => {
      const date = new Date('2000-08-06T02:13:00.000Z');
      return {
        values: [
          new Date(date.getTime()),
          123,
          'hello',
          {a: {a: {}}},
          {},
          [],
          [[]],
          [123, 3, {b: 'hello'}],
          [123, 3, 'hello'],
          [[123], 3, [3, 'hello']],
        ],
      };
    },
  },
  union_with_methods: {
    title: 'union with methods — methods should be excluded',
    mutateEncoder: () =>
      createJsonEncoder<
        {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
      >(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<
        {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
      >(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () =>
      createJsonEncoder<
        {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
      >(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () =>
      createJsonEncoder<
        {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
      >(),
    directEncoder: () =>
      createJsonEncoder<
        {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
      >(undefined, {strategy: 'direct'}),
    stripDecoder: () =>
      createJsonDecoder<
        {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
      >(),
    preserveDecoder: () =>
      createJsonDecoder<
        {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
      >(undefined, {strategy: 'preserve'}),
    binaryEncoder: () =>
      createBinaryEncoder<
        {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
      >(),
    binaryDecoder: () =>
      createBinaryDecoder<
        {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
      >(),
    getTestData: () => {
      const objWithName = {
        name: 'John',
        getName() {
          return 'John';
        },
      };
      const objWithAge = {
        age: 25,
        getAge() {
          return 25;
        },
      };
      const objWithActive = {
        active: true,
        isActive() {
          return true;
        },
      };
      return {
        values: [objWithName, objWithAge, objWithActive],
        deserializedValues: [{name: 'John'}, {age: 25}, {active: true}],
      };
    },
  },
  union_with_any: {
    title: 'union with any — checked last as fallback',
    mutateEncoder: () => createJsonEncoder<number | {name: string} | any>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<number | {name: string} | any>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<number | {name: string} | any>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<number | {name: string} | any>(),
    directEncoder: () => createJsonEncoder<number | {name: string} | any>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<number | {name: string} | any>(),
    preserveDecoder: () => createJsonDecoder<number | {name: string} | any>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<number | {name: string} | any>(),
    binaryDecoder: () => createBinaryDecoder<number | {name: string} | any>(),
    roundTripBestEffort: true,
    getTestData: () => ({values: [42, {name: 'test'}, 'fallback to any', true, null]}),
  },
  union_with_non_serializable: {
    title: 'union with non-serializable type throws',
    description: 'function in union — mion throws at RT-compile time.',
    mutateEncoder: () => createJsonEncoder<Date | number | string | (() => any)>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Date | number | string | (() => any)>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<Date | number | string | (() => any)>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<Date | number | string | (() => any)>(),
    directEncoder: () => createJsonEncoder<Date | number | string | (() => any)>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Date | number | string | (() => any)>(),
    preserveDecoder: () => createJsonDecoder<Date | number | string | (() => any)>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Date | number | string | (() => any)>(),
    binaryDecoder: () => createBinaryDecoder<Date | number | string | (() => any)>(),
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },

  // ──────────────────────────────────────────────────────────────
  // Documented throw cases: mion's prepareForJson does NOT strip
  // extras (`03JsonObjects.spec.ts` strip extra params:
  //   `// expect(deserializedValues[i]).toEqual(deserialized);`
  //   `// native JSON.stringify do not strip extra params`).
  // When a union member matches an input that carries an extra
  // prop holding a non-serializable value (bigint, symbol), the
  // matched member's emit transforms only its declared props; the
  // extra survives into JSON.stringify, which throws. These cases
  // pin that contract — callers must shape their data to the
  // declared type, or apply a future stripUnknownProps pass before
  // serialize. The flag `jsonStringifyThrows` opts the case into
  // the throw-asserting adapter path.

  union_extra_bigint_prop_throws: {
    title: 'union member with extra bigint prop throws at JSON.stringify',
    description:
      'Input `{b: 123, c: 123n}` matches the `{b: number}` arm; mion preserves the structural extra `c: 123n` (no implicit strip). JSON.stringify then throws on the bigint. Contract: extras pass through unchanged — pre-strip them if they may carry non-serializable values.',
    mutateEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{a: string} | {b: number}>(),
    directEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{a: string} | {b: number}>(),
    preserveDecoder: () => createJsonDecoder<{a: string} | {b: number}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{a: string} | {b: number}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string} | {b: number}>(),
    jsonStringifyThrows: true,
    getTestData: () => ({values: [{b: 123, c: 123n}]}),
    // Safe-path adapter: stringifyJson strips the extra `c: 123n` in
    // the emit, so the round-trip succeeds with a declared-only
    // result. Captured here as a stringify-specific expectation.
    getTestDataForStringify: () => ({values: [{b: 123, c: 123n}], deserializedValues: [{b: 123}]}),
  },

  union_extra_symbol_prop_drops: {
    title: 'union member with extra symbol prop is dropped by JSON.stringify',
    description:
      'Same contract as `union_extra_bigint_prop_throws` but with a symbol extra. JSON.stringify silently drops symbols (returns `{"b":123}` — no throw), so this case round-trips with the extra silently lost. Rename from the original `_throws` name (which advertised a throw that never fires) for honesty.',
    mutateEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{a: string} | {b: number}>(),
    directEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{a: string} | {b: number}>(),
    preserveDecoder: () => createJsonDecoder<{a: string} | {b: number}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{a: string} | {b: number}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string} | {b: number}>(),
    // Symbol-valued props are silently dropped by JSON.stringify
    // (per ECMAScript spec) — no throw, no round-trip mismatch
    // because the symbol was never reachable post-stringify
    // anyway. Documenting via `deserializedValues` instead of the
    // throw flag — the symbol prop vanishes, the rest survives.
    getTestData: () => ({
      values: [{b: 123, sym: Symbol('extra')}],
      deserializedValues: [{b: 123}],
    }),
  },

  // ----------------------------------------------------------------
  // Flattened-union shared-prop cases. When two union members declare
  // a property with the same name, the flattened shape treats that
  // property as a union of the per-member declared types. Round-trip
  // is all-or-nothing per member: encode AND decode must dispatch to
  // the matched member and apply that member's per-prop transform —
  // never compose transforms across members. Each case exercises
  // both encoder modes against both decoder modes via the adapter.
  // ----------------------------------------------------------------

  shared_prop_same_type: {
    title: 'shared prop — same declared type in both members (Date)',
    description:
      'Discriminator `kind` selects the member; shared prop `at: Date` has the identical transform on both branches, so the round-trip only needs to prove that the dispatch does not lose the prop or double-transform it.',
    mutateEncoder: () =>
      createJsonEncoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(undefined, {
        strategy: 'mutate',
      }),
    cloneEncoder: () =>
      createJsonEncoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(undefined, {
        strategy: 'clone',
      }),
    stripMutateEncoder: () =>
      createJsonEncoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(undefined, {
        strategy: 'stripMutate',
      }),
    stripCloneEncoder: () =>
      createJsonEncoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(),
    directEncoder: () =>
      createJsonEncoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(undefined, {
        strategy: 'direct',
      }),
    stripDecoder: () =>
      createJsonDecoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(),
    preserveDecoder: () =>
      createJsonDecoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(undefined, {
        strategy: 'preserve',
      }),
    binaryEncoder: () =>
      createBinaryEncoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(),
    binaryDecoder: () =>
      createBinaryDecoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(),
    getTestData: () => ({
      values: [
        {kind: 'created', at: new Date('2000-08-06T02:13:00.000Z'), by: 'alice'},
        {kind: 'updated', at: new Date('2001-09-07T03:14:00.000Z'), reviewers: ['bob', 'carol']},
      ],
    }),
  },

  shared_prop_divergent_date_string: {
    title: 'shared prop — Date in one member, string in the other',
    description:
      'Discriminator `kind` resolves which member matched. Shared prop `when: Date | string` MUST take the matched-member transform: `kind:event` → Date↔ISO; `kind:note` → raw string passthrough. Composing both transforms would corrupt either branch (a `Date.toISOString()` reapplied to a plain string, or a string parsed as Date when it should not be).',
    mutateEncoder: () =>
      createJsonEncoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(undefined, {
        strategy: 'mutate',
      }),
    cloneEncoder: () =>
      createJsonEncoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(undefined, {
        strategy: 'clone',
      }),
    stripMutateEncoder: () =>
      createJsonEncoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(undefined, {
        strategy: 'stripMutate',
      }),
    stripCloneEncoder: () =>
      createJsonEncoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(),
    directEncoder: () =>
      createJsonEncoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(undefined, {
        strategy: 'direct',
      }),
    stripDecoder: () =>
      createJsonDecoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(),
    preserveDecoder: () =>
      createJsonDecoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(undefined, {
        strategy: 'preserve',
      }),
    binaryEncoder: () =>
      createBinaryEncoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(),
    binaryDecoder: () =>
      createBinaryDecoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(),
    getTestData: () => ({
      values: [
        {kind: 'event', when: new Date('2000-08-06T02:13:00.000Z'), label: 'kickoff'},
        {kind: 'note', when: 'tomorrow morning', label: 'reminder'},
      ],
    }),
  },

  shared_prop_divergent_bigint_number: {
    title: 'shared prop — bigint in one member, number in the other',
    description:
      'Discriminator `form` resolves the member. Shared prop `id: bigint | number` must follow the matched-member transform: `form:big` → bigint↔string; `form:small` → raw number. Other shared prop `label: string` is identical on both branches and must survive either dispatch.',
    mutateEncoder: () =>
      createJsonEncoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(undefined, {
        strategy: 'mutate',
      }),
    cloneEncoder: () =>
      createJsonEncoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(undefined, {
        strategy: 'clone',
      }),
    stripMutateEncoder: () =>
      createJsonEncoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(undefined, {
        strategy: 'stripMutate',
      }),
    stripCloneEncoder: () =>
      createJsonEncoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(),
    directEncoder: () =>
      createJsonEncoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(undefined, {
        strategy: 'direct',
      }),
    stripDecoder: () =>
      createJsonDecoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(),
    preserveDecoder: () =>
      createJsonDecoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(undefined, {
        strategy: 'preserve',
      }),
    binaryEncoder: () =>
      createBinaryEncoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(),
    binaryDecoder: () =>
      createBinaryDecoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(),
    getTestData: () => ({
      values: [
        {form: 'big', id: 9007199254740993n, label: 'beyond Number.MAX_SAFE_INTEGER'},
        {form: 'small', id: 42, label: 'fits in number'},
      ],
    }),
  },

  shared_prop_no_discriminator_structural: {
    title: 'shared prop — no literal discriminator, member resolved structurally',
    description:
      'No tag-like literal field. Members differentiated by (a) shared prop `a` having divergent type (string vs boolean — a sub-union) and (b) unique companion props (`b: number` vs `c: Date`). The encoder/decoder dispatch must work purely on shape: which member’s required props match the input. Verifies the dispatch is not silently relying on a literal-discriminator fast path.',
    mutateEncoder: () => createJsonEncoder<{a: string; b: number} | {a: boolean; c: Date}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{a: string; b: number} | {a: boolean; c: Date}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () =>
      createJsonEncoder<{a: string; b: number} | {a: boolean; c: Date}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{a: string; b: number} | {a: boolean; c: Date}>(),
    directEncoder: () => createJsonEncoder<{a: string; b: number} | {a: boolean; c: Date}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{a: string; b: number} | {a: boolean; c: Date}>(),
    preserveDecoder: () => createJsonDecoder<{a: string; b: number} | {a: boolean; c: Date}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{a: string; b: number} | {a: boolean; c: Date}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string; b: number} | {a: boolean; c: Date}>(),
    getTestData: () => ({
      values: [
        {a: 'hello', b: 7},
        {a: true, c: new Date('2000-08-06T02:13:00.000Z')},
      ],
    }),
  },
} as const satisfies Record<string, SerializationCase>;
