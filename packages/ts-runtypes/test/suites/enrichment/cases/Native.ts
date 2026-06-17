import type {FriendlyType, MockData} from 'ts-runtypes';
import type {EnrichmentCase} from './types.ts';

// Builtin / native kinds. Date and RegExp are scalar-like leaves — friendly
// `{$label: ''}`, mock `{pool: []}` (both valid). Map and Set are emitted as
// opaque leaves too (no Map/Set arm in the emitter), but `MockData<Map>` /
// `MockData<Set>` model them as homomorphic object maps, so their `{pool: []}`
// mock is authored with an `as MockData<Target>` assertion (the harness strips
// the cast before comparing). Mirrors the validation suite's NATIVE range.
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
      const friendlyTarget: FriendlyType<Target> = {$label: ''};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []} as MockData<Target>;
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
      const friendlyTarget: FriendlyType<Target> = {$label: ''};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []} as MockData<Target>;
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichmentCase>;
