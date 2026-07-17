// Object-shaped cases: plain objects, optionals, nesting, frozen inputs,
// index signatures (pure and mixed with named props), and class instances
// (prototype-preserving rebuild).

import {it, expect} from 'vitest';
import {createCloneExactShape} from '@ts-runtypes/core';

export function registerObjectCloneCases(): void {
  it('rebuilds a flat object, dropping undeclared keys, input untouched', () => {
    const clone = createCloneExactShape<{a: string; b: number}>();
    const input = {a: 'x', b: 1, extra: true, more: 'gone'};
    const out = clone(input as unknown as {a: string; b: number});
    expect(out).toEqual({a: 'x', b: 1});
    expect(out).not.toBe(input);
    expect(input).toEqual({a: 'x', b: 1, extra: true, more: 'gone'});
  });

  it('works on frozen inputs (a mutating strip never could)', () => {
    const clone = createCloneExactShape<{a: string}>();
    const input = Object.freeze({a: 'x', extra: 1});
    const out = clone(input as unknown as {a: string});
    expect(out).toEqual({a: 'x'});
    expect(Object.isFrozen(out)).toBe(false); // the clone is a plain fresh object
  });

  it('absent optional properties stay absent (no `key: undefined`)', () => {
    const clone = createCloneExactShape<{a: string; b?: number}>();
    const out = clone({a: 'x', extra: 9} as unknown as {a: string; b?: number});
    expect(out).toEqual({a: 'x'});
    expect('b' in out).toBe(false);
  });

  it('rebuilds nested objects with fresh identities at every level', () => {
    interface User {
      name: string;
      address: {street: string; city: string};
    }
    const clone = createCloneExactShape<User>();
    const input = {name: 'jane', address: {street: '10', city: 'sf', extra: true}};
    const out = clone(input as unknown as User);
    expect(out).toEqual({name: 'jane', address: {street: '10', city: 'sf'}});
    expect(out.address).not.toBe(input.address);
    expect((input.address as Record<string, unknown>).extra).toBe(true);
  });

  it('index signature over atomics: fresh object, every declared key copied', () => {
    const clone = createCloneExactShape<{[key: string]: number}>();
    const input = {a: 1, b: 2, anyOther: 3};
    const out = clone(input);
    expect(out).toEqual({a: 1, b: 2, anyOther: 3});
    expect(out).not.toBe(input);
  });

  it('named props + atomic index signature: sig-matched keys are copied, not dropped', () => {
    // Regression: the sig was once filtered as "non-contributing", which made
    // the clone drop every sig-matched key — but those keys ARE declared.
    const clone = createCloneExactShape<{name: string; [key: string]: string}>();
    const input = {name: 'ada', role: 'admin', team: 'core'};
    const out = clone(input);
    expect(out).toEqual({name: 'ada', role: 'admin', team: 'core'});
    expect(out).not.toBe(input);
  });

  it('index signature over objects: copies every key, cloning values', () => {
    const clone = createCloneExactShape<{[key: string]: {a: string}}>();
    const input = {k1: {a: 'x', extra: 1}, k2: {a: 'y'}};
    const out = clone(input as unknown as {[key: string]: {a: string}});
    expect(out).toEqual({k1: {a: 'x'}, k2: {a: 'y'}});
    expect(out).not.toBe(input);
    expect(out.k1).not.toBe(input.k1);
  });

  it('clones a class instance preserving its prototype (instanceof + methods survive)', () => {
    class Point {
      x = 0;
      y = 0;
      len(): number {
        return Math.hypot(this.x, this.y);
      }
    }
    const clone = createCloneExactShape<Point>();
    const input = new Point();
    input.x = 3;
    input.y = 4;
    (input as unknown as Record<string, unknown>).extra = 'gone';
    const out = clone(input);
    expect(out).not.toBe(input);
    expect(out).toBeInstanceOf(Point);
    expect(out.x).toBe(3);
    expect(out.y).toBe(4);
    expect(out.len()).toBe(5); // prototype method works on the clone
    expect('extra' in out).toBe(false); // own extra dropped
    expect((input as unknown as Record<string, unknown>).extra).toBe('gone'); // input untouched
  });
}
