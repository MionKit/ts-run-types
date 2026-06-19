import type {FriendlyType, MockData} from 'ts-runtypes';
import type {EnrichCase} from './types.ts';

// Object-like kinds — interfaces / object literals / intersections. Friendly
// emits `{$label: '', <field>: <node>, …}`; mock emits `{<field>: <node>, …}`.
// Mirrors the validation suite's OBJECT range. (Bare index-signature roots are
// excluded: the emitter projects them as a `{$label: ''}` leaf, but
// `FriendlyType<{[k: string]: V}>` makes EVERY string key a node — `$label`
// then collides with the index signature, so the leaf isn't type-checkable. The
// validation suite exercises index signatures as object MEMBERS, not roots.)
export const OBJECT = {
  flat: {
    title: 'Flat object',
    case: () => {
      // ##### src #####
      type Target = {a: string; b: number};
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {
        $label: '',
        $errors: {type: ''},
        a: {$label: '', $errors: {type: ''}},
        b: {$label: '', $errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        a: {pool: []},
        b: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  optionalMember: {
    title: 'Object with optional member',
    case: () => {
      // ##### src #####
      type Target = {a: string; b?: number};
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {
        $label: '',
        $errors: {type: ''},
        a: {$label: '', $errors: {type: ''}},
        b: {$label: '', $errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        a: {pool: []},
        b: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  nested: {
    title: 'Nested object',
    case: () => {
      // ##### src #####
      type Target = {a: string; deep: {b: string; c: number}};
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {
        $label: '',
        $errors: {type: ''},
        a: {$label: '', $errors: {type: ''}},
        deep: {
          $label: '',
          $errors: {type: ''},
          b: {$label: '', $errors: {type: ''}},
          c: {$label: '', $errors: {type: ''}},
        },
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        a: {pool: []},
        deep: {
          b: {pool: []},
          c: {pool: []},
        },
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  readonlyMembers: {
    title: 'Object with readonly members',
    case: () => {
      // ##### src #####
      type Target = {readonly name: string; readonly age: number};
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {
        $label: '',
        $errors: {type: ''},
        name: {$label: '', $errors: {type: ''}},
        age: {$label: '', $errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        name: {pool: []},
        age: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  intersection: {
    title: 'Intersection of two objects',
    case: () => {
      // ##### src #####
      type Target = {a: string} & {b: number};
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {
        $label: '',
        $errors: {type: ''},
        a: {$label: '', $errors: {type: ''}},
        b: {$label: '', $errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        a: {pool: []},
        b: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  deeplyNested: {
    title: 'Deeply nested object',
    case: () => {
      // ##### src #####
      type Target = {a: {b: {c: string}}};
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
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        a: {
          b: {
            c: {pool: []},
          },
        },
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  manyScalarMembers: {
    title: 'Object with many scalar members',
    case: () => {
      // ##### src #####
      type Target = {s: string; n: number; b: boolean; d: Date; big: bigint};
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {
        $label: '',
        $errors: {type: ''},
        s: {$label: '', $errors: {type: ''}},
        n: {$label: '', $errors: {type: ''}},
        b: {$label: '', $errors: {type: ''}},
        d: {$label: '', $errors: {type: ''}},
        big: {$label: '', $errors: {type: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        s: {pool: []},
        n: {pool: []},
        b: {pool: []},
        d: {pool: []},
        big: {pool: []},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  withArrayMember: {
    title: 'Object with an array member',
    case: () => {
      // ##### src #####
      type Target = {tags: string[]};
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {
        $label: '',
        $errors: {type: ''},
        tags: {$label: '', $errors: {type: ''}, $items: {$label: '', $errors: {type: ''}}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {
        tags: {$items: {pool: []}, $length: [1, 3]},
      };
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichCase>;
