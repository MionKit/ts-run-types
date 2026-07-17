// cloning / Iterables — Map and Set are mutable containers and are ALWAYS
// fresh instances: `new Map(v)` / `new Set(v)` when the entries are
// immutable, per-entry exact-shape clones when they have shape.

import {createCloneExactShape} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

interface Row {
  id: number;
  tags: string[];
}

export const ITERABLES = {
  mapAtomic: {
    title: 'Map of atomics',
    description: 'Immutable entries make the constructor copy (`new Map(v)`) a complete deep clone.',
    clone: () => createCloneExactShape<Map<string, number>>(),
    getTestData: () => ({values: [new Map([['k', 1]]), new Map()]}),
  },
  mapObjectValues: {
    title: 'Map with object values',
    description: 'Shaped values rebuild per entry with fresh identities; value extras drop.',
    clone: () => createCloneExactShape<Map<string, {a: string}>>(),
    getTestData: () => ({
      values: [new Map([['k1', {a: 'x', extra: 'gone'} as {a: string}]])],
      expected: [new Map([['k1', {a: 'x'}]])],
    }),
  },
  setAtomic: {
    title: 'Set of atomics',
    description: 'Immutable items make the constructor copy (`new Set(v)`) a complete deep clone.',
    clone: () => createCloneExactShape<Set<string>>(),
    getTestData: () => ({values: [new Set(['a', 'b'])]}),
  },
  setObjects: {
    title: 'Set of objects',
    description: 'Shaped items rebuild per element with fresh identities; item extras drop.',
    clone: () => createCloneExactShape<Set<{a: string}>>(),
    getTestData: () => ({
      values: [new Set([{a: 'x', extra: 'gone'} as {a: string}])],
      expected: [new Set([{a: 'x'}])],
    }),
  },
  deepComposition: {
    title: 'Map of object arrays',
    description: 'Containers compose: the Map, each array, each row, and each row array are all fresh; row extras drop.',
    clone: () => createCloneExactShape<Map<string, Row[]>>(),
    getTestData: () => ({
      values: [new Map([['r', [{id: 1, tags: ['a'], extra: true} as unknown as Row]]])],
      expected: [new Map([['r', [{id: 1, tags: ['a']}]]])],
    }),
  },
} satisfies Record<string, CloningCase>;
