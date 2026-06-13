import type * as TF from 'ts-runtypes/formats';
import type {FriendlyType, MockData} from 'ts-runtypes';
import type {EnrichCase} from './types.ts';

// Array kinds — `T[]`, `Array<T>`, nested arrays, arrays of objects. Friendly
// emits `{$label: '', $items: <elem node>}`; mock emits `{$items: <elem node>,
// $length: [1, 3]}`. Mirrors the validation suite's ARRAY range.
export const ARRAY = {
  stringArray: {
    title: 'String array',
    case: () => {
      // ##### src #####
      type Target = string[];
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: '', $items: {$label: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {$items: {pool: []}, $length: [1, 3]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  numberArray: {
    title: 'Number array',
    case: () => {
      // ##### src #####
      type Target = number[];
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: '', $items: {$label: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {$items: {pool: []}, $length: [1, 3]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  booleanArray: {
    title: 'Boolean array',
    case: () => {
      // ##### src #####
      type Target = boolean[];
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: '', $items: {$label: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {$items: {pool: []}, $length: [1, 3]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  dateArray: {
    title: 'Date array',
    case: () => {
      // ##### src #####
      type Target = Date[];
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: '', $items: {$label: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {$items: {pool: []}, $length: [1, 3]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  arrayGeneric: {
    title: 'Array<string> generic form',
    case: () => {
      // ##### src #####
      type Target = Array<string>;
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: '', $items: {$label: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {$items: {pool: []}, $length: [1, 3]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  readonlyArray: {
    title: 'ReadonlyArray<string>',
    case: () => {
      // ##### src #####
      type Target = ReadonlyArray<string>;
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: '', $items: {$label: ''}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {$items: {pool: []}, $length: [1, 3]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  nestedArray: {
    title: 'Nested array (string[][])',
    case: () => {
      // ##### src #####
      type Target = string[][];
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: '', $items: {$label: '', $items: {$label: ''}}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {$items: {$items: {pool: []}, $length: [1, 3]}, $length: [1, 3]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  arrayOfObjects: {
    title: 'Array of objects',
    case: () => {
      // ##### src #####
      type Target = {a: string}[];
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {$label: '', $items: {$label: '', a: {$label: ''}}};
      // ##### mock #####
      const mockTarget: MockData<Target> = {$items: {a: {pool: []}}, $length: [1, 3]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },

  formatElementArray: {
    title: 'Array of format-branded strings',
    case: () => {
      // ##### src #####
      type Target = TF.Email[];
      // ##### friendly #####
      const friendlyTarget: FriendlyType<Target> = {
        $label: '',
        $items: {$label: '', $errors: {type: '', maxLength: '', minLength: '', pattern: ''}},
      };
      // ##### mock #####
      const mockTarget: MockData<Target> = {$items: {pool: []}, $length: [1, 3]};
      // ##### result #####
      return {friendlyTarget, mockTarget};
    },
  },
} satisfies Record<string, EnrichCase>;
