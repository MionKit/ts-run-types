// cloning / Atomic — the pass-through categories of the isolation contract.
// Primitives compare by value (a "fresh" primitive is meaningless — `'a' !==
// 'a'` cannot be made true), and opaque values the type system gives no
// shape for cannot be rebuilt (copying a resource handle would be wrong, not
// just slow — `overrideCloneExactShape<T>()` is the escape hatch).

import {createCloneExactShape} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

enum Color {
  Red = 'red',
  Blue = 'blue',
}

// Module-level const so both getTestData() calls return the SAME reference
// (functions pass through by reference; a per-call closure would break the
// untouched-twin comparison).
const opaqueFn = () => 1;

export const ATOMIC = {
  string: {
    title: 'string',
    description: 'Root `string` passes through by value — primitives have no identity to refresh.',
    cloneNotes: 'Primitives compare by value; `clone(x) === x` is the correct and only possible result.',
    clone: () => createCloneExactShape<string>(),
    getTestData: () => ({values: ['hello', '', '你好', '🌍🚀✨']}),
    passThrough: true,
  },
  number: {
    title: 'number',
    description: 'Root `number` passes through by value.',
    clone: () => createCloneExactShape<number>(),
    getTestData: () => ({values: [0, -1, 1.5, Number.MAX_SAFE_INTEGER]}),
    passThrough: true,
  },
  boolean: {
    title: 'boolean',
    description: 'Root `boolean` passes through by value.',
    clone: () => createCloneExactShape<boolean>(),
    getTestData: () => ({values: [true, false]}),
    passThrough: true,
  },
  bigint: {
    title: 'bigint',
    description: 'Root `bigint` passes through by value (no JSON-style string projection — this is a value-level clone).',
    clone: () => createCloneExactShape<bigint>(),
    getTestData: () => ({values: [0n, 123456789012345678901234567890n]}),
    passThrough: true,
  },
  null: {
    title: 'null',
    description: 'Root `null` passes through.',
    clone: () => createCloneExactShape<null>(),
    getTestData: () => ({values: [null]}),
    passThrough: true,
  },
  stringLiteral: {
    title: 'string literal',
    description: 'A literal type passes through by value.',
    clone: () => createCloneExactShape<'on'>(),
    getTestData: () => ({values: ['on']}),
    passThrough: true,
  },
  enum: {
    title: 'enum',
    description: 'Enum values are primitives at runtime and pass through by value.',
    clone: () => createCloneExactShape<Color>(),
    getTestData: () => ({values: [Color.Red, Color.Blue]}),
    passThrough: true,
  },
  function: {
    title: 'function (opaque)',
    description: 'A function-typed root passes through by reference — functions have no declared data shape to rebuild.',
    cloneNotes: 'Opaque pass-through: copying a function (or any resource handle) would be wrong, not just slow.',
    clone: () => createCloneExactShape<() => number>(),
    getTestData: () => ({values: [opaqueFn]}),
    passThrough: true,
  },
  unknown: {
    title: 'unknown (unshaped)',
    description: '`unknown` gives the emitter no declared shape — the value passes through by reference.',
    clone: () => createCloneExactShape<unknown>(),
    getTestData: () => ({values: [{anything: 1}]}),
    passThrough: true,
  },
} satisfies Record<string, CloningCase>;
