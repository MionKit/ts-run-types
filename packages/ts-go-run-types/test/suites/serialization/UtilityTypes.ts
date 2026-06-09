import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {SerializationCase} from './types.ts';

export const UTILITY_TYPES = {
  awaited: {
    title: 'Awaited<Promise<T>>',
    mutateEncoder: () => createJsonEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
    preserveDecoder: () =>
      createJsonDecoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
    binaryDecoder: () => createBinaryDecoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
    // Awaited<Promise<T>> resolves to T at the type-checker layer; the value-first
    // model is the resolved object shape (mirrors validation Native.awaited_promise,
    // which models Awaited<Promise<string>> as plain RT.string()).
    schemaEncoder: () => createJsonEncoder(RT.object({a: RT.string(), b: RT.number(), c: RT.date()})),
    schemaDecoder: () => createJsonDecoder(RT.object({a: RT.string(), b: RT.number(), c: RT.date()})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({a: RT.string(), b: RT.number(), c: RT.date()})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({a: RT.string(), b: RT.number(), c: RT.date()})),
    getTestData: () => ({values: [{a: 'hello', b: 1, c: new Date('2000-08-06T02:13:00.000Z')}]}),
  },
  exclude_atomic: {
    title: 'Exclude on atomic union',
    mutateEncoder: () => createJsonEncoder<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Exclude<'name' | 'age' | number, 'age'>>(),
    preserveDecoder: () => createJsonDecoder<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Exclude<'name' | 'age' | number, 'age'>>(),
    binaryDecoder: () => createBinaryDecoder<Exclude<'name' | 'age' | number, 'age'>>(),
    schemaEncoder: () =>
      createJsonEncoder(RT.exclude(RT.union([RT.literal('name'), RT.literal('age'), RT.number()]), RT.literal('age'))),
    schemaDecoder: () =>
      createJsonDecoder(RT.exclude(RT.union([RT.literal('name'), RT.literal('age'), RT.number()]), RT.literal('age'))),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(RT.exclude(RT.union([RT.literal('name'), RT.literal('age'), RT.number()]), RT.literal('age'))),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(RT.exclude(RT.union([RT.literal('name'), RT.literal('age'), RT.number()]), RT.literal('age'))),
    getTestData: () => ({values: ['name', 3, 4]}),
  },
  exclude_objects: {
    title: 'Exclude on object union',
    mutateEncoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonEncoder<Exclude<Shape, Circle>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonEncoder<Exclude<Shape, Circle>>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonEncoder<Exclude<Shape, Circle>>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonDecoder<Exclude<Shape, Circle>>();
    },
    preserveDecoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonDecoder<Exclude<Shape, Circle>>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createBinaryEncoder<Exclude<Shape, Circle>>();
    },
    binaryDecoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createBinaryDecoder<Exclude<Shape, Circle>>();
    },
    schemaEncoder: () =>
      createJsonEncoder(
        RT.exclude(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: RT.number()}),
            RT.object({kind: RT.literal('square'), x: RT.number()}),
            RT.object({kind: RT.literal('triangle'), x: RT.number(), y: RT.number()}),
          ]),
          RT.object({kind: RT.literal('circle'), radius: RT.number()})
        )
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.exclude(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: RT.number()}),
            RT.object({kind: RT.literal('square'), x: RT.number()}),
            RT.object({kind: RT.literal('triangle'), x: RT.number(), y: RT.number()}),
          ]),
          RT.object({kind: RT.literal('circle'), radius: RT.number()})
        )
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.exclude(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: RT.number()}),
            RT.object({kind: RT.literal('square'), x: RT.number()}),
            RT.object({kind: RT.literal('triangle'), x: RT.number(), y: RT.number()}),
          ]),
          RT.object({kind: RT.literal('circle'), radius: RT.number()})
        )
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.exclude(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: RT.number()}),
            RT.object({kind: RT.literal('square'), x: RT.number()}),
            RT.object({kind: RT.literal('triangle'), x: RT.number(), y: RT.number()}),
          ]),
          RT.object({kind: RT.literal('circle'), radius: RT.number()})
        )
      ),
    getTestData: () => ({
      values: [
        {kind: 'square', x: 5},
        {kind: 'triangle', x: 5, y: 10},
      ],
    }),
  },
  required_properties: {
    title: 'Required<T>',
    mutateEncoder: () =>
      createJsonEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Required<{name?: string; age?: number; createdAt?: Date}>>(),
    preserveDecoder: () =>
      createJsonDecoder<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(),
    binaryDecoder: () => createBinaryDecoder<Required<{name?: string; age?: number; createdAt?: Date}>>(),
    schemaEncoder: () =>
      createJsonEncoder(
        RT.required(RT.object({name: RT.optional(RT.string()), age: RT.optional(RT.number()), createdAt: RT.optional(RT.date())}))
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.required(RT.object({name: RT.optional(RT.string()), age: RT.optional(RT.number()), createdAt: RT.optional(RT.date())}))
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.required(RT.object({name: RT.optional(RT.string()), age: RT.optional(RT.number()), createdAt: RT.optional(RT.date())}))
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.required(RT.object({name: RT.optional(RT.string()), age: RT.optional(RT.number()), createdAt: RT.optional(RT.date())}))
      ),
    getTestData: () => ({
      values: [{name: 'John', age: 30, createdAt: new Date('2000-08-06T02:13:00.000Z')}],
    }),
  },
  extract_atomic: {
    title: 'Extract on atomic union',
    mutateEncoder: () =>
      createJsonEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    preserveDecoder: () =>
      createJsonDecoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    binaryDecoder: () => createBinaryDecoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    schemaEncoder: () =>
      createJsonEncoder(
        RT.extract(
          RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]),
          RT.union([RT.literal('name'), RT.literal('createdAt')])
        )
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.extract(
          RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]),
          RT.union([RT.literal('name'), RT.literal('createdAt')])
        )
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.extract(
          RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]),
          RT.union([RT.literal('name'), RT.literal('createdAt')])
        )
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.extract(
          RT.union([RT.literal('name'), RT.literal('age'), RT.literal('createdAt')]),
          RT.union([RT.literal('name'), RT.literal('createdAt')])
        )
      ),
    getTestData: () => ({values: ['name']}),
  },
  extract_objects: {
    title: 'Extract on object union',
    mutateEncoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonEncoder<Extract<Shape, ToExtract>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonEncoder<Extract<Shape, ToExtract>>(undefined, {strategy: 'clone'});
    },
    directEncoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonEncoder<Extract<Shape, ToExtract>>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonDecoder<Extract<Shape, ToExtract>>();
    },
    preserveDecoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonDecoder<Extract<Shape, ToExtract>>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createBinaryEncoder<Extract<Shape, ToExtract>>();
    },
    binaryDecoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createBinaryDecoder<Extract<Shape, ToExtract>>();
    },
    schemaEncoder: () =>
      createJsonEncoder(
        RT.extract(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: RT.number()}),
            RT.object({kind: RT.literal('square'), x: RT.number()}),
            RT.object({kind: RT.literal('triangle'), x: RT.number(), y: RT.number()}),
          ]),
          RT.union([
            RT.object({kind: RT.literal('square'), x: RT.number()}),
            RT.object({kind: RT.literal('triangle'), x: RT.number(), y: RT.number()}),
          ])
        )
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.extract(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: RT.number()}),
            RT.object({kind: RT.literal('square'), x: RT.number()}),
            RT.object({kind: RT.literal('triangle'), x: RT.number(), y: RT.number()}),
          ]),
          RT.union([
            RT.object({kind: RT.literal('square'), x: RT.number()}),
            RT.object({kind: RT.literal('triangle'), x: RT.number(), y: RT.number()}),
          ])
        )
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.extract(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: RT.number()}),
            RT.object({kind: RT.literal('square'), x: RT.number()}),
            RT.object({kind: RT.literal('triangle'), x: RT.number(), y: RT.number()}),
          ]),
          RT.union([
            RT.object({kind: RT.literal('square'), x: RT.number()}),
            RT.object({kind: RT.literal('triangle'), x: RT.number(), y: RT.number()}),
          ])
        )
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.extract(
          RT.union([
            RT.object({kind: RT.literal('circle'), radius: RT.number()}),
            RT.object({kind: RT.literal('square'), x: RT.number()}),
            RT.object({kind: RT.literal('triangle'), x: RT.number(), y: RT.number()}),
          ]),
          RT.union([
            RT.object({kind: RT.literal('square'), x: RT.number()}),
            RT.object({kind: RT.literal('triangle'), x: RT.number(), y: RT.number()}),
          ])
        )
      ),
    getTestData: () => ({values: [{kind: 'square', x: 5}]}),
  },
  partial_properties: {
    title: 'Partial<T>',
    mutateEncoder: () =>
      createJsonEncoder<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Partial<{name: string; age: number; createdAt: Date}>>(),
    preserveDecoder: () =>
      createJsonDecoder<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Partial<{name: string; age: number; createdAt: Date}>>(),
    binaryDecoder: () => createBinaryDecoder<Partial<{name: string; age: number; createdAt: Date}>>(),
    schemaEncoder: () => createJsonEncoder(RT.partial(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}))),
    schemaDecoder: () => createJsonDecoder(RT.partial(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}))),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(RT.partial(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}))),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(RT.partial(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date()}))),
    getTestData: () => {
      const createdAt = new Date('2000-08-06T02:13:00.000Z');
      return {values: [{name: 'John'}, {age: 30}, {createdAt}, {}]};
    },
  },
  pick_properties: {
    title: 'Pick<T, K>',
    mutateEncoder: () =>
      createJsonEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
        strategy: 'mutate',
      }),
    cloneEncoder: () =>
      createJsonEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
        strategy: 'clone',
      }),
    directEncoder: () =>
      createJsonEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
        strategy: 'direct',
      }),
    stripDecoder: () =>
      createJsonDecoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
    preserveDecoder: () =>
      createJsonDecoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
        strategy: 'preserve',
      }),
    binaryEncoder: () =>
      createBinaryEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
    binaryDecoder: () =>
      createBinaryDecoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
    schemaEncoder: () =>
      createJsonEncoder(
        RT.pick(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date(), email: RT.string()}), ['name', 'createdAt'])
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.pick(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date(), email: RT.string()}), ['name', 'createdAt'])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.pick(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date(), email: RT.string()}), ['name', 'createdAt'])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.pick(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date(), email: RT.string()}), ['name', 'createdAt'])
      ),
    getTestData: () => ({values: [{name: 'John', createdAt: new Date('2000-08-06T02:13:00.000Z')}]}),
  },
  omit_properties: {
    title: 'Omit<T, K>',
    mutateEncoder: () =>
      createJsonEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
        strategy: 'mutate',
      }),
    cloneEncoder: () =>
      createJsonEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
        strategy: 'clone',
      }),
    directEncoder: () =>
      createJsonEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
        strategy: 'direct',
      }),
    stripDecoder: () => createJsonDecoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
    preserveDecoder: () =>
      createJsonDecoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
        strategy: 'preserve',
      }),
    binaryEncoder: () => createBinaryEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
    binaryDecoder: () => createBinaryDecoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
    schemaEncoder: () =>
      createJsonEncoder(
        RT.omit(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date(), email: RT.string()}), ['email'])
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.omit(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date(), email: RT.string()}), ['email'])
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.omit(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date(), email: RT.string()}), ['email'])
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.omit(RT.object({name: RT.string(), age: RT.number(), createdAt: RT.date(), email: RT.string()}), ['email'])
      ),
    getTestData: () => ({values: [{name: 'John', age: 30, createdAt: new Date('2000-08-06T02:13:00.000Z')}]}),
  },
  record_type: {
    title: 'Record<string, Date>',
    mutateEncoder: () => createJsonEncoder<Record<string, Date>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Record<string, Date>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Record<string, Date>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Record<string, Date>>(),
    preserveDecoder: () => createJsonDecoder<Record<string, Date>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Record<string, Date>>(),
    binaryDecoder: () => createBinaryDecoder<Record<string, Date>>(),
    // Record<string, V> — value-only builder; the key defaults to string (mirrors
    // validation Object.ts string-keyed record cases using RT.record(<value>)).
    schemaEncoder: () => createJsonEncoder(RT.record(RT.date())),
    schemaDecoder: () => createJsonDecoder(RT.record(RT.date())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.record(RT.date())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.record(RT.date())),
    getTestData: () => ({
      values: [
        {
          key1: new Date('2000-08-06T02:13:00.000Z'),
          key2: new Date('2001-09-07T03:14:00.000Z'),
        },
        {},
      ],
    }),
  },
} as const satisfies Record<string, SerializationCase>;
