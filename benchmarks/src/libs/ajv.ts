// AJV validators — JSON Schema compiled to validation functions.
//
// JSON Schema has no `bigint` type, so the bigint case is marked
// not-supported (AJV cannot validate a `bigint` value).

import Ajv, {type SchemaObject} from 'ajv';
import {NOT_SUPPORTED, type ValidatorMap} from './types.ts';

const ajv = new Ajv({strict: false, allowUnionTypes: true});

const compile = (schema: SchemaObject) => {
  const validate = ajv.compile(schema);
  return (value: unknown): boolean => validate(value) as boolean;
};

const user: SchemaObject = {
  type: 'object',
  properties: {id: {type: 'number'}, name: {type: 'string'}, active: {type: 'boolean'}},
  required: ['id', 'name', 'active'],
};
const address: SchemaObject = {
  type: 'object',
  properties: {street: {type: 'string'}, city: {type: 'string'}, zip: {type: 'string'}},
  required: ['street', 'city', 'zip'],
};

export const ajvValidators: ValidatorMap = {
  string: compile({type: 'string'}),
  number: compile({type: 'number'}),
  boolean: compile({type: 'boolean'}),
  bigint: NOT_SUPPORTED,
  user: compile(user),
  userOptional: compile({
    type: 'object',
    properties: {id: {type: 'number'}, name: {type: 'string'}, nickname: {type: 'string'}},
    required: ['id', 'name'],
  }),
  company: compile({
    type: 'object',
    properties: {name: {type: 'string'}, address, employees: {type: 'array', items: user}},
    required: ['name', 'address', 'employees'],
  }),
  numberArray: compile({type: 'array', items: {type: 'number'}}),
  stringOrNumber: compile({type: ['string', 'number']}),
  status: compile({type: 'string', enum: ['active', 'inactive', 'pending']}),
  pair: compile({
    type: 'array',
    items: [{type: 'string'}, {type: 'number'}],
    minItems: 2,
    maxItems: 2,
    additionalItems: false,
  }),
  scoreMap: compile({type: 'object', additionalProperties: {type: 'number'}}),
  nullable: compile({
    type: 'object',
    properties: {value: {type: ['string', 'null']}},
    required: ['value'],
  }),
  order: compile({
    type: 'object',
    properties: {
      id: {type: 'number'},
      customer: user,
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {sku: {type: 'string'}, qty: {type: 'number'}, price: {type: 'number'}},
          required: ['sku', 'qty', 'price'],
        },
      },
      status: {type: 'string', enum: ['active', 'inactive', 'pending']},
      note: {type: 'string'},
      total: {type: 'number'},
    },
    required: ['id', 'customer', 'items', 'status', 'total'],
  }),
};
