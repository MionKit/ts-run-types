import {ATOMIC} from './Atomic.ts';
import {OBJECTS} from './Objects.ts';
import {RECORDS} from './Records.ts';
import {ARRAYS} from './Arrays.ts';
import {TUPLES} from './Tuples.ts';
import {ITERABLES} from './Iterables.ts';
import {DATETIME} from './DateTime.ts';
import {OTHERS} from './Others.ts';
import {UNIONS} from './Unions.ts';
import {REALWORLD} from './Realworld.ts';
import type {CloningCase} from './types.ts';

export const CLONING_SPEC = {
  REALWORLD,
  ATOMIC,
  OBJECTS,
  RECORDS,
  ARRAYS,
  TUPLES,
  ITERABLES,
  DATETIME,
  OTHERS,
  UNIONS,
} as const satisfies Record<string, Record<string, CloningCase>>;

export * from './types.ts';
