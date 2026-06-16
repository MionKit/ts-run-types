import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';
import type {SerializationCase} from './types.ts';

export const UNIONS = {
  union: {
    title: 'Atomic union',
    description:
      'Untagged union of scalar atoms (Date | number | string | null | bigint) whose members resolve by runtime kind with no discriminator, encoding Date to an ISO string and bigint to a decimal string while number, string and null pass through unchanged.',
    serializeNotes:
      'Date and bigint members carry per-kind wire transforms (Date↔ISO string, bigint↔decimal string); the decoder restores each from its scalar form.',
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
    title: 'Union of arrays',
    description:
      'Untagged union of homogeneous arrays (string[] | number[] | boolean[] | Date[]) where the matched member is chosen by element kind, only the Date[] arm applies a per-element Date↔ISO string transform, and an empty `[]` value satisfies every arm.',
    serializeNotes:
      'Empty array sample matches all four arms structurally — the round-trip stays an empty array regardless of which member resolves.',
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
    title: 'Array of scalar union',
    description:
      'Array whose element type is an untagged scalar union (string | bigint | boolean | Date) where each element resolves independently by runtime kind (bigint to decimal strings, Date to ISO strings), and the mixed sample [1n, "b", date] exercises per-element member selection within one array.',
    serializeNotes:
      'Member selection is per-element, not per-array — a single array can hold elements that resolve to different union arms (bigint↔string, Date↔ISO, raw string/boolean).',
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
    title: 'Union of object shapes',
    description:
      'Untagged union of object shapes ({a; aa} | {b} | {c: bigint} | {d?}) with no literal discriminator, where members resolve structurally by which required keys are present, the {c: bigint} arm applies bigint↔string, and the all-optional {d?} arm matches an empty object.',
    serializeNotes:
      'Empty-object sample {} resolves to the all-optional {d?: string} arm (its only member with no required key); the {c: bigint} arm encodes bigint to a decimal string.',
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
    title: 'Discriminated union',
    description:
      'Union keyed on a `type` discriminator with literal arms type:"a"/"b"/"c" plus a non-literal type:boolean arm, where the decoder picks the member by `type` and the type:"c" arm carries a Date↔ISO transform on its `time` prop.',
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
    title: 'Mixed arrays and objects',
    description:
      'Untagged union mixing array members (string[] | number[] | boolean[]) and object members ({a; aa} | {b} | {c: bigint; aa: "string"}) where dispatch first splits on array-vs-object kind, then resolves the matched shape structurally, and the {c: bigint} object arm carries bigint↔string.',
    serializeNotes:
      'No literal discriminator across the family — array members are told apart from object members by structural kind, then by element type or required keys.',
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
    title: 'Union with index signatures',
    description:
      'Untagged union including record-like members with index signatures ({a; [key]: string} and {[key]: bigint; b: bigint}) modelled value-first as record∩object intersections, where members resolve structurally and the bigint-record arm encodes every index-keyed value (including the {b: 1n, c: 2n} sample) bigint↔string.',
    serializeNotes:
      'Index-signature members serialize all enumerable keys, not just the named ones — the bigint-record arm applies bigint↔string to both the declared `b` and the open index entries (e.g. `c`).',
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
    title: 'Circular union',
    description:
      'Self-referential union UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[] recursing through the optional prop `a` and the array arm, where each node resolves by kind, the value-first form uses RT.circular(self => …) to follow the recursion to arbitrary depth, and Date members encode Date↔ISO.',
    serializeNotes:
      'Recursive union — encoder and decoder must walk the self-reference (nested objects and arrays) without diverging; member selection happens fresh at every level.',
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
    title: 'Union with methods',
    description:
      'Union of object shapes each carrying a method ({name; getName()} | {age; getAge()} | {active; isActive()}), where methods are non-serializable at a property position so each matched member serializes its data prop only and the method is silently dropped, restoring {name}, {age}, {active}.',
    serializeNotes:
      'Method members are dropped, not throwing — they sit at a property position, so the build emits a per-family Warning and the round-trip yields the data-only projection (deserializedValues omit getName/getAge/isActive).',
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
    title: 'Union with any',
    description:
      'Union containing `any` (number | {name} | any) where the `any` arm absorbs the whole union at the type-checker layer so the compiled type is bare `any` (value-first equivalent RT.any()), and serialization is a best-effort JSON pass over whatever value arrives (number, object, string, boolean, null).',
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
    title: 'Union with non-serializable member',
    description:
      'A function arm in the union sits at a propagating union-member position, so it is non-serializable as an Error rather than a droppable Warning and we throw at RT-compile time.',
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
  // Documented throw cases: prepareForJson does NOT strip
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
    title: 'Extra bigint prop',
    description:
      'Input `{b: 123, c: 123n}` matches the `{b: number}` arm and we preserve the structural extra `c: 123n` with no implicit strip, so JSON.stringify throws on the bigint — extras pass through unchanged unless pre-stripped when they may carry non-serializable values.',
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
    title: 'Extra symbol prop',
    description:
      'Same contract as the extra-bigint case but with a symbol extra that JSON.stringify silently drops (returns `{"b":123}` with no throw), so this case round-trips with the extra silently lost.',
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
    title: 'Shared prop same type',
    description:
      'Discriminator `kind` selects the member and shared prop `at: Date` has the identical Date↔ISO transform on both branches, so the round-trip only needs to prove the dispatch does not lose the prop or double-transform it.',
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
    title: 'Shared prop Date or string',
    description:
      'Discriminator `kind` resolves the member and shared prop `when: Date | string` must take the matched-member transform (`kind:event` → Date↔ISO, `kind:note` → raw string passthrough), since composing both would corrupt either branch by reapplying `Date.toISOString()` to a plain string or parsing a string as a Date.',
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
    title: 'Shared prop bigint or number',
    description:
      'Discriminator `form` resolves the member and shared prop `id: bigint | number` must follow the matched-member transform (`form:big` → bigint↔string, `form:small` → raw number) while the other shared prop `label: string` is identical on both branches and must survive either dispatch.',
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
    title: 'Shared prop structural',
    description:
      "With no tag-like literal field, members are differentiated by a divergent shared prop `a` (string vs boolean sub-union) and unique companion props (`b: number` vs `c: Date`), so the encoder/decoder dispatch must work purely on which member's required props match the input rather than a literal-discriminator fast path.",
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
