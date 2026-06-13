import type {ValidationCase} from './types.ts';
import {createValidate, createGetValidationErrors, createMockType, type DataOnly} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

export const TYPE_MAPPINGS = {
  key_prefix_rename: {
    title: 'Key prefix rename',
    description:
      'TS 4.1+ key remapping `{[K in keyof T as `prefix_${K & string}`]: T[K]}` resolves to a fully concrete object literal with template-literal renamed keys, carrying each value type over unchanged, as in DB column-name prefixing (`user_id`, `user_name`).',
    validateNotes:
      'The validator checks the RENAMED keys — a value carrying the original un-prefixed keys (`{id, name}`) fails because the required `user_id` / `user_name` are absent.',
    validate: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return createValidate<Prefixed<Source>>();
    },
    validateDataOnly: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return createValidate<DataOnly<Prefixed<Source>>>();
    },
    validateSchema: () => createValidate(RT.object({user_id: RT.number(), user_name: RT.string()})),
    deserializeValidate: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return deserializeValidate<Prefixed<Source>>();
    },
    validateReflect: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return createGetValidationErrors<Prefixed<Source>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return createGetValidationErrors<DataOnly<Prefixed<Source>>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrors(RT.object({user_id: RT.number(), user_name: RT.string()})),
    deserializeGetValidationErrors: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return deserializeGetValidationErrors<Prefixed<Source>>();
    },
    getValidationErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return createMockType<Prefixed<Source>>();
    },
    mockTypeReflect: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {user_id: 1, user_name: 'x'},
        {user_id: 0, user_name: ''},
      ],
      invalid: [
        {id: 1, name: 'x'}, // original (un-prefixed) keys — both required prefixed keys missing
        {user_id: 'not number', user_name: 'x'},
        {user_id: 1}, // missing user_name
        null,
        undefined,
      ],
    }),
    getExpectedErrors: () => [
      [
        {path: ['user_id'], expected: 'number'},
        {path: ['user_name'], expected: 'string'},
      ],
      [{path: ['user_id'], expected: 'number'}],
      [{path: ['user_name'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  key_conditional_rename: {
    title: 'Conditional key rename',
    description:
      '`{[K in keyof T as K extends "id" ? "_id" : K]: T[K]}` swaps a single specific key (`id` to `_id`, Mongo-style) while the rest pass through unchanged.',
    validateNotes:
      'Only `id` is renamed; the resolved shape requires `_id` and ignores the original `id`, so a value with `id` (and no `_id`) fails while the pass-through keys (`name`, `createdAt`) are still required.',
    validate: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return createValidate<MongoForm<Source>>();
    },
    validateDataOnly: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return createValidate<DataOnly<MongoForm<Source>>>();
    },
    validateSchema: () => createValidate(RT.object({_id: RT.number(), name: RT.string(), createdAt: RT.date()})),
    deserializeValidate: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return deserializeValidate<MongoForm<Source>>();
    },
    validateReflect: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return createGetValidationErrors<MongoForm<Source>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return createGetValidationErrors<DataOnly<MongoForm<Source>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.object({_id: RT.number(), name: RT.string(), createdAt: RT.date()})),
    deserializeGetValidationErrors: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return deserializeGetValidationErrors<MongoForm<Source>>();
    },
    getValidationErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return createMockType<MongoForm<Source>>();
    },
    mockTypeReflect: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{_id: 1, name: 'x', createdAt: new Date()}],
      invalid: [
        // Original `id` key — renamed away, so `_id` is missing.
        {id: 1, name: 'x', createdAt: new Date()},
        // Wrong type at renamed slot.
        {_id: 'not number', name: 'x', createdAt: new Date()},
        // Missing the non-renamed `createdAt`.
        {_id: 1, name: 'x'},
        null,
        undefined,
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['_id'], expected: 'number'}],
      [{path: ['_id'], expected: 'number'}],
      [{path: ['createdAt'], expected: 'date'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  key_filter_via_never: {
    title: 'Filter keys via never',
    description:
      '`{[K in keyof T as K extends "secret" ? never : K]: T[K]}` maps a key to `never` to drop it from the resulting shape entirely (TS 4.1+ semantic), stripping internal-only or secret fields when exposing a wire shape.',
    validateNotes:
      'Dropped keys are NOT present in the resolved type. The validator does NOT check whether the dropped key is absent — structural typing allows extra props, so a value carrying the dropped key still passes (the key is simply ignored).',
    validate: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return createValidate<Public<Source>>();
    },
    validateDataOnly: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return createValidate<DataOnly<Public<Source>>>();
    },
    validateSchema: () => createValidate(RT.object({id: RT.number(), name: RT.string()})),
    deserializeValidate: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return deserializeValidate<Public<Source>>();
    },
    validateReflect: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      const v: Public<Source> = {id: 1, name: 'x'};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      const v: Public<Source> = {id: 1, name: 'x'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return createGetValidationErrors<Public<Source>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return createGetValidationErrors<DataOnly<Public<Source>>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrors(RT.object({id: RT.number(), name: RT.string()})),
    deserializeGetValidationErrors: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return deserializeGetValidationErrors<Public<Source>>();
    },
    getValidationErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      const v: Public<Source> = {id: 1, name: 'x'};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      const v: Public<Source> = {id: 1, name: 'x'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return createMockType<Public<Source>>();
    },
    mockTypeReflect: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      const v: Public<Source> = {id: 1, name: 'x'};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {id: 1, name: 'x'},
        // Extra `secret` prop passes (structural typing — the
        // resolved shape doesn't know about it).
        {id: 1, name: 'x', secret: 'oops'},
      ],
      invalid: [
        {id: 1}, // missing name
        {name: 'x'}, // missing id
        {id: 'not number', name: 'x'},
        null,
        undefined,
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['name'], expected: 'string'}],
      [{path: ['id'], expected: 'number'}],
      [{path: ['id'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },
} as const satisfies Record<string, ValidationCase>;
