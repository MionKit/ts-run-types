// cloning / Arrays — arrays are mutable containers and are ALWAYS fresh:
// `.slice()` when the element type is immutable (a slice IS a deep clone
// then), `.map(clone)` when elements have shape.

import {createCloneExactShape} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

export const ARRAYS = {
  atomicElements: {
    title: 'array of atomics',
    description: 'Immutable elements make `.slice()` a complete deep clone — fresh array, shared primitive values.',
    clone: () => createCloneExactShape<string[]>(),
    getTestData: () => ({values: [['a', 'b'], []]}),
  },
  objectElements: {
    title: 'array of objects',
    description: 'Object elements rebuild element-wise with fresh identities; element extras drop.',
    clone: () => createCloneExactShape<Array<{a: string}>>(),
    getTestData: () => ({
      values: [
        [
          {a: 'x', extra: 1},
          {a: 'y', extra: 2},
        ],
      ],
      expected: [[{a: 'x'}, {a: 'y'}]],
    }),
  },
  nestedArrays: {
    title: 'array of arrays',
    description: 'Outer and inner arrays are both fresh (containers are never shared, even when the leaves are atomic).',
    clone: () => createCloneExactShape<string[][]>(),
    getTestData: () => ({values: [[['a'], ['b', 'c']]]}),
  },
} satisfies Record<string, CloningCase>;
