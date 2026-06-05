import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {SerializationCase} from './types.ts';

export const UTILITY_TYPES = {
  awaited: {
    title: 'Awaited<Promise<T>>',
    unsafeEncoder: () =>
      createJsonEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'mutate', stripExtras: false}),
    clonePreserveEncoder: () =>
      createJsonEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () =>
      createJsonEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
    safeDirectEncoder: () =>
      createJsonEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
    unsafeDecoder: () =>
      createJsonDecoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(undefined, {strategy: 'mutate', stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
    binaryDecoder: () => createBinaryDecoder<Awaited<Promise<{a: string; b: number; c: Date}>>>(),
    getTestData: () => ({values: [{a: 'hello', b: 1, c: new Date('2000-08-06T02:13:00.000Z')}]}),
  },
  exclude_atomic: {
    title: 'Exclude on atomic union',
    unsafeEncoder: () =>
      createJsonEncoder<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'mutate', stripExtras: false}),
    clonePreserveEncoder: () =>
      createJsonEncoder<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () =>
      createJsonEncoder<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<Exclude<'name' | 'age' | number, 'age'>>(),
    safeDirectEncoder: () => createJsonEncoder<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<Exclude<'name' | 'age' | number, 'age'>>(),
    unsafeDecoder: () =>
      createJsonDecoder<Exclude<'name' | 'age' | number, 'age'>>(undefined, {strategy: 'mutate', stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<Exclude<'name' | 'age' | number, 'age'>>(),
    binaryDecoder: () => createBinaryDecoder<Exclude<'name' | 'age' | number, 'age'>>(),
    getTestData: () => ({values: ['name', 3, 4]}),
  },
  exclude_objects: {
    title: 'Exclude on object union',
    unsafeEncoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonEncoder<Exclude<Shape, Circle>>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonEncoder<Exclude<Shape, Circle>>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonEncoder<Exclude<Shape, Circle>>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonEncoder<Exclude<Shape, Circle>>();
    },
    safeDirectEncoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonEncoder<Exclude<Shape, Circle>>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonDecoder<Exclude<Shape, Circle>>();
    },
    unsafeDecoder: () => {
      type Circle = {kind: 'circle'; radius: number};
      type Square = {kind: 'square'; x: number};
      type Triangle = {kind: 'triangle'; x: number; y: number};
      type Shape = Circle | Square | Triangle;
      return createJsonDecoder<Exclude<Shape, Circle>>(undefined, {strategy: 'mutate', stripExtras: false});
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
    getTestData: () => ({
      values: [
        {kind: 'square', x: 5},
        {kind: 'triangle', x: 5, y: 10},
      ],
    }),
  },
  required_properties: {
    title: 'Required<T>',
    unsafeEncoder: () =>
      createJsonEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {
        strategy: 'mutate',
        stripExtras: false,
      }),
    clonePreserveEncoder: () =>
      createJsonEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {
        strategy: 'clone',
        stripExtras: false,
      }),
    mutateStripEncoder: () =>
      createJsonEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {
        strategy: 'mutate',
        stripExtras: true,
      }),
    safeEncoder: () => createJsonEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(),
    safeDirectEncoder: () =>
      createJsonEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<Required<{name?: string; age?: number; createdAt?: Date}>>(),
    unsafeDecoder: () =>
      createJsonDecoder<Required<{name?: string; age?: number; createdAt?: Date}>>(undefined, {
        strategy: 'mutate',
        stripExtras: false,
      }),
    binaryEncoder: () => createBinaryEncoder<Required<{name?: string; age?: number; createdAt?: Date}>>(),
    binaryDecoder: () => createBinaryDecoder<Required<{name?: string; age?: number; createdAt?: Date}>>(),
    getTestData: () => ({
      values: [{name: 'John', age: 30, createdAt: new Date('2000-08-06T02:13:00.000Z')}],
    }),
  },
  extract_atomic: {
    title: 'Extract on atomic union',
    unsafeEncoder: () =>
      createJsonEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {
        strategy: 'mutate',
        stripExtras: false,
      }),
    clonePreserveEncoder: () =>
      createJsonEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {
        strategy: 'clone',
        stripExtras: false,
      }),
    mutateStripEncoder: () =>
      createJsonEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {
        strategy: 'mutate',
        stripExtras: true,
      }),
    safeEncoder: () => createJsonEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    safeDirectEncoder: () =>
      createJsonEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    unsafeDecoder: () =>
      createJsonDecoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(undefined, {
        strategy: 'mutate',
        stripExtras: false,
      }),
    binaryEncoder: () => createBinaryEncoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    binaryDecoder: () => createBinaryDecoder<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
    getTestData: () => ({values: ['name']}),
  },
  extract_objects: {
    title: 'Extract on object union',
    unsafeEncoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonEncoder<Extract<Shape, ToExtract>>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonEncoder<Extract<Shape, ToExtract>>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonEncoder<Extract<Shape, ToExtract>>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonEncoder<Extract<Shape, ToExtract>>();
    },
    safeDirectEncoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonEncoder<Extract<Shape, ToExtract>>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonDecoder<Extract<Shape, ToExtract>>();
    },
    unsafeDecoder: () => {
      type Shape = {kind: 'circle'; radius: number} | {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      type ToExtract = {kind: 'square'; x: number} | {kind: 'triangle'; x: number; y: number};
      return createJsonDecoder<Extract<Shape, ToExtract>>(undefined, {strategy: 'mutate', stripExtras: false});
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
    getTestData: () => ({values: [{kind: 'square', x: 5}]}),
  },
  partial_properties: {
    title: 'Partial<T>',
    unsafeEncoder: () =>
      createJsonEncoder<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {
        strategy: 'mutate',
        stripExtras: false,
      }),
    clonePreserveEncoder: () =>
      createJsonEncoder<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {
        strategy: 'clone',
        stripExtras: false,
      }),
    mutateStripEncoder: () =>
      createJsonEncoder<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {
        strategy: 'mutate',
        stripExtras: true,
      }),
    safeEncoder: () => createJsonEncoder<Partial<{name: string; age: number; createdAt: Date}>>(),
    safeDirectEncoder: () =>
      createJsonEncoder<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<Partial<{name: string; age: number; createdAt: Date}>>(),
    unsafeDecoder: () =>
      createJsonDecoder<Partial<{name: string; age: number; createdAt: Date}>>(undefined, {
        strategy: 'mutate',
        stripExtras: false,
      }),
    binaryEncoder: () => createBinaryEncoder<Partial<{name: string; age: number; createdAt: Date}>>(),
    binaryDecoder: () => createBinaryDecoder<Partial<{name: string; age: number; createdAt: Date}>>(),
    getTestData: () => {
      const createdAt = new Date('2000-08-06T02:13:00.000Z');
      return {values: [{name: 'John'}, {age: 30}, {createdAt}, {}]};
    },
  },
  pick_properties: {
    title: 'Pick<T, K>',
    unsafeEncoder: () =>
      createJsonEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
        strategy: 'mutate',
        stripExtras: false,
      }),
    clonePreserveEncoder: () =>
      createJsonEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
        strategy: 'clone',
        stripExtras: false,
      }),
    mutateStripEncoder: () =>
      createJsonEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
        strategy: 'mutate',
        stripExtras: true,
      }),
    safeEncoder: () =>
      createJsonEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
    safeDirectEncoder: () =>
      createJsonEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
        strategy: 'direct',
      }),
    safeDecoder: () =>
      createJsonDecoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
    unsafeDecoder: () =>
      createJsonDecoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(undefined, {
        stripExtras: false,
      }),
    binaryEncoder: () =>
      createBinaryEncoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
    binaryDecoder: () =>
      createBinaryDecoder<Pick<{name: string; age: number; createdAt: Date; email: string}, 'name' | 'createdAt'>>(),
    getTestData: () => ({values: [{name: 'John', createdAt: new Date('2000-08-06T02:13:00.000Z')}]}),
  },
  omit_properties: {
    title: 'Omit<T, K>',
    unsafeEncoder: () =>
      createJsonEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
        strategy: 'mutate',
        stripExtras: false,
      }),
    clonePreserveEncoder: () =>
      createJsonEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
        strategy: 'clone',
        stripExtras: false,
      }),
    mutateStripEncoder: () =>
      createJsonEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
        strategy: 'mutate',
        stripExtras: true,
      }),
    safeEncoder: () => createJsonEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
    safeDirectEncoder: () =>
      createJsonEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
        strategy: 'direct',
      }),
    safeDecoder: () => createJsonDecoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
    unsafeDecoder: () =>
      createJsonDecoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(undefined, {
        stripExtras: false,
      }),
    binaryEncoder: () => createBinaryEncoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
    binaryDecoder: () => createBinaryDecoder<Omit<{name: string; age: number; createdAt: Date; email: string}, 'email'>>(),
    getTestData: () => ({values: [{name: 'John', age: 30, createdAt: new Date('2000-08-06T02:13:00.000Z')}]}),
  },
  record_type: {
    title: 'Record<string, Date>',
    unsafeEncoder: () => createJsonEncoder<Record<string, Date>>(undefined, {strategy: 'mutate', stripExtras: false}),
    clonePreserveEncoder: () => createJsonEncoder<Record<string, Date>>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () => createJsonEncoder<Record<string, Date>>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<Record<string, Date>>(),
    safeDirectEncoder: () => createJsonEncoder<Record<string, Date>>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<Record<string, Date>>(),
    unsafeDecoder: () => createJsonDecoder<Record<string, Date>>(undefined, {strategy: 'mutate', stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<Record<string, Date>>(),
    binaryDecoder: () => createBinaryDecoder<Record<string, Date>>(),
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
