// cloning / Tuples — tuples ride arrays (mutable), so always fresh:
// `.slice()` when every slot is immutable, positional rebuild when a slot
// carries shape. Optional slots preserve `undefined` (no JSON `null`
// placeholder — this is a value-level clone).

import {createCloneExactShape} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

export const TUPLES = {
  atomicSlots: {
    title: 'tuple of atomics',
    description: 'All-immutable slots copy via `.slice()` — fresh array, same values.',
    clone: () => createCloneExactShape<[string, number]>(),
    getTestData: () => ({values: [['x', 1]]}),
  },
  objectSlot: {
    title: 'tuple with an object slot',
    description: 'A shaped slot forces the positional rebuild; the slot clones fresh and its extras drop.',
    clone: () => createCloneExactShape<[string, {a: number}]>(),
    getTestData: () => ({
      values: [['x', {a: 1, extra: 9}]],
      expected: [['x', {a: 1}]],
    }),
  },
} satisfies Record<string, CloningCase>;
