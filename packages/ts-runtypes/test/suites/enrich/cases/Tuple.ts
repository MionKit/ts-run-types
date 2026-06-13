import type {FriendlyType, MockData} from 'ts-runtypes';
import type {EnrichCase} from './types.ts';

// Tuple kinds. The emitter reflects tuple STRUCTURE (solution A): a fixed-length
// tuple emits friendly `{$label: '', $slots: [node, …]}` and mock `{$slots:
// [node, …]}` (fixed length, no `$length`) — one node per slot. A VARIADIC tuple
// (`[A, ...B[]]`) has a broad `length: number`, so the `FriendlyType`/`MockData`
// mapped types route it through the ARRAY branch (`$items`/`$length`); the
// emitter mirrors that. Both shapes are valid `FriendlyType<Target>` /
// `MockData<Target>` — no `as` cast needed. Mirrors the validation suite's
// TUPLE range.
export const TUPLE = {
  pair: {
    title: 'Tuple [string, number]',
    case: () => {
      // ##### src #####
      type Target = [string, number];
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: '', $slots: [{$label: ''}, {$label: ''}]};
      // ##### mock #####
      const mockTarget: MockData<Target> = {$slots: [{pool: []}, {pool: []}]};
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
      const friendlyTarget: FriendlyType<Target> = {$label: '', $slots: [{$label: ''}]};
      // ##### mock #####
      const mockTarget: MockData<Target> = {$slots: [{pool: []}]};
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
      const friendlyTarget: FriendlyType<Target> = {$label: '', $slots: [{$label: ''}, {$label: ''}]};
      // ##### mock #####
      const mockTarget: MockData<Target> = {$slots: [{pool: []}, {pool: []}]};
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
      const friendlyTarget: FriendlyType<Target> = {
        $label: '',
        $slots: [{$label: ''}, {$label: ''}, {$label: ''}, {$label: ''}],
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {$slots: [{pool: []}, {pool: []}, {pool: []}, {pool: []}]};
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
      // A variadic tuple has `length: number`, so the type (and emitter) treat
      // it as an array — `$items`, not `$slots`.
      const friendlyTarget: FriendlyType<Target> = {$label: '', $items: {$label: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {$items: {pool: []}, $length: [1, 3]};
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
      const friendlyTarget: FriendlyType<Target> = {$label: '', $slots: [{$label: ''}, {$label: ''}]};
      // ##### mock #####
      const mockTarget: MockData<Target> = {$slots: [{pool: []}, {pool: []}]};
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
      const friendlyTarget: FriendlyType<Target> = {
        $label: '',
        $slots: [{$label: ''}, {$label: ''}, {$label: ''}, {$label: ''}, {$label: ''}],
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {$slots: [{pool: []}, {pool: []}, {pool: []}, {pool: []}, {pool: []}]};
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
      const friendlyTarget: FriendlyType<Target> = {$label: '', $slots: []};
      // ##### mock #####
      const mockTarget: MockData<Target> = {$slots: []};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichCase>;
