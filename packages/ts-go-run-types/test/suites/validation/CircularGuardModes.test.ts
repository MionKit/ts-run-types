// validation / CircularGuard modes — the cross-cutting arming behaviour the
// per-vector CircularGuard cases don't cover: the global `setCircularCheck`
// toggle, the per-call `{rejectCircularRefs:false}` opt-out overriding an armed
// global, and the no-op on a non-circular type while armed. The per-vector
// cases (CircularGuard.ts) all arm per-call; these pin the global flag and the
// override precedence. afterEach disarms so the global flag never leaks.
import {afterEach, describe, expect, it} from 'vitest';
import {createValidate, setCircularCheck} from '@mionjs/ts-go-run-types';

interface Node {
  name: string;
  next?: Node;
}

function selfCycle(): Node {
  const node = {name: 'a'} as Node & {next?: Node};
  node.next = node;
  return node;
}

afterEach(() => setCircularCheck(false));

describe('validation / CircularGuard modes', () => {
  it('global setCircularCheck(true) arms the guard without a per-call option', () => {
    setCircularCheck(true);
    const isNode = createValidate<Node>();
    expect(isNode(selfCycle())).toBe(false);
    expect(isNode({name: 'a', next: {name: 'b'}})).toBe(true);
  });

  it('disarmed by default — per-call {rejectCircularRefs:true} still arms', () => {
    const isNode = createValidate<Node>(undefined, {rejectCircularRefs: true});
    expect(isNode(selfCycle())).toBe(false);
  });

  it('per-call {rejectCircularRefs:false} overrides an armed global', () => {
    setCircularCheck(true);
    const isNode = createValidate<Node>(undefined, {rejectCircularRefs: false});
    // Guard disabled for this validator → an acyclic value validates as usual.
    // (A cyclic value would overflow, exactly as an unguarded validator does.)
    expect(isNode({name: 'a', next: {name: 'b'}})).toBe(true);
  });

  it('armed global is a no-op for a non-circular type', () => {
    setCircularCheck(true);
    interface Plain {
      id: number;
      label: string;
    }
    const isPlain = createValidate<Plain>();
    expect(isPlain({id: 1, label: 'x'})).toBe(true);
    expect(isPlain({id: 'no', label: 'x'})).toBe(false);
  });
});
