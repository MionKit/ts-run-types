import * as TF from '@ts-runtypes/core/formats';
import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import type {SerializationCase} from './types.ts';

export const ITERABLES = {
  set_string: {
    title: 'Set<string>',
    description:
      'Root `Set<string>` serializes to a JSON array via `Array.from(v)` and restores with `new Set(v)` (atomic string elements need no per-element transform), while binary writes a uint32 size prefix followed by the encoded elements then rebuilds the Set.',
    serializeNotes: 'Set round-trips as a JSON array (insertion order preserved), rehydrated to a Set on decode.',
    mutateEncoder: () => createJsonEncoder<Set<string>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Set<string>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Set<string>>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<Set<string>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<Set<string>>(),
    preserveDecoder: () => createJsonDecoder<Set<string>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<Set<string>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<Set<string>>(),
    binaryDecoder: () => createBinaryDecoder<Set<string>>(),
    schemaEncoder: () => createJsonEncoder(RT.set(TF.string())),
    schemaDecoder: () => createJsonDecoder(RT.set(TF.string())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.set(TF.string())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.set(TF.string())),
    getTestData: () => ({values: [new Set<string>(['one', 'two', 'three'])]}),
  },
  set_nullable: {
    title: 'Set<number | null>',
    description: 'Root `Set<number | null>` keeps a `null` element across every strategy (serialized as the JSON null literal).',
    serializeNotes:
      'A Set builds its JSON array via `[...].join(",")` like a plain array, so a null / undefined element must emit the constant `"null"` rather than a bare value (which join would drop, shrinking the Set).',
    mutateEncoder: () => createJsonEncoder<Set<number | null>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Set<number | null>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Set<number | null>>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<Set<number | null>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<Set<number | null>>(),
    preserveDecoder: () => createJsonDecoder<Set<number | null>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<Set<number | null>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<Set<number | null>>(),
    binaryDecoder: () => createBinaryDecoder<Set<number | null>>(),
    schemaEncoder: () => createJsonEncoder(RT.set(RT.union([TF.number(), RT.literal(null)]))),
    schemaDecoder: () => createJsonDecoder(RT.set(RT.union([TF.number(), RT.literal(null)]))),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.set(RT.union([TF.number(), RT.literal(null)]))),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.set(RT.union([TF.number(), RT.literal(null)]))),
    getTestData: () => ({values: [new Set<number | null>([1, null, 2])]}),
  },
  set_void: {
    title: 'Set<void>',
    description: 'Root `Set<void>` keeps its element across every strategy (serialized as the JSON null literal).',
    serializeNotes:
      'A Set builds its JSON array via `[...].join(",")`, so a void / undefined element must emit the constant "null" rather than a bare value that join would coerce to empty and drop.',
    mutateEncoder: () => createJsonEncoder<Set<void>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Set<void>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Set<void>>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<Set<void>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<Set<void>>(),
    preserveDecoder: () => createJsonDecoder<Set<void>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<Set<void>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<Set<void>>(),
    binaryDecoder: () => createBinaryDecoder<Set<void>>(),
    schemaEncoder: () => createJsonEncoder(RT.set(RT.void())),
    schemaDecoder: () => createJsonDecoder(RT.set(RT.void())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.set(RT.void())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.set(RT.void())),
    getTestData: () => ({values: [new Set<void>([undefined])]}),
  },
  set_small_object: {
    title: 'Set<SmallObject>',
    description:
      'Root `Set<SmallObject>` whose elements carry string/number/boolean fields plus optional `Date` and `bigint` serializes to a JSON array of objects restored via `new Set(v)`, with each `Date` becoming an ISO string (restored with `new Date`) and each `bigint` a decimal string (restored with `BigInt(...)`), while binary writes a size-prefixed entry list.',
    serializeNotes: [
      'Set materialises to a JSON array of element objects, rehydrated to a Set on decode.',
      'Optional `prop4: Date` round-trips via its ISO string; optional `prop5: bigint` via a decimal string (not natively JSON-encodable).',
    ],
    mutateEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Set<SmallObject>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Set<SmallObject>>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Set<SmallObject>>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Set<SmallObject>>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoder<Set<SmallObject>>();
    },
    preserveDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoder<Set<SmallObject>>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoder<Set<SmallObject>>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createBinaryEncoder<Set<SmallObject>>();
    },
    binaryDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createBinaryDecoder<Set<SmallObject>>();
    },
    schemaEncoder: () =>
      createJsonEncoder(
        RT.set(
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          })
        )
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.set(
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          })
        )
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.set(
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          })
        )
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.set(
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          })
        )
      ),
    getTestData: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return {
        values: [
          new Set<SmallObject>([
            {prop1: 'value1', prop2: 1, prop3: true},
            {prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')},
            {prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)},
          ]),
        ],
      };
    },
  },
  objects_with_nested_sets: {
    title: 'Nested sets',
    description:
      'Object with two `Set<{s: string; arr: number[]}>` properties where each nested set serializes to a JSON array of objects restored via `new Set(v)` (atomic-shaped elements need no value transform) and binary nests a size-prefixed entry list per set.',
    serializeNotes: 'Each nested Set round-trips as a JSON array, rehydrated to a Set on decode.',
    mutateEncoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonEncoder<DeepWithSet>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonEncoder<DeepWithSet>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonEncoder<DeepWithSet>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonEncoder<DeepWithSet>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonDecoder<DeepWithSet>();
    },
    preserveDecoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonDecoder<DeepWithSet>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonDecoder<DeepWithSet>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createBinaryEncoder<DeepWithSet>();
    },
    binaryDecoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createBinaryDecoder<DeepWithSet>();
    },
    schemaEncoder: () =>
      createJsonEncoder(
        RT.object({
          a: TF.string(),
          b: RT.set(RT.object({s: TF.string(), arr: RT.array(TF.number())})),
          c: RT.set(RT.object({s: TF.string(), arr: RT.array(TF.number())})),
        })
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.object({
          a: TF.string(),
          b: RT.set(RT.object({s: TF.string(), arr: RT.array(TF.number())})),
          c: RT.set(RT.object({s: TF.string(), arr: RT.array(TF.number())})),
        })
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.object({
          a: TF.string(),
          b: RT.set(RT.object({s: TF.string(), arr: RT.array(TF.number())})),
          c: RT.set(RT.object({s: TF.string(), arr: RT.array(TF.number())})),
        })
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.object({
          a: TF.string(),
          b: RT.set(RT.object({s: TF.string(), arr: RT.array(TF.number())})),
          c: RT.set(RT.object({s: TF.string(), arr: RT.array(TF.number())})),
        })
      ),
    getTestData: () => {
      const setB = new Set([
        {s: 'a', arr: [1, 2, 3]},
        {s: 'b', arr: [4, 5, 6]},
      ]);
      const setC = new Set([
        {s: 'a', arr: [1, 2, 3]},
        {s: 'b', arr: [4, 5, 6]},
      ]);
      return {values: [{a: 'a', b: setB, c: setC}]};
    },
  },
  map_string_number: {
    title: 'Map<string, number>',
    description:
      'Root `Map<string, number>` serializes to a JSON array of `[key, value]` pairs via `Array.from(v)` and restores with `new Map(v)` (atomic string keys and number values need no per-entry transform), while binary writes a uint32 size prefix followed by encoded entries.',
    serializeNotes:
      'Map round-trips as a JSON array of [key, value] pairs (insertion order preserved), rehydrated to a Map on decode.',
    mutateEncoder: () => createJsonEncoder<Map<string, number>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Map<string, number>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Map<string, number>>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<Map<string, number>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<Map<string, number>>(),
    preserveDecoder: () => createJsonDecoder<Map<string, number>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<Map<string, number>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<Map<string, number>>(),
    binaryDecoder: () => createBinaryDecoder<Map<string, number>>(),
    schemaEncoder: () => createJsonEncoder(RT.map(TF.string(), TF.number())),
    schemaDecoder: () => createJsonDecoder(RT.map(TF.string(), TF.number())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.map(TF.string(), TF.number())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.map(TF.string(), TF.number())),
    getTestData: () => ({
      values: [
        new Map<string, number>([
          ['one', 1],
          ['two', 2],
          ['three', 3],
        ]),
      ],
    }),
  },
  map_string_small_object: {
    title: 'Map<string, SmallObject>',
    description:
      "Root `Map<string, SmallObject>` with string keys and object values carrying optional `Date` and `bigint` serializes to a JSON array of `[key, value]` pairs restored via `new Map(v)`, with each value's `Date` becoming an ISO string and `bigint` a decimal string, while binary writes a size-prefixed entry list.",
    serializeNotes: [
      'Map materialises to a JSON array of [key, value] pairs, rehydrated to a Map on decode.',
      'Value-side `prop4: Date` round-trips via its ISO string; `prop5: bigint` via a decimal string.',
    ],
    mutateEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<string, SmallObject>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<string, SmallObject>>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<string, SmallObject>>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<string, SmallObject>>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoder<Map<string, SmallObject>>();
    },
    preserveDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoder<Map<string, SmallObject>>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoder<Map<string, SmallObject>>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createBinaryEncoder<Map<string, SmallObject>>();
    },
    binaryDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createBinaryDecoder<Map<string, SmallObject>>();
    },
    schemaEncoder: () =>
      createJsonEncoder(
        RT.map(
          TF.string(),
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          })
        )
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.map(
          TF.string(),
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          })
        )
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.map(
          TF.string(),
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          })
        )
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.map(
          TF.string(),
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          })
        )
      ),
    getTestData: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return {
        values: [
          new Map<string, SmallObject>([
            ['key1', {prop1: 'value1', prop2: 1, prop3: true}],
            ['key2', {prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')}],
            ['key3', {prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)}],
          ]),
        ],
      };
    },
  },
  map_small_object_number: {
    title: 'Map<SmallObject, number>',
    description:
      'Root `Map<SmallObject, number>` keyed by an object with optional `Date`/`bigint` fields serializes to a JSON array of `[keyObject, value]` pairs restored via `new Map(v)`, with the key-side transform turning a `Date` field into an ISO string and a `bigint` field into a decimal string before rebuild, while binary writes a size-prefixed entry list.',
    serializeNotes: [
      'Object keys are emitted as the entry tuple key (a JSON object) and rebuilt into a fresh Map key on decode.',
      'Key-side `prop4: Date` round-trips via its ISO string; `prop5: bigint` via a decimal string.',
    ],
    mutateEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<SmallObject, number>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<SmallObject, number>>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<SmallObject, number>>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<SmallObject, number>>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoder<Map<SmallObject, number>>();
    },
    preserveDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoder<Map<SmallObject, number>>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoder<Map<SmallObject, number>>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createBinaryEncoder<Map<SmallObject, number>>();
    },
    binaryDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createBinaryDecoder<Map<SmallObject, number>>();
    },
    schemaEncoder: () =>
      createJsonEncoder(
        RT.map(
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          }),
          TF.number()
        )
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.map(
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          }),
          TF.number()
        )
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.map(
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          }),
          TF.number()
        )
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.map(
          RT.object({
            prop1: TF.string(),
            prop2: TF.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(TF.date()),
            prop5: RT.optional(TF.bigInt()),
          }),
          TF.number()
        )
      ),
    getTestData: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return {
        values: [
          new Map<SmallObject, number>([
            [{prop1: 'value1', prop2: 1, prop3: true}, 1],
            [{prop1: 'value2', prop2: 2, prop3: false, prop4: new Date('2000-08-06T02:13:00.000Z')}, 2],
            [{prop1: 'value3', prop2: 3, prop3: true, prop5: BigInt(100)}, 3],
          ]),
        ],
      };
    },
  },
  objects_with_nested_maps: {
    title: 'Nested maps',
    description:
      'Object with a nested `Map<string, {sm: {s: string; arr: number[]}}>` property where the map serializes to a JSON array of `[key, value]` pairs restored via `new Map(v)` (atomic-shaped values need no value transform) and binary nests a size-prefixed entry list.',
    serializeNotes: 'The nested Map round-trips as a JSON array of [key, value] pairs, rehydrated to a Map on decode.',
    mutateEncoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonEncoder<DeepWithMap>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonEncoder<DeepWithMap>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonEncoder<DeepWithMap>(undefined, {strategy: 'direct'});
    },
    compactEncoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonEncoder<DeepWithMap>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonDecoder<DeepWithMap>();
    },
    preserveDecoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonDecoder<DeepWithMap>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonDecoder<DeepWithMap>(undefined, {strategy: 'compact'});
    },
    binaryEncoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createBinaryEncoder<DeepWithMap>();
    },
    binaryDecoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createBinaryDecoder<DeepWithMap>();
    },
    schemaEncoder: () =>
      createJsonEncoder(
        RT.object({
          a: TF.string(),
          b: RT.map(TF.string(), RT.object({sm: RT.object({s: TF.string(), arr: RT.array(TF.number())})})),
        })
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.object({
          a: TF.string(),
          b: RT.map(TF.string(), RT.object({sm: RT.object({s: TF.string(), arr: RT.array(TF.number())})})),
        })
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.object({
          a: TF.string(),
          b: RT.map(TF.string(), RT.object({sm: RT.object({s: TF.string(), arr: RT.array(TF.number())})})),
        })
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.object({
          a: TF.string(),
          b: RT.map(TF.string(), RT.object({sm: RT.object({s: TF.string(), arr: RT.array(TF.number())})})),
        })
      ),
    getTestData: () => ({
      values: [
        {
          a: 'a',
          b: new Map([
            ['key1', {sm: {s: 's', arr: [1, 2, 3]}}],
            ['key2', {sm: {s: 's', arr: [1, 2, 3]}}],
          ]),
        },
      ],
    }),
  },
  map_with_bigint_keys: {
    title: 'Bigint keys',
    description:
      'Root `Map<bigint, number>` keyed by bigint with number values serializes to a JSON array of `[key, value]` pairs restored via `new Map(v)`, with each bigint key emitted as a decimal string (not natively JSON-encodable) and rebuilt with `BigInt(...)` while number values pass through atomically, and binary writes a size-prefixed entry list encoding bigint keys natively.',
    serializeNotes: [
      'Map round-trips as a JSON array of [key, value] pairs, rehydrated to a Map on decode.',
      'bigint keys serialize as decimal strings and restore via BigInt(...); JSON cannot encode bigint directly.',
    ],
    mutateEncoder: () => createJsonEncoder<Map<bigint, number>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Map<bigint, number>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Map<bigint, number>>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<Map<bigint, number>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<Map<bigint, number>>(),
    preserveDecoder: () => createJsonDecoder<Map<bigint, number>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<Map<bigint, number>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<Map<bigint, number>>(),
    binaryDecoder: () => createBinaryDecoder<Map<bigint, number>>(),
    schemaEncoder: () => createJsonEncoder(RT.map(TF.bigInt(), TF.number())),
    schemaDecoder: () => createJsonDecoder(RT.map(TF.bigInt(), TF.number())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.map(TF.bigInt(), TF.number())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.map(TF.bigInt(), TF.number())),
    getTestData: () => ({
      values: [
        new Map<bigint, number>([
          [1n, 1],
          [2n, 2],
          [3n, 3],
        ]),
      ],
    }),
  },
  map_with_date_values: {
    title: 'Date values',
    description:
      'Root `Map<string, Date>` with string keys and `Date` values serializes to a JSON array of `[key, value]` pairs restored via `new Map(v)`, with each `Date` value becoming an ISO string on encode and rebuilt with `new Date(...)` on decode, while binary writes a size-prefixed entry list.',
    serializeNotes: [
      'Map round-trips as a JSON array of [key, value] pairs, rehydrated to a Map on decode.',
      'Date values serialize via their ISO string and restore with new Date(...).',
    ],
    mutateEncoder: () => createJsonEncoder<Map<string, Date>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Map<string, Date>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Map<string, Date>>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<Map<string, Date>>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<Map<string, Date>>(),
    preserveDecoder: () => createJsonDecoder<Map<string, Date>>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<Map<string, Date>>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<Map<string, Date>>(),
    binaryDecoder: () => createBinaryDecoder<Map<string, Date>>(),
    schemaEncoder: () => createJsonEncoder(RT.map(TF.string(), TF.date())),
    schemaDecoder: () => createJsonDecoder(RT.map(TF.string(), TF.date())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.map(TF.string(), TF.date())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.map(TF.string(), TF.date())),
    getTestData: () => ({
      values: [
        new Map<string, Date>([
          ['date1', new Date('2000-08-06T02:13:00.000Z')],
          ['date2', new Date('2001-09-07T03:14:00.000Z')],
        ]),
      ],
    }),
  },
} as const satisfies Record<string, SerializationCase>;
