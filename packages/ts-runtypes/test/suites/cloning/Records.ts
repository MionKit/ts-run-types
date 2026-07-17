// cloning / Records — index-signature shapes. Signature-matched keys ARE
// declared shape: the clone copies every one of them onto a fresh object
// (values exact-shape-cloned), whether the signature stands alone or sits
// beside named properties.

import {createCloneExactShape} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

export const RECORDS = {
  atomicValues: {
    title: 'record of atomics',
    description: 'An index signature over atomic values copies every key onto a fresh object.',
    clone: () => createCloneExactShape<{[key: string]: number}>(),
    getTestData: () => ({values: [{a: 1, b: 2, anyOther: 3}]}),
  },
  objectValues: {
    title: 'record of objects',
    description: 'An index signature over object values copies every key, exact-shape-cloning each value (their extras drop).',
    clone: () => createCloneExactShape<{[key: string]: {a: string}}>(),
    getTestData: () => ({
      values: [{k1: {a: 'x', extra: 1}, k2: {a: 'y'}}],
      expected: [{k1: {a: 'x'}, k2: {a: 'y'}}],
    }),
  },
  mixedNamedAndSig: {
    title: 'named props + index signature',
    description: 'Named properties and signature-matched keys are BOTH declared shape — the clone copies both.',
    cloneNotes:
      'Regression guard: an early emit filtered atomic index signatures as "non-contributing", which silently dropped every signature-matched key from the clone.',
    clone: () => createCloneExactShape<{name: string; [key: string]: string}>(),
    getTestData: () => ({values: [{name: 'ada', role: 'admin', team: 'core'}]}),
  },
} satisfies Record<string, CloningCase>;
