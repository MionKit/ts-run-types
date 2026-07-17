// Union cases: atomic unions dispatch per member (mutable members get an
// instanceof/structural arm, immutable members fall through by value), and
// object-bearing unions are unsupported by design — the factory throws at
// creation (CES001) instead of emitting a clone that could silently keep
// unknown keys.

import {it, expect} from 'vitest';
import {createCloneExactShape} from '@ts-runtypes/core';

export function registerUnionCloneCases(): void {
  it('primitive unions pass through by value', () => {
    const clone = createCloneExactShape<string | number>();
    expect(clone('hello')).toBe('hello');
    expect(clone(42)).toBe(42);
  });

  it('dispatches the mutable member of Date | null', () => {
    const clone = createCloneExactShape<{at: Date | null}>();
    const at = new Date('2021-05-06T07:08:09.000Z');
    const cloned = clone({at});
    expect(cloned.at).not.toBe(at);
    expect(cloned.at?.getTime()).toBe(at.getTime());
    expect(clone({at: null}).at).toBe(null);
  });

  it('dispatches per member of string | Date', () => {
    const clone = createCloneExactShape<string | Date>();
    const at = new Date('2021-05-06T07:08:09.000Z');
    const out = clone(at);
    expect(out).not.toBe(at);
    expect(out).toBeInstanceOf(Date);
    expect((out as Date).getTime()).toBe(at.getTime());
    expect(clone('plain')).toBe('plain');
  });

  it('dispatches an array member of string | string[]', () => {
    const clone = createCloneExactShape<string | string[]>();
    const arr = ['a', 'b'];
    const out = clone(arr);
    expect(out).not.toBe(arr);
    expect(out).toEqual(['a', 'b']);
    expect(clone('solo')).toBe('solo');
  });

  it('object-bearing unions throw at factory creation (CES001 build stance)', () => {
    type Disjoint = {a: string} | {b: number};
    expect(() => createCloneExactShape<Disjoint>()).toThrow(/CES001/);
  });
}
