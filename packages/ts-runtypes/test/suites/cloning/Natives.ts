// Native object cases: Date, RegExp, and Temporal — every object-typed value
// comes back fresh (`clone(x) !== x`), including immutable Temporal instances
// (identity freshness wins over the saved allocation; test code relies on
// `expect(a).not.toBe(b)` distinctions). Temporal cases self-skip on runtimes
// without `globalThis.Temporal` (the repo targets Node >= 26).

import {it, expect} from 'vitest';
import {createCloneExactShape} from '@ts-runtypes/core';

const hasTemporal = typeof (globalThis as {Temporal?: unknown}).Temporal !== 'undefined';

export function registerNativeCloneCases(): void {
  it('re-wraps a Date property (fresh instance, same instant, isolated)', () => {
    const clone = createCloneExactShape<{at: Date; note: string}>();
    const at = new Date('2021-05-06T07:08:09.000Z');
    const out = clone({at, note: 'n', extra: 1} as unknown as {at: Date; note: string});
    expect(out).toEqual({at, note: 'n'});
    expect(out.at).not.toBe(at);
    expect(out.at.getTime()).toBe(at.getTime());
    out.at.setTime(0);
    expect(at.getTime()).not.toBe(0);
  });

  it('clones a root Date', () => {
    const clone = createCloneExactShape<Date>();
    const at = new Date('2021-05-06T07:08:09.000Z');
    const out = clone(at);
    expect(out).not.toBe(at);
    expect(out).toBeInstanceOf(Date);
    expect(out.getTime()).toBe(at.getTime());
  });

  it('clones a RegExp preserving flags and lastIndex', () => {
    const clone = createCloneExactShape<{re: RegExp}>();
    const re = /ab/g;
    re.exec('abab'); // advance lastIndex to 2
    const out = clone({re});
    expect(out.re).not.toBe(re);
    expect(out.re.source).toBe('ab');
    expect(out.re.flags).toBe('g');
    expect(out.re.lastIndex).toBe(2);
  });

  it.skipIf(!hasTemporal)('re-materializes Temporal instances (fresh identity, same value)', () => {
    type Stamped = {at: Temporal.Instant; day: Temporal.PlainDate};
    const clone = createCloneExactShape<Stamped>();
    const at = Temporal.Instant.from('2021-05-06T07:08:09Z');
    const day = Temporal.PlainDate.from('2021-05-06');
    const out = clone({at, day, extra: 1} as unknown as Stamped);
    expect(out.at).not.toBe(at);
    expect(out.at.toString()).toBe(at.toString());
    expect(out.day).not.toBe(day);
    expect(out.day.toString()).toBe(day.toString());
  });

  it.skipIf(!hasTemporal)('clones a root Temporal value', () => {
    const clone = createCloneExactShape<Temporal.PlainDate>();
    const day = Temporal.PlainDate.from('2021-05-06');
    const out = clone(day);
    expect(out).not.toBe(day);
    expect(out.toString()).toBe(day.toString());
  });
}
