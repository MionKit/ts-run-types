import * as TF from 'ts-runtypes/formats';
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
    compactEncoder: () => createJsonEncoder<string[]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<string[]>(),
    preserveDecoder: () => createJsonDecoder<string[]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<string[]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<string[]>(),
    binaryDecoder: () => createBinaryDecoder<string[]>(),
    schemaEncoder: () => createJsonEncoder(RT.array(TF.string())),
    schemaDecoder: () => createJsonDecoder(RT.array(TF.string())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.array(TF.string())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.array(TF.string())),
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
    compactEncoder: () => createJsonEncoder<Date[]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<Date[]>(),
    preserveDecoder: () => createJsonDecoder<Date[]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<Date[]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<Date[]>(),
    binaryDecoder: () => createBinaryDecoder<Date[]>(),
    schemaEncoder: () => createJsonEncoder(RT.array(TF.date())),
    schemaDecoder: () => createJsonDecoder(RT.array(TF.date())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.array(TF.date())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.array(TF.date())),
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
    compactEncoder: () => createJsonEncoder<undefined[]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<undefined[]>(),
    preserveDecoder: () => createJsonDecoder<undefined[]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<undefined[]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<undefined[]>(),
    binaryDecoder: () => createBinaryDecoder<undefined[]>(),
    schemaEncoder: () => createJsonEncoder(RT.array(RT.literal(undefined))),
    schemaDecoder: () => createJsonDecoder(RT.array(RT.literal(undefined))),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.array(RT.literal(undefined))),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.array(RT.literal(undefined))),
    getTestData: () => ({values: [[undefined, undefined]]}),
  },
  null_in_array: {
    title: 'Null array elements',
    description: '`null[]` array slots serialize as the JSON `null` literal across every strategy.',
    serializeNotes:
      'A null element must emit the literal `null` on the wire: the single-pass `direct` strategy builds the array via `[...].join(",")`, which coerces a bare null to the empty string, so the element is emitted as the constant `"null"` to stay valid JSON.',
    mutateEncoder: () => createJsonEncoder<null[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<null[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<null[]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<null[]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<null[]>(),
    preserveDecoder: () => createJsonDecoder<null[]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<null[]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<null[]>(),
    binaryDecoder: () => createBinaryDecoder<null[]>(),
    schemaEncoder: () => createJsonEncoder(RT.array(RT.literal(null))),
    schemaDecoder: () => createJsonDecoder(RT.array(RT.literal(null))),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.array(RT.literal(null))),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.array(RT.literal(null))),
    getTestData: () => ({values: [[null, null], []]}),
  },
  nullable_number_array: {
    title: 'Nullable number array',
    description: '`(number | null)[]` round-trips a mix of numbers and nulls identically across every strategy.',
    serializeNotes:
      'The common nullable-element case: each null in the array must survive as the JSON `null` literal (it previously corrupted the `direct` wire to `[1,,2]`).',
    mutateEncoder: () => createJsonEncoder<(number | null)[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<(number | null)[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<(number | null)[]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<(number | null)[]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<(number | null)[]>(),
    preserveDecoder: () => createJsonDecoder<(number | null)[]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<(number | null)[]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<(number | null)[]>(),
    binaryDecoder: () => createBinaryDecoder<(number | null)[]>(),
    schemaEncoder: () => createJsonEncoder(RT.array(RT.union([TF.number(), RT.literal(null)]))),
    schemaDecoder: () => createJsonDecoder(RT.array(RT.union([TF.number(), RT.literal(null)]))),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.array(RT.union([TF.number(), RT.literal(null)]))),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.array(RT.union([TF.number(), RT.literal(null)]))),
    getTestData: () => ({values: [[1, null, 2], [null], []]}),
  },
  void_in_array: {
    title: 'Void array elements',
    description: '`void[]` array slots serialize as null across every strategy (same wire as undefined elements).',
    serializeNotes:
      'void normalises to undefined, so a void element follows the undefined rule: emitted as the JSON null literal in an array slot (the single-pass direct strategy must emit the constant "null" so the `.join(",")` array build stays valid JSON).',
    mutateEncoder: () => createJsonEncoder<void[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<void[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<void[]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<void[]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<void[]>(),
    preserveDecoder: () => createJsonDecoder<void[]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<void[]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<void[]>(),
    binaryDecoder: () => createBinaryDecoder<void[]>(),
    schemaEncoder: () => createJsonEncoder(RT.array(RT.void())),
    schemaDecoder: () => createJsonDecoder(RT.array(RT.void())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.array(RT.void())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.array(RT.void())),
    getTestData: () => ({values: [[undefined, undefined]]}),
  },
  multi_dimensional: {
    title: 'Multi-dimensional array',
    description:
      'Nested `string[][]` round-trips identically across JSON and binary, with samples mixing ragged inner arrays alongside empty inner and outer arrays.',
    mutateEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<string[][]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<string[][]>(),
    preserveDecoder: () => createJsonDecoder<string[][]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<string[][]>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<string[][]>(),
    binaryDecoder: () => createBinaryDecoder<string[][]>(),
    schemaEncoder: () => createJsonEncoder(RT.array(RT.array(TF.string()))),
    schemaDecoder: () => createJsonDecoder(RT.array(RT.array(TF.string()))),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.array(RT.array(TF.string()))),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.array(RT.array(TF.string()))),
    getTestData: () => ({values: [[['hello', 'world'], ['a', 'b'], []], []]}),
  },
  non_serializable_in_array: {
    title: 'Non-serializable array elements',
    description:
      '`symbol[]` should throw at RT-compile time per the reference semantics because a non-serializable element propagates to the root.',
    mutateEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<symbol[]>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<symbol[]>(),
    preserveDecoder: () => createJsonDecoder<symbol[]>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<symbol[]>(undefined, {strategy: 'compact'}),
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
    compactEncoder: () => {
      type CircularArray = CircularArray[];
      return createJsonEncoder<CircularArray>(undefined, {strategy: 'compact'});
    },
    stripDecoder: () => {
      type CircularArray = CircularArray[];
      return createJsonDecoder<CircularArray>();
    },
    preserveDecoder: () => {
      type CircularArray = CircularArray[];
      return createJsonDecoder<CircularArray>(undefined, {strategy: 'preserve'});
    },
    compactDecoder: () => {
      type CircularArray = CircularArray[];
      return createJsonDecoder<CircularArray>(undefined, {strategy: 'compact'});
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
      const ca = RT.circular(RT.array(RT.self()));
      return createJsonEncoder(ca);
    },
    schemaDecoder: () => {
      const ca = RT.circular(RT.array(RT.self()));
      return createJsonDecoder(ca);
    },
    schemaBinaryEncoder: () => {
      const ca = RT.circular(RT.array(RT.self()));
      return createBinaryEncoder(ca);
    },
    schemaBinaryDecoder: () => {
      const ca = RT.circular(RT.array(RT.self()));
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
