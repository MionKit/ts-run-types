import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {SerializationCase} from './types.ts';

export const ITERABLES = {
  set_string: {
    title: 'Set<string>',
    unsafeEncoder: () => createJsonEncoder<Set<string>>(undefined, {strategy: 'mutate', stripExtras: false}),
    clonePreserveEncoder: () => createJsonEncoder<Set<string>>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () => createJsonEncoder<Set<string>>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<Set<string>>(),
    safeDirectEncoder: () => createJsonEncoder<Set<string>>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<Set<string>>(),
    unsafeDecoder: () => createJsonDecoder<Set<string>>(undefined, {strategy: 'mutate', stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<Set<string>>(),
    binaryDecoder: () => createBinaryDecoder<Set<string>>(),
    getTestData: () => ({values: [new Set<string>(['one', 'two', 'three'])]}),
  },
  set_small_object: {
    title: 'Set<SmallObject>',
    unsafeEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Set<SmallObject>>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Set<SmallObject>>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Set<SmallObject>>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Set<SmallObject>>();
    },
    safeDirectEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Set<SmallObject>>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoder<Set<SmallObject>>();
    },
    unsafeDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoder<Set<SmallObject>>(undefined, {strategy: 'mutate', stripExtras: false});
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
    unsafeEncoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonEncoder<DeepWithSet>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonEncoder<DeepWithSet>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonEncoder<DeepWithSet>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonEncoder<DeepWithSet>();
    },
    safeDirectEncoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonEncoder<DeepWithSet>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonDecoder<DeepWithSet>();
    },
    unsafeDecoder: () => {
      type Set1 = Set<{s: string; arr: number[]}>;
      interface DeepWithSet {
        a: string;
        b: Set1;
        c: Set1;
      }
      return createJsonDecoder<DeepWithSet>(undefined, {stripExtras: false});
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
    unsafeEncoder: () => createJsonEncoder<Map<string, number>>(undefined, {strategy: 'mutate', stripExtras: false}),
    clonePreserveEncoder: () => createJsonEncoder<Map<string, number>>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () => createJsonEncoder<Map<string, number>>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<Map<string, number>>(),
    safeDirectEncoder: () => createJsonEncoder<Map<string, number>>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<Map<string, number>>(),
    unsafeDecoder: () => createJsonDecoder<Map<string, number>>(undefined, {strategy: 'mutate', stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<Map<string, number>>(),
    binaryDecoder: () => createBinaryDecoder<Map<string, number>>(),
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
    unsafeEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<string, SmallObject>>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<string, SmallObject>>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<string, SmallObject>>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<string, SmallObject>>();
    },
    safeDirectEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<string, SmallObject>>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoder<Map<string, SmallObject>>();
    },
    unsafeDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoder<Map<string, SmallObject>>(undefined, {strategy: 'mutate', stripExtras: false});
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
    unsafeEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<SmallObject, number>>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<SmallObject, number>>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<SmallObject, number>>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<SmallObject, number>>();
    },
    safeDirectEncoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonEncoder<Map<SmallObject, number>>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoder<Map<SmallObject, number>>();
    },
    unsafeDecoder: () => {
      interface SmallObject {
        prop1: string;
        prop2: number;
        prop3: boolean;
        prop4?: Date;
        prop5?: bigint;
      }
      return createJsonDecoder<Map<SmallObject, number>>(undefined, {strategy: 'mutate', stripExtras: false});
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
    unsafeEncoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonEncoder<DeepWithMap>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonEncoder<DeepWithMap>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonEncoder<DeepWithMap>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonEncoder<DeepWithMap>();
    },
    safeDirectEncoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonEncoder<DeepWithMap>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonDecoder<DeepWithMap>();
    },
    unsafeDecoder: () => {
      interface DeepWithMap {
        a: string;
        b: Map<string, {sm: {s: string; arr: number[]}}>;
      }
      return createJsonDecoder<DeepWithMap>(undefined, {stripExtras: false});
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
    unsafeEncoder: () => createJsonEncoder<Map<bigint, number>>(undefined, {strategy: 'mutate', stripExtras: false}),
    clonePreserveEncoder: () => createJsonEncoder<Map<bigint, number>>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () => createJsonEncoder<Map<bigint, number>>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<Map<bigint, number>>(),
    safeDirectEncoder: () => createJsonEncoder<Map<bigint, number>>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<Map<bigint, number>>(),
    unsafeDecoder: () => createJsonDecoder<Map<bigint, number>>(undefined, {strategy: 'mutate', stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<Map<bigint, number>>(),
    binaryDecoder: () => createBinaryDecoder<Map<bigint, number>>(),
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
    unsafeEncoder: () => createJsonEncoder<Map<string, Date>>(undefined, {strategy: 'mutate', stripExtras: false}),
    clonePreserveEncoder: () => createJsonEncoder<Map<string, Date>>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () => createJsonEncoder<Map<string, Date>>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<Map<string, Date>>(),
    safeDirectEncoder: () => createJsonEncoder<Map<string, Date>>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<Map<string, Date>>(),
    unsafeDecoder: () => createJsonDecoder<Map<string, Date>>(undefined, {strategy: 'mutate', stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<Map<string, Date>>(),
    binaryDecoder: () => createBinaryDecoder<Map<string, Date>>(),
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
