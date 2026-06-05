import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {SerializationCase} from './types.ts';

export const ARRAYS = {
  array: {
    title: 'array',
    mutateEncoder: () => createJsonEncoder<string[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<string[]>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<string[]>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<string[]>(),
    directEncoder: () => createJsonEncoder<string[]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<string[]>(),
    preserveDecoder: () => createJsonDecoder<string[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<string[]>(),
    binaryDecoder: () => createBinaryDecoder<string[]>(),
    getTestData: () => ({values: [['hello', 'world'], []]}),
  },
  array_date: {
    title: 'array of dates',
    mutateEncoder: () => createJsonEncoder<Date[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Date[]>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<Date[]>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<Date[]>(),
    directEncoder: () => createJsonEncoder<Date[]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Date[]>(),
    preserveDecoder: () => createJsonDecoder<Date[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Date[]>(),
    binaryDecoder: () => createBinaryDecoder<Date[]>(),
    getTestData: () => ({
      values: [[new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')], []],
    }),
  },
  undefined_in_array: {
    title: 'undefined is serialized as null in array',
    mutateEncoder: () => createJsonEncoder<undefined[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<undefined[]>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<undefined[]>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<undefined[]>(),
    directEncoder: () => createJsonEncoder<undefined[]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<undefined[]>(),
    preserveDecoder: () => createJsonDecoder<undefined[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<undefined[]>(),
    binaryDecoder: () => createBinaryDecoder<undefined[]>(),
    getTestData: () => ({values: [[undefined, undefined]]}),
  },
  multi_dimensional: {
    title: 'multi dimensional array',
    mutateEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<string[][]>(),
    directEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<string[][]>(),
    preserveDecoder: () => createJsonDecoder<string[][]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<string[][]>(),
    binaryDecoder: () => createBinaryDecoder<string[][]>(),
    getTestData: () => ({values: [[['hello', 'world'], ['a', 'b'], []], []]}),
  },
  non_serializable_in_array: {
    title: 'non serializable items throws an error',
    description: 'symbol[] should throw at RT-compile time per mion semantic.',
    mutateEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<symbol[]>(),
    directEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<symbol[]>(),
    preserveDecoder: () => createJsonDecoder<symbol[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<symbol[]>(),
    binaryDecoder: () => createBinaryDecoder<symbol[]>(),
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  array_circular: {
    title: 'array circular',
    mutateEncoder: () => {
      type CircularArray = CircularArray[];
      return createJsonEncoder<CircularArray>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type CircularArray = CircularArray[];
      return createJsonEncoder<CircularArray>(undefined, {strategy: 'clone'});
    },
    stripMutateEncoder: () => {
      type CircularArray = CircularArray[];
      return createJsonEncoder<CircularArray>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      type CircularArray = CircularArray[];
      return createJsonEncoder<CircularArray>();
    },
    directEncoder: () => {
      type CircularArray = CircularArray[];
      return createJsonEncoder<CircularArray>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      type CircularArray = CircularArray[];
      return createJsonDecoder<CircularArray>();
    },
    preserveDecoder: () => {
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
