import type {FriendlyType, MockData} from 'ts-runtypes';
import type {EnrichmentCase} from './types.ts';

// Self-referential / circular kinds. The emitter's per-node `seen` guard breaks
// the cycle: the recursion point (the back-edge to an already-walked object)
// degrades to a leaf node. Mirrors the validation suite's CIRCULAR range.
export const CIRCULAR = {
  selfReference: {
    title: 'Self-referential object',
    case: () => {
      // ##### src #####
      interface Circular {
        value: string;
        next: Circular | null;
      }
      type Target = Circular;
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: '', value: {$label: ''}, next: {$label: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {value: {pool: []}, next: {pool: []}};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  deepCircular: {
    title: 'Deeply nested circular object',
    case: () => {
      // ##### src #####
      interface CircularDeep {
        a: {b: {c: CircularDeep | null}};
        name: string;
      }
      type Target = CircularDeep;
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {
        $label: '',
        a: {$label: '', b: {$label: '', c: {$label: ''}}},
        name: {$label: ''},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {a: {b: {c: {pool: []}}}, name: {pool: []}};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  circularArray: {
    title: 'Object with self-referential array',
    case: () => {
      // ##### src #####
      interface CircularArray {
        items: CircularArray[];
        id: number;
      }
      type Target = CircularArray;
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {
        $label: '',
        items: {$label: '', $items: {$label: ''}},
        id: {$label: ''},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {items: {$items: {}, $length: [1, 3]}, id: {pool: []}};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichmentCase>;
