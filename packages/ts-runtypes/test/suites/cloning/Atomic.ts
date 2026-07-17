// Atomic + opaque cases — the two documented pass-through categories of the
// cloneExactShape isolation contract. Primitives compare by value (a "fresh"
// primitive is meaningless — `'a' !== 'a'` cannot be made true), and opaque
// values the type system gives no shape for cannot be rebuilt (copying a
// resource handle would be wrong, not just slow).

import {it, expect} from 'vitest';
import {createCloneExactShape} from '@ts-runtypes/core';

enum Color {
  Red = 'red',
  Blue = 'blue',
}

export function registerAtomicCloneCases(): void {
  it('primitives pass through by value', () => {
    expect(createCloneExactShape<string>()('hello')).toBe('hello');
    expect(createCloneExactShape<number>()(42)).toBe(42);
    expect(createCloneExactShape<boolean>()(true)).toBe(true);
    expect(createCloneExactShape<bigint>()(7n)).toBe(7n);
    expect(createCloneExactShape<null>()(null)).toBe(null);
  });

  it('literal and enum types pass through by value', () => {
    expect(createCloneExactShape<'on'>()('on')).toBe('on');
    expect(createCloneExactShape<Color>()(Color.Red)).toBe(Color.Red);
  });

  it('opaque values pass through by reference (functions have no declared shape)', () => {
    const fn = () => 1;
    expect(createCloneExactShape<() => number>()(fn)).toBe(fn);
  });

  it('unshaped values pass through by reference (unknown gives the emitter nothing to rebuild)', () => {
    const clone = createCloneExactShape<unknown>();
    const value = {anything: 1};
    expect(clone(value)).toBe(value);
  });
}
