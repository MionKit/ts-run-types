// cloning / Objects — plain objects and class instances. Objects always
// rebuild from the declared shape (no key-count gates, no reuse shortcuts —
// measured slower than the rebuild below ~30 props); class instances rebuild
// prototype-preservingly via `Object.create(Object.getPrototypeOf(v))`, so
// `instanceof` and prototype methods survive while own extras drop.

import {expect} from 'vitest';
import {createCloneExactShape} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

interface User {
  name: string;
  address: {street: string; city: string};
}

class Point {
  x = 0;
  y = 0;
  len(): number {
    return Math.hypot(this.x, this.y);
  }
}

function makePoint(x: number, y: number, extra?: boolean): Point {
  const p = new Point();
  p.x = x;
  p.y = y;
  if (extra) (p as unknown as Record<string, unknown>).extra = 'gone';
  return p;
}

export const OBJECTS = {
  flat: {
    title: 'flat object',
    description: 'A flat all-required object rebuilds; undeclared keys are dropped by construction and the input keeps them.',
    clone: () => createCloneExactShape<{a: string; b: number}>(),
    getTestData: () => ({
      values: [
        {a: 'x', b: 1},
        {a: 'y', b: 2, extra: true, more: 'gone'},
      ],
      expected: [
        {a: 'x', b: 1},
        {a: 'y', b: 2},
      ],
    }),
  },
  frozen: {
    title: 'frozen input',
    description: 'A frozen input clones fine — the input is never written, and the clone is a fresh unfrozen object.',
    cloneNotes: 'The removed delete-based strip could never handle frozen inputs (strict-mode TypeError).',
    clone: () => createCloneExactShape<{a: string}>(),
    getTestData: () => ({
      values: [Object.freeze({a: 'x', extra: 1})],
      expected: [{a: 'x'}],
    }),
    verifyClone: (out) => {
      expect(Object.isFrozen(out)).toBe(false);
    },
  },
  optionalAbsent: {
    title: 'absent optional property',
    description: 'An absent optional stays ABSENT on the clone (no `key: undefined` placeholder).',
    clone: () => createCloneExactShape<{a: string; b?: number}>(),
    getTestData: () => ({
      values: [
        {a: 'x', extra: 9},
        {a: 'y', b: 2},
      ],
      expected: [{a: 'x'}, {a: 'y', b: 2}],
    }),
    verifyClone: (out) => {
      if ((out as {a: string}).a === 'x') expect('b' in (out as object)).toBe(false);
    },
  },
  nested: {
    title: 'nested object',
    description: 'Nested objects rebuild with fresh identities at every level; nested extras drop, the input keeps them.',
    clone: () => createCloneExactShape<User>(),
    getTestData: () => ({
      values: [{name: 'jane', address: {street: '10', city: 'sf', extra: true}}],
      expected: [{name: 'jane', address: {street: '10', city: 'sf'}}],
    }),
  },
  classInstance: {
    title: 'class instance',
    description:
      'A plain class instance rebuilds via `Object.create(Object.getPrototypeOf(v))` + declared-prop assigns: `instanceof` holds, prototype methods work, own extras drop, and the constructor never runs.',
    cloneNotes:
      'Methods are not copied as own properties — they ride the shared class prototype, exactly like any two `new Point()` instances.',
    clone: () => createCloneExactShape<Point>(),
    getTestData: () => ({
      values: [makePoint(3, 4, true)],
      expected: [makePoint(3, 4)],
    }),
    verifyClone: (out) => {
      expect(out).toBeInstanceOf(Point);
      expect((out as Point).len()).toBe(5);
      expect('extra' in (out as object)).toBe(false);
    },
  },
} satisfies Record<string, CloningCase>;
