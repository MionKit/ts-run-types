import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';
import type {SerializationCase} from './types.ts';

export const CIRCULAR_REFS = {
  circular_types: {
    title: 'Circular object',
    description:
      'Self-referential `{name: string; child?: CircularObject}` (a node with an optional child of its own type) exercises recursive object walking and the value-first `RT.circular` builder, with samples nesting one level deep.',
    mutateEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonEncoder<CircularObject>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonEncoder<CircularObject>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonEncoder<CircularObject>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonDecoder<CircularObject>();
    },
    preserveDecoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonDecoder<CircularObject>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createBinaryEncoder<CircularObject>();
    },
    binaryDecoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createBinaryDecoder<CircularObject>();
    },
    schemaEncoder: () => createJsonEncoder(RT.circular((self) => RT.object({name: RT.string(), child: RT.optional(self)}))),
    schemaDecoder: () => createJsonDecoder(RT.circular((self) => RT.object({name: RT.string(), child: RT.optional(self)}))),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(RT.circular((self) => RT.object({name: RT.string(), child: RT.optional(self)}))),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(RT.circular((self) => RT.object({name: RT.string(), child: RT.optional(self)}))),
    getTestData: () => ({values: [{name: 'hello', child: {name: 'world'}}]}),
  },
  circular_union_array: {
    title: 'Circular union array',
    description:
      'Recursive `type CuArray = (CuArray | Date | number | string)[]` is an array whose elements are itself, Date, number, or string, exercising a recursive union element with a mix of scalar and Date members nested several levels deep.',
    serializeNotes:
      'The decoder selects each element by trying the union members (Date arrives as an ISO string and is revived to a Date); the recursive `CuArray` branch lets the array contain further arrays of the same union.',
    mutateEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonEncoder<CuArray>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonEncoder<CuArray>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonEncoder<CuArray>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonDecoder<CuArray>();
    },
    preserveDecoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonDecoder<CuArray>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createBinaryEncoder<CuArray>();
    },
    binaryDecoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createBinaryDecoder<CuArray>();
    },
    schemaEncoder: () =>
      createJsonEncoder(RT.circular((self) => RT.array(RT.union([self, RT.date(), RT.number(), RT.string()])))),
    schemaDecoder: () =>
      createJsonDecoder(RT.circular((self) => RT.array(RT.union([self, RT.date(), RT.number(), RT.string()])))),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(RT.circular((self) => RT.array(RT.union([self, RT.date(), RT.number(), RT.string()])))),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(RT.circular((self) => RT.array(RT.union([self, RT.date(), RT.number(), RT.string()])))),
    getTestData: () => {
      const date = new Date('2000-08-06T02:13:00.000Z');
      return {
        values: [
          [date, 123, 'hello', ['a', 'b', 'c']],
          [date, 123, 'hello', ['a', 2, 'c'], [date, 123, 'hello', ['a', 'b', 'c']]],
          [],
        ],
      };
    },
  },
  circular_tuple: {
    title: 'Circular tuple',
    description:
      'Recursive `interface CircularTuple { list: [bigint, CircularTuple?] }` is an object holding a tuple of a bigint and an optional self, exercising an object-to-tuple recursion cycle.',
    serializeNotes:
      'The leading tuple slot is a bigint, so each `list[0]` JSON-encodes to a decimal string and rebuilds with `BigInt(...)`; the optional trailing slot recurses into the same shape.',
    mutateEncoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonEncoder<CircularTuple>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonEncoder<CircularTuple>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonEncoder<CircularTuple>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonDecoder<CircularTuple>();
    },
    preserveDecoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonDecoder<CircularTuple>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createBinaryEncoder<CircularTuple>();
    },
    binaryDecoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createBinaryDecoder<CircularTuple>();
    },
    schemaEncoder: () => createJsonEncoder(RT.circular((self) => RT.object({list: RT.tuple([RT.bigint()], [self])}))),
    schemaDecoder: () => createJsonDecoder(RT.circular((self) => RT.object({list: RT.tuple([RT.bigint()], [self])}))),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.circular((self) => RT.object({list: RT.tuple([RT.bigint()], [self])}))),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.circular((self) => RT.object({list: RT.tuple([RT.bigint()], [self])}))),
    getTestData: () => ({
      values: [{list: [1n, {list: [2n, {list: [3n, {list: [4n]}]}]}]}, {list: [1n, {list: [2n]}]}, {list: [1n]}],
    }),
  },
  circular_index: {
    title: 'Circular index',
    description:
      'Recursive `interface CircularIndex { index: {[key: string]: CircularIndex} }` is a node whose `index` is a record of further nodes, exercising an object-to-record recursion cycle, with samples nesting several levels and bottoming out in an empty record.',
    mutateEncoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonEncoder<CircularIndex>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonEncoder<CircularIndex>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonEncoder<CircularIndex>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonDecoder<CircularIndex>();
    },
    preserveDecoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonDecoder<CircularIndex>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createBinaryEncoder<CircularIndex>();
    },
    binaryDecoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createBinaryDecoder<CircularIndex>();
    },
    schemaEncoder: () => createJsonEncoder(RT.circular((self) => RT.object({index: RT.record(self)}))),
    schemaDecoder: () => createJsonDecoder(RT.circular((self) => RT.object({index: RT.record(self)}))),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.circular((self) => RT.object({index: RT.record(self)}))),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.circular((self) => RT.object({index: RT.record(self)}))),
    getTestData: () => ({
      values: [{index: {a: {index: {b: {index: {}}}}}}, {index: {a: {index: {}}}}, {index: {}}],
    }),
  },
  circular_deep: {
    title: 'Circular deep',
    description:
      'Recursive `interface CircularDeep { deep1: {deep2: {deep3: {deep4?: CircularDeep}}} }` places the self-reference four plain-object levels down behind an optional `deep4`, exercising a recursion cycle that only re-enters after deep nesting.',
    mutateEncoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonEncoder<CircularDeep>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonEncoder<CircularDeep>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonEncoder<CircularDeep>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonDecoder<CircularDeep>();
    },
    preserveDecoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonDecoder<CircularDeep>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createBinaryEncoder<CircularDeep>();
    },
    binaryDecoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createBinaryDecoder<CircularDeep>();
    },
    schemaEncoder: () =>
      createJsonEncoder(
        RT.circular((self) => RT.object({deep1: RT.object({deep2: RT.object({deep3: RT.object({deep4: RT.optional(self)})})})}))
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.circular((self) => RT.object({deep1: RT.object({deep2: RT.object({deep3: RT.object({deep4: RT.optional(self)})})})}))
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.circular((self) => RT.object({deep1: RT.object({deep2: RT.object({deep3: RT.object({deep4: RT.optional(self)})})})}))
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.circular((self) => RT.object({deep1: RT.object({deep2: RT.object({deep3: RT.object({deep4: RT.optional(self)})})})}))
      ),
    getTestData: () => ({
      values: [{deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}}, {deep1: {deep2: {deep3: {}}}}],
    }),
  },
  circular_tuple_complex: {
    title: 'Root circular tuple',
    description:
      'ROOT-level recursive tuple `type CircularTupleComplex = [bigint, CircularTupleComplex?]` is a tuple of a bigint and an optional self where each bigint slot JSON-encodes to a decimal string and the optional tail recurses, with samples nesting several levels deep.',
    serializeNotes:
      'A root recursive tuple cannot be authored value-first (`circular` over a tuple hits TS2589), so the schema thunks opt out; the object→tuple cycle is covered value-first by `circular_tuple`.',
    mutateEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonEncoder<CircularTupleComplex>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonEncoder<CircularTupleComplex>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonEncoder<CircularTupleComplex>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonDecoder<CircularTupleComplex>();
    },
    preserveDecoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonDecoder<CircularTupleComplex>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createBinaryEncoder<CircularTupleComplex>();
    },
    binaryDecoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createBinaryDecoder<CircularTupleComplex>();
    },
    // A ROOT-level recursive tuple can't be authored value-first — `circular(self =>
    // tuple([bigint()], [self]))` hits TS2589 (TS can't build a recursive tuple type
    // via the mapping). Covered type-first here; the object→tuple cycle is covered
    // value-first by circular_tuple. Mirrors validation TUPLE.tuple_circular.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    getTestData: () => ({values: [[1n, [2n, [3n, [4n]]]], [1n, [2n]], [1n]]}),
  },
  object_with_circular_array: {
    title: 'Object with circular array',
    description:
      'Recursive `{a: string; deep?: {b: string; c: number}; d?: ObjCircularArr[]}` is an object with a scalar, an optional plain nested object, and an optional array of itself, exercising an object-to-array-of-self recursion cycle alongside non-recursive sibling props.',
    mutateEncoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonEncoder<ObjCircularArr>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonEncoder<ObjCircularArr>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonEncoder<ObjCircularArr>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonDecoder<ObjCircularArr>();
    },
    preserveDecoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonDecoder<ObjCircularArr>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createBinaryEncoder<ObjCircularArr>();
    },
    binaryDecoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createBinaryDecoder<ObjCircularArr>();
    },
    schemaEncoder: () =>
      createJsonEncoder(
        RT.circular((self) =>
          RT.object({
            a: RT.string(),
            deep: RT.optional(RT.object({b: RT.string(), c: RT.number()})),
            d: RT.optional(RT.array(self)),
          })
        )
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.circular((self) =>
          RT.object({
            a: RT.string(),
            deep: RT.optional(RT.object({b: RT.string(), c: RT.number()})),
            d: RT.optional(RT.array(self)),
          })
        )
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.circular((self) =>
          RT.object({
            a: RT.string(),
            deep: RT.optional(RT.object({b: RT.string(), c: RT.number()})),
            d: RT.optional(RT.array(self)),
          })
        )
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.circular((self) =>
          RT.object({
            a: RT.string(),
            deep: RT.optional(RT.object({b: RT.string(), c: RT.number()})),
            d: RT.optional(RT.array(self)),
          })
        )
      ),
    getTestData: () => ({
      values: [
        {
          a: 'hello',
          deep: {b: 'world', c: 123},
          d: [{a: 'hello2', deep: {b: 'world2', c: 1234}}],
        },
      ],
    }),
  },
} as const satisfies Record<string, SerializationCase>;
