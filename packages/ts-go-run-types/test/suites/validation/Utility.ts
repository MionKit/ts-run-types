import type {ValidationCase} from './types.ts';
import {createValidate, createGetValidationErrors, createMockType, type DataOnly} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import {deserializeValidate, deserializeGetValidationErrors} from '../../util/deserializeRTFunctions.ts';

export const UTILITY = {
  partial: {
    title: 'Partial<T> — all props become optional',
    description:
      'mion utility/partial.spec.ts — all properties become optional. Resolves to {name?: string; age?: number; createdAt?: Date}; reuses the object emit with allOptionalCode array-rejection guard.',
    validateNotes:
      'Resolves to an all-optional object shape, so the `allOptionalCode` guard kicks in: arrays, Date, Map, Set, RegExp are rejected at the top level even though `{}` is valid. Present properties still run their atomic checks (Invalid Date in `createdAt` fails).',
    validate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidate<Partial<Person>>();
    },
    validateDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidate<DataOnly<Partial<Person>>>();
    },
    validateSchema: () => createValidate(RT.partial(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}))),
    deserializeValidate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeValidate<Partial<Person>>();
    },
    validateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> = {};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> = {};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrors<Partial<Person>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrors<DataOnly<Partial<Person>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.partial(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}))),
    deserializeGetValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeGetValidationErrors<Partial<Person>>();
    },
    getValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> = {};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> = {};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createMockType<Partial<Person>>();
    },
    mockTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> = {};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{}, {name: 'John'}, {createdAt: new Date()}, {name: 'John', age: 30, createdAt: new Date()}],
      invalid: [
        [], // allOptionalCode rejects arrays
        new Date(), // allOptionalCode rejects native objects
        {name: 42}, // wrong type when prop is present
        {createdAt: 'not date'},
        null,
        undefined,
        {createdAt: new Date('invalid')}, // Invalid Date in optional prop
        new Map(),
        new Set(),
        {age: NaN}, // NaN at optional number
      ],
    }),
    // allOptionalCode guards the outer check, so non-plain-object
    // inputs (arrays, Date, Map, Set) report 'objectLiteral'.
    // Plain objects with bad prop types pass the outer guard and
    // fall through to per-property error accumulation.
    getExpectedErrors: () => [
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['name'], expected: 'string'}],
      [{path: ['createdAt'], expected: 'date'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['createdAt'], expected: 'date'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['age'], expected: 'number'}],
    ],
  },

  required: {
    title: 'Required<T> — all optional props become required',
    description:
      'mion utility/required.spec.ts — all properties become required. Resolves to a plain object literal; reuses the object emit.',
    validate: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return createValidate<Required<MaybePerson>>();
    },
    validateDataOnly: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return createValidate<DataOnly<Required<MaybePerson>>>();
    },
    validateSchema: () =>
      createValidate(
        RT.required(RT.object({name: RT.optional(RT.string()), age: RT.optional(RT.number()), createdAt: RT.optional(RT.date())}))
      ),
    deserializeValidate: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return deserializeValidate<Required<MaybePerson>>();
    },
    validateReflect: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return createGetValidationErrors<Required<MaybePerson>>();
    },
    getValidationErrorsDataOnly: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return createGetValidationErrors<DataOnly<Required<MaybePerson>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.required(RT.object({name: RT.optional(RT.string()), age: RT.optional(RT.number()), createdAt: RT.optional(RT.date())}))
      ),
    deserializeGetValidationErrors: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return deserializeGetValidationErrors<Required<MaybePerson>>();
    },
    getValidationErrorsReflect: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return createMockType<Required<MaybePerson>>();
    },
    mockTypeReflect: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{name: 'John', age: 30, createdAt: new Date()}],
      invalid: [
        {},
        {name: 'John'}, // missing age + createdAt
        {name: 'John', age: 30}, // missing createdAt
        {name: 'John', age: 30, createdAt: 'not date'}, // wrong type
        null,
        undefined,
        {name: 'John', age: NaN, createdAt: new Date()}, // NaN at age
        {name: 'John', age: 30, createdAt: new Date('invalid')}, // Invalid Date
      ],
    }),
    getExpectedErrors: () => [
      // {} — every required prop missing.
      [
        {path: ['name'], expected: 'string'},
        {path: ['age'], expected: 'number'},
        {path: ['createdAt'], expected: 'date'},
      ],
      [
        {path: ['age'], expected: 'number'},
        {path: ['createdAt'], expected: 'date'},
      ],
      [{path: ['createdAt'], expected: 'date'}],
      [{path: ['createdAt'], expected: 'date'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['age'], expected: 'number'}],
      [{path: ['createdAt'], expected: 'date'}],
    ],
  },

  pick: {
    title: 'Pick<T, K> — keeps only the named properties',
    description: 'mion utility/pick.spec.ts — selects a subset of properties. Resolves to {name: string; createdAt: Date}.',
    validateNotes:
      'Resolves to a fixed-property object with only the picked keys. Extra properties on the input still pass (structural typing).',
    validate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidate<Pick<Person, 'name' | 'createdAt'>>();
    },
    validateDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidate<DataOnly<Pick<Person, 'name' | 'createdAt'>>>();
    },
    validateSchema: () =>
      createValidate(RT.pick(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}), ['name', 'createdAt'])),
    deserializeValidate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeValidate<Pick<Person, 'name' | 'createdAt'>>();
    },
    validateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrors<Pick<Person, 'name' | 'createdAt'>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrors<DataOnly<Pick<Person, 'name' | 'createdAt'>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.pick(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}), ['name', 'createdAt'])),
    deserializeGetValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeGetValidationErrors<Pick<Person, 'name' | 'createdAt'>>();
    },
    getValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createMockType<Pick<Person, 'name' | 'createdAt'>>();
    },
    mockTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {name: 'John', createdAt: new Date()},
        // Extra props pass (Pick doesn't imply strict)
        {name: 'John', age: 30, createdAt: new Date()},
      ],
      invalid: [
        {name: 'John'}, // missing createdAt
        {createdAt: new Date()}, // missing name
        {name: 42, createdAt: new Date()},
        null,
        undefined,
        {name: 'John', createdAt: new Date('invalid')},
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['createdAt'], expected: 'date'}],
      [{path: ['name'], expected: 'string'}],
      [{path: ['name'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['createdAt'], expected: 'date'}],
    ],
  },

  omit: {
    title: 'Omit<T, K> — drops the named properties',
    description: 'mion utility/omit.spec.ts — removes selected properties. Resolves to {name: string; createdAt: Date}.',
    validateNotes:
      'Resolves to the original shape minus the omitted keys. The omitted property can still appear on the input — structural typing accepts extras.',
    validate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidate<Omit<Person, 'age'>>();
    },
    validateDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidate<DataOnly<Omit<Person, 'age'>>>();
    },
    validateSchema: () => createValidate(RT.omit(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}), ['age'])),
    deserializeValidate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeValidate<Omit<Person, 'age'>>();
    },
    validateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrors<Omit<Person, 'age'>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrors<DataOnly<Omit<Person, 'age'>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.omit(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}), ['age'])),
    deserializeGetValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeGetValidationErrors<Omit<Person, 'age'>>();
    },
    getValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createMockType<Omit<Person, 'age'>>();
    },
    mockTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {name: 'John', createdAt: new Date()},
        {name: 'John', age: 30, createdAt: new Date()}, // extra prop still passes
      ],
      invalid: [{name: 'John'}, {createdAt: new Date()}, null, undefined, {name: 'John', createdAt: new Date('invalid')}],
    }),
    getExpectedErrors: () => [
      [{path: ['createdAt'], expected: 'date'}],
      [{path: ['name'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['createdAt'], expected: 'date'}],
    ],
  },

  exclude_atomic: {
    title: 'Exclude<U, X> on a string-literal union',
    description: 'mion utility/exclude.spec.ts (atomic case) — excludes union members. Resolves to "name" | "createdAt".',
    validate: () => createValidate<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
    validateDataOnly: () => createValidate<DataOnly<Exclude<'name' | 'age' | 'createdAt', 'age'>>>(),
    validateSchema: () =>
      createValidate(RT.exclude(RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]), RT.literal('age'))),
    deserializeValidate: () => deserializeValidate<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
    validateReflect: () => {
      const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Exclude<'name' | 'age' | 'createdAt', 'age'>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.exclude(RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]), RT.literal('age'))
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
    getValidationErrorsReflect: () => {
      const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
    mockTypeReflect: () => {
      const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: ['name', 'createdAt'],
      invalid: ['age', 'other', 42, null, undefined, true, '', 'Name'],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  extract_atomic: {
    title: 'Extract<U, X> on a string-literal union',
    description:
      'mion utility/extract.spec.ts (atomic case) — extracts matching union members. Resolves to "name" | "createdAt".',
    validate: () => createValidate<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    validateDataOnly: () => createValidate<DataOnly<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>>(),
    validateSchema: () =>
      createValidate(
        RT.extract(
          RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]),
          RT.union([RT.literal('name'), RT.literal('createdAt')])
        )
      ),
    deserializeValidate: () => deserializeValidate<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    validateReflect: () => {
      const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.extract(
          RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]),
          RT.union([RT.literal('name'), RT.literal('createdAt')])
        )
      ),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    getValidationErrorsReflect: () => {
      const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    mockTypeReflect: () => {
      const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: ['name', 'createdAt'],
      invalid: ['age', 'other', null, undefined, true, 42, '', 'Name'],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  exclude_from_object_union: {
    title: 'Exclude<U, X> on a discriminated object union',
    description: 'mion utility/exclude.spec.ts (object union) — excludes object members from a discriminated union.',
    validate: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return createValidate<Exclude<Shape, {kind: 'circle'}>>();
    },
    validateDataOnly: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return createValidate<DataOnly<Exclude<Shape, {kind: 'circle'}>>>();
    },
    validateSchema: () =>
      createValidate(
        RT.exclude(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: RT.number()}),
            RT.object({kind: RT.literal('square'), x: RT.number()}),
            RT.object({kind: RT.literal('triangle'), base: RT.number(), height: RT.number()}),
          ]),
          RT.object({kind: RT.literal('circle')})
        )
      ),
    deserializeValidate: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return deserializeValidate<Exclude<Shape, {kind: 'circle'}>>();
    },
    validateReflect: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return createGetValidationErrors<Exclude<Shape, {kind: 'circle'}>>();
    },
    getValidationErrorsDataOnly: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return createGetValidationErrors<DataOnly<Exclude<Shape, {kind: 'circle'}>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.exclude(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: RT.number()}),
            RT.object({kind: RT.literal('square'), x: RT.number()}),
            RT.object({kind: RT.literal('triangle'), base: RT.number(), height: RT.number()}),
          ]),
          RT.object({kind: RT.literal('circle')})
        )
      ),
    deserializeGetValidationErrors: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return deserializeGetValidationErrors<Exclude<Shape, {kind: 'circle'}>>();
    },
    getValidationErrorsReflect: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return createMockType<Exclude<Shape, {kind: 'circle'}>>();
    },
    mockTypeReflect: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {kind: 'square', x: 5},
        {kind: 'triangle', base: 4, height: 3},
      ],
      invalid: [
        {kind: 'circle', radius: 3},
        {},
        null,
        undefined,
        {kind: 'square'}, // missing x
        {kind: 'square', x: NaN}, // NaN at x
        {kind: 'triangle', base: 4}, // missing height
      ],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  non_nullable: {
    title: 'NonNullable<T> — strips null and undefined from a union',
    description: 'mion utility/nonNullable.spec.ts — removes null + undefined from a union.',
    validate: () => createValidate<NonNullable<string | number | null | undefined>>(),
    validateDataOnly: () => createValidate<DataOnly<NonNullable<string | number | null | undefined>>>(),
    validateSchema: () =>
      createValidate(RT.nonNullable(RT.union([RT.string(), RT.number(), RT.literal(null), RT.literal(undefined)]))),
    deserializeValidate: () => deserializeValidate<NonNullable<string | number | null | undefined>>(),
    validateReflect: () => {
      const v: NonNullable<string | number | null | undefined> = 'hello';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: NonNullable<string | number | null | undefined> = 'hello';
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<NonNullable<string | number | null | undefined>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<NonNullable<string | number | null | undefined>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.nonNullable(RT.union([RT.string(), RT.number(), RT.literal(null), RT.literal(undefined)]))),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<NonNullable<string | number | null | undefined>>(),
    getValidationErrorsReflect: () => {
      const v: NonNullable<string | number | null | undefined> = 'hello';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: NonNullable<string | number | null | undefined> = 'hello';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<NonNullable<string | number | null | undefined>>(),
    mockTypeReflect: () => {
      const v: NonNullable<string | number | null | undefined> = 'hello';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: ['hello', 42, 0],
      invalid: [null, undefined, true, {}, [], NaN, Infinity],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  return_type: {
    title: 'ReturnType<F> — extracts the return type of a function',
    description: "mion utility/params-return.spec.ts — extracts a function's return type. Resolves to Date.",
    validate: () => {
      type Fn = (a: number, b: boolean) => Date;
      return createValidate<ReturnType<Fn>>();
    },
    validateDataOnly: () => {
      type Fn = (a: number, b: boolean) => Date;
      return createValidate<DataOnly<ReturnType<Fn>>>();
    },
    validateSchema: () => createValidate(RT.returnType(RT.func([RT.number(), RT.boolean()], RT.date()))),
    deserializeValidate: () => {
      type Fn = (a: number, b: boolean) => Date;
      return deserializeValidate<ReturnType<Fn>>();
    },
    validateReflect: () => {
      type Fn = (a: number, b: boolean) => Date;
      const v: ReturnType<Fn> = new Date();
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      type Fn = (a: number, b: boolean) => Date;
      const v: ReturnType<Fn> = new Date();
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type Fn = (a: number, b: boolean) => Date;
      return createGetValidationErrors<ReturnType<Fn>>();
    },
    getValidationErrorsDataOnly: () => {
      type Fn = (a: number, b: boolean) => Date;
      return createGetValidationErrors<DataOnly<ReturnType<Fn>>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrors(RT.returnType(RT.func([RT.number(), RT.boolean()], RT.date()))),
    deserializeGetValidationErrors: () => {
      type Fn = (a: number, b: boolean) => Date;
      return deserializeGetValidationErrors<ReturnType<Fn>>();
    },
    getValidationErrorsReflect: () => {
      type Fn = (a: number, b: boolean) => Date;
      const v: ReturnType<Fn> = new Date();
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type Fn = (a: number, b: boolean) => Date;
      const v: ReturnType<Fn> = new Date();
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      type Fn = (a: number, b: boolean) => Date;
      return createMockType<ReturnType<Fn>>();
    },
    mockTypeReflect: () => {
      type Fn = (a: number, b: boolean) => Date;
      const v: ReturnType<Fn> = new Date();
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [new Date()],
      invalid: ['not date', 42, null, undefined, new Date('invalid'), new Date(NaN), {}, []],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'date'}],
      [{path: [], expected: 'date'}],
      [{path: [], expected: 'date'}],
      [{path: [], expected: 'date'}],
      [{path: [], expected: 'date'}],
      [{path: [], expected: 'date'}],
      [{path: [], expected: 'date'}],
      [{path: [], expected: 'date'}],
    ],
  },

  readonly: {
    title: 'Readonly<T> — readonly bit erased at runtime',
    description:
      'Readonly<T> marks properties readonly at the TS layer; the readonly bit is erased at runtime so the validator behaves identically to the source object. Regression check.',
    validate: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createValidate<Readonly<Person>>();
    },
    validateDataOnly: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createValidate<DataOnly<Readonly<Person>>>();
    },
    validateSchema: () => createValidate(RT.readonly(RT.object({name: RT.string(), age: RT.number()}))),
    deserializeValidate: () => {
      interface Person {
        name: string;
        age: number;
      }
      return deserializeValidate<Readonly<Person>>();
    },
    validateReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Readonly<Person> = {name: 'John', age: 30};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Readonly<Person> = {name: 'John', age: 30};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createGetValidationErrors<Readonly<Person>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createGetValidationErrors<DataOnly<Readonly<Person>>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrors(RT.readonly(RT.object({name: RT.string(), age: RT.number()}))),
    deserializeGetValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
      }
      return deserializeGetValidationErrors<Readonly<Person>>();
    },
    getValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Readonly<Person> = {name: 'John', age: 30};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Readonly<Person> = {name: 'John', age: 30};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createMockType<Readonly<Person>>();
    },
    mockTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Readonly<Person> = {name: 'John', age: 30};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {name: 'John', age: 30},
        {name: '', age: 0},
      ],
      invalid: [{name: 'John'}, {age: 30}, null, undefined, {name: 1, age: 30}, {name: 'John', age: NaN}],
    }),
    getExpectedErrors: () => [
      [{path: ['age'], expected: 'number'}],
      [{path: ['name'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['name'], expected: 'string'}],
      [{path: ['age'], expected: 'number'}],
    ],
  },

  // String-mapping utilities (Uppercase / Lowercase / Capitalize /
  // Uncapitalize) are intentionally not covered here. They work as
  // pure type-system literal mappings (`Uppercase<'foo'>` resolves
  // to `'FOO'` and validates via the existing literal-equality
  // check) but the CONSTRAINT form — "is this any uppercase
  // string" — is a value-shape predicate, not a type check, and
  // lives in the future validation-constraints library alongside
  // the number brand types (int / uint8 / Range<a, b> / etc.).
  // Mion's own utility/string.spec.ts is `.skip()`'d for the
  // same reason.

  intersection_with_required_override: {
    title: 'Partial<T> intersected with Required<Pick<T, K>> (re-requires one prop)',
    description:
      'Intersection that flips a property\'s optionality — `Partial<Person>` makes all props optional, then `& Required<Pick<Person, "name">>` re-requires only `name`. tsgo resolves the intersection to {name: string; age?: number; createdAt?: Date}; reuses the object emit.',
    validateNotes:
      "Intersections of utility types resolve at the type-checker layer to a single flat object shape. Use this pattern to flip a specific property's optionality without re-declaring the whole type.",
    validate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidate<Partial<Person> & Required<Pick<Person, 'name'>>>();
    },
    validateDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidate<DataOnly<Partial<Person> & Required<Pick<Person, 'name'>>>>();
    },
    validateSchema: () =>
      createValidate(
        RT.intersection(
          RT.partial(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()})),
          RT.required(RT.pick(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}), ['name']))
        )
      ),
    deserializeValidate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeValidate<Partial<Person> & Required<Pick<Person, 'name'>>>();
    },
    validateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrors<Partial<Person> & Required<Pick<Person, 'name'>>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrors<DataOnly<Partial<Person> & Required<Pick<Person, 'name'>>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.intersection(
          RT.partial(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()})),
          RT.required(RT.pick(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}), ['name']))
        )
      ),
    deserializeGetValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeGetValidationErrors<Partial<Person> & Required<Pick<Person, 'name'>>>();
    },
    getValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createMockType<Partial<Person> & Required<Pick<Person, 'name'>>>();
    },
    mockTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {name: 'John'},
        {name: 'John', age: 30},
        {name: 'John', createdAt: new Date()},
        {name: 'John', age: 30, createdAt: new Date()},
      ],
      invalid: [
        {}, // name is required
        {age: 30}, // name still required
        {name: 42}, // wrong type
        {name: 'John', age: '30'}, // wrong type at optional slot
        null,
        undefined,
        {name: 'John', age: NaN}, // NaN at optional
        {name: 'John', createdAt: new Date('invalid')}, // Invalid Date in optional
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['name'], expected: 'string'}],
      [{path: ['name'], expected: 'string'}],
      [{path: ['name'], expected: 'string'}],
      [{path: ['age'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['age'], expected: 'number'}],
      [{path: ['createdAt'], expected: 'date'}],
    ],
  },

  omit_keeping_optional: {
    title: 'Omit<T, K> preserves optionality of remaining props',
    description: 'Omit preserves the optionality of remaining properties — resolves to {b?: number; c: boolean}.',
    validate: () => createValidate<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
    validateDataOnly: () => createValidate<DataOnly<Omit<{a: string; b?: number; c: boolean}, 'a'>>>(),
    validateSchema: () => createValidate(RT.omit(RT.object({a: RT.string(), b: RT.optional(RT.number()), c: RT.boolean()}), ['a'])),
    deserializeValidate: () => deserializeValidate<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
    validateReflect: () => {
      const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
      return deserializeValidate(v);
    },
    getValidationErrors: () => createGetValidationErrors<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
    getValidationErrorsDataOnly: () => createGetValidationErrors<DataOnly<Omit<{a: string; b?: number; c: boolean}, 'a'>>>(),
    getValidationErrorsSchema: () =>
      createGetValidationErrors(RT.omit(RT.object({a: RT.string(), b: RT.optional(RT.number()), c: RT.boolean()}), ['a'])),
    deserializeGetValidationErrors: () => deserializeGetValidationErrors<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
    getValidationErrorsReflect: () => {
      const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => createMockType<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
    mockTypeReflect: () => {
      const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{c: true}, {b: 1, c: false}, {c: true, b: undefined}],
      invalid: [{}, {b: 1}, {c: 'not boolean'}, null, undefined, {c: true, b: NaN}, {c: 0}, {b: 1, c: 1}],
    }),
    // `c` is required, `b` is optional. `c` defaults to undefined when
    // missing → boolean check fails. NaN/non-boolean values at `b` or
    // `c` fall through to their atomic checks.
    getExpectedErrors: () => [
      [{path: ['c'], expected: 'boolean'}],
      [{path: ['c'], expected: 'boolean'}],
      [{path: ['c'], expected: 'boolean'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['b'], expected: 'number'}],
      [{path: ['c'], expected: 'boolean'}],
      [{path: ['c'], expected: 'boolean'}],
    ],
  },

  keyof_to_literal_union: {
    title: 'keyof T — resolves to a union of string-literal keys',
    description:
      '`keyof Person` where Person has `name: string; age: number; createdAt: Date` resolves to the union `"name" | "age" | "createdAt"`. The validator is the union of three string literals.',
    validateNotes:
      '`keyof T` is resolved at the type-checker layer to a union of the prop names as literals. Validation is identical to a hand-written string literal union.',
    validate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidate<keyof Person>();
    },
    validateDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createValidate<DataOnly<keyof Person>>();
    },
    validateSchema: () => createValidate(RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')])),
    deserializeValidate: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeValidate<keyof Person>();
    },
    validateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: keyof Person = 'name';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: keyof Person = 'name';
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrors<keyof Person>();
    },
    getValidationErrorsDataOnly: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetValidationErrors<DataOnly<keyof Person>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrors(RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')])),
    deserializeGetValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeGetValidationErrors<keyof Person>();
    },
    getValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: keyof Person = 'name';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: keyof Person = 'name';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createMockType<keyof Person>();
    },
    mockTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: keyof Person = 'name';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: ['name', 'age', 'createdAt'],
      invalid: ['other', '', 42, null, undefined, true, 'Name'],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  typeof_variable_query: {
    title: 'typeof variable — type query on a runtime value',
    description:
      "`typeof config` where `config` is a bound value resolves to the value's static type. Without `as const` the type is widened (`url: string`, `port: number`); with `as const` it pins to literals. This case verifies the widened path.",
    validateNotes:
      '`typeof <variable>` reads the declared / inferred type of a value. Validation runs against the resolved shape; the value itself is discarded at type-check time.',
    validate: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createValidate<typeof config>();
    },
    validateDataOnly: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createValidate<DataOnly<typeof config>>();
    },
    validateSchema: () => createValidate(RT.object({url: RT.string(), port: RT.number()})),
    deserializeValidate: () => {
      const config = {url: 'http://example.com', port: 8080};
      return deserializeValidate<typeof config>();
    },
    validateReflect: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createValidate(config);
    },
    deserializeValidateReflect: () => {
      const config = {url: 'http://example.com', port: 8080};
      return deserializeValidate(config);
    },
    getValidationErrors: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createGetValidationErrors<typeof config>();
    },
    getValidationErrorsDataOnly: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createGetValidationErrors<DataOnly<typeof config>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrors(RT.object({url: RT.string(), port: RT.number()})),
    deserializeGetValidationErrors: () => {
      const config = {url: 'http://example.com', port: 8080};
      return deserializeGetValidationErrors<typeof config>();
    },
    getValidationErrorsReflect: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createGetValidationErrors(config);
    },
    deserializeGetValidationErrorsReflect: () => {
      const config = {url: 'http://example.com', port: 8080};
      return deserializeGetValidationErrors(config);
    },
    mockType: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createMockType<typeof config>();
    },
    mockTypeReflect: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createMockType(config);
    },
    getSamples: () => ({
      valid: [
        {url: 'http://example.com', port: 8080},
        {url: '', port: 0},
      ],
      invalid: [
        {url: 'x'}, // missing port
        {port: 80}, // missing url
        {url: 42, port: 8080}, // wrong type
        null,
        undefined,
      ],
    }),
    getExpectedErrors: () => [
      [{path: ['port'], expected: 'number'}],
      [{path: ['url'], expected: 'string'}],
      [{path: ['url'], expected: 'string'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  indexed_access_type: {
    title: 'Indexed access type — Person["name"] resolves to string',
    description:
      '`T[K]` reads the value type of a property. `Person["name"]` resolves to `string` at the type-checker layer; the validator is identical to the atomic `string` shape. Pins the resolution path through the cache.',
    validate: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createValidate<Person['name']>();
    },
    validateDataOnly: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createValidate<DataOnly<Person['name']>>();
    },
    validateSchema: () => createValidate(RT.string()),
    deserializeValidate: () => {
      interface Person {
        name: string;
        age: number;
      }
      return deserializeValidate<Person['name']>();
    },
    validateReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Person['name'] = 'x';
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Person['name'] = 'x';
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createGetValidationErrors<Person['name']>();
    },
    getValidationErrorsDataOnly: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createGetValidationErrors<DataOnly<Person['name']>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrors(RT.string()),
    deserializeGetValidationErrors: () => {
      interface Person {
        name: string;
        age: number;
      }
      return deserializeGetValidationErrors<Person['name']>();
    },
    getValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Person['name'] = 'x';
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Person['name'] = 'x';
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createMockType<Person['name']>();
    },
    mockTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Person['name'] = 'x';
      return createMockType(v);
    },
    getSamples: () => ({
      valid: ['hello', ''],
      invalid: [42, null, undefined, true],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
      [{path: [], expected: 'string'}],
    ],
  },

  conditional_type_resolved: {
    title: 'Conditional type — T extends string ? boolean : number',
    description:
      '`T extends U ? X : Y` resolves at the type-checker layer to either X or Y depending on T. `IsString<"hello">` resolves to `boolean` here. Validation pins that the conditional threads through to the resolved shape.',
    validate: () => {
      type IsString<T> = T extends string ? boolean : number;
      return createValidate<IsString<'hello'>>();
    },
    validateDataOnly: () => {
      type IsString<T> = T extends string ? boolean : number;
      return createValidate<DataOnly<IsString<'hello'>>>();
    },
    validateSchema: () => createValidate(RT.boolean()),
    deserializeValidate: () => {
      type IsString<T> = T extends string ? boolean : number;
      return deserializeValidate<IsString<'hello'>>();
    },
    validateReflect: () => {
      type IsString<T> = T extends string ? boolean : number;
      const v: IsString<'hello'> = true;
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      type IsString<T> = T extends string ? boolean : number;
      const v: IsString<'hello'> = true;
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type IsString<T> = T extends string ? boolean : number;
      return createGetValidationErrors<IsString<'hello'>>();
    },
    getValidationErrorsDataOnly: () => {
      type IsString<T> = T extends string ? boolean : number;
      return createGetValidationErrors<DataOnly<IsString<'hello'>>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrors(RT.boolean()),
    deserializeGetValidationErrors: () => {
      type IsString<T> = T extends string ? boolean : number;
      return deserializeGetValidationErrors<IsString<'hello'>>();
    },
    getValidationErrorsReflect: () => {
      type IsString<T> = T extends string ? boolean : number;
      const v: IsString<'hello'> = true;
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type IsString<T> = T extends string ? boolean : number;
      const v: IsString<'hello'> = true;
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      type IsString<T> = T extends string ? boolean : number;
      return createMockType<IsString<'hello'>>();
    },
    mockTypeReflect: () => {
      type IsString<T> = T extends string ? boolean : number;
      const v: IsString<'hello'> = true;
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [true, false],
      invalid: [42, 'x', null, undefined, 0, 1],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
      [{path: [], expected: 'boolean'}],
    ],
  },

  mapped_type_custom: {
    title: 'Custom mapped type — {[K in keyof T]: T[K] | null}',
    description:
      'A user-authored mapped type that augments every prop with `| null`. Tests that resolver + emit thread custom mapped types correctly; Partial / Required / Pick etc. exercise the same machinery via the built-in utility paths.',
    validate: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return createValidate<Nullable<Source>>();
    },
    validateDataOnly: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return createValidate<DataOnly<Nullable<Source>>>();
    },
    validateSchema: () =>
      createValidate(RT.object({a: RT.union([RT.string(), RT.literal(null)]), b: RT.union([RT.number(), RT.literal(null)])})),
    deserializeValidate: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return deserializeValidate<Nullable<Source>>();
    },
    validateReflect: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      const v: Nullable<Source> = {a: 'x', b: 1};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      const v: Nullable<Source> = {a: 'x', b: 1};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return createGetValidationErrors<Nullable<Source>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return createGetValidationErrors<DataOnly<Nullable<Source>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.object({a: RT.union([RT.string(), RT.literal(null)]), b: RT.union([RT.number(), RT.literal(null)])})
      ),
    deserializeGetValidationErrors: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return deserializeGetValidationErrors<Nullable<Source>>();
    },
    getValidationErrorsReflect: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      const v: Nullable<Source> = {a: 'x', b: 1};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      const v: Nullable<Source> = {a: 'x', b: 1};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return createMockType<Nullable<Source>>();
    },
    mockTypeReflect: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      const v: Nullable<Source> = {a: 'x', b: 1};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {a: 'x', b: 1},
        {a: null, b: 1},
        {a: 'x', b: null},
        {a: null, b: null},
      ],
      invalid: [
        {a: 42, b: 1}, // a not string|null
        {a: 'x', b: 'not number'}, // b not number|null
        {b: 1}, // missing a (undefined ∉ string|null)
        null,
        undefined,
      ],
    }),
    // Each prop's value is a union (string|null or number|null), so
    // mismatched values produce union-failure errors at the prop path.
    getExpectedErrors: () => [
      [{path: ['a'], expected: 'union'}],
      [{path: ['b'], expected: 'union'}],
      [{path: ['a'], expected: 'union'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  mapped_type_with_conditional_value: {
    title: 'Mapped type whose value is a conditional — per-prop shape diverges',
    description:
      '`{[K in keyof T]: FieldFor<T[K]>}` where `FieldFor<X>` is a conditional that produces a different object shape for each input type. The resolver evaluates the conditional per prop at the type-checker layer, so each prop ends up with its own concrete (and different) validator. Stress-tests the "two-different-validations-from-one-mapping" pattern.',
    validateNotes:
      'Each prop ends up with a structurally distinct shape — `name` validates as a text field, `age` as a number field, `admin` as a checkbox. The validator emits independent per-prop checks.',
    validate: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      return createValidate<UserForm>();
    },
    validateDataOnly: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      return createValidate<DataOnly<UserForm>>();
    },
    validateSchema: () =>
      createValidate(
        RT.object({
          name: RT.object({kind: RT.literal('text'), value: RT.string()}),
          age: RT.object({kind: RT.literal('number'), value: RT.number(), min: RT.optional(RT.number())}),
          admin: RT.object({kind: RT.literal('checkbox'), value: RT.boolean()}),
        })
      ),
    deserializeValidate: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      return deserializeValidate<UserForm>();
    },
    validateReflect: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      const v: UserForm = {
        name: {kind: 'text', value: 'x'},
        age: {kind: 'number', value: 1},
        admin: {kind: 'checkbox', value: true},
      };
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      const v: UserForm = {
        name: {kind: 'text', value: 'x'},
        age: {kind: 'number', value: 1},
        admin: {kind: 'checkbox', value: true},
      };
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      return createGetValidationErrors<UserForm>();
    },
    getValidationErrorsDataOnly: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      return createGetValidationErrors<DataOnly<UserForm>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.object({
          name: RT.object({kind: RT.literal('text'), value: RT.string()}),
          age: RT.object({kind: RT.literal('number'), value: RT.number(), min: RT.optional(RT.number())}),
          admin: RT.object({kind: RT.literal('checkbox'), value: RT.boolean()}),
        })
      ),
    deserializeGetValidationErrors: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      return deserializeGetValidationErrors<UserForm>();
    },
    getValidationErrorsReflect: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      const v: UserForm = {
        name: {kind: 'text', value: 'x'},
        age: {kind: 'number', value: 1},
        admin: {kind: 'checkbox', value: true},
      };
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      const v: UserForm = {
        name: {kind: 'text', value: 'x'},
        age: {kind: 'number', value: 1},
        admin: {kind: 'checkbox', value: true},
      };
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      return createMockType<UserForm>();
    },
    mockTypeReflect: () => {
      type FieldFor<T> = T extends string
        ? {kind: 'text'; value: string}
        : T extends number
          ? {kind: 'number'; value: number; min?: number}
          : T extends boolean
            ? {kind: 'checkbox'; value: boolean}
            : never;
      interface User {
        name: string;
        age: number;
        admin: boolean;
      }
      type UserForm = {[K in keyof User]: FieldFor<User[K]>};
      const v: UserForm = {
        name: {kind: 'text', value: 'x'},
        age: {kind: 'number', value: 1},
        admin: {kind: 'checkbox', value: true},
      };
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {
          name: {kind: 'text', value: 'Alice'},
          age: {kind: 'number', value: 30},
          admin: {kind: 'checkbox', value: true},
        },
        // age.min is optional
        {
          name: {kind: 'text', value: 'B'},
          age: {kind: 'number', value: 1, min: 0},
          admin: {kind: 'checkbox', value: false},
        },
      ],
      invalid: [
        // age.kind wrong literal
        {
          name: {kind: 'text', value: 'x'},
          age: {kind: 'text', value: 1},
          admin: {kind: 'checkbox', value: true},
        },
        // name.value wrong type
        {
          name: {kind: 'text', value: 42},
          age: {kind: 'number', value: 1},
          admin: {kind: 'checkbox', value: true},
        },
        // missing required prop
        {
          name: {kind: 'text', value: 'x'},
          age: {kind: 'number', value: 1},
        },
        null,
        undefined,
      ],
    }),
    getExpectedErrors: () => [
      // age.kind is 'text' but the resolved type for age says it
      // must be 'number' literal.
      [{path: ['age', 'kind'], expected: 'literal'}],
      // name.value wrong type — must be string.
      [{path: ['name', 'value'], expected: 'string'}],
      // missing admin → admin is undefined → object check at ['admin'] fails.
      [{path: ['admin'], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },

  distributive_conditional_over_union: {
    title: 'Distributive conditional — `Wrap<string | number>` → `{w:string} | {w:number}`',
    description:
      'When a conditional type is applied to a generic union, TS distributes the conditional over each member, producing a union of the per-arm results. `T extends any ? {w: T} : never` applied to `string | number` resolves to `{w: string} | {w: number}`. Validator dispatches through the union emit.',
    validate: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return createValidate<Wrap<string | number>>();
    },
    validateDataOnly: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return createValidate<DataOnly<Wrap<string | number>>>();
    },
    validateSchema: () => createValidate(RT.union([RT.object({w: RT.string()}), RT.object({w: RT.number()})])),
    deserializeValidate: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return deserializeValidate<Wrap<string | number>>();
    },
    validateReflect: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const v: Wrap<string | number> = {w: 'x'};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const v: Wrap<string | number> = {w: 'x'};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return createGetValidationErrors<Wrap<string | number>>();
    },
    getValidationErrorsDataOnly: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return createGetValidationErrors<DataOnly<Wrap<string | number>>>();
    },
    getValidationErrorsSchema: () => createGetValidationErrors(RT.union([RT.object({w: RT.string()}), RT.object({w: RT.number()})])),
    deserializeGetValidationErrors: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return deserializeGetValidationErrors<Wrap<string | number>>();
    },
    getValidationErrorsReflect: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const v: Wrap<string | number> = {w: 'x'};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const v: Wrap<string | number> = {w: 'x'};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return createMockType<Wrap<string | number>>();
    },
    mockTypeReflect: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const v: Wrap<string | number> = {w: 'x'};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [{w: 'hello'}, {w: 42}],
      invalid: [{w: true}, {w: null}, {}, null, undefined, {w: NaN}],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
      [{path: [], expected: 'union'}],
    ],
  },

  deep_partial_recursive_mapped: {
    title: 'DeepPartial<T> — recursive mapped type with nested optionality',
    description:
      '`type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]}`. Recursively makes every nested object-typed property optional. The resolver evaluates the recursion at the type-checker layer; the validator sees the fully flattened all-optional-deep shape.',
    validateNotes:
      'Every nested object becomes all-optional. The `allOptionalCode` guard fires at every level so non-plain-object inputs (arrays, Date, …) are rejected even though the all-optional shape would otherwise accept them.',
    validate: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return createValidate<DeepPartial<Settings>>();
    },
    validateDataOnly: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return createValidate<DataOnly<DeepPartial<Settings>>>();
    },
    validateSchema: () =>
      createValidate(
        RT.object({
          display: RT.optional(
            RT.object({
              theme: RT.optional(RT.union([RT.literal('light'), RT.literal('dark')])),
              brightness: RT.optional(RT.number()),
            })
          ),
          audio: RT.optional(RT.object({volume: RT.optional(RT.number()), muted: RT.optional(RT.boolean())})),
        })
      ),
    deserializeValidate: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return deserializeValidate<DeepPartial<Settings>>();
    },
    validateReflect: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      const v: DeepPartial<Settings> = {};
      return createValidate(v);
    },
    deserializeValidateReflect: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      const v: DeepPartial<Settings> = {};
      return deserializeValidate(v);
    },
    getValidationErrors: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return createGetValidationErrors<DeepPartial<Settings>>();
    },
    getValidationErrorsDataOnly: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return createGetValidationErrors<DataOnly<DeepPartial<Settings>>>();
    },
    getValidationErrorsSchema: () =>
      createGetValidationErrors(
        RT.object({
          display: RT.optional(
            RT.object({
              theme: RT.optional(RT.union([RT.literal('light'), RT.literal('dark')])),
              brightness: RT.optional(RT.number()),
            })
          ),
          audio: RT.optional(RT.object({volume: RT.optional(RT.number()), muted: RT.optional(RT.boolean())})),
        })
      ),
    deserializeGetValidationErrors: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return deserializeGetValidationErrors<DeepPartial<Settings>>();
    },
    getValidationErrorsReflect: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      const v: DeepPartial<Settings> = {};
      return createGetValidationErrors(v);
    },
    deserializeGetValidationErrorsReflect: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      const v: DeepPartial<Settings> = {};
      return deserializeGetValidationErrors(v);
    },
    mockType: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return createMockType<DeepPartial<Settings>>();
    },
    mockTypeReflect: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      const v: DeepPartial<Settings> = {};
      return createMockType(v);
    },
    getSamples: () => ({
      valid: [
        {},
        {display: {}},
        {audio: {volume: 1}},
        {display: {theme: 'light'}, audio: {muted: true}},
        {display: {theme: 'dark', brightness: 0.5}, audio: {volume: 1, muted: false}},
      ],
      invalid: [
        [], // allOptionalCode guard rejects arrays at the outer level
        new Date(), // same — Date is not '[object Object]'
        {display: 'not object'}, // nested object expected
        {display: {theme: 'invalid'}}, // literal-union arm fails
        {audio: {volume: NaN}}, // NaN fails number
        null,
        undefined,
      ],
    }),
    getExpectedErrors: () => [
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: ['display'], expected: 'objectLiteral'}],
      // theme is a literal union 'light'|'dark', 'invalid' fails the
      // union check at ['display', 'theme'].
      [{path: ['display', 'theme'], expected: 'union'}],
      [{path: ['audio', 'volume'], expected: 'number'}],
      [{path: [], expected: 'objectLiteral'}],
      [{path: [], expected: 'objectLiteral'}],
    ],
  },
} as const satisfies Record<string, ValidationCase>;
