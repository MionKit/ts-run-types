// Circular-reference guard — end-to-end through the real vite-plugin pipeline.
// A self-referential type is detected as circular by the Go serializer, which
// links its reflection RunType graph into the guarded fn entries; arming
// `setCircularCheck(true)` then makes the four live-object families detect a
// reference cycle in the VALUE (not the type) before they recurse.
//
// The base validators / encoders are straight-line walkers with no cycle
// protection of their own, so a cyclic value through an UNguarded factory would
// stack-overflow — every cyclic-value assertion here therefore also proves the
// build-time wiring actually reached the runtime (no RunType ⇒ no guard ⇒
// overflow ⇒ a failing test, never a silent pass).

import {afterEach, describe, expect, it} from 'vitest';
import {
  createBinaryEncoder,
  createGetValidationErrors,
  createJsonEncoder,
  createValidate,
  setCircularCheck,
  CircularReferenceError,
} from '@mionjs/ts-go-run-types';

type Node = {name: string; next?: Node};

/** A minimal self-cycle: `a.next === a`. */
function selfCycle(): Node {
  const node = {name: 'a'} as Node & {next?: Node};
  node.next = node;
  return node;
}

// Disarm after every case so the global flag never leaks across tests.
afterEach(() => setCircularCheck(false));

describe('circular-reference guard', () => {
  describe('createValidate', () => {
    it('armed → returns false on a cyclic value instead of recursing forever', () => {
      setCircularCheck(true);
      const isNode = createValidate<Node>();
      expect(isNode(selfCycle())).toBe(false);
    });

    it('armed → still validates acyclic values normally', () => {
      setCircularCheck(true);
      const isNode = createValidate<Node>();
      expect(isNode({name: 'a', next: {name: 'b'}})).toBe(true);
      expect(isNode({name: 42})).toBe(false);
    });

    it('disarmed → acyclic values validate (guard inert)', () => {
      setCircularCheck(false);
      const isNode = createValidate<Node>();
      expect(isNode({name: 'a'})).toBe(true);
    });
  });

  describe('createGetValidationErrors', () => {
    it('armed → records a {expected: "circular"} error on a cyclic value', () => {
      setCircularCheck(true);
      const getErrors = createGetValidationErrors<Node>();
      const errors = getErrors(selfCycle());
      expect(errors.some((error) => error.expected === 'circular')).toBe(true);
    });

    it('armed → returns no errors for a valid acyclic value', () => {
      setCircularCheck(true);
      const getErrors = createGetValidationErrors<Node>();
      expect(getErrors({name: 'a', next: {name: 'b'}})).toEqual([]);
    });
  });

  describe('createJsonEncoder', () => {
    it('armed → throws CircularReferenceError on a cyclic value', () => {
      setCircularCheck(true);
      const encode = createJsonEncoder<Node>();
      expect(() => encode(selfCycle())).toThrow(CircularReferenceError);
    });

    it('armed → the error carries the path to the back-edge', () => {
      setCircularCheck(true);
      const encode = createJsonEncoder<Node>();
      try {
        encode(selfCycle());
        expect.unreachable('expected a CircularReferenceError');
      } catch (error) {
        expect(error).toBeInstanceOf(CircularReferenceError);
        expect((error as CircularReferenceError).path).toContain('next');
      }
    });

    it('armed → encodes an acyclic value normally', () => {
      setCircularCheck(true);
      const encode = createJsonEncoder<Node>();
      const json = encode({name: 'a', next: {name: 'b'}});
      expect(JSON.parse(json as string)).toEqual({name: 'a', next: {name: 'b'}});
    });
  });

  describe('createBinaryEncoder', () => {
    it('armed → throws CircularReferenceError on a cyclic value', () => {
      setCircularCheck(true);
      const encode = createBinaryEncoder<Node>();
      expect(() => encode(selfCycle())).toThrow(CircularReferenceError);
    });
  });

  describe('recursion through containers', () => {
    type Tree = {label: string; children: Tree[]};
    type LinkedList = {value: number; next: LinkedList | undefined};

    it('armed → detects a cycle through an array element', () => {
      setCircularCheck(true);
      const encode = createJsonEncoder<Tree>();
      const root = {label: 'r', children: [] as Tree[]};
      root.children.push(root);
      expect(() => encode(root)).toThrow(CircularReferenceError);
    });

    it('armed → detects a cycle through a union member', () => {
      setCircularCheck(true);
      const isList = createValidate<LinkedList>();
      const head = {value: 1} as LinkedList & {next?: LinkedList};
      head.next = head;
      expect(isList(head)).toBe(false);
    });

    it('armed → a shared-but-acyclic DAG is NOT flagged as a cycle', () => {
      setCircularCheck(true);
      const encode = createJsonEncoder<Tree>();
      const shared = {label: 'shared', children: [] as Tree[]};
      const root = {label: 'root', children: [shared, shared]};
      // `shared` appears twice but the graph is acyclic — must encode, not throw.
      expect(() => encode(root)).not.toThrow();
      expect(JSON.parse(encode(root) as string).children).toHaveLength(2);
    });
  });

  describe('non-circular types', () => {
    // The resolver never links a RunType graph for a type that cannot cycle, so
    // the guard stays completely inert even while armed — no behaviour change.
    type Plain = {id: number; label: string};
    it('armed → a non-circular type validates/encodes unchanged', () => {
      setCircularCheck(true);
      const isPlain = createValidate<Plain>();
      const encode = createJsonEncoder<Plain>();
      expect(isPlain({id: 1, label: 'x'})).toBe(true);
      expect(JSON.parse(encode({id: 1, label: 'x'}) as string)).toEqual({id: 1, label: 'x'});
    });
  });
});
