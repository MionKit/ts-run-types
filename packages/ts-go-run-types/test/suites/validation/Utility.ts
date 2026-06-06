import type {ValidationCase} from './types.ts';
import {createIsType, createGetTypeErrors, createMockType} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/define';
import {deserializeIsType, deserializeGetTypeErrors} from '../../util/deserializeRTFunctions.ts';

export const UTILITY = {
  partial: {
    title: 'Partial<T> — all props become optional',
    description:
      'mion utility/partial.spec.ts — all properties become optional. Resolves to {name?: string; age?: number; createdAt?: Date}; reuses the object emit with allOptionalCode array-rejection guard.',
    isTypeNotes:
      'Resolves to an all-optional object shape, so the `allOptionalCode` guard kicks in: arrays, Date, Map, Set, RegExp are rejected at the top level even though `{}` is valid. Present properties still run their atomic checks (Invalid Date in `createdAt` fails).',
    isType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createIsType<Partial<Person>>();
    },
    isTypeSchema: () => createIsType(RT.partial(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}))),
    deserializeIsType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeIsType<Partial<Person>>();
    },
    isTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> = {};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> = {};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetTypeErrors<Partial<Person>>();
    },
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.partial(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}))),
    deserializeGetTypeErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeGetTypeErrors<Partial<Person>>();
    },
    getTypeErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> = {};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> = {};
      return deserializeGetTypeErrors(v);
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
    isType: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return createIsType<Required<MaybePerson>>();
    },
    isTypeSchema: () =>
      createIsType(
        RT.required(RT.object({name: RT.optional(RT.string()), age: RT.optional(RT.number()), createdAt: RT.optional(RT.date())}))
      ),
    deserializeIsType: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return deserializeIsType<Required<MaybePerson>>();
    },
    isTypeReflect: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return createGetTypeErrors<Required<MaybePerson>>();
    },
    getTypeErrorsSchema: () =>
      createGetTypeErrors(
        RT.required(RT.object({name: RT.optional(RT.string()), age: RT.optional(RT.number()), createdAt: RT.optional(RT.date())}))
      ),
    deserializeGetTypeErrors: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      return deserializeGetTypeErrors<Required<MaybePerson>>();
    },
    getTypeErrorsReflect: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface MaybePerson {
        name?: string;
        age?: number;
        createdAt?: Date;
      }
      const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
      return deserializeGetTypeErrors(v);
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
    isTypeNotes:
      'Resolves to a fixed-property object with only the picked keys. Extra properties on the input still pass (structural typing).',
    isType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createIsType<Pick<Person, 'name' | 'createdAt'>>();
    },
    isTypeSchema: () =>
      createIsType(RT.pick(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}), ['name', 'createdAt'])),
    deserializeIsType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeIsType<Pick<Person, 'name' | 'createdAt'>>();
    },
    isTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetTypeErrors<Pick<Person, 'name' | 'createdAt'>>();
    },
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.pick(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}), ['name', 'createdAt'])),
    deserializeGetTypeErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeGetTypeErrors<Pick<Person, 'name' | 'createdAt'>>();
    },
    getTypeErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
      return deserializeGetTypeErrors(v);
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
    isTypeNotes:
      'Resolves to the original shape minus the omitted keys. The omitted property can still appear on the input — structural typing accepts extras.',
    isType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createIsType<Omit<Person, 'age'>>();
    },
    isTypeSchema: () => createIsType(RT.omit(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}), ['age'])),
    deserializeIsType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeIsType<Omit<Person, 'age'>>();
    },
    isTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetTypeErrors<Omit<Person, 'age'>>();
    },
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.omit(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}), ['age'])),
    deserializeGetTypeErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeGetTypeErrors<Omit<Person, 'age'>>();
    },
    getTypeErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
      return deserializeGetTypeErrors(v);
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
    isType: () => createIsType<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
    isTypeSchema: () =>
      createIsType(RT.exclude(RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]), RT.literal('age'))),
    deserializeIsType: () => deserializeIsType<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
    isTypeReflect: () => {
      const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(
        RT.exclude(RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]), RT.literal('age'))
      ),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
    getTypeErrorsReflect: () => {
      const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
      return deserializeGetTypeErrors(v);
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
    isType: () => createIsType<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    isTypeSchema: () =>
      createIsType(
        RT.extract(
          RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]),
          RT.union([RT.literal('name'), RT.literal('createdAt')])
        )
      ),
    deserializeIsType: () => deserializeIsType<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    isTypeReflect: () => {
      const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(
        RT.extract(
          RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]),
          RT.union([RT.literal('name'), RT.literal('createdAt')])
        )
      ),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    getTypeErrorsReflect: () => {
      const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
      return deserializeGetTypeErrors(v);
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
    isType: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return createIsType<Exclude<Shape, {kind: 'circle'}>>();
    },
    isTypeSchema: () =>
      createIsType(
        RT.exclude(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: RT.number()}),
            RT.object({kind: RT.literal('square'), x: RT.number()}),
            RT.object({kind: RT.literal('triangle'), base: RT.number(), height: RT.number()}),
          ]),
          RT.object({kind: RT.literal('circle')})
        )
      ),
    deserializeIsType: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return deserializeIsType<Exclude<Shape, {kind: 'circle'}>>();
    },
    isTypeReflect: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return createGetTypeErrors<Exclude<Shape, {kind: 'circle'}>>();
    },
    getTypeErrorsSchema: () =>
      createGetTypeErrors(
        RT.exclude(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: RT.number()}),
            RT.object({kind: RT.literal('square'), x: RT.number()}),
            RT.object({kind: RT.literal('triangle'), base: RT.number(), height: RT.number()}),
          ]),
          RT.object({kind: RT.literal('circle')})
        )
      ),
    deserializeGetTypeErrors: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      return deserializeGetTypeErrors<Exclude<Shape, {kind: 'circle'}>>();
    },
    getTypeErrorsReflect: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      type Shape =
        | {kind: 'circle'; radius: number}
        | {kind: 'square'; x: number}
        | {kind: 'triangle'; base: number; height: number};
      const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
      return deserializeGetTypeErrors(v);
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
    isType: () => createIsType<NonNullable<string | number | null | undefined>>(),
    isTypeSchema: () =>
      createIsType(RT.nonNullable(RT.union([RT.string(), RT.number(), RT.literal(null), RT.literal(undefined)]))),
    deserializeIsType: () => deserializeIsType<NonNullable<string | number | null | undefined>>(),
    isTypeReflect: () => {
      const v: NonNullable<string | number | null | undefined> = 'hello';
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: NonNullable<string | number | null | undefined> = 'hello';
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<NonNullable<string | number | null | undefined>>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.nonNullable(RT.union([RT.string(), RT.number(), RT.literal(null), RT.literal(undefined)]))),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<NonNullable<string | number | null | undefined>>(),
    getTypeErrorsReflect: () => {
      const v: NonNullable<string | number | null | undefined> = 'hello';
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: NonNullable<string | number | null | undefined> = 'hello';
      return deserializeGetTypeErrors(v);
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
    isType: () => {
      type Fn = (a: number, b: boolean) => Date;
      return createIsType<ReturnType<Fn>>();
    },
    isTypeSchema: () => createIsType(RT.returnType(RT.func([RT.number(), RT.boolean()], RT.date()))),
    deserializeIsType: () => {
      type Fn = (a: number, b: boolean) => Date;
      return deserializeIsType<ReturnType<Fn>>();
    },
    isTypeReflect: () => {
      type Fn = (a: number, b: boolean) => Date;
      const v: ReturnType<Fn> = new Date();
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      type Fn = (a: number, b: boolean) => Date;
      const v: ReturnType<Fn> = new Date();
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      type Fn = (a: number, b: boolean) => Date;
      return createGetTypeErrors<ReturnType<Fn>>();
    },
    getTypeErrorsSchema: () => createGetTypeErrors(RT.returnType(RT.func([RT.number(), RT.boolean()], RT.date()))),
    deserializeGetTypeErrors: () => {
      type Fn = (a: number, b: boolean) => Date;
      return deserializeGetTypeErrors<ReturnType<Fn>>();
    },
    getTypeErrorsReflect: () => {
      type Fn = (a: number, b: boolean) => Date;
      const v: ReturnType<Fn> = new Date();
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      type Fn = (a: number, b: boolean) => Date;
      const v: ReturnType<Fn> = new Date();
      return deserializeGetTypeErrors(v);
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
    isType: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createIsType<Readonly<Person>>();
    },
    isTypeSchema: () => createIsType(RT.readonly(RT.object({name: RT.string(), age: RT.number()}))),
    deserializeIsType: () => {
      interface Person {
        name: string;
        age: number;
      }
      return deserializeIsType<Readonly<Person>>();
    },
    isTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Readonly<Person> = {name: 'John', age: 30};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Readonly<Person> = {name: 'John', age: 30};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createGetTypeErrors<Readonly<Person>>();
    },
    getTypeErrorsSchema: () => createGetTypeErrors(RT.readonly(RT.object({name: RT.string(), age: RT.number()}))),
    deserializeGetTypeErrors: () => {
      interface Person {
        name: string;
        age: number;
      }
      return deserializeGetTypeErrors<Readonly<Person>>();
    },
    getTypeErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Readonly<Person> = {name: 'John', age: 30};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Readonly<Person> = {name: 'John', age: 30};
      return deserializeGetTypeErrors(v);
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
    isTypeNotes:
      "Intersections of utility types resolve at the type-checker layer to a single flat object shape. Use this pattern to flip a specific property's optionality without re-declaring the whole type.",
    isType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createIsType<Partial<Person> & Required<Pick<Person, 'name'>>>();
    },
    isTypeSchema: () =>
      createIsType(
        RT.intersection(
          RT.partial(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()})),
          RT.required(RT.pick(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}), ['name']))
        )
      ),
    deserializeIsType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeIsType<Partial<Person> & Required<Pick<Person, 'name'>>>();
    },
    isTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetTypeErrors<Partial<Person> & Required<Pick<Person, 'name'>>>();
    },
    getTypeErrorsSchema: () =>
      createGetTypeErrors(
        RT.intersection(
          RT.partial(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()})),
          RT.required(RT.pick(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}), ['name']))
        )
      ),
    deserializeGetTypeErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeGetTypeErrors<Partial<Person> & Required<Pick<Person, 'name'>>>();
    },
    getTypeErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
      return deserializeGetTypeErrors(v);
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
    isType: () => createIsType<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
    isTypeSchema: () => createIsType(RT.omit(RT.object({a: RT.string(), b: RT.optional(RT.number()), c: RT.boolean()}), ['a'])),
    deserializeIsType: () => deserializeIsType<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
    isTypeReflect: () => {
      const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
      return deserializeIsType(v);
    },
    getTypeErrors: () => createGetTypeErrors<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
    getTypeErrorsSchema: () =>
      createGetTypeErrors(RT.omit(RT.object({a: RT.string(), b: RT.optional(RT.number()), c: RT.boolean()}), ['a'])),
    deserializeGetTypeErrors: () => deserializeGetTypeErrors<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
    getTypeErrorsReflect: () => {
      const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
      return deserializeGetTypeErrors(v);
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
    isTypeNotes:
      '`keyof T` is resolved at the type-checker layer to a union of the prop names as literals. Validation is identical to a hand-written string literal union.',
    isType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createIsType<keyof Person>();
    },
    isTypeSchema: () => createIsType(RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')])),
    deserializeIsType: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeIsType<keyof Person>();
    },
    isTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: keyof Person = 'name';
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: keyof Person = 'name';
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return createGetTypeErrors<keyof Person>();
    },
    getTypeErrorsSchema: () => createGetTypeErrors(RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')])),
    deserializeGetTypeErrors: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      return deserializeGetTypeErrors<keyof Person>();
    },
    getTypeErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: keyof Person = 'name';
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
        createdAt: Date;
      }
      const v: keyof Person = 'name';
      return deserializeGetTypeErrors(v);
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
    isTypeNotes:
      '`typeof <variable>` reads the declared / inferred type of a value. Validation runs against the resolved shape; the value itself is discarded at type-check time.',
    isType: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createIsType<typeof config>();
    },
    isTypeSchema: () => createIsType(RT.object({url: RT.string(), port: RT.number()})),
    deserializeIsType: () => {
      const config = {url: 'http://example.com', port: 8080};
      return deserializeIsType<typeof config>();
    },
    isTypeReflect: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createIsType(config);
    },
    deserializeIsTypeReflect: () => {
      const config = {url: 'http://example.com', port: 8080};
      return deserializeIsType(config);
    },
    getTypeErrors: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createGetTypeErrors<typeof config>();
    },
    deserializeGetTypeErrors: () => {
      const config = {url: 'http://example.com', port: 8080};
      return deserializeGetTypeErrors<typeof config>();
    },
    getTypeErrorsReflect: () => {
      const config = {url: 'http://example.com', port: 8080};
      return createGetTypeErrors(config);
    },
    deserializeGetTypeErrorsReflect: () => {
      const config = {url: 'http://example.com', port: 8080};
      return deserializeGetTypeErrors(config);
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
    isType: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createIsType<Person['name']>();
    },
    isTypeSchema: () => createIsType(RT.string()),
    deserializeIsType: () => {
      interface Person {
        name: string;
        age: number;
      }
      return deserializeIsType<Person['name']>();
    },
    isTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Person['name'] = 'x';
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Person['name'] = 'x';
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface Person {
        name: string;
        age: number;
      }
      return createGetTypeErrors<Person['name']>();
    },
    getTypeErrorsSchema: () => createGetTypeErrors(RT.string()),
    deserializeGetTypeErrors: () => {
      interface Person {
        name: string;
        age: number;
      }
      return deserializeGetTypeErrors<Person['name']>();
    },
    getTypeErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Person['name'] = 'x';
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface Person {
        name: string;
        age: number;
      }
      const v: Person['name'] = 'x';
      return deserializeGetTypeErrors(v);
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
    isType: () => {
      type IsString<T> = T extends string ? boolean : number;
      return createIsType<IsString<'hello'>>();
    },
    isTypeSchema: () => createIsType(RT.boolean()),
    deserializeIsType: () => {
      type IsString<T> = T extends string ? boolean : number;
      return deserializeIsType<IsString<'hello'>>();
    },
    isTypeReflect: () => {
      type IsString<T> = T extends string ? boolean : number;
      const v: IsString<'hello'> = true;
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      type IsString<T> = T extends string ? boolean : number;
      const v: IsString<'hello'> = true;
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      type IsString<T> = T extends string ? boolean : number;
      return createGetTypeErrors<IsString<'hello'>>();
    },
    getTypeErrorsSchema: () => createGetTypeErrors(RT.boolean()),
    deserializeGetTypeErrors: () => {
      type IsString<T> = T extends string ? boolean : number;
      return deserializeGetTypeErrors<IsString<'hello'>>();
    },
    getTypeErrorsReflect: () => {
      type IsString<T> = T extends string ? boolean : number;
      const v: IsString<'hello'> = true;
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      type IsString<T> = T extends string ? boolean : number;
      const v: IsString<'hello'> = true;
      return deserializeGetTypeErrors(v);
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
    isType: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return createIsType<Nullable<Source>>();
    },
    isTypeSchema: () =>
      createIsType(RT.object({a: RT.union([RT.string(), RT.literal(null)]), b: RT.union([RT.number(), RT.literal(null)])})),
    deserializeIsType: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return deserializeIsType<Nullable<Source>>();
    },
    isTypeReflect: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      const v: Nullable<Source> = {a: 'x', b: 1};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      const v: Nullable<Source> = {a: 'x', b: 1};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return createGetTypeErrors<Nullable<Source>>();
    },
    deserializeGetTypeErrors: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      return deserializeGetTypeErrors<Nullable<Source>>();
    },
    getTypeErrorsReflect: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      const v: Nullable<Source> = {a: 'x', b: 1};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface Source {
        a: string;
        b: number;
      }
      type Nullable<T> = {[K in keyof T]: T[K] | null};
      const v: Nullable<Source> = {a: 'x', b: 1};
      return deserializeGetTypeErrors(v);
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
    isTypeNotes:
      'Each prop ends up with a structurally distinct shape — `name` validates as a text field, `age` as a number field, `admin` as a checkbox. The validator emits independent per-prop checks.',
    isType: () => {
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
      return createIsType<UserForm>();
    },
    isTypeSchema: () =>
      createIsType(
        RT.object({
          name: RT.object({kind: RT.literal('text'), value: RT.string()}),
          age: RT.object({kind: RT.literal('number'), value: RT.number(), min: RT.optional(RT.number())}),
          admin: RT.object({kind: RT.literal('checkbox'), value: RT.boolean()}),
        })
      ),
    deserializeIsType: () => {
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
      return deserializeIsType<UserForm>();
    },
    isTypeReflect: () => {
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
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
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
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
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
      return createGetTypeErrors<UserForm>();
    },
    deserializeGetTypeErrors: () => {
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
      return deserializeGetTypeErrors<UserForm>();
    },
    getTypeErrorsReflect: () => {
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
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
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
      return deserializeGetTypeErrors(v);
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
    isType: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return createIsType<Wrap<string | number>>();
    },
    isTypeSchema: () => createIsType(RT.union([RT.object({w: RT.string()}), RT.object({w: RT.number()})])),
    deserializeIsType: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return deserializeIsType<Wrap<string | number>>();
    },
    isTypeReflect: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const v: Wrap<string | number> = {w: 'x'};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const v: Wrap<string | number> = {w: 'x'};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return createGetTypeErrors<Wrap<string | number>>();
    },
    deserializeGetTypeErrors: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      return deserializeGetTypeErrors<Wrap<string | number>>();
    },
    getTypeErrorsReflect: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const v: Wrap<string | number> = {w: 'x'};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      type Wrap<T> = T extends any ? {w: T} : never;
      const v: Wrap<string | number> = {w: 'x'};
      return deserializeGetTypeErrors(v);
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
    isTypeNotes:
      'Every nested object becomes all-optional. The `allOptionalCode` guard fires at every level so non-plain-object inputs (arrays, Date, …) are rejected even though the all-optional shape would otherwise accept them.',
    isType: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return createIsType<DeepPartial<Settings>>();
    },
    isTypeSchema: () =>
      createIsType(
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
    deserializeIsType: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return deserializeIsType<DeepPartial<Settings>>();
    },
    isTypeReflect: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      const v: DeepPartial<Settings> = {};
      return createIsType(v);
    },
    deserializeIsTypeReflect: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      const v: DeepPartial<Settings> = {};
      return deserializeIsType(v);
    },
    getTypeErrors: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return createGetTypeErrors<DeepPartial<Settings>>();
    },
    deserializeGetTypeErrors: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      return deserializeGetTypeErrors<DeepPartial<Settings>>();
    },
    getTypeErrorsReflect: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      const v: DeepPartial<Settings> = {};
      return createGetTypeErrors(v);
    },
    deserializeGetTypeErrorsReflect: () => {
      interface Settings {
        display: {theme: 'light' | 'dark'; brightness: number};
        audio: {volume: number; muted: boolean};
      }
      type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
      const v: DeepPartial<Settings> = {};
      return deserializeGetTypeErrors(v);
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
