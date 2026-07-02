// Circular-reference GUARD cases for the serialization suite. Each recursive
// TYPE is fed a runtime VALUE containing a reference cycle; with the per-call
// `{rejectCircularRefs: true}` option armed, `createJsonEncoder` / `createBinaryEncoder`
// throw `CircularReferenceError` before recursing forever (matching
// JSON.stringify). Acyclic controls (DAG, disarmed) encode without throwing.

import {createBinaryEncoder, createJsonEncoder} from 'ts-runtypes';
import type {CircularGuardSerializationCase} from '../../util/circularGuardAsserts.ts';

export const CIRCULAR_GUARD = {
  cycle_object_property: {
    title: 'Cycle through an object property',
    jsonEncoder: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createJsonEncoder<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createBinaryEncoder<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: {name: string; next?: unknown} = {name: 'a'};
      node.next = node;
      return node;
    },
    expectThrows: true,
  },

  cycle_array_element: {
    title: 'Cycle through an array element',
    jsonEncoder: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      return createJsonEncoder<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      return createBinaryEncoder<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: {label: string; children: unknown[]} = {label: 'r', children: []};
      node.children.push(node);
      return node;
    },
    expectThrows: true,
  },

  cycle_tuple_slot: {
    title: 'Cycle through a tuple slot',
    jsonEncoder: () => {
      interface Node {
        head: number;
        tail?: [Node];
      }
      return createJsonEncoder<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        head: number;
        tail?: [Node];
      }
      return createBinaryEncoder<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: {head: number; tail?: unknown[]} = {head: 1};
      node.tail = [node];
      return node;
    },
    expectThrows: true,
  },

  cycle_index_signature: {
    title: 'Cycle through an index-signature value',
    jsonEncoder: () => {
      interface Node {
        [key: string]: Node;
      }
      return createJsonEncoder<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        [key: string]: Node;
      }
      return createBinaryEncoder<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: Record<string, unknown> = {};
      node.self = node;
      return node;
    },
    expectThrows: true,
  },

  cycle_union_member: {
    title: 'Cycle through a union member',
    jsonEncoder: () => {
      interface Node {
        value: number;
        next: Node | null;
      }
      return createJsonEncoder<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        value: number;
        next: Node | null;
      }
      return createBinaryEncoder<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: {value: number; next: unknown} = {value: 1, next: null};
      node.next = node;
      return node;
    },
    expectThrows: true,
  },

  cycle_deeply_nested: {
    title: 'Cycle behind several plain-object levels',
    jsonEncoder: () => {
      interface Node {
        name: string;
        a: {b: {c?: Node}};
      }
      return createJsonEncoder<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        name: string;
        a: {b: {c?: Node}};
      }
      return createBinaryEncoder<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const root: {name: string; a: {b: {c?: unknown}}} = {name: 'r', a: {b: {}}};
      root.a.b.c = root;
      return root;
    },
    expectThrows: true,
  },

  cycle_under_noncircular_root: {
    title: 'Cycle in a child under a non-circular root',
    jsonEncoder: () => {
      interface Recursive {
        name: string;
        next?: Recursive;
      }
      interface Wrapper {
        id: number;
        node?: Recursive;
      }
      return createJsonEncoder<Wrapper>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Recursive {
        name: string;
        next?: Recursive;
      }
      interface Wrapper {
        id: number;
        node?: Recursive;
      }
      return createBinaryEncoder<Wrapper>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const child: {name: string; next?: unknown} = {name: 'x'};
      child.next = child;
      return {id: 1, node: child};
    },
    expectThrows: true,
  },

  cycle_collapsed_noop_composite: {
    title: 'Cycle caught on a collapsed (noop short-form) mutate encoder',
    description:
      'A fully JSON-compatible circular TYPE is pj-noop (the cycle-as-identity ' +
      'fixpoint), so the jeMU composite ships as the noop short-form tuple and the ' +
      'runtime fn is native JSON.stringify. The armed guard must still wrap it — ' +
      'the short-form entry carries the runtype bundle SoftDep — and throw ' +
      'CircularReferenceError, NOT the native TypeError a bare JSON.stringify ' +
      'would raise on the cyclic value.',
    jsonEncoder: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createJsonEncoder<Node>(undefined, {strategy: 'mutate', rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createBinaryEncoder<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: {name: string; next?: unknown} = {name: 'a'};
      node.next = node;
      return node;
    },
    expectThrows: true,
  },

  cycle_mutual: {
    title: 'Mutual cycle across two types',
    jsonEncoder: () => {
      interface A {
        name: string;
        b?: B;
      }
      interface B {
        tag: string;
        a?: A;
      }
      return createJsonEncoder<A>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface A {
        name: string;
        b?: B;
      }
      interface B {
        tag: string;
        a?: A;
      }
      return createBinaryEncoder<A>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const a: {name: string; b?: unknown} = {name: 'a'};
      const b: {tag: string; a?: unknown} = {tag: 'b'};
      a.b = b;
      b.a = a;
      return a;
    },
    expectThrows: true,
  },

  dag_shared_acyclic: {
    title: 'Shared-but-acyclic DAG encodes without throwing',
    jsonEncoder: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      return createJsonEncoder<Node>(undefined, {rejectCircularRefs: true});
    },
    binaryEncoder: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      return createBinaryEncoder<Node>(undefined, {rejectCircularRefs: true});
    },
    getValue: () => {
      const shared = {label: 'shared', children: [] as unknown[]};
      return {label: 'root', children: [shared, shared]};
    },
    expectThrows: false,
  },

  disarmed_acyclic: {
    title: 'Disarmed guard leaves acyclic encoding unchanged',
    jsonEncoder: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createJsonEncoder<Node>();
    },
    binaryEncoder: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createBinaryEncoder<Node>();
    },
    getValue: () => ({name: 'a', next: {name: 'b'}}),
    expectThrows: false,
  },
} as const satisfies Record<string, CircularGuardSerializationCase>;
