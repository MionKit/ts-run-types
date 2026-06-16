import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';
import type {SerializationCase} from './types.ts';

export const ARRAYS = {
  array: {
    title: 'Array',
    description:
      'Root `string[]` round-trips identically across JSON and binary, with samples covering a populated array and the empty case.',
    mutateEncoder: () => createJsonEncoder<string[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<string[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<string[]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<string[]>(),
    preserveDecoder: () => createJsonDecoder<string[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<string[]>(),
    binaryDecoder: () => createBinaryDecoder<string[]>(),
    schemaEncoder: () => createJsonEncoder(RT.array(RT.string())),
    schemaDecoder: () => createJsonDecoder(RT.array(RT.string())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.array(RT.string())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.array(RT.string())),
    getTestData: () => ({values: [['hello', 'world'], []]}),
  },
  array_date: {
    title: 'Date array',
    description:
      '`Date[]` encodes each element to an ISO string on the JSON wire and restores to a Date, while binary packs each as a fixed 8-byte epoch.',
    serializeNotes:
      'Per-element Date transform applies recursively over the array; the empty-array sample confirms no element work happens when there are no items.',
    mutateEncoder: () => createJsonEncoder<Date[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Date[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Date[]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Date[]>(),
    preserveDecoder: () => createJsonDecoder<Date[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Date[]>(),
    binaryDecoder: () => createBinaryDecoder<Date[]>(),
    schemaEncoder: () => createJsonEncoder(RT.array(RT.date())),
    schemaDecoder: () => createJsonDecoder(RT.array(RT.date())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.array(RT.date())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.array(RT.date())),
    getTestData: () => ({
      values: [[new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')], []],
    }),
  },
  undefined_in_array: {
    title: 'Undefined array elements',
    description: '`undefined[]` array slots cannot hold undefined on the JSON wire, so each is serialized as null.',
    serializeNotes:
      'JSON.stringify writes each undefined element as null (array holes/undefined become null, unlike object props which are dropped); decode restores them per the declared literal type.',
    mutateEncoder: () => createJsonEncoder<undefined[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<undefined[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<undefined[]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<undefined[]>(),
    preserveDecoder: () => createJsonDecoder<undefined[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<undefined[]>(),
    binaryDecoder: () => createBinaryDecoder<undefined[]>(),
    schemaEncoder: () => createJsonEncoder(RT.array(RT.literal(undefined))),
    schemaDecoder: () => createJsonDecoder(RT.array(RT.literal(undefined))),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.array(RT.literal(undefined))),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.array(RT.literal(undefined))),
    getTestData: () => ({values: [[undefined, undefined]]}),
  },
  multi_dimensional: {
    title: 'Multi-dimensional array',
    description:
      'Nested `string[][]` round-trips identically across JSON and binary, with samples mixing ragged inner arrays alongside empty inner and outer arrays.',
    mutateEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<string[][]>(),
    preserveDecoder: () => createJsonDecoder<string[][]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<string[][]>(),
    binaryDecoder: () => createBinaryDecoder<string[][]>(),
    schemaEncoder: () => createJsonEncoder(RT.array(RT.array(RT.string()))),
    schemaDecoder: () => createJsonDecoder(RT.array(RT.array(RT.string()))),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.array(RT.array(RT.string()))),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.array(RT.array(RT.string()))),
    getTestData: () => ({values: [[['hello', 'world'], ['a', 'b'], []], []]}),
  },
  non_serializable_in_array: {
    title: 'Non-serializable array elements',
    description:
      '`symbol[]` should throw at RT-compile time per mion semantics because a non-serializable element propagates to the root.',
    mutateEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<symbol[]>(),
    preserveDecoder: () => createJsonDecoder<symbol[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<symbol[]>(),
    binaryDecoder: () => createBinaryDecoder<symbol[]>(),
    // Non-serializable array element (symbol) propagates to the root → alwaysThrow.
    // `RT.array(RT.symbol())` resolves the same factory, so each schema thunk throws.
    schemaEncoder: () => createJsonEncoder(RT.array(RT.symbol())),
    schemaDecoder: () => createJsonDecoder(RT.array(RT.symbol())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.array(RT.symbol())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.array(RT.symbol())),
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  array_circular: {
    title: 'Circular array',
    description:
      'Self-referential `type CircularArray = CircularArray[]` exercises recursive element walking via the value-first `RT.circular` builder and a deeply nested empty-array sample.',
    mutateEncoder: () => {
      type CircularArray = CircularArray[];
      return createJsonEncoder<CircularArray>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type CircularArray = CircularArray[];
      return createJsonEncoder<CircularArray>(undefined, {strategy: 'clone'});
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
    schemaEncoder: () => {
      const ca = RT.circular((self) => RT.array(self));
      return createJsonEncoder(ca);
    },
    schemaDecoder: () => {
      const ca = RT.circular((self) => RT.array(self));
      return createJsonDecoder(ca);
    },
    schemaBinaryEncoder: () => {
      const ca = RT.circular((self) => RT.array(self));
      return createBinaryEncoder(ca);
    },
    schemaBinaryDecoder: () => {
      const ca = RT.circular((self) => RT.array(self));
      return createBinaryDecoder(ca);
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
