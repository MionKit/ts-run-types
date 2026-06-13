import type {FriendlyType, MockData} from 'ts-runtypes';
import type {EnrichCase} from './types.ts';

// Builtin / native kinds. Date and RegExp are scalar-like leaves — friendly
// `{$label: ''}`, mock `{pool: []}`. Map and Set reflect their STRUCTURE
// (solution A): the emitter walks the key/value/element types. `Map<K,V>` →
// friendly `{$label: '', $keys, $values}` / mock `{$keys, $values}` (the
// optional `$size` is left for the author to add); `Set<U>` → friendly
// `{$label: '', $values}` / mock `{$values}`. All are valid `FriendlyType` /
// `MockData` — no `as` cast needed. Mirrors the validation suite's NATIVE range.
export const NATIVE = {
  date: {
    title: 'Date',
    case: () => {
      // ##### src #####
      type Target = Date;
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: ''};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  regexp: {
    title: 'RegExp',
    case: () => {
      // ##### src #####
      type Target = RegExp;
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: ''};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  map: {
    title: 'Map<string, number>',
    case: () => {
      // ##### src #####
      type Target = Map<string, number>;
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: '', $keys: {$label: ''}, $values: {$label: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {$keys: {pool: []}, $values: {pool: []}};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  set: {
    title: 'Set<string>',
    case: () => {
      // ##### src #####
      type Target = Set<string>;
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: '', $values: {$label: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {$values: {pool: []}};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichCase>;
