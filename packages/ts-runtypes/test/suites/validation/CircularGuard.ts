// Circular-reference GUARD cases for the validation suite. Each recursive TYPE
// is fed a runtime VALUE that contains a reference cycle; with the per-call
// `{rejectCircularRefs: true}` option armed, `createValidate` returns false and
// `createGetValidationErrors` records a `{expected: 'circular'}` entry instead
// of recursing forever. Acyclic controls (DAG, disarmed) prove the guard stays
// inert when there is no real cycle / when not armed.

import {createGetValidationErrors, createValidate} from '@ts-runtypes/core';
import type {CircularGuardValidationCase} from '../../util/circularGuardAsserts.ts';

export const CIRCULAR_GUARD = {
  cycle_object_property: {
    title: 'Cycle through an object property',
    description: 'Self-referential `{name; next?}` with `a.next = a`.',
    validate: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createValidate<Node>(undefined, {rejectCircularRefs: true});
    },
    validateReflect: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      const inference: Node = {name: 'a'};
      return createValidate(inference, {rejectCircularRefs: true});
    },
    getValidationErrors: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createGetValidationErrors<Node>(undefined, {rejectCircularRefs: true});
    },
    getValidationErrorsReflect: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      const inference: Node = {name: 'a'};
      return createGetValidationErrors(inference, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: {name: string; next?: unknown} = {name: 'a'};
      node.next = node;
      return node;
    },
    expectValid: false,
  },

  cycle_array_element: {
    title: 'Cycle through an array element',
    description: 'Recursive `{label; children: Node[]}` with `t.children.push(t)`.',
    validate: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      return createValidate<Node>(undefined, {rejectCircularRefs: true});
    },
    validateReflect: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      const inference: Node = {label: 'a', children: []};
      return createValidate(inference, {rejectCircularRefs: true});
    },
    getValidationErrors: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      return createGetValidationErrors<Node>(undefined, {rejectCircularRefs: true});
    },
    getValidationErrorsReflect: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      const inference: Node = {label: 'a', children: []};
      return createGetValidationErrors(inference, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: {label: string; children: unknown[]} = {label: 'r', children: []};
      node.children.push(node);
      return node;
    },
    expectValid: false,
  },

  cycle_tuple_slot: {
    title: 'Cycle through a tuple slot',
    description: 'Recursive `{head: number; tail?: [Node]}` with `a.tail = [a]`.',
    validate: () => {
      interface Node {
        head: number;
        tail?: [Node];
      }
      return createValidate<Node>(undefined, {rejectCircularRefs: true});
    },
    validateReflect: () => {
      interface Node {
        head: number;
        tail?: [Node];
      }
      const inference: Node = {head: 1};
      return createValidate(inference, {rejectCircularRefs: true});
    },
    getValidationErrors: () => {
      interface Node {
        head: number;
        tail?: [Node];
      }
      return createGetValidationErrors<Node>(undefined, {rejectCircularRefs: true});
    },
    getValidationErrorsReflect: () => {
      interface Node {
        head: number;
        tail?: [Node];
      }
      const inference: Node = {head: 1};
      return createGetValidationErrors(inference, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: {head: number; tail?: unknown[]} = {head: 1};
      node.tail = [node];
      return node;
    },
    expectValid: false,
  },

  cycle_index_signature: {
    title: 'Cycle through an index-signature value',
    description: 'Recursive record `{[key: string]: Node}` with `a.self = a`.',
    validate: () => {
      interface Node {
        [key: string]: Node;
      }
      return createValidate<Node>(undefined, {rejectCircularRefs: true});
    },
    validateReflect: () => {
      interface Node {
        [key: string]: Node;
      }
      const inference: Node = {};
      return createValidate(inference, {rejectCircularRefs: true});
    },
    getValidationErrors: () => {
      interface Node {
        [key: string]: Node;
      }
      return createGetValidationErrors<Node>(undefined, {rejectCircularRefs: true});
    },
    getValidationErrorsReflect: () => {
      interface Node {
        [key: string]: Node;
      }
      const inference: Node = {};
      return createGetValidationErrors(inference, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: Record<string, unknown> = {};
      node.self = node;
      return node;
    },
    expectValid: false,
  },

  cycle_union_member: {
    title: 'Cycle through a union member',
    description: 'Linked list `{value: number; next: Node | null}` with `a.next = a`.',
    validate: () => {
      interface Node {
        value: number;
        next: Node | null;
      }
      return createValidate<Node>(undefined, {rejectCircularRefs: true});
    },
    validateReflect: () => {
      interface Node {
        value: number;
        next: Node | null;
      }
      const inference: Node = {value: 1, next: null};
      return createValidate(inference, {rejectCircularRefs: true});
    },
    getValidationErrors: () => {
      interface Node {
        value: number;
        next: Node | null;
      }
      return createGetValidationErrors<Node>(undefined, {rejectCircularRefs: true});
    },
    getValidationErrorsReflect: () => {
      interface Node {
        value: number;
        next: Node | null;
      }
      const inference: Node = {value: 1, next: null};
      return createGetValidationErrors(inference, {rejectCircularRefs: true});
    },
    getValue: () => {
      const node: {value: number; next: unknown} = {value: 1, next: null};
      node.next = node;
      return node;
    },
    expectValid: false,
  },

  cycle_deeply_nested: {
    title: 'Cycle behind several plain-object levels',
    description: 'Recursive `{name; a: {b: {c?: Node}}}` with `root.a.b.c = root`.',
    validate: () => {
      interface Node {
        name: string;
        a: {b: {c?: Node}};
      }
      return createValidate<Node>(undefined, {rejectCircularRefs: true});
    },
    validateReflect: () => {
      interface Node {
        name: string;
        a: {b: {c?: Node}};
      }
      const inference: Node = {name: 'r', a: {b: {}}};
      return createValidate(inference, {rejectCircularRefs: true});
    },
    getValidationErrors: () => {
      interface Node {
        name: string;
        a: {b: {c?: Node}};
      }
      return createGetValidationErrors<Node>(undefined, {rejectCircularRefs: true});
    },
    getValidationErrorsReflect: () => {
      interface Node {
        name: string;
        a: {b: {c?: Node}};
      }
      const inference: Node = {name: 'r', a: {b: {}}};
      return createGetValidationErrors(inference, {rejectCircularRefs: true});
    },
    getValue: () => {
      const root: {name: string; a: {b: {c?: unknown}}} = {name: 'r', a: {b: {}}};
      root.a.b.c = root;
      return root;
    },
    expectValid: false,
  },

  cycle_under_noncircular_root: {
    title: 'Cycle in a child under a non-circular root',
    description: 'Non-recursive `{id; node?: Recursive}` whose `Recursive` child cycles.',
    validate: () => {
      interface Recursive {
        name: string;
        next?: Recursive;
      }
      interface Wrapper {
        id: number;
        node?: Recursive;
      }
      return createValidate<Wrapper>(undefined, {rejectCircularRefs: true});
    },
    validateReflect: () => {
      interface Recursive {
        name: string;
        next?: Recursive;
      }
      interface Wrapper {
        id: number;
        node?: Recursive;
      }
      const inference: Wrapper = {id: 1};
      return createValidate(inference, {rejectCircularRefs: true});
    },
    getValidationErrors: () => {
      interface Recursive {
        name: string;
        next?: Recursive;
      }
      interface Wrapper {
        id: number;
        node?: Recursive;
      }
      return createGetValidationErrors<Wrapper>(undefined, {rejectCircularRefs: true});
    },
    getValidationErrorsReflect: () => {
      interface Recursive {
        name: string;
        next?: Recursive;
      }
      interface Wrapper {
        id: number;
        node?: Recursive;
      }
      const inference: Wrapper = {id: 1};
      return createGetValidationErrors(inference, {rejectCircularRefs: true});
    },
    getValue: () => {
      const child: {name: string; next?: unknown} = {name: 'x'};
      child.next = child;
      return {id: 1, node: child};
    },
    expectValid: false,
  },

  cycle_mutual: {
    title: 'Mutual cycle across two types',
    description: 'Cross-referential `A{name; b?: B}` / `B{tag; a?: A}` with `a.b = b; b.a = a`.',
    validate: () => {
      interface A {
        name: string;
        b?: B;
      }
      interface B {
        tag: string;
        a?: A;
      }
      return createValidate<A>(undefined, {rejectCircularRefs: true});
    },
    validateReflect: () => {
      interface A {
        name: string;
        b?: B;
      }
      interface B {
        tag: string;
        a?: A;
      }
      const inference: A = {name: 'a'};
      return createValidate(inference, {rejectCircularRefs: true});
    },
    getValidationErrors: () => {
      interface A {
        name: string;
        b?: B;
      }
      interface B {
        tag: string;
        a?: A;
      }
      return createGetValidationErrors<A>(undefined, {rejectCircularRefs: true});
    },
    getValidationErrorsReflect: () => {
      interface A {
        name: string;
        b?: B;
      }
      interface B {
        tag: string;
        a?: A;
      }
      const inference: A = {name: 'a'};
      return createGetValidationErrors(inference, {rejectCircularRefs: true});
    },
    getValue: () => {
      const a: {name: string; b?: unknown} = {name: 'a'};
      const b: {tag: string; a?: unknown} = {tag: 'b'};
      a.b = b;
      b.a = a;
      return a;
    },
    expectValid: false,
  },

  dag_shared_acyclic: {
    title: 'Shared-but-acyclic DAG is not a cycle',
    description: 'A node reachable by two paths but never on its own descent stack — must validate.',
    validate: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      return createValidate<Node>(undefined, {rejectCircularRefs: true});
    },
    validateReflect: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      const inference: Node = {label: 'a', children: []};
      return createValidate(inference, {rejectCircularRefs: true});
    },
    getValidationErrors: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      return createGetValidationErrors<Node>(undefined, {rejectCircularRefs: true});
    },
    getValidationErrorsReflect: () => {
      interface Node {
        label: string;
        children: Node[];
      }
      const inference: Node = {label: 'a', children: []};
      return createGetValidationErrors(inference, {rejectCircularRefs: true});
    },
    getValue: () => {
      const shared = {label: 'shared', children: [] as unknown[]};
      return {label: 'root', children: [shared, shared]};
    },
    expectValid: true,
  },

  dag_multi_level_shared: {
    title: 'Deep diamond DAG (shared, multi-level) is not a cycle',
    description:
      'Each level references the same child twice (`a === b`); acyclic, so the guard must pass. Pins the fully-explored memo — without it the guard re-walks each shared subtree per path (exponential).',
    validate: () => {
      interface Node {
        name: string;
        a?: Node;
        b?: Node;
      }
      return createValidate<Node>(undefined, {rejectCircularRefs: true});
    },
    validateReflect: () => {
      interface Node {
        name: string;
        a?: Node;
        b?: Node;
      }
      const inference: Node = {name: 'a'};
      return createValidate(inference, {rejectCircularRefs: true});
    },
    getValidationErrors: () => {
      interface Node {
        name: string;
        a?: Node;
        b?: Node;
      }
      return createGetValidationErrors<Node>(undefined, {rejectCircularRefs: true});
    },
    getValidationErrorsReflect: () => {
      interface Node {
        name: string;
        a?: Node;
        b?: Node;
      }
      const inference: Node = {name: 'a'};
      return createGetValidationErrors(inference, {rejectCircularRefs: true});
    },
    getValue: () => {
      // A diamond DAG: every node's `a` and `b` point at the SAME next node, so
      // the guard reaches each node by 2^depth paths. Kept shallow (the emitted
      // validator that runs after the guard also re-walks shared subtrees).
      let head: {name: string; a?: unknown; b?: unknown} = {name: 'leaf'};
      for (let i = 0; i < 5; i++) head = {name: 'n' + i, a: head, b: head};
      return head;
    },
    expectValid: true,
  },

  disarmed_acyclic: {
    title: 'Disarmed guard leaves acyclic validation unchanged',
    description: 'No `{rejectCircularRefs}` — a normal acyclic value validates exactly as without the feature.',
    validate: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createValidate<Node>();
    },
    validateReflect: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      const inference: Node = {name: 'a'};
      return createValidate(inference);
    },
    getValidationErrors: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      return createGetValidationErrors<Node>();
    },
    getValidationErrorsReflect: () => {
      interface Node {
        name: string;
        next?: Node;
      }
      const inference: Node = {name: 'a'};
      return createGetValidationErrors(inference);
    },
    getValue: () => ({name: 'a', next: {name: 'b'}}),
    expectValid: true,
  },
} as const satisfies Record<string, CircularGuardValidationCase>;
