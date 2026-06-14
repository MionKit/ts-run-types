import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {SerializationCase} from './types.ts';

export const ITERABLES = {
  set_string: {
    title: 'Set<string>',
    description:
      'Root `Set<string>`. JSON serializes the set to an array via `Array.from(v)` and restores it with `new Set(v)`; string elements are atomic so no per-element transform runs. Binary writes a uint32 size prefix followed by the encoded elements, then rebuilds the Set.',
    serializeNotes: 'Set round-trips as a JSON array (insertion order preserved), rehydrated to a Set on decode.',
    mutateEncoder: () => createJsonEncoder<Set<string>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Set<string>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Set<string>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Set<string>>(),
    preserveDecoder: () => createJsonDecoder<Set<string>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Set<string>>(),
    binaryDecoder: () => createBinaryDecoder<Set<string>>(),
    schemaEncoder: () => createJsonEncoder(RT.set(RT.string())),
    schemaDecoder: () => createJsonDecoder(RT.set(RT.string())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.set(RT.string())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.set(RT.string())),
    getTestData: () => ({values: [new Set<string>(['one', 'two', 'three'])]}),
  },
  set_small_object: {
    title: 'Set<SmallObject>',
    description:
      'Root `Set<SmallObject>` where each element has string / number / boolean fields plus optional `Date` and `bigint`. JSON serializes the set to an array of objects and restores via `new Set(v)`; per-element the `Date` becomes an ISO string (restored with `new Date`) and the `bigint` a decimal string (restored with `BigInt(...)`). Binary writes a size-prefixed entry list.',
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
            prop1: RT.string(),
            prop2: RT.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(RT.date()),
            prop5: RT.optional(RT.bigint()),
          })
        )
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.set(
          RT.object({
            prop1: RT.string(),
            prop2: RT.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(RT.date()),
            prop5: RT.optional(RT.bigint()),
          })
        )
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.set(
          RT.object({
            prop1: RT.string(),
            prop2: RT.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(RT.date()),
            prop5: RT.optional(RT.bigint()),
          })
        )
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.set(
          RT.object({
            prop1: RT.string(),
            prop2: RT.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(RT.date()),
            prop5: RT.optional(RT.bigint()),
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
    title: 'objects with nested sets',
    description:
      'Object with two `Set<{s: string; arr: number[]}>` properties. Each nested set serializes to a JSON array of objects and restores via `new Set(v)`; the elements are atomic-shaped (string + number array) so no value transform applies. Binary nests a size-prefixed entry list per set.',
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
          a: RT.string(),
          b: RT.set(RT.object({s: RT.string(), arr: RT.array(RT.number())})),
          c: RT.set(RT.object({s: RT.string(), arr: RT.array(RT.number())})),
        })
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.object({
          a: RT.string(),
          b: RT.set(RT.object({s: RT.string(), arr: RT.array(RT.number())})),
          c: RT.set(RT.object({s: RT.string(), arr: RT.array(RT.number())})),
        })
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.object({
          a: RT.string(),
          b: RT.set(RT.object({s: RT.string(), arr: RT.array(RT.number())})),
          c: RT.set(RT.object({s: RT.string(), arr: RT.array(RT.number())})),
        })
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.object({
          a: RT.string(),
          b: RT.set(RT.object({s: RT.string(), arr: RT.array(RT.number())})),
          c: RT.set(RT.object({s: RT.string(), arr: RT.array(RT.number())})),
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
      'Root `Map<string, number>`. JSON serializes the map to an array of `[key, value]` entry pairs via `Array.from(v)` and restores it with `new Map(v)`; string keys and number values are atomic so no per-entry transform runs. Binary writes a uint32 size prefix followed by encoded entries.',
    serializeNotes: 'Map round-trips as a JSON array of [key, value] pairs (insertion order preserved), rehydrated to a Map on decode.',
    mutateEncoder: () => createJsonEncoder<Map<string, number>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Map<string, number>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Map<string, number>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Map<string, number>>(),
    preserveDecoder: () => createJsonDecoder<Map<string, number>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Map<string, number>>(),
    binaryDecoder: () => createBinaryDecoder<Map<string, number>>(),
    schemaEncoder: () => createJsonEncoder(RT.map(RT.string(), RT.number())),
    schemaDecoder: () => createJsonDecoder(RT.map(RT.string(), RT.number())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.map(RT.string(), RT.number())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.map(RT.string(), RT.number())),
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
      'Root `Map<string, SmallObject>` with string keys and object values carrying optional `Date` and `bigint`. JSON serializes to an array of `[key, value]` pairs and restores via `new Map(v)`; inside each value the `Date` becomes an ISO string and the `bigint` a decimal string. Binary writes a size-prefixed entry list.',
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
          RT.string(),
          RT.object({
            prop1: RT.string(),
            prop2: RT.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(RT.date()),
            prop5: RT.optional(RT.bigint()),
          })
        )
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.map(
          RT.string(),
          RT.object({
            prop1: RT.string(),
            prop2: RT.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(RT.date()),
            prop5: RT.optional(RT.bigint()),
          })
        )
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.map(
          RT.string(),
          RT.object({
            prop1: RT.string(),
            prop2: RT.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(RT.date()),
            prop5: RT.optional(RT.bigint()),
          })
        )
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.map(
          RT.string(),
          RT.object({
            prop1: RT.string(),
            prop2: RT.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(RT.date()),
            prop5: RT.optional(RT.bigint()),
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
      'Root `Map<SmallObject, number>` keyed by an object (optional `Date` / `bigint` fields) with number values. JSON serializes to an array of `[keyObject, value]` pairs and restores via `new Map(v)`; the key-side transform applies, so a `Date` field becomes an ISO string and a `bigint` field a decimal string before being rebuilt. Binary writes a size-prefixed entry list.',
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
            prop1: RT.string(),
            prop2: RT.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(RT.date()),
            prop5: RT.optional(RT.bigint()),
          }),
          RT.number()
        )
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.map(
          RT.object({
            prop1: RT.string(),
            prop2: RT.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(RT.date()),
            prop5: RT.optional(RT.bigint()),
          }),
          RT.number()
        )
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.map(
          RT.object({
            prop1: RT.string(),
            prop2: RT.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(RT.date()),
            prop5: RT.optional(RT.bigint()),
          }),
          RT.number()
        )
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.map(
          RT.object({
            prop1: RT.string(),
            prop2: RT.number(),
            prop3: RT.boolean(),
            prop4: RT.optional(RT.date()),
            prop5: RT.optional(RT.bigint()),
          }),
          RT.number()
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
    title: 'objects with nested maps',
    description:
      'Object with a nested `Map<string, {sm: {s: string; arr: number[]}}>` property. The nested map serializes to a JSON array of `[key, value]` pairs and restores via `new Map(v)`; values are atomic-shaped so no value transform applies. Binary nests a size-prefixed entry list.',
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
          a: RT.string(),
          b: RT.map(RT.string(), RT.object({sm: RT.object({s: RT.string(), arr: RT.array(RT.number())})})),
        })
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.object({
          a: RT.string(),
          b: RT.map(RT.string(), RT.object({sm: RT.object({s: RT.string(), arr: RT.array(RT.number())})})),
        })
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.object({
          a: RT.string(),
          b: RT.map(RT.string(), RT.object({sm: RT.object({s: RT.string(), arr: RT.array(RT.number())})})),
        })
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.object({
          a: RT.string(),
          b: RT.map(RT.string(), RT.object({sm: RT.object({s: RT.string(), arr: RT.array(RT.number())})})),
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
    title: 'Map with bigint keys',
    description:
      'Root `Map<bigint, number>` keyed by bigint with number values. JSON serializes to an array of `[key, value]` pairs and restores via `new Map(v)`; each bigint key is emitted as a decimal string (not natively JSON-encodable) and rebuilt with `BigInt(...)`, while number values pass through atomically. Binary writes a size-prefixed entry list, encoding bigint keys natively.',
    serializeNotes: [
      'Map round-trips as a JSON array of [key, value] pairs, rehydrated to a Map on decode.',
      'bigint keys serialize as decimal strings and restore via BigInt(...); JSON cannot encode bigint directly.',
    ],
    mutateEncoder: () => createJsonEncoder<Map<bigint, number>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Map<bigint, number>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Map<bigint, number>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Map<bigint, number>>(),
    preserveDecoder: () => createJsonDecoder<Map<bigint, number>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Map<bigint, number>>(),
    binaryDecoder: () => createBinaryDecoder<Map<bigint, number>>(),
    schemaEncoder: () => createJsonEncoder(RT.map(RT.bigint(), RT.number())),
    schemaDecoder: () => createJsonDecoder(RT.map(RT.bigint(), RT.number())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.map(RT.bigint(), RT.number())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.map(RT.bigint(), RT.number())),
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
    title: 'Map with Date values',
    mutateEncoder: () => createJsonEncoder<Map<string, Date>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Map<string, Date>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Map<string, Date>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Map<string, Date>>(),
    preserveDecoder: () => createJsonDecoder<Map<string, Date>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Map<string, Date>>(),
    binaryDecoder: () => createBinaryDecoder<Map<string, Date>>(),
    schemaEncoder: () => createJsonEncoder(RT.map(RT.string(), RT.date())),
    schemaDecoder: () => createJsonDecoder(RT.map(RT.string(), RT.date())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.map(RT.string(), RT.date())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.map(RT.string(), RT.date())),
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
