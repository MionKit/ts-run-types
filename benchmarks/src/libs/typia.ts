// Typia validators — compile-time reflection (like ts-go-run-types, typia uses
// the TypeScript compiler to generate validators from types).
//
// Requires the typia transform to be active during the build (unplugin-typia).
// If the transform is NOT wired in, `typia.createIs<T>()` throws at runtime;
// run.ts imports this module defensively and falls back to "not supported" for
// the whole typia column in that case.

import typia from 'typia';
import type {ValidatorMap} from './types.ts';
import type {User, UserWithOptional, Company, Order} from '../suite/types.ts';

export const typiaValidators: ValidatorMap = {
  string: typia.createIs<string>(),
  number: typia.createIs<number>(),
  boolean: typia.createIs<boolean>(),
  bigint: typia.createIs<bigint>(),
  user: typia.createIs<User>(),
  userOptional: typia.createIs<UserWithOptional>(),
  company: typia.createIs<Company>(),
  numberArray: typia.createIs<number[]>(),
  stringOrNumber: typia.createIs<string | number>(),
  status: typia.createIs<'active' | 'inactive' | 'pending'>(),
  pair: typia.createIs<[string, number]>(),
  scoreMap: typia.createIs<Record<string, number>>(),
  nullable: typia.createIs<{value: string | null}>(),
  order: typia.createIs<Order>(),
};
