// End-to-end isolation + flow cases: mutate EVERY mutable position of the
// clone and assert the input never observes it, and the intended
// validate-then-clone pipeline.

import {it, expect} from 'vitest';
import {createCloneExactShape, createValidate} from '@ts-runtypes/core';

interface Payload {
  id: number;
  nested: {tag: string; when: Date};
  tags: string[];
  index: Map<string, number>;
}

export function registerIsolationCloneCases(): void {
  it('mutating the clone never touches the input, at any depth', () => {
    const clone = createCloneExactShape<Payload>();
    const input: Payload = {
      id: 1,
      nested: {tag: 't', when: new Date('2021-05-06T07:08:09.000Z')},
      tags: ['a'],
      index: new Map([['k', 1]]),
    };
    const snapshot = {
      tag: input.nested.tag,
      when: input.nested.when.getTime(),
      tags: [...input.tags],
      index: [...input.index.entries()],
    };

    const out = clone(input);
    out.id = 99;
    out.nested.tag = 'mutated';
    out.nested.when.setTime(0);
    out.tags.push('b');
    out.index.set('k2', 2);

    expect(input.id).toBe(1);
    expect(input.nested.tag).toBe(snapshot.tag);
    expect(input.nested.when.getTime()).toBe(snapshot.when);
    expect(input.tags).toEqual(snapshot.tags);
    expect([...input.index.entries()]).toEqual(snapshot.index);
  });

  it('every object-typed position of the clone is a fresh identity', () => {
    const clone = createCloneExactShape<Payload>();
    const input: Payload = {
      id: 1,
      nested: {tag: 't', when: new Date('2021-05-06T07:08:09.000Z')},
      tags: ['a'],
      index: new Map([['k', 1]]),
    };
    const out = clone(input);
    expect(out).not.toBe(input);
    expect(out.nested).not.toBe(input.nested);
    expect(out.nested.when).not.toBe(input.nested.when);
    expect(out.tags).not.toBe(input.tags);
    expect(out.index).not.toBe(input.index);
  });

  it('composes with validate for the parseSafe flow', () => {
    const validate = createValidate<Payload>();
    const clone = createCloneExactShape<Payload>();
    const parseSafe = (v: unknown): Payload => {
      if (!validate(v)) throw new Error('wrong type');
      return clone(v as Payload);
    };
    const dirty = {
      id: 1,
      nested: {tag: 't', when: new Date(0), extra: 1},
      tags: ['a'],
      index: new Map([['k', 1]]),
      evil: true,
    };
    const out = parseSafe(dirty);
    expect(out).toEqual({
      id: 1,
      nested: {tag: 't', when: new Date(0)},
      tags: ['a'],
      index: new Map([['k', 1]]),
    });
    expect('evil' in out).toBe(false);
    expect(() => parseSafe({id: 'nope'})).toThrow();
  });
}
