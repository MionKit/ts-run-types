import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {SerializationCase} from './types.ts';

export const CIRCULAR_REFS = {
  circular_types: {
    title: 'circular objects',
    unsafeEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonEncoder<CircularObject>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonEncoder<CircularObject>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonEncoder<CircularObject>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonEncoder<CircularObject>();
    },
    safeDirectEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonEncoder<CircularObject>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonDecoder<CircularObject>();
    },
    unsafeDecoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createJsonDecoder<CircularObject>(undefined, {stripExtras: false});
    },
    binaryEncoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createBinaryEncoder<CircularObject>();
    },
    binaryDecoder: () => {
      type CircularObject = {name: string; child?: CircularObject};
      return createBinaryDecoder<CircularObject>();
    },
    getTestData: () => ({values: [{name: 'hello', child: {name: 'world'}}]}),
  },
  circular_union_array: {
    title: 'CircularUnion array with discriminator',
    unsafeEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonEncoder<CuArray>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonEncoder<CuArray>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonEncoder<CuArray>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonEncoder<CuArray>();
    },
    safeDirectEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonEncoder<CuArray>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonDecoder<CuArray>();
    },
    unsafeDecoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createJsonDecoder<CuArray>(undefined, {stripExtras: false});
    },
    binaryEncoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createBinaryEncoder<CuArray>();
    },
    binaryDecoder: () => {
      type CuArray = (CuArray | Date | number | string)[];
      return createBinaryDecoder<CuArray>();
    },
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
    unsafeEncoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonEncoder<CircularTuple>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonEncoder<CircularTuple>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonEncoder<CircularTuple>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonEncoder<CircularTuple>();
    },
    safeDirectEncoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonEncoder<CircularTuple>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonDecoder<CircularTuple>();
    },
    unsafeDecoder: () => {
      interface CircularTuple {
        list: [bigint, CircularTuple?];
      }
      return createJsonDecoder<CircularTuple>(undefined, {stripExtras: false});
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
    getTestData: () => ({
      values: [{list: [1n, {list: [2n, {list: [3n, {list: [4n]}]}]}]}, {list: [1n, {list: [2n]}]}, {list: [1n]}],
    }),
  },
  circular_index: {
    title: 'CircularIndex object with discriminator',
    unsafeEncoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonEncoder<CircularIndex>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonEncoder<CircularIndex>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonEncoder<CircularIndex>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonEncoder<CircularIndex>();
    },
    safeDirectEncoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonEncoder<CircularIndex>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonDecoder<CircularIndex>();
    },
    unsafeDecoder: () => {
      interface CircularIndex {
        index: {[key: string]: CircularIndex};
      }
      return createJsonDecoder<CircularIndex>(undefined, {stripExtras: false});
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
    getTestData: () => ({
      values: [{index: {a: {index: {b: {index: {}}}}}}, {index: {a: {index: {}}}}, {index: {}}],
    }),
  },
  circular_deep: {
    title: 'CircularDeep object with discriminator',
    unsafeEncoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonEncoder<CircularDeep>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonEncoder<CircularDeep>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonEncoder<CircularDeep>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonEncoder<CircularDeep>();
    },
    safeDirectEncoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonEncoder<CircularDeep>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonDecoder<CircularDeep>();
    },
    unsafeDecoder: () => {
      interface CircularDeep {
        deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
      }
      return createJsonDecoder<CircularDeep>(undefined, {stripExtras: false});
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
    getTestData: () => ({
      values: [{deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}}, {deep1: {deep2: {deep3: {}}}}],
    }),
  },
  circular_tuple_complex: {
    title: 'Circular tuple with complex structure',
    unsafeEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonEncoder<CircularTupleComplex>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonEncoder<CircularTupleComplex>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonEncoder<CircularTupleComplex>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonEncoder<CircularTupleComplex>();
    },
    safeDirectEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonEncoder<CircularTupleComplex>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonDecoder<CircularTupleComplex>();
    },
    unsafeDecoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createJsonDecoder<CircularTupleComplex>(undefined, {stripExtras: false});
    },
    binaryEncoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createBinaryEncoder<CircularTupleComplex>();
    },
    binaryDecoder: () => {
      type CircularTupleComplex = [bigint, CircularTupleComplex?];
      return createBinaryDecoder<CircularTupleComplex>();
    },
    getTestData: () => ({values: [[1n, [2n, [3n, [4n]]]], [1n, [2n]], [1n]]}),
  },
  object_with_circular_array: {
    title: 'object with circular array',
    unsafeEncoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonEncoder<ObjCircularArr>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonEncoder<ObjCircularArr>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonEncoder<ObjCircularArr>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonEncoder<ObjCircularArr>();
    },
    safeDirectEncoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonEncoder<ObjCircularArr>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonDecoder<ObjCircularArr>();
    },
    unsafeDecoder: () => {
      type ObjCircularArr = {
        a: string;
        deep?: {b: string; c: number};
        d?: ObjCircularArr[];
      };
      return createJsonDecoder<ObjCircularArr>(undefined, {stripExtras: false});
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
