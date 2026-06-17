import type {FriendlyType, MockData} from 'ts-runtypes';
import type {EnrichmentCase} from './types.ts';

// Tuple kinds. The emitter treats a tuple as an OPAQUE LEAF (only `KindArray`
// has the `$items` array arm), so it emits friendly `{$label: ''}` and mock
// `{pool: []}`. The friendly leaf IS a valid `FriendlyType<tuple>`. The mock
// leaf is NOT a valid `MockData<tuple>` — `MockData` models a tuple as
// `{$items?, $length?}` (no `pool`) — so each mock is authored with an explicit
// `as MockData<Target>` assertion (the harness strips the cast before comparing
// against the generator's bare literal). Mirrors the validation suite's TUPLE
// range.
export const TUPLE = {
  pair: {
    title: 'Tuple [string, number]',
    case: () => {
      // ##### src #####
      type Target = [string, number];
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: ''};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []} as MockData<Target>;
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  single: {
    title: 'Single-element tuple [string]',
    case: () => {
      // ##### src #####
      type Target = [string];
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: ''};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []} as MockData<Target>;
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  named: {
    title: 'Named tuple [name: string, age: number]',
    case: () => {
      // ##### src #####
      type Target = [name: string, age: number];
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: ''};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []} as MockData<Target>;
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  optionalSlots: {
    title: 'Tuple with optional slots',
    case: () => {
      // ##### src #####
      type Target = [number, bigint?, boolean?, number?];
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: ''};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []} as MockData<Target>;
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  restTail: {
    title: 'Tuple with rest tail [number, ...string[]]',
    case: () => {
      // ##### src #####
      type Target = [number, ...string[]];
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: ''};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []} as MockData<Target>;
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  readonlyTuple: {
    title: 'Readonly tuple',
    case: () => {
      // ##### src #####
      type Target = readonly [string, number];
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: ''};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []} as MockData<Target>;
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  mixedTuple: {
    title: 'Mixed-type tuple',
    case: () => {
      // ##### src #####
      type Target = [Date, number, string, null, bigint];
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: ''};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []} as MockData<Target>;
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  empty: {
    title: 'Empty tuple []',
    case: () => {
      // ##### src #####
      type Target = [];
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: ''};
      // ##### mock #####
      const mockTarget: MockData<Target> = {pool: []} as MockData<Target>;
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichmentCase>;
