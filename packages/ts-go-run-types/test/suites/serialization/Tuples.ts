import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {SerializationCase} from './types.ts';

export const TUPLES = {
  tuple: {
    title: 'tuple',
    mutateEncoder: () => createJsonEncoder<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<[Date, number, string, null, string[], bigint]>(),
    preserveDecoder: () => createJsonDecoder<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<[Date, number, string, null, string[], bigint]>(),
    binaryDecoder: () => createBinaryDecoder<[Date, number, string, null, string[], bigint]>(),
    schemaEncoder: () =>
      createJsonEncoder(RT.tuple([RT.date(), RT.number(), RT.string(), RT.literal(null), RT.array(RT.string()), RT.bigint()])),
    schemaDecoder: () =>
      createJsonDecoder(RT.tuple([RT.date(), RT.number(), RT.string(), RT.literal(null), RT.array(RT.string()), RT.bigint()])),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(RT.tuple([RT.date(), RT.number(), RT.string(), RT.literal(null), RT.array(RT.string()), RT.bigint()])),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(RT.tuple([RT.date(), RT.number(), RT.string(), RT.literal(null), RT.array(RT.string()), RT.bigint()])),
    getTestData: () => ({
      values: [[new Date('2000-08-06T02:13:00.000Z'), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)]],
    }),
  },
  tuple_with_optional: {
    title: 'tuple with optional params',
    mutateEncoder: () => createJsonEncoder<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<[number, bigint?, boolean?, number?]>(),
    preserveDecoder: () => createJsonDecoder<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<[number, bigint?, boolean?, number?]>(),
    binaryDecoder: () => createBinaryDecoder<[number, bigint?, boolean?, number?]>(),
    schemaEncoder: () => createJsonEncoder(RT.tuple([RT.number()], [RT.bigint(), RT.boolean(), RT.number()])),
    schemaDecoder: () => createJsonDecoder(RT.tuple([RT.number()], [RT.bigint(), RT.boolean(), RT.number()])),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.tuple([RT.number()], [RT.bigint(), RT.boolean(), RT.number()])),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.tuple([RT.number()], [RT.bigint(), RT.boolean(), RT.number()])),
    getTestData: () => ({
      values: [
        [3, undefined, true, 4],
        [446, undefined, undefined, undefined],
      ],
    }),
  },
  tuple_rest_parameter: {
    title: 'tuple rest parameter',
    mutateEncoder: () => createJsonEncoder<[number, ...bigint[]]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<[number, ...bigint[]]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<[number, ...bigint[]]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<[number, ...bigint[]]>(),
    preserveDecoder: () => createJsonDecoder<[number, ...bigint[]]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<[number, ...bigint[]]>(),
    binaryDecoder: () => createBinaryDecoder<[number, ...bigint[]]>(),
    schemaEncoder: () => createJsonEncoder(RT.tuple([RT.number()], RT.bigint())),
    schemaDecoder: () => createJsonDecoder(RT.tuple([RT.number()], RT.bigint())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.tuple([RT.number()], RT.bigint())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.tuple([RT.number()], RT.bigint())),
    getTestData: () => ({values: [[34567, 1n, 2n, 3n], [3]]}),
  },
  tuple_with_non_serializable: {
    title: 'tuple with function-typed slot — alwaysThrow',
    description:
      'Function-typed tuple slots are unsupported at every serialization family: tuple positions are structural, so the previous silent drop produced lossy output (functions became null / undefined depending on path). The factory is now rendered as alwaysThrow.',
    mutateEncoder: () => createJsonEncoder<[number, () => any]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<[number, () => any]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<[number, () => any]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<[number, () => any]>(),
    preserveDecoder: () => createJsonDecoder<[number, () => any]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<[number, () => any]>(),
    binaryDecoder: () => createBinaryDecoder<[number, () => any]>(),
    // Expressible value-first (mirrors validation TUPLE.tuple_with_non_serializable),
    // but a function-typed tuple slot resolves the same alwaysThrow factory — each
    // thunk throws like the type-first form (factoryThrows below); adapter asserts it.
    schemaEncoder: () => createJsonEncoder(RT.tuple([RT.number(), RT.func([], RT.any())])),
    schemaDecoder: () => createJsonDecoder(RT.tuple([RT.number(), RT.func([], RT.any())])),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.tuple([RT.number(), RT.func([], RT.any())])),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.tuple([RT.number(), RT.func([], RT.any())])),
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  tuple_circular: {
    title: 'tuple circular',
    mutateEncoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonEncoder<TupleCircular>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonEncoder<TupleCircular>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonEncoder<TupleCircular>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonDecoder<TupleCircular>();
    },
    preserveDecoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonDecoder<TupleCircular>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createBinaryEncoder<TupleCircular>();
    },
    binaryDecoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createBinaryDecoder<TupleCircular>();
    },
    // A ROOT-level recursive tuple can't be authored value-first — `circular(self =>
    // tuple([...], [self]))` hits TS2589 (TS can't build a recursive tuple type via
    // the mapping). Covered type-first here; the object→tuple cycle is covered
    // value-first by interface_circular_tuple. Mirrors validation TUPLE.tuple_circular.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    getTestData: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      const tDeep: TupleCircular = [
        new Date('2000-08-06T02:13:00.000Z'),
        456,
        'world',
        null,
        ['x', 'y', 'z'],
        BigInt(456),
        undefined,
      ];
      const typeValue: TupleCircular = [
        new Date('2000-08-06T02:13:00.000Z'),
        123,
        'hello',
        null,
        ['a', 'b', 'c'],
        BigInt(123),
        tDeep,
      ];
      return {values: [typeValue]};
    },
  },
  interface_circular_tuple: {
    title: 'interface circular tuple',
    mutateEncoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonEncoder<ICircularTuple>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonEncoder<ICircularTuple>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonEncoder<ICircularTuple>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonDecoder<ICircularTuple>();
    },
    preserveDecoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonDecoder<ICircularTuple>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createBinaryEncoder<ICircularTuple>();
    },
    binaryDecoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createBinaryDecoder<ICircularTuple>();
    },
    schemaEncoder: () =>
      createJsonEncoder(
        RT.circular((self) => RT.object({name: RT.string(), parent: RT.optional(RT.tuple([RT.string(), self]))}))
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.circular((self) => RT.object({name: RT.string(), parent: RT.optional(RT.tuple([RT.string(), self]))}))
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.circular((self) => RT.object({name: RT.string(), parent: RT.optional(RT.tuple([RT.string(), self]))}))
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.circular((self) => RT.object({name: RT.string(), parent: RT.optional(RT.tuple([RT.string(), self]))}))
      ),
    getTestData: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      const obj1: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world'}]};
      const obj2: ICircularTuple = {name: 'hello', parent: ['world', {name: 'world', parent: ['hello', obj1]}]};
      return {values: [obj1, obj2]};
    },
  },
} as const satisfies Record<string, SerializationCase>;
