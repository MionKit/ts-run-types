import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {SerializationCase} from './types.ts';

export const TUPLES = {
  tuple: {
    title: 'tuple',
    unsafeEncoder: () => createJsonEncoder<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () =>
      createJsonEncoder<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<[Date, number, string, null, string[], bigint]>(),
    safeDirectEncoder: () => createJsonEncoder<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<[Date, number, string, null, string[], bigint]>(),
    unsafeDecoder: () => createJsonDecoder<[Date, number, string, null, string[], bigint]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<[Date, number, string, null, string[], bigint]>(),
    binaryDecoder: () => createBinaryDecoder<[Date, number, string, null, string[], bigint]>(),
    getTestData: () => ({
      values: [[new Date('2000-08-06T02:13:00.000Z'), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)]],
    }),
  },
  tuple_with_optional: {
    title: 'tuple with optional params',
    unsafeEncoder: () => createJsonEncoder<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<[number, bigint?, boolean?, number?]>(),
    safeDirectEncoder: () => createJsonEncoder<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<[number, bigint?, boolean?, number?]>(),
    unsafeDecoder: () => createJsonDecoder<[number, bigint?, boolean?, number?]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<[number, bigint?, boolean?, number?]>(),
    binaryDecoder: () => createBinaryDecoder<[number, bigint?, boolean?, number?]>(),
    getTestData: () => ({
      values: [
        [3, undefined, true, 4],
        [446, undefined, undefined, undefined],
      ],
    }),
  },
  tuple_rest_parameter: {
    title: 'tuple rest parameter',
    unsafeEncoder: () => createJsonEncoder<[number, ...bigint[]]>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<[number, ...bigint[]]>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<[number, ...bigint[]]>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<[number, ...bigint[]]>(),
    safeDirectEncoder: () => createJsonEncoder<[number, ...bigint[]]>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<[number, ...bigint[]]>(),
    unsafeDecoder: () => createJsonDecoder<[number, ...bigint[]]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<[number, ...bigint[]]>(),
    binaryDecoder: () => createBinaryDecoder<[number, ...bigint[]]>(),
    getTestData: () => ({values: [[34567, 1n, 2n, 3n], [3]]}),
  },
  tuple_with_non_serializable: {
    title: 'tuple with function-typed slot — alwaysThrow',
    description:
      'Function-typed tuple slots are unsupported at every serialization family: tuple positions are structural, so the previous silent drop produced lossy output (functions became null / undefined depending on path). The factory is now rendered as alwaysThrow.',
    unsafeEncoder: () => createJsonEncoder<[number, () => any]>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<[number, () => any]>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<[number, () => any]>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<[number, () => any]>(),
    safeDirectEncoder: () => createJsonEncoder<[number, () => any]>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<[number, () => any]>(),
    unsafeDecoder: () => createJsonDecoder<[number, () => any]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<[number, () => any]>(),
    binaryDecoder: () => createBinaryDecoder<[number, () => any]>(),
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  tuple_circular: {
    title: 'tuple circular',
    unsafeEncoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonEncoder<TupleCircular>(undefined, {strategy: 'mutate'});
    },
    clonePreserveEncoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonEncoder<TupleCircular>(undefined, {strategy: 'clone'});
    },
    mutateStripEncoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonEncoder<TupleCircular>(undefined, {strategy: 'stripMutate'});
    },
    safeEncoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonEncoder<TupleCircular>();
    },
    safeDirectEncoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonEncoder<TupleCircular>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
      return createJsonDecoder<TupleCircular>();
    },
    unsafeDecoder: () => {
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
    unsafeEncoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonEncoder<ICircularTuple>(undefined, {strategy: 'mutate'});
    },
    clonePreserveEncoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonEncoder<ICircularTuple>(undefined, {strategy: 'clone'});
    },
    mutateStripEncoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonEncoder<ICircularTuple>(undefined, {strategy: 'stripMutate'});
    },
    safeEncoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonEncoder<ICircularTuple>();
    },
    safeDirectEncoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonEncoder<ICircularTuple>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      interface ICircularTuple {
        name: string;
        parent?: [string, ICircularTuple];
      }
      return createJsonDecoder<ICircularTuple>();
    },
    unsafeDecoder: () => {
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
