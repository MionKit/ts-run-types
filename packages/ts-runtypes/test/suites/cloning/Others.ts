// cloning / Others — remaining native shapes: RegExp re-compiles (mutable
// via lastIndex, the sticky/global iteration cursor, which the clone
// carries over).

import {expect} from 'vitest';
import {createCloneExactShape} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

function advancedRegExp(): RegExp {
  const re = /ab/g;
  re.exec('abab'); // advance lastIndex to 2
  return re;
}

export const OTHERS = {
  regexp: {
    title: 'RegExp',
    description: 'Re-compiled from source + flags with `lastIndex` carried over — a faithful copy even mid-iteration.',
    clone: () => createCloneExactShape<{re: RegExp}>(),
    getTestData: () => ({values: [{re: advancedRegExp()}]}),
    verifyClone: (out) => {
      const re = (out as {re: RegExp}).re;
      expect(re.source).toBe('ab');
      expect(re.flags).toBe('g');
      expect(re.lastIndex).toBe(2);
    },
  },
  regexpRoot: {
    title: 'RegExp root',
    description: 'A root RegExp clones the same way.',
    clone: () => createCloneExactShape<RegExp>(),
    getTestData: () => ({values: [/xy+z/im]}),
  },
} satisfies Record<string, CloningCase>;
