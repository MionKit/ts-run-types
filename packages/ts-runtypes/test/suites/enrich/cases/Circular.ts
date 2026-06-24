import type {FriendlyType, MockData} from 'ts-runtypes';
import type {EnrichCase} from './types.ts';

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
      const friendlyTarget: FriendlyType<Target> = {
        $label: '',
        $errors: {type: ''},
        value: {$label: '', $errors: {type: ''}},
        next: {$label: '', $errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        value: {pool: []},
        next: {pool: []},
      };
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
        $errors: {type: ''},
        a: {
          $label: '',
          $errors: {type: ''},
          b: {
            $label: '',
            $errors: {type: ''},
            c: {$label: '', $errors: {type: ''}},
          },
        },
        name: {$label: '', $errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        a: {
          b: {
            c: {pool: []},
          },
        },
        name: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  circularArray: {
    // NOTE: the friendly + mock below break the cycle at the self-referential
    // array element — `items.$items` is a BARE node (`{$label,$errors}` / `{}`),
    // NOT the filled `{$items: {pool: []}, …}` of every other array case. The
    // element type is `CircularArray` itself, so the array back-edge is the
    // recursion-leaf where gen's runtime `seen` guard stops and emits a bare node.
    // The depth-bounded `FriendlyType` / `MockData` TYPES can't model that cutoff
    // (they keep recursing to the depth budget), so each expected carries a trailing
    // divergence cast — enrichCases.ts `stripTrailingAs` removes it before the shape
    // comparison, and `check` re-validates the stripped literal against the strict
    // type via the Go CLI. Friendly's bare leaf still carries `{$label,$errors}` and
    // overlaps the node type, so a plain `as FriendlyType<Target>` suffices; mock's
    // leaf is the EMPTY `{}`, which shares no members with the rich node, so it needs
    // the `as unknown as MockData<Target>` bridge. The lone divergence is the
    // cycle-break leaf, not drift.
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
        $errors: {type: ''},
        items: {$label: '', $errors: {type: ''}, $items: {$label: '', $errors: {type: ''}}},
        id: {$label: '', $errors: {type: ''}},
      } as FriendlyType<Target>;
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        items: {$items: {}, $length: [1, 3]},
        id: {pool: []},
      } as unknown as MockData<Target>;
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichCase>;
