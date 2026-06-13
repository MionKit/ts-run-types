// TypeBox validators — schemas compiled to optimized check functions.

import {Type, type TSchema} from '@sinclair/typebox';
import {TypeCompiler} from '@sinclair/typebox/compiler';
import type {ValidatorMap} from './types.ts';

const compile = (schema: TSchema) => {
  const checker = TypeCompiler.Compile(schema);
  return (value: unknown): boolean => checker.Check(value);
};

const user = Type.Object({id: Type.Number(), name: Type.String(), active: Type.Boolean()});
const address = Type.Object({street: Type.String(), city: Type.String(), zip: Type.String()});

export const typeboxValidators: ValidatorMap = {
  string: compile(Type.String()),
  number: compile(Type.Number()),
  boolean: compile(Type.Boolean()),
  bigint: compile(Type.BigInt()),
  user: compile(user),
  userOptional: compile(
    Type.Object({id: Type.Number(), name: Type.String(), nickname: Type.Optional(Type.String())}),
  ),
  company: compile(
    Type.Object({name: Type.String(), address, employees: Type.Array(user)}),
  ),
  numberArray: compile(Type.Array(Type.Number())),
  stringOrNumber: compile(Type.Union([Type.String(), Type.Number()])),
  status: compile(
    Type.Union([Type.Literal('active'), Type.Literal('inactive'), Type.Literal('pending')]),
  ),
  pair: compile(Type.Tuple([Type.String(), Type.Number()])),
  scoreMap: compile(Type.Record(Type.String(), Type.Number())),
  nullable: compile(Type.Object({value: Type.Union([Type.String(), Type.Null()])})),
  order: compile(
    Type.Object({
      id: Type.Number(),
      customer: user,
      items: Type.Array(
        Type.Object({sku: Type.String(), qty: Type.Number(), price: Type.Number()}),
      ),
      status: Type.Union([
        Type.Literal('active'),
        Type.Literal('inactive'),
        Type.Literal('pending'),
      ]),
      note: Type.Optional(Type.String()),
      total: Type.Number(),
    }),
  ),
};
