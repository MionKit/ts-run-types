import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {SerializationCase} from './types.ts';

export const ITERABLES = {
  set_string: {
    title: 'Set<string>',
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
