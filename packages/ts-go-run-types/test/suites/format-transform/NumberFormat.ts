import type {FormatTransformCase} from './types.ts';
import '@mionjs/ts-go-run-types/formats';
import {createFormatTransform} from '@mionjs/ts-go-run-types';
import type {FormatInteger, FormatInt8, FormatNumber} from '@mionjs/ts-go-run-types/formats';

export const NUMBER_FORMAT = {
  identity_integer: {
    title: 'FormatInteger — no transform, passes through unchanged',
    formatTransform: () => createFormatTransform<FormatInteger>(),
    getCases: () => [
      {input: 42, expected: 42},
      {input: -7, expected: -7},
    ],
  },
  identity_int8: {
    title: 'FormatInt8 — no transform',
    formatTransform: () => createFormatTransform<FormatInt8>(),
    getCases: () => [{input: 127, expected: 127}],
  },
  identity_ranged: {
    title: 'FormatNumber<{min:0; max:100}> — no transform',
    formatTransform: () => createFormatTransform<FormatNumber<{min: 0; max: 100}>>(),
    getCases: () => [{input: 50, expected: 50}],
  },
  nested_number_field: {
    title: 'nested object — number-branded field passes through unchanged',
    formatTransform: () => createFormatTransform<{count: FormatInt8; label: string}>(),
    getCases: () => [{input: {count: 5, label: 'KEEP'}, expected: {count: 5, label: 'KEEP'}}],
  },
} as const satisfies Record<string, FormatTransformCase>;
