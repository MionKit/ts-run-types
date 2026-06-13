// ts-go-run-types validators — compile-time reflection.
//
// Each `createValidate<T>()` call is rewritten at build time by
// vite-plugin-runtypes (which spawns the Go binary) into a call carrying the
// precompiled validator for `T`. No schema is written by hand: the validator
// is derived directly from the TypeScript type.

import {createValidate} from '@mionjs/ts-go-run-types';
import type {ValidatorMap} from './types.ts';
import type {
  User,
  UserWithOptional,
  Company,
  Order,
} from '../suite/types.ts';

export const tsRunTypesValidators: ValidatorMap = {
  string: createValidate<string>(),
  number: createValidate<number>(),
  boolean: createValidate<boolean>(),
  bigint: createValidate<bigint>(),
  user: createValidate<User>(),
  userOptional: createValidate<UserWithOptional>(),
  company: createValidate<Company>(),
  numberArray: createValidate<number[]>(),
  stringOrNumber: createValidate<string | number>(),
  status: createValidate<'active' | 'inactive' | 'pending'>(),
  pair: createValidate<[string, number]>(),
  scoreMap: createValidate<Record<string, number>>(),
  nullable: createValidate<{value: string | null}>(),
  order: createValidate<Order>(),
};
