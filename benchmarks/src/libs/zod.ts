// Zod validators — hand-written schemas mirroring suite/types.ts.

import {z} from 'zod';
import type {ValidatorMap} from './types.ts';

const compile =
  (schema: z.ZodTypeAny) =>
  (value: unknown): boolean =>
    schema.safeParse(value).success;

const user = z.object({id: z.number(), name: z.string(), active: z.boolean()});
const address = z.object({street: z.string(), city: z.string(), zip: z.string()});

export const zodValidators: ValidatorMap = {
  string: compile(z.string()),
  number: compile(z.number()),
  boolean: compile(z.boolean()),
  bigint: compile(z.bigint()),
  user: compile(user),
  userOptional: compile(
    z.object({id: z.number(), name: z.string(), nickname: z.string().optional()}),
  ),
  company: compile(
    z.object({name: z.string(), address, employees: z.array(user)}),
  ),
  numberArray: compile(z.array(z.number())),
  stringOrNumber: compile(z.union([z.string(), z.number()])),
  status: compile(z.enum(['active', 'inactive', 'pending'])),
  pair: compile(z.tuple([z.string(), z.number()])),
  scoreMap: compile(z.record(z.string(), z.number())),
  nullable: compile(z.object({value: z.string().nullable()})),
  order: compile(
    z.object({
      id: z.number(),
      customer: user,
      items: z.array(z.object({sku: z.string(), qty: z.number(), price: z.number()})),
      status: z.enum(['active', 'inactive', 'pending']),
      note: z.string().optional(),
      total: z.number(),
    }),
  ),
};
