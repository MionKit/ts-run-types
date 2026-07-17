// cloning / Unions — atomic unions dispatch per member (mutable members get
// an instanceof/structural arm; immutable members fall through by value).
// Object-bearing unions are unsupported by design: without runtime arm
// discrimination the emitter cannot know WHICH declared shape to rebuild,
// and a clone that silently kept unknown keys would be a security bug — the
// factory throws at creation (CES001) and the build surfaces the error.

import {createCloneExactShape} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

type Disjoint = {a: string} | {b: number};

export const UNIONS = {
  primitiveMembers: {
    title: 'string | number',
    description: 'Every member is immutable — the union passes through by value.',
    clone: () => createCloneExactShape<string | number>(),
    getTestData: () => ({values: ['hello', 42]}),
    passThrough: true,
  },
  nullableDate: {
    title: 'Date | null',
    description: 'The Date member gets a dispatch arm (fresh instance); `null` falls through by value.',
    clone: () => createCloneExactShape<{at: Date | null}>(),
    getTestData: () => ({
      values: [{at: new Date('2021-05-06T07:08:09.000Z')}, {at: null}],
    }),
  },
  stringOrDate: {
    title: 'string | Date',
    description: 'Mixed union at root: a Date input clones fresh, a string input passes through by value.',
    clone: () => createCloneExactShape<string | Date>(),
    getTestData: () => ({values: [new Date('2021-05-06T07:08:09.000Z'), 'plain']}),
  },
  stringOrArray: {
    title: 'string | string[]',
    description: 'The array member gets an `Array.isArray` arm (fresh array); the string falls through.',
    clone: () => createCloneExactShape<string | string[]>(),
    getTestData: () => ({values: [['a', 'b'], 'solo']}),
  },
  objectBearing: {
    title: 'object-bearing union (unsupported)',
    description: 'Unions with object members throw at factory creation — CES001, the house alwaysThrow convention.',
    cloneNotes:
      'Narrow to one arm before cloning (one factory per arm), or restructure into a single object with optional props.',
    clone: () => createCloneExactShape<Disjoint>(),
    getTestData: () => ({values: []}),
    factoryThrows: true,
  },
} satisfies Record<string, CloningCase>;
