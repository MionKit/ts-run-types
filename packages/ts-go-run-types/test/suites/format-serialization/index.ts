import {STRING_FORMAT} from './StringFormat.ts';
import {NUMBER_FORMAT} from './NumberFormat.ts';
import {BIGINT_FORMAT} from './BigintFormat.ts';

export const FORMAT_SERIALIZATION_SUITE = {STRING_FORMAT, NUMBER_FORMAT, BIGINT_FORMAT} as const satisfies {
  STRING_FORMAT: Record<string, import('./types.ts').SerializationCase>;
  NUMBER_FORMAT: Record<string, import('./types.ts').SerializationCase>;
  BIGINT_FORMAT: Record<string, import('./types.ts').SerializationCase>;
};

export * from './types.ts';
