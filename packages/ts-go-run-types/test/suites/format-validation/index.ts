import {STRING_FORMAT} from './StringFormat.ts';
import {NUMBER_FORMAT} from './NumberFormat.ts';
import {BIGINT_FORMAT} from './BigintFormat.ts';
import {DATETIME} from './DateTime.ts';
import {REALWORLD} from './Realworld.ts';

export const FORMAT_VALIDATION_SUITE = {REALWORLD, STRING_FORMAT, NUMBER_FORMAT, BIGINT_FORMAT, DATETIME} as const satisfies {
  REALWORLD: Record<string, import('./types.ts').FormatValidationCase>;
  STRING_FORMAT: Record<string, import('./types.ts').FormatValidationCase>;
  NUMBER_FORMAT: Record<string, import('./types.ts').FormatValidationCase>;
  BIGINT_FORMAT: Record<string, import('./types.ts').FormatValidationCase>;
  DATETIME: Record<string, import('./types.ts').FormatValidationCase>;
};

export * from './types.ts';
