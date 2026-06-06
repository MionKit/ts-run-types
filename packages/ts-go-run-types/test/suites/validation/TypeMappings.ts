import type {ValidationCase} from './types.ts';
import {createIsType, createGetTypeErrors, createMockType} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import {deserializeIsType, deserializeGetTypeErrors} from '../../util/deserializeRTFunctions.ts';

export const TYPE_MAPPINGS = {
  key_prefix_rename: {
    title: 'Key prefix via template literal — `prefix_${K}` rename',
    description:
      'TS 4.1+ key remapping: `{[K in keyof T as `prefix_${K & string}`]: T[K]}`. Resolves to a fully concrete object literal with renamed keys; each value type is carried over unchanged. Common pattern for DB column-name prefixing (`user_id`, `user_name`).',
    isType: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return createIsType<Prefixed<Source>>();
    },
    isTypeSchema: () => createIsType(RT.object({user_id: RT.number(), user_name: RT.string()})),
    deserializeIsType: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return deserializeIsType<Prefixed<Source>>();
    },
    isTypeReflect: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return createGetTypeErrors<Prefixed<Source>>();
    },
    getTypeErrorsSchema: () => createGetTypeErrors(RT.object({user_id: RT.number(), user_name: RT.string()})),
    deserializeGetTypeErrors: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      return deserializeGetTypeErrors<Prefixed<Source>>();
    },
    getTypeErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
      }
      type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
      const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
      return deserializeGetTypeErrors(v);
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
    title: 'Conditional key rename — swap one key, leave the rest',
    description:
      '`{[K in keyof T as K extends "id" ? "_id" : K]: T[K]}`. Renames a single specific key (`id` → `_id` — Mongo-style); other keys pass through unchanged.',
    isType: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return createIsType<MongoForm<Source>>();
    },
    isTypeSchema: () => createIsType(RT.object({_id: RT.number(), name: RT.string(), createdAt: RT.date()})),
    deserializeIsType: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return deserializeIsType<MongoForm<Source>>();
    },
    isTypeReflect: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return createGetTypeErrors<MongoForm<Source>>();
    },
    getTypeErrorsSchema: () => createGetTypeErrors(RT.object({_id: RT.number(), name: RT.string(), createdAt: RT.date()})),
    deserializeGetTypeErrors: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      return deserializeGetTypeErrors<MongoForm<Source>>();
    },
    getTypeErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
        createdAt: Date;
      }
      type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
      const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
      return deserializeGetTypeErrors(v);
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
    title: 'Filter keys via `never` — drop sensitive props',
    description:
      '`{[K in keyof T as K extends "secret" ? never : K]: T[K]}`. Mapping a key to `never` drops it from the resulting shape entirely (TS 4.1+ semantic). Useful for stripping internal-only / secret fields when exposing a wire shape.',
    isTypeNotes:
      'Dropped keys are NOT present in the resolved type. The validator does NOT check whether the dropped key is absent — structural typing allows extra props, so a value carrying the dropped key still passes (the key is simply ignored).',
    isType: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return createIsType<Public<Source>>();
    },
    isTypeSchema: () => createIsType(RT.object({id: RT.number(), name: RT.string()})),
    deserializeIsType: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return deserializeIsType<Public<Source>>();
    },
    isTypeReflect: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      const v: Public<Source> = {id: 1, name: 'x'};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      const v: Public<Source> = {id: 1, name: 'x'};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return createGetTypeErrors<Public<Source>>();
    },
    getTypeErrorsSchema: () => createGetTypeErrors(RT.object({id: RT.number(), name: RT.string()})),
    deserializeGetTypeErrors: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      return deserializeGetTypeErrors<Public<Source>>();
    },
    getTypeErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      const v: Public<Source> = {id: 1, name: 'x'};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface Source {
        id: number;
        name: string;
        secret: string;
      }
      type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
      const v: Public<Source> = {id: 1, name: 'x'};
      return deserializeGetTypeErrors(v);
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
