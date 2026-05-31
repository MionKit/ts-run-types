import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {SerializationCase} from './types.ts';

export const RECORDS = {
  index_property: {
    title: 'index property',
    unsafeEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'mutate', stripExtras: false}),
    clonePreserveEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<{[key: string]: string}>(),
    safeDirectEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<{[key: string]: string}>(),
    unsafeDecoder: () => createJsonDecoder<{[key: string]: string}>(undefined, {stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<{[key: string]: string}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: string]: string}>(),
    getTestData: () => ({values: [{key1: 'value1', key2: 'value2'}, {}]}),
  },
  index_property_and_prop: {
    title: 'interface with a single property and index property',
    unsafeEncoder: () =>
      createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'mutate', stripExtras: false}),
    clonePreserveEncoder: () =>
      createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () =>
      createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(),
    safeDirectEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<{a: string; [key: string]: string}>(),
    unsafeDecoder: () => createJsonDecoder<{a: string; [key: string]: string}>(undefined, {stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<{a: string; [key: string]: string}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string; [key: string]: string}>(),
    getTestData: () => ({values: [{a: 'helloA'}, {a: 'helloA', b: 'helloB'}]}),
  },
  index_property_extra: {
    title: 'index property with extra props and unions',
    unsafeEncoder: () =>
      createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {
        strategy: 'mutate',
        stripExtras: false,
      }),
    clonePreserveEncoder: () =>
      createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {
        strategy: 'clone',
        stripExtras: false,
      }),
    mutateStripEncoder: () =>
      createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {
        strategy: 'mutate',
        stripExtras: true,
      }),
    safeEncoder: () => createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(),
    safeDirectEncoder: () =>
      createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<{a: string; b: number; [key: string]: string | number}>(),
    unsafeDecoder: () =>
      createJsonDecoder<{a: string; b: number; [key: string]: string | number}>(undefined, {stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<{a: string; b: number; [key: string]: string | number}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string; b: number; [key: string]: string | number}>(),
    getTestData: () => ({values: [{key1: 'value1', key2: 'value2', a: 'extra1', b: 123}]}),
  },
  multiple_index_props: {
    title: 'multiple index properties (symbol keys skipped)',
    unsafeEncoder: () =>
      createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {
        strategy: 'mutate',
        stripExtras: false,
      }),
    clonePreserveEncoder: () =>
      createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {
        strategy: 'clone',
        stripExtras: false,
      }),
    mutateStripEncoder: () =>
      createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {
        strategy: 'mutate',
        stripExtras: true,
      }),
    safeEncoder: () => createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
    safeDirectEncoder: () =>
      createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
    unsafeDecoder: () =>
      createJsonDecoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
    getTestData: () => {
      const objWithSymbolKeys = {
        key1: 'value1',
        key2: 'value2',
        [Symbol('key3')]: new Date(),
        [Symbol('key4')]: new Date(),
      };
      return {
        values: [{key1: 'value1', key2: 'value2'}, objWithSymbolKeys],
        deserializedValues: [
          {key1: 'value1', key2: 'value2'},
          {key1: 'value1', key2: 'value2'},
        ],
      };
    },
  },
  index_property_nested: {
    title: 'index property nested',
    unsafeEncoder: () =>
      createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'mutate', stripExtras: false}),
    clonePreserveEncoder: () =>
      createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () =>
      createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(),
    safeDirectEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: number}}>(),
    unsafeDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: number}}>(undefined, {stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<{[key: string]: {[key: string]: number}}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: string]: {[key: string]: number}}>(),
    getTestData: () => ({values: [{key1: {nestedKey1: 1, nestedKey2: 2}}]}),
  },
  index_property_nested_date: {
    title: 'index property nested with Date values',
    unsafeEncoder: () =>
      createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'mutate', stripExtras: false}),
    clonePreserveEncoder: () =>
      createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () =>
      createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(),
    safeDirectEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: Date}}>(),
    unsafeDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: Date}}>(undefined, {stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<{[key: string]: {[key: string]: Date}}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: string]: {[key: string]: Date}}>(),
    getTestData: () => ({
      values: [
        {
          key1: {
            nestedKey1: new Date('2000-08-06T02:13:00.000Z'),
            nestedKey2: new Date('2000-08-06T02:13:00.000Z'),
          },
        },
      ],
    }),
  },
  index_property_bigint: {
    title: 'index property with bigint values',
    unsafeEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'mutate', stripExtras: false}),
    clonePreserveEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<{[key: string]: bigint}>(),
    safeDirectEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<{[key: string]: bigint}>(),
    unsafeDecoder: () => createJsonDecoder<{[key: string]: bigint}>(undefined, {stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<{[key: string]: bigint}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: string]: bigint}>(),
    getTestData: () => ({
      values: [
        {key1: 1n, key2: 2n},
        {hello: 1n, world: 2n},
      ],
    }),
  },
  index_property_non_root: {
    title: 'index property non-root',
    unsafeEncoder: () =>
      createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {
        strategy: 'mutate',
        stripExtras: false,
      }),
    clonePreserveEncoder: () =>
      createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () =>
      createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(),
    safeDirectEncoder: () =>
      createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<{b: string; c: {a: string; [key: string]: string}}>(),
    unsafeDecoder: () => createJsonDecoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<{b: string; c: {a: string; [key: string]: string}}>(),
    binaryDecoder: () => createBinaryDecoder<{b: string; c: {a: string; [key: string]: string}}>(),
    getTestData: () => ({values: [{b: 'hello', c: {a: 'world', c: 'world'}}]}),
  },
} as const satisfies Record<string, SerializationCase>;
