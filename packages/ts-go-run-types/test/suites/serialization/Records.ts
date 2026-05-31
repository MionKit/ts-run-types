import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {SerializationCase} from './types.ts';

export const RECORDS = {
  index_property: {
    title: 'index property',
    mutateEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{[key: string]: string}>(),
    directEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{[key: string]: string}>(),
    preserveDecoder: () => createJsonDecoder<{[key: string]: string}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{[key: string]: string}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: string]: string}>(),
    getTestData: () => ({values: [{key1: 'value1', key2: 'value2'}, {}]}),
  },
  index_property_and_prop: {
    title: 'interface with a single property and index property',
    mutateEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(),
    directEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{a: string; [key: string]: string}>(),
    preserveDecoder: () => createJsonDecoder<{a: string; [key: string]: string}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{a: string; [key: string]: string}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string; [key: string]: string}>(),
    getTestData: () => ({values: [{a: 'helloA'}, {a: 'helloA', b: 'helloB'}]}),
  },
  index_property_extra: {
    title: 'index property with extra props and unions',
    mutateEncoder: () =>
      createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () =>
      createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(),
    directEncoder: () =>
      createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{a: string; b: number; [key: string]: string | number}>(),
    preserveDecoder: () =>
      createJsonDecoder<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{a: string; b: number; [key: string]: string | number}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string; b: number; [key: string]: string | number}>(),
    getTestData: () => ({values: [{key1: 'value1', key2: 'value2', a: 'extra1', b: 123}]}),
  },
  multiple_index_props: {
    title: 'multiple index properties (symbol keys skipped)',
    mutateEncoder: () =>
      createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () =>
      createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {
        strategy: 'stripMutate',
      }),
    stripCloneEncoder: () => createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
    directEncoder: () =>
      createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
    preserveDecoder: () =>
      createJsonDecoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'preserve'}),
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
    mutateEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(),
    directEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: number}}>(),
    preserveDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{[key: string]: {[key: string]: number}}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: string]: {[key: string]: number}}>(),
    getTestData: () => ({values: [{key1: {nestedKey1: 1, nestedKey2: 2}}]}),
  },
  index_property_nested_date: {
    title: 'index property nested with Date values',
    mutateEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(),
    directEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: Date}}>(),
    preserveDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'preserve'}),
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
    mutateEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{[key: string]: bigint}>(),
    directEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{[key: string]: bigint}>(),
    preserveDecoder: () => createJsonDecoder<{[key: string]: bigint}>(undefined, {strategy: 'preserve'}),
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
    mutateEncoder: () => createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () =>
      createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(),
    directEncoder: () => createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{b: string; c: {a: string; [key: string]: string}}>(),
    preserveDecoder: () =>
      createJsonDecoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{b: string; c: {a: string; [key: string]: string}}>(),
    binaryDecoder: () => createBinaryDecoder<{b: string; c: {a: string; [key: string]: string}}>(),
    getTestData: () => ({values: [{b: 'hello', c: {a: 'world', c: 'world'}}]}),
  },
} as const satisfies Record<string, SerializationCase>;
