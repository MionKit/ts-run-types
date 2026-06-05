import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {SerializationCase} from './types.ts';

export const ARRAYS = {
  array: {
    title: 'array',
    unsafeEncoder: () => createJsonEncoder<string[]>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<string[]>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<string[]>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<string[]>(),
    safeDirectEncoder: () => createJsonEncoder<string[]>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<string[]>(),
    unsafeDecoder: () => createJsonDecoder<string[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<string[]>(),
    binaryDecoder: () => createBinaryDecoder<string[]>(),
    getTestData: () => ({values: [['hello', 'world'], []]}),
  },
  array_date: {
    title: 'array of dates',
    unsafeEncoder: () => createJsonEncoder<Date[]>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<Date[]>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<Date[]>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<Date[]>(),
    safeDirectEncoder: () => createJsonEncoder<Date[]>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<Date[]>(),
    unsafeDecoder: () => createJsonDecoder<Date[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Date[]>(),
    binaryDecoder: () => createBinaryDecoder<Date[]>(),
    getTestData: () => ({
      values: [[new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')], []],
    }),
  },
  undefined_in_array: {
    title: 'undefined is serialized as null in array',
    unsafeEncoder: () => createJsonEncoder<undefined[]>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<undefined[]>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<undefined[]>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<undefined[]>(),
    safeDirectEncoder: () => createJsonEncoder<undefined[]>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<undefined[]>(),
    unsafeDecoder: () => createJsonDecoder<undefined[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<undefined[]>(),
    binaryDecoder: () => createBinaryDecoder<undefined[]>(),
    getTestData: () => ({values: [[undefined, undefined]]}),
  },
  multi_dimensional: {
    title: 'multi dimensional array',
    unsafeEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<string[][]>(),
    safeDirectEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<string[][]>(),
    unsafeDecoder: () => createJsonDecoder<string[][]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<string[][]>(),
    binaryDecoder: () => createBinaryDecoder<string[][]>(),
    getTestData: () => ({values: [[['hello', 'world'], ['a', 'b'], []], []]}),
  },
  non_serializable_in_array: {
    title: 'non serializable items throws an error',
    description: 'symbol[] should throw at RT-compile time per mion semantic.',
    unsafeEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<symbol[]>(),
    safeDirectEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<symbol[]>(),
    unsafeDecoder: () => createJsonDecoder<symbol[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<symbol[]>(),
    binaryDecoder: () => createBinaryDecoder<symbol[]>(),
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  array_circular: {
    title: 'array circular',
    unsafeEncoder: () => {
      type CircularArray = CircularArray[];
      return createJsonEncoder<CircularArray>(undefined, {strategy: 'mutate'});
    },
    clonePreserveEncoder: () => {
      type CircularArray = CircularArray[];
      return createJsonEncoder<CircularArray>(undefined, {strategy: 'clone'});
    },
    mutateStripEncoder: () => {
      type CircularArray = CircularArray[];
      return createJsonEncoder<CircularArray>(undefined, {strategy: 'stripMutate'});
    },
    safeEncoder: () => {
      type CircularArray = CircularArray[];
      return createJsonEncoder<CircularArray>();
    },
    safeDirectEncoder: () => {
      type CircularArray = CircularArray[];
      return createJsonEncoder<CircularArray>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      type CircularArray = CircularArray[];
      return createJsonDecoder<CircularArray>();
    },
    unsafeDecoder: () => {
      type CircularArray = CircularArray[];
      return createJsonDecoder<CircularArray>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      type CircularArray = CircularArray[];
      return createBinaryEncoder<CircularArray>();
    },
    binaryDecoder: () => {
      type CircularArray = CircularArray[];
      return createBinaryDecoder<CircularArray>();
    },
    getTestData: () => {
      type CircularArray = CircularArray[];
      const arr: CircularArray = [];
      arr.push([]);
      arr[0].push([]);
      arr[0][0].push([]);
      return {values: [arr, []]};
    },
  },
} as const satisfies Record<string, SerializationCase>;
