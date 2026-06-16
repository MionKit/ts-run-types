// Circular-reference GUARD cases for the format-validation suite. The guard
// keys on container kinds, not branded leaves, so a recursive type carrying a
// formatted leaf (a uuid string) behaves exactly like the plain validation
// cases — proving the guard is format-agnostic. Minimal coverage: one cyclic
// case + one acyclic DAG control.

import {createGetValidationErrors, createValidate} from '@mionjs/ts-go-run-types';
import '@mionjs/ts-go-run-types/formats';
import type {FormatUUIDv4} from '@mionjs/ts-go-run-types/formats';
import type {CircularGuardValidationCase} from '../../util/circularGuardAsserts.ts';

const UUID_V4 = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

export const CIRCULAR_GUARD = {
  cycle_with_format_leaf: {
    title: 'Cycle through an object carrying a uuid leaf',
    validate: () => {
      interface Node {
        id: FormatUUIDv4;
        next?: Node;
      }
      return createValidate<Node>(undefined, {checkCircular: true});
    },
    validateReflect: () => {
      interface Node {
        id: FormatUUIDv4;
        next?: Node;
      }
      const inference: Node = {id: UUID_V4};
      return createValidate(inference, {checkCircular: true});
    },
    getValidationErrors: () => {
      interface Node {
        id: FormatUUIDv4;
        next?: Node;
      }
      return createGetValidationErrors<Node>(undefined, {checkCircular: true});
    },
    getValidationErrorsReflect: () => {
      interface Node {
        id: FormatUUIDv4;
        next?: Node;
      }
      const inference: Node = {id: UUID_V4};
      return createGetValidationErrors(inference, {checkCircular: true});
    },
    getValue: () => {
      const node: {id: string; next?: unknown} = {id: UUID_V4};
      node.next = node;
      return node;
    },
    expectValid: false,
  },

  dag_with_format_leaf: {
    title: 'Shared-but-acyclic DAG with uuid leaves validates',
    validate: () => {
      interface Node {
        id: FormatUUIDv4;
        children: Node[];
      }
      return createValidate<Node>(undefined, {checkCircular: true});
    },
    validateReflect: () => {
      interface Node {
        id: FormatUUIDv4;
        children: Node[];
      }
      const inference: Node = {id: UUID_V4, children: []};
      return createValidate(inference, {checkCircular: true});
    },
    getValidationErrors: () => {
      interface Node {
        id: FormatUUIDv4;
        children: Node[];
      }
      return createGetValidationErrors<Node>(undefined, {checkCircular: true});
    },
    getValidationErrorsReflect: () => {
      interface Node {
        id: FormatUUIDv4;
        children: Node[];
      }
      const inference: Node = {id: UUID_V4, children: []};
      return createGetValidationErrors(inference, {checkCircular: true});
    },
    getValue: () => {
      const shared = {id: UUID_V4, children: [] as unknown[]};
      return {id: UUID_V4, children: [shared, shared]};
    },
    expectValid: true,
  },
} as const satisfies Record<string, CircularGuardValidationCase>;
