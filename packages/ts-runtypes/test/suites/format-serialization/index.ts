import {STRING_FORMAT} from './StringFormat.ts';
import {CLASS_WITH_FORMATS} from './ClassWithFormats.ts';
import {NUMBER_FORMAT} from './NumberFormat.ts';
import {BIGINT_FORMAT} from './BigintFormat.ts';
import {DATETIME} from './DateTime.ts';
import {REALWORLD} from './Realworld.ts';

export const FORMAT_SERIALIZATION_SUITE = {
  REALWORLD,
  STRING_FORMAT,
  NUMBER_FORMAT,
  BIGINT_FORMAT,
  DATETIME,
  CLASS_WITH_FORMATS,
} as const satisfies {
  REALWORLD: Record<string, import('./types.ts').SerializationCase>;
  STRING_FORMAT: Record<string, import('./types.ts').SerializationCase>;
  NUMBER_FORMAT: Record<string, import('./types.ts').SerializationCase>;
  BIGINT_FORMAT: Record<string, import('./types.ts').SerializationCase>;
  DATETIME: Record<string, import('./types.ts').SerializationCase>;
  CLASS_WITH_FORMATS: Record<string, import('./types.ts').SerializationCase>;
};

export * from './types.ts';
