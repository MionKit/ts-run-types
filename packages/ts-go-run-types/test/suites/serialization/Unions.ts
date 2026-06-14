import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {SerializationCase} from './types.ts';

export const UNIONS = {
  union: {
    title: 'atomic union',
    description:
      'Untagged union of scalar atoms (Date | number | string | null | bigint). Members resolve by runtime kind — no discriminator. Date encodes to an ISO string and bigint to a decimal string on the wire; number, string and null pass through unchanged.',
    serializeNotes: 'Date and bigint members carry per-kind wire transforms (Date↔ISO string, bigint↔decimal string); the decoder restores each from its scalar form.',
    mutateEncoder: () => createJsonEncoder<Date | number | string | null | bigint>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Date | number | string | null | bigint>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Date | number | string | null | bigint>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Date | number | string | null | bigint>(),
    preserveDecoder: () => createJsonDecoder<Date | number | string | null | bigint>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Date | number | string | null | bigint>(),
    binaryDecoder: () => createBinaryDecoder<Date | number | string | null | bigint>(),
    schemaEncoder: () => createJsonEncoder(RT.union([RT.date(), RT.number(), RT.string(), RT.literal(null), RT.bigint()])),
    schemaDecoder: () => createJsonDecoder(RT.union([RT.date(), RT.number(), RT.string(), RT.literal(null), RT.bigint()])),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(RT.union([RT.date(), RT.number(), RT.string(), RT.literal(null), RT.bigint()])),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(RT.union([RT.date(), RT.number(), RT.string(), RT.literal(null), RT.bigint()])),
    getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z'), 123, 'hello', null, 3n]}),
  },
  union_array: {
    title: 'union of arrays',
    description:
      'Untagged union of homogeneous arrays (string[] | number[] | boolean[] | Date[]). The matched member is chosen by element kind; only the Date[] arm applies a per-element transform (Date↔ISO string), the rest round-trip their elements verbatim. An empty `[]` value satisfies every arm.',
    serializeNotes: 'Empty array sample matches all four arms structurally — the round-trip stays an empty array regardless of which member resolves.',
    mutateEncoder: () => createJsonEncoder<string[] | number[] | boolean[] | Date[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<string[] | number[] | boolean[] | Date[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<string[] | number[] | boolean[] | Date[]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<string[] | number[] | boolean[] | Date[]>(),
    preserveDecoder: () => createJsonDecoder<string[] | number[] | boolean[] | Date[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<string[] | number[] | boolean[] | Date[]>(),
    binaryDecoder: () => createBinaryDecoder<string[] | number[] | boolean[] | Date[]>(),
    schemaEncoder: () =>
      createJsonEncoder(RT.union([RT.array(RT.string()), RT.array(RT.number()), RT.array(RT.boolean()), RT.array(RT.date())])),
    schemaDecoder: () =>
      createJsonDecoder(RT.union([RT.array(RT.string()), RT.array(RT.number()), RT.array(RT.boolean()), RT.array(RT.date())])),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(RT.union([RT.array(RT.string()), RT.array(RT.number()), RT.array(RT.boolean()), RT.array(RT.date())])),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(RT.union([RT.array(RT.string()), RT.array(RT.number()), RT.array(RT.boolean()), RT.array(RT.date())])),
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
    description:
      'Array whose element type is an untagged scalar union (string | bigint | boolean | Date). Each element resolves independently by runtime kind; bigint elements encode to decimal strings and Date elements to ISO strings. The mixed sample [1n, "b", date] exercises per-element member selection within one array.',
    serializeNotes: 'Member selection is per-element, not per-array — a single array can hold elements that resolve to different union arms (bigint↔string, Date↔ISO, raw string/boolean).',
    mutateEncoder: () => createJsonEncoder<(string | bigint | boolean | Date)[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<(string | bigint | boolean | Date)[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<(string | bigint | boolean | Date)[]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<(string | bigint | boolean | Date)[]>(),
    preserveDecoder: () => createJsonDecoder<(string | bigint | boolean | Date)[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<(string | bigint | boolean | Date)[]>(),
    binaryDecoder: () => createBinaryDecoder<(string | bigint | boolean | Date)[]>(),
    schemaEncoder: () => createJsonEncoder(RT.array(RT.union([RT.string(), RT.bigint(), RT.boolean(), RT.date()]))),
    schemaDecoder: () => createJsonDecoder(RT.array(RT.union([RT.string(), RT.bigint(), RT.boolean(), RT.date()]))),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.array(RT.union([RT.string(), RT.bigint(), RT.boolean(), RT.date()]))),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.array(RT.union([RT.string(), RT.bigint(), RT.boolean(), RT.date()]))),
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
    description:
      'Untagged union of object shapes ({a; aa} | {b} | {c: bigint} | {d?}) with no literal discriminator — members resolve structurally by which required keys are present. The {c: bigint} arm applies bigint↔string; the all-optional {d?} arm matches an empty object.',
    serializeNotes: 'Empty-object sample {} resolves to the all-optional {d?: string} arm (its only member with no required key); the {c: bigint} arm encodes bigint to a decimal string.',
    mutateEncoder: () =>
      createJsonEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
    preserveDecoder: () =>
      createJsonDecoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string; aa: boolean} | {b: number} | {c: bigint} | {d?: string}>(),
    schemaEncoder: () =>
      createJsonEncoder(
        RT.union([
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.object({c: RT.bigint()}),
          RT.object({d: RT.optional(RT.string())}),
        ])
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.union([
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.object({c: RT.bigint()}),
          RT.object({d: RT.optional(RT.string())}),
        ])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.union([
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.object({c: RT.bigint()}),
          RT.object({d: RT.optional(RT.string())}),
        ])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.union([
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.object({c: RT.bigint()}),
          RT.object({d: RT.optional(RT.string())}),
        ])
      ),
    getTestData: () => ({values: [{a: 'world', aa: true}, {c: 1n}, {d: 'hello'}, {}]}),
  },
  union_with_discriminator_property: {
    title: 'union with discriminator property',
    description:
      'Discriminated union keyed on `type`: literal arms type:"a"/"b"/"c" plus a non-literal type:boolean arm. The decoder picks the member by the `type` discriminator; the type:"c" arm carries a Date↔ISO transform on its `time` prop.',
    serializeNotes: [
      'Discriminator is the literal `type` field for three arms; the fourth (type:boolean) is matched on the non-literal kind, so dispatch falls back from literal value to value-type for that member.',
      'Only the type:"c" arm has a wire transform (Date↔ISO string on `time`); the other arms carry plain scalars.',
    ],
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
    schemaEncoder: () =>
      createJsonEncoder(
        RT.union([
          RT.object({type: RT.literal('a'), otherProp: RT.boolean()}),
          RT.object({type: RT.literal('b'), otherProp: RT.number()}),
          RT.object({type: RT.literal('c'), otherProp: RT.string(), time: RT.date()}),
          RT.object({type: RT.boolean(), otherProp: RT.string()}),
        ])
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.union([
          RT.object({type: RT.literal('a'), otherProp: RT.boolean()}),
          RT.object({type: RT.literal('b'), otherProp: RT.number()}),
          RT.object({type: RT.literal('c'), otherProp: RT.string(), time: RT.date()}),
          RT.object({type: RT.boolean(), otherProp: RT.string()}),
        ])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.union([
          RT.object({type: RT.literal('a'), otherProp: RT.boolean()}),
          RT.object({type: RT.literal('b'), otherProp: RT.number()}),
          RT.object({type: RT.literal('c'), otherProp: RT.string(), time: RT.date()}),
          RT.object({type: RT.boolean(), otherProp: RT.string()}),
        ])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.union([
          RT.object({type: RT.literal('a'), otherProp: RT.boolean()}),
          RT.object({type: RT.literal('b'), otherProp: RT.number()}),
          RT.object({type: RT.literal('c'), otherProp: RT.string(), time: RT.date()}),
          RT.object({type: RT.boolean(), otherProp: RT.string()}),
        ])
      ),
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
    description:
      'Untagged union mixing array members (string[] | number[] | boolean[]) and object members ({a; aa} | {b} | {c: bigint; aa: "string"}). Dispatch first splits on array-vs-object kind, then resolves the matched shape structurally. The {c: bigint} object arm carries bigint↔string.',
    serializeNotes: 'No literal discriminator across the family — array members are told apart from object members by structural kind, then by element type or required keys.',
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
    schemaEncoder: () =>
      createJsonEncoder(
        RT.union([
          RT.array(RT.string()),
          RT.array(RT.number()),
          RT.array(RT.boolean()),
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.object({c: RT.bigint(), aa: RT.literal('string')}),
        ])
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.union([
          RT.array(RT.string()),
          RT.array(RT.number()),
          RT.array(RT.boolean()),
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.object({c: RT.bigint(), aa: RT.literal('string')}),
        ])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.union([
          RT.array(RT.string()),
          RT.array(RT.number()),
          RT.array(RT.boolean()),
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.object({c: RT.bigint(), aa: RT.literal('string')}),
        ])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.union([
          RT.array(RT.string()),
          RT.array(RT.number()),
          RT.array(RT.boolean()),
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.object({c: RT.bigint(), aa: RT.literal('string')}),
        ])
      ),
    getTestData: () => ({values: [['a', 'b', 'c'], {a: 'hello', aa: true}]}),
  },
  union_index_property_with_discriminator: {
    title: 'union with index property and discriminator',
    description:
      'Untagged union including members with index signatures (record-like {a; [key]: string} and {[key]: bigint; b: bigint}), modelled value-first as record∩object intersections. Members resolve structurally; the bigint-record arm encodes every index-keyed value (including the {b: 1n, c: 2n} sample) bigint↔string.',
    serializeNotes: 'Index-signature members serialize all enumerable keys, not just the named ones — the bigint-record arm applies bigint↔string to both the declared `b` and the open index entries (e.g. `c`).',
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
    schemaEncoder: () =>
      createJsonEncoder(
        RT.union([
          RT.array(RT.string()),
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()})),
          RT.intersection(RT.record(RT.bigint()), RT.object({b: RT.bigint()})),
        ])
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.union([
          RT.array(RT.string()),
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()})),
          RT.intersection(RT.record(RT.bigint()), RT.object({b: RT.bigint()})),
        ])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.union([
          RT.array(RT.string()),
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()})),
          RT.intersection(RT.record(RT.bigint()), RT.object({b: RT.bigint()})),
        ])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.union([
          RT.array(RT.string()),
          RT.object({a: RT.string(), aa: RT.boolean()}),
          RT.object({b: RT.number()}),
          RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()})),
          RT.intersection(RT.record(RT.bigint()), RT.object({b: RT.bigint()})),
        ])
      ),
    getTestData: () => ({values: [['a', 'b', 'c'], {a: 'hello', aa: true}, {b: 1n, c: 2n}]}),
  },
  circular_union_with_discriminator: {
    title: 'Circular union with discriminator',
    description:
      'Self-referential union UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[], recursing through the optional object prop `a` and the array arm. Each node resolves by kind; the value-first form uses RT.circular(self => …) so encode/decode follow the recursion to arbitrary depth. Date members encode Date↔ISO.',
    serializeNotes: 'Recursive union — encoder and decoder must walk the self-reference (nested objects and arrays) without diverging; member selection happens fresh at every level.',
    mutateEncoder: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createJsonEncoder<UnionC>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
      return createJsonEncoder<UnionC>(undefined, {strategy: 'clone'});
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
    schemaEncoder: () => {
      const uc = RT.circular((self) =>
        RT.union([
          RT.date(),
          RT.number(),
          RT.string(),
          RT.object({a: RT.optional(self), b: RT.optional(RT.string())}),
          RT.array(self),
        ])
      );
      return createJsonEncoder(uc);
    },
    schemaDecoder: () => {
      const uc = RT.circular((self) =>
        RT.union([
          RT.date(),
          RT.number(),
          RT.string(),
          RT.object({a: RT.optional(self), b: RT.optional(RT.string())}),
          RT.array(self),
        ])
      );
      return createJsonDecoder(uc);
    },
    schemaBinaryEncoder: () => {
      const uc = RT.circular((self) =>
        RT.union([
          RT.date(),
          RT.number(),
          RT.string(),
          RT.object({a: RT.optional(self), b: RT.optional(RT.string())}),
          RT.array(self),
        ])
      );
      return createBinaryEncoder(uc);
    },
    schemaBinaryDecoder: () => {
      const uc = RT.circular((self) =>
        RT.union([
          RT.date(),
          RT.number(),
          RT.string(),
          RT.object({a: RT.optional(self), b: RT.optional(RT.string())}),
          RT.array(self),
        ])
      );
      return createBinaryDecoder(uc);
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
    description:
      'Union of object shapes each carrying a method ({name; getName()} | {age; getAge()} | {active; isActive()}). Methods are non-serializable at a property position, so each matched member serializes its data prop only and the method is silently dropped — restored values are {name}, {age}, {active}.',
    serializeNotes: 'Method members are dropped, not throwing — they sit at a property position, so the build emits a per-family Warning and the round-trip yields the data-only projection (deserializedValues omit getName/getAge/isActive).',
    mutateEncoder: () =>
      createJsonEncoder<
        {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
      >(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<
        {name: string; getName(): string} | {age: number; getAge(): number} | {active: boolean; isActive(): boolean}
      >(undefined, {strategy: 'clone'}),
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
    schemaEncoder: () =>
      createJsonEncoder(
        RT.union([
          RT.object({name: RT.string(), getName: RT.func([], RT.string())}),
          RT.object({age: RT.number(), getAge: RT.func([], RT.number())}),
          RT.object({active: RT.boolean(), isActive: RT.func([], RT.boolean())}),
        ])
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.union([
          RT.object({name: RT.string(), getName: RT.func([], RT.string())}),
          RT.object({age: RT.number(), getAge: RT.func([], RT.number())}),
          RT.object({active: RT.boolean(), isActive: RT.func([], RT.boolean())}),
        ])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.union([
          RT.object({name: RT.string(), getName: RT.func([], RT.string())}),
          RT.object({age: RT.number(), getAge: RT.func([], RT.number())}),
          RT.object({active: RT.boolean(), isActive: RT.func([], RT.boolean())}),
        ])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.union([
          RT.object({name: RT.string(), getName: RT.func([], RT.string())}),
          RT.object({age: RT.number(), getAge: RT.func([], RT.number())}),
          RT.object({active: RT.boolean(), isActive: RT.func([], RT.boolean())}),
        ])
      ),
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
    description:
      'Union containing `any` (number | {name} | any). The `any` arm absorbs the whole union at the type-checker layer, so the compiled type is bare `any` and the value-first equivalent is RT.any(). Serialization is a best-effort JSON pass over whatever value arrives (number, object, string, boolean, null).',
    serializeNotes: [
      'TS DIVERGENCE: `T | any` collapses to `any` in the checker, so the named number/{name} arms never participate — the case compiles to the same factory as a bare `any` type.',
      'roundTripBestEffort: the adapter only requires JSON.stringify to yield a defined string, not a deep-equal round-trip, since `any` carries no shape to restore.',
    ],
    mutateEncoder: () => createJsonEncoder<number | {name: string} | any>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<number | {name: string} | any>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<number | {name: string} | any>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<number | {name: string} | any>(),
    preserveDecoder: () => createJsonDecoder<number | {name: string} | any>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<number | {name: string} | any>(),
    binaryDecoder: () => createBinaryDecoder<number | {name: string} | any>(),
    // `T | any` collapses to `any` at the type-checker layer — the value-first
    // equivalent is the bare `any` builder.
    schemaEncoder: () => createJsonEncoder(RT.any()),
    schemaDecoder: () => createJsonDecoder(RT.any()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.any()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.any()),
    roundTripBestEffort: true,
    getTestData: () => ({values: [42, {name: 'test'}, 'fallback to any', true, null]}),
  },
  union_with_non_serializable: {
    title: 'union with non-serializable type throws',
    description: 'function in union — mion throws at RT-compile time.',
    serializeNotes:
      'The function arm sits at a propagating (union-member) position, so it is non-serializable as an Error, not a droppable Warning: the Go pipeline renders an alwaysThrow factory and every encoder/decoder (JSON and binary) throws at the first call. factoryThrows is set; the schema thunks resolve the same throwing factory via the value-first path.',
    mutateEncoder: () => createJsonEncoder<Date | number | string | (() => any)>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Date | number | string | (() => any)>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Date | number | string | (() => any)>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Date | number | string | (() => any)>(),
    preserveDecoder: () => createJsonDecoder<Date | number | string | (() => any)>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Date | number | string | (() => any)>(),
    binaryDecoder: () => createBinaryDecoder<Date | number | string | (() => any)>(),
    // The function arm resolves the same alwaysThrow factory via the value-first
    // path, so each schema thunk throws like the type-first form (factoryThrows).
    schemaEncoder: () => createJsonEncoder(RT.union([RT.date(), RT.number(), RT.string(), RT.func([], RT.any())])),
    schemaDecoder: () => createJsonDecoder(RT.union([RT.date(), RT.number(), RT.string(), RT.func([], RT.any())])),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.union([RT.date(), RT.number(), RT.string(), RT.func([], RT.any())])),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.union([RT.date(), RT.number(), RT.string(), RT.func([], RT.any())])),
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
    serializeNotes:
      'jsonStringifyThrows applies to the unsafe (mutate/preserve) path only — the matched member transforms its declared `b`, the bigint extra survives into JSON.stringify and throws. The safe (clone/direct) path strips the extra pre-serialise, so getTestDataForStringify expects a clean declared-only {b: 123} round-trip.',
    mutateEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{a: string} | {b: number}>(),
    preserveDecoder: () => createJsonDecoder<{a: string} | {b: number}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{a: string} | {b: number}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string} | {b: number}>(),
    schemaEncoder: () => createJsonEncoder(RT.union([RT.object({a: RT.string()}), RT.object({b: RT.number()})])),
    schemaDecoder: () => createJsonDecoder(RT.union([RT.object({a: RT.string()}), RT.object({b: RT.number()})])),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.union([RT.object({a: RT.string()}), RT.object({b: RT.number()})])),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.union([RT.object({a: RT.string()}), RT.object({b: RT.number()})])),
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
    serializeNotes:
      'No throw flag — symbol-valued extras are dropped by JSON.stringify per ECMAScript spec, so both paths converge on declared-only output. The lossy round-trip is captured via deserializedValues ({b: 123}) rather than jsonStringifyThrows.',
    mutateEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{a: string} | {b: number}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{a: string} | {b: number}>(),
    preserveDecoder: () => createJsonDecoder<{a: string} | {b: number}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{a: string} | {b: number}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string} | {b: number}>(),
    schemaEncoder: () => createJsonEncoder(RT.union([RT.object({a: RT.string()}), RT.object({b: RT.number()})])),
    schemaDecoder: () => createJsonDecoder(RT.union([RT.object({a: RT.string()}), RT.object({b: RT.number()})])),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.union([RT.object({a: RT.string()}), RT.object({b: RT.number()})])),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.union([RT.object({a: RT.string()}), RT.object({b: RT.number()})])),
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
    serializeNotes:
      'Shared `at: Date` carries Date↔ISO on whichever arm the `kind` literal selects; the per-member companion props (`by` string vs `reviewers` string[]) pass through verbatim.',
    mutateEncoder: () =>
      createJsonEncoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(undefined, {
        strategy: 'mutate',
      }),
    cloneEncoder: () =>
      createJsonEncoder<{kind: 'created'; at: Date; by: string} | {kind: 'updated'; at: Date; reviewers: string[]}>(undefined, {
        strategy: 'clone',
      }),
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
    schemaEncoder: () =>
      createJsonEncoder(
        RT.union([
          RT.object({kind: RT.literal('created'), at: RT.date(), by: RT.string()}),
          RT.object({kind: RT.literal('updated'), at: RT.date(), reviewers: RT.array(RT.string())}),
        ])
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.union([
          RT.object({kind: RT.literal('created'), at: RT.date(), by: RT.string()}),
          RT.object({kind: RT.literal('updated'), at: RT.date(), reviewers: RT.array(RT.string())}),
        ])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.union([
          RT.object({kind: RT.literal('created'), at: RT.date(), by: RT.string()}),
          RT.object({kind: RT.literal('updated'), at: RT.date(), reviewers: RT.array(RT.string())}),
        ])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.union([
          RT.object({kind: RT.literal('created'), at: RT.date(), by: RT.string()}),
          RT.object({kind: RT.literal('updated'), at: RT.date(), reviewers: RT.array(RT.string())}),
        ])
      ),
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
    serializeNotes:
      'Divergent shared-prop transform keyed on the `kind` discriminator: the `when` slot encodes Date↔ISO for the event arm but passes the string through untouched for the note arm — the two transforms must never compose on the same value.',
    mutateEncoder: () =>
      createJsonEncoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(undefined, {
        strategy: 'mutate',
      }),
    cloneEncoder: () =>
      createJsonEncoder<{kind: 'event'; when: Date; label: string} | {kind: 'note'; when: string; label: string}>(undefined, {
        strategy: 'clone',
      }),
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
    schemaEncoder: () =>
      createJsonEncoder(
        RT.union([
          RT.object({kind: RT.literal('event'), when: RT.date(), label: RT.string()}),
          RT.object({kind: RT.literal('note'), when: RT.string(), label: RT.string()}),
        ])
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.union([
          RT.object({kind: RT.literal('event'), when: RT.date(), label: RT.string()}),
          RT.object({kind: RT.literal('note'), when: RT.string(), label: RT.string()}),
        ])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.union([
          RT.object({kind: RT.literal('event'), when: RT.date(), label: RT.string()}),
          RT.object({kind: RT.literal('note'), when: RT.string(), label: RT.string()}),
        ])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.union([
          RT.object({kind: RT.literal('event'), when: RT.date(), label: RT.string()}),
          RT.object({kind: RT.literal('note'), when: RT.string(), label: RT.string()}),
        ])
      ),
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
    serializeNotes:
      'The big-arm sample id (9007199254740993n) is past Number.MAX_SAFE_INTEGER, so the bigint↔string transform is what preserves it losslessly — a number transform would round it; the small arm keeps its number verbatim.',
    mutateEncoder: () =>
      createJsonEncoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(undefined, {
        strategy: 'mutate',
      }),
    cloneEncoder: () =>
      createJsonEncoder<{form: 'big'; id: bigint; label: string} | {form: 'small'; id: number; label: string}>(undefined, {
        strategy: 'clone',
      }),
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
    schemaEncoder: () =>
      createJsonEncoder(
        RT.union([
          RT.object({form: RT.literal('big'), id: RT.bigint(), label: RT.string()}),
          RT.object({form: RT.literal('small'), id: RT.number(), label: RT.string()}),
        ])
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.union([
          RT.object({form: RT.literal('big'), id: RT.bigint(), label: RT.string()}),
          RT.object({form: RT.literal('small'), id: RT.number(), label: RT.string()}),
        ])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.union([
          RT.object({form: RT.literal('big'), id: RT.bigint(), label: RT.string()}),
          RT.object({form: RT.literal('small'), id: RT.number(), label: RT.string()}),
        ])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.union([
          RT.object({form: RT.literal('big'), id: RT.bigint(), label: RT.string()}),
          RT.object({form: RT.literal('small'), id: RT.number(), label: RT.string()}),
        ])
      ),
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
    serializeNotes:
      'Structural dispatch with no discriminator: the matched member is chosen by required-key shape, then the second arm applies Date↔ISO on `c` while the first arm carries only plain scalars.',
    mutateEncoder: () => createJsonEncoder<{a: string; b: number} | {a: boolean; c: Date}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{a: string; b: number} | {a: boolean; c: Date}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{a: string; b: number} | {a: boolean; c: Date}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{a: string; b: number} | {a: boolean; c: Date}>(),
    preserveDecoder: () => createJsonDecoder<{a: string; b: number} | {a: boolean; c: Date}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{a: string; b: number} | {a: boolean; c: Date}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string; b: number} | {a: boolean; c: Date}>(),
    schemaEncoder: () =>
      createJsonEncoder(RT.union([RT.object({a: RT.string(), b: RT.number()}), RT.object({a: RT.boolean(), c: RT.date()})])),
    schemaDecoder: () =>
      createJsonDecoder(RT.union([RT.object({a: RT.string(), b: RT.number()}), RT.object({a: RT.boolean(), c: RT.date()})])),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(RT.union([RT.object({a: RT.string(), b: RT.number()}), RT.object({a: RT.boolean(), c: RT.date()})])),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(RT.union([RT.object({a: RT.string(), b: RT.number()}), RT.object({a: RT.boolean(), c: RT.date()})])),
    getTestData: () => ({
      values: [
        {a: 'hello', b: 7},
        {a: true, c: new Date('2000-08-06T02:13:00.000Z')},
      ],
    }),
  },
} as const satisfies Record<string, SerializationCase>;
