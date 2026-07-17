// Container cases: arrays, tuples, Map, Set — always fresh instances
// (mutable containers are never shared), with per-element clones wherever the
// element type has shape and cheap constructor/slice copies where it is
// immutable.

import {it, expect} from 'vitest';
import {createCloneExactShape} from '@ts-runtypes/core';

export function registerContainerCloneCases(): void {
  it('arrays of atomics copy into a fresh array', () => {
    const clone = createCloneExactShape<string[]>();
    const input = ['a', 'b'];
    const out = clone(input);
    expect(out).toEqual(['a', 'b']);
    expect(out).not.toBe(input);
  });

  it('arrays of objects rebuild element-wise with fresh elements', () => {
    const clone = createCloneExactShape<Array<{a: string}>>();
    const input = [
      {a: 'x', extra: 1},
      {a: 'y', extra: 2},
    ];
    const out = clone(input as unknown as Array<{a: string}>);
    expect(out).toEqual([{a: 'x'}, {a: 'y'}]);
    expect(out[0]).not.toBe(input[0]);
    expect(input[0]).toEqual({a: 'x', extra: 1});
  });

  it('tuples of atomics copy into a fresh array', () => {
    const clone = createCloneExactShape<[string, number]>();
    const input: [string, number] = ['x', 1];
    const out = clone(input);
    expect(out).toEqual(['x', 1]);
    expect(out).not.toBe(input);
  });

  it('tuples with object slots rebuild positionally, cloning the slot', () => {
    const clone = createCloneExactShape<[string, {a: number}]>();
    const inner = {a: 1, extra: 9};
    const out = clone(['x', inner] as unknown as [string, {a: number}]);
    expect(out).toEqual(['x', {a: 1}]);
    expect(out[1]).not.toBe(inner);
    expect(inner).toEqual({a: 1, extra: 9});
  });

  it('Map of atomics copies into a fresh Map', () => {
    const clone = createCloneExactShape<Map<string, number>>();
    const input = new Map([['k', 1]]);
    const out = clone(input);
    expect(out).not.toBe(input);
    expect(out).toBeInstanceOf(Map);
    expect([...out.entries()]).toEqual([['k', 1]]);
  });

  it('Map with object values rebuilds per entry with fresh values', () => {
    const clone = createCloneExactShape<Map<string, {a: string}>>();
    const inner = {a: 'x', extra: 'gone'};
    const input = new Map<string, unknown>([['k1', inner]]);
    const out = clone(input as Map<string, {a: string}>);
    expect(out).not.toBe(input);
    expect(out.get('k1')).toEqual({a: 'x'});
    expect(out.get('k1')).not.toBe(inner);
    expect(inner).toEqual({a: 'x', extra: 'gone'});
  });

  it('Set of atomics copies into a fresh Set', () => {
    const clone = createCloneExactShape<Set<string>>();
    const input = new Set(['a', 'b']);
    const out = clone(input);
    expect(out).not.toBe(input);
    expect(out).toBeInstanceOf(Set);
    expect([...out]).toEqual(['a', 'b']);
  });

  it('Set of objects rebuilds per element with fresh elements', () => {
    const clone = createCloneExactShape<Set<{a: string}>>();
    const inner = {a: 'x', extra: 'gone'};
    const input = new Set([inner]) as unknown as Set<{a: string}>;
    const out = clone(input);
    expect(out).not.toBe(input);
    expect([...out][0]).toEqual({a: 'x'});
    expect([...out][0]).not.toBe(inner);
    expect(inner).toEqual({a: 'x', extra: 'gone'});
  });

  it('composes through deep container nesting', () => {
    interface Row {
      id: number;
      tags: string[];
    }
    const clone = createCloneExactShape<Map<string, Row[]>>();
    const row = {id: 1, tags: ['a'], extra: true};
    const input = new Map<string, unknown>([['r', [row]]]);
    const out = clone(input as Map<string, Row[]>);
    const outRows = out.get('r');
    expect(outRows).toEqual([{id: 1, tags: ['a']}]);
    expect(outRows).not.toBe(input.get('r'));
    expect(outRows?.[0]).not.toBe(row);
    expect(outRows?.[0].tags).not.toBe(row.tags);
  });
}
