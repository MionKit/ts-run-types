import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {SerializationCase} from './types.ts';

export const TUPLES = {
  tuple: {
    title: 'tuple',
    description:
      'Fixed-length mixed tuple [Date, number, string, null, string[], bigint] where the Date slot encodes to an ISO string and the bigint slot to a decimal string, while number, string, null and the string[] slot pass through unchanged.',
    serializeNotes: 'Per-slot wire transforms: Date↔ISO string and bigint↔decimal string; the decoder restores each slot from its scalar form.',
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
    title: 'tuple with optionals',
    description:
      'Tuple [number, bigint?, boolean?, number?] with one required leading slot and three trailing optional slots that may be absent and round-trip symmetrically across JSON and binary.',
    serializeNotes:
      'Samples carry the optional bigint slot as `undefined` rather than a real value, so the bigint-to-decimal-string transform is exercised by other cases; both samples round-trip with no shape asymmetry.',
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
    title: 'tuple rest',
    description:
      'Tuple [number, ...bigint[]] with one fixed number slot and a possibly-empty trailing bigint rest segment, where each rest bigint encodes to a decimal string and rebuilds with BigInt(...) on decode.',
    serializeNotes: 'Rest bigint elements serialize to decimal strings on the JSON wire and rebuild to bigints on decode; samples cover the rest segment populated and empty.',
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
    title: 'tuple non-serializable slot',
    description:
      'Function-typed tuple slots are unsupported at every serialization family because tuple positions are structural, so rather than silently dropping to lossy null/undefined output the factory is rendered as alwaysThrow.',
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
    description:
      'Self-referential root tuple [Date, number, string, null, string[], bigint, TupleCircular?] whose last optional slot recurses into the same tuple, with the Date slot encoding to an ISO string, the bigint slot to a decimal string, and the nested tuple round-tripping recursively across JSON and binary.',
    serializeNotes:
      'A root-level recursive tuple cannot be authored value-first, so all four schema variants are marked not-supported (the object-to-tuple cycle is covered value-first by interface_circular_tuple); the type-first path round-trips with Date-to-ISO-string and bigint-to-decimal-string per-slot transforms.',
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
    description:
      'Recursive interface whose optional `parent` is a [string, ICircularTuple] tuple forming an object-to-tuple cycle where every slot is serializable, so the whole graph round-trips symmetrically across JSON and binary with the value-first schema mirroring the type via RT.circular.',
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
