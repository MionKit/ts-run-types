import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {SerializationCase} from './types.ts';

export const CIRCULAR_REFS = {
  circular_types: {
    title: 'circular objects',
    mutateEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonEncoder<CircularObject>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonEncoder<CircularObject>(undefined, {strategy: 'clone'});
    },
    stripMutateEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonEncoder<CircularObject>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonEncoder<CircularObject>();
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
    schemaBinaryEncoder: () => createBinaryEncoder(RT.circular((self) => RT.object({name: RT.string(), child: RT.optional(self)}))),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.circular((self) => RT.object({name: RT.string(), child: RT.optional(self)}))),
    getTestData: () => ({values: [{name: 'hello', child: {name: 'world'}}]}),
  },
  circular_union_array: {
    title: 'CircularUnion array with discriminator',
    mutateEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonEncoder<CuArray>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonEncoder<CuArray>(undefined, {strategy: 'clone'});
    },
    stripMutateEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonEncoder<CuArray>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonEncoder<CuArray>();
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
    schemaEncoder: () => createJsonEncoder(RT.circular((self) => RT.array(RT.union([self, RT.date(), RT.number(), RT.string()])))),
    schemaDecoder: () => createJsonDecoder(RT.circular((self) => RT.array(RT.union([self, RT.date(), RT.number(), RT.string()])))),
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
    title: 'CircularTuple object with discriminator',
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
    stripMutateEncoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonEncoder<CircularTuple>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonEncoder<CircularTuple>();
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
    title: 'CircularIndex object with discriminator',
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
    stripMutateEncoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonEncoder<CircularIndex>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonEncoder<CircularIndex>();
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
    title: 'CircularDeep object with discriminator',
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
    stripMutateEncoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonEncoder<CircularDeep>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonEncoder<CircularDeep>();
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
    title: 'Circular tuple with complex structure',
    mutateEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonEncoder<CircularTupleComplex>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonEncoder<CircularTupleComplex>(undefined, {strategy: 'clone'});
    },
    stripMutateEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonEncoder<CircularTupleComplex>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonEncoder<CircularTupleComplex>();
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
    title: 'object with circular array',
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
    stripMutateEncoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonEncoder<ObjCircularArr>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonEncoder<ObjCircularArr>();
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
          RT.object({a: RT.string(), deep: RT.optional(RT.object({b: RT.string(), c: RT.number()})), d: RT.optional(RT.array(self))})
        )
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.circular((self) =>
          RT.object({a: RT.string(), deep: RT.optional(RT.object({b: RT.string(), c: RT.number()})), d: RT.optional(RT.array(self))})
        )
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.circular((self) =>
          RT.object({a: RT.string(), deep: RT.optional(RT.object({b: RT.string(), c: RT.number()})), d: RT.optional(RT.array(self))})
        )
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.circular((self) =>
          RT.object({a: RT.string(), deep: RT.optional(RT.object({b: RT.string(), c: RT.number()})), d: RT.optional(RT.array(self))})
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
