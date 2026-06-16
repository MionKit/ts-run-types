import type {FormatTransformCase} from './types.ts';
import 'ts-runtypes/formats';
import {createFormatTransform} from 'ts-runtypes';
import type {FormatBigInt64, FormatBigInt} from 'ts-runtypes/formats';

export const BIGINT_FORMAT = {
  identity_int64: {
    title: 'FormatBigInt64 — no transform, passes through unchanged',
    formatTransform: () => createFormatTransform<FormatBigInt64>(),
    getCases: () => [
      {input: 5n, expected: 5n},
      {input: -9223372036854775808n, expected: -9223372036854775808n},
    ],
  },
  identity_ranged: {
    title: 'FormatBigInt<{min:0n; max:1000n}> — no transform',
    formatTransform: () => createFormatTransform<FormatBigInt<{min: 0n; max: 1000n}>>(),
    getCases: () => [{input: 500n, expected: 500n}],
  },
} as const satisfies Record<string, FormatTransformCase>;
