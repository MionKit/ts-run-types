import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {SerializationCase} from './types.ts';

export const FUNCTIONS = {
  // Function parameter and return-type slicing uses TS utility types
  // (Parameters<typeof fn>, ReturnType<typeof fn>) rather than mion's
  // bespoke createSerializationParamsFn / createSerializationReturnFn
  // helpers. Same type-level slicing, no extra factories.
  parameters: {
    title: 'function parameters',
    mutateEncoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonEncoder<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonEncoder<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'clone'});
    },
    stripMutateEncoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonEncoder<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonEncoder<Parameters<typeof fnNoOptional>>();
    },
    directEncoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonEncoder<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonDecoder<Parameters<typeof fnNoOptional>>();
    },
    preserveDecoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonDecoder<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createBinaryEncoder<Parameters<typeof fnNoOptional>>();
    },
    binaryDecoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createBinaryDecoder<Parameters<typeof fnNoOptional>>();
    },
    // Parameters tuple [number, boolean, string].
    schemaEncoder: () => createJsonEncoder(RT.tuple([RT.number(), RT.boolean(), RT.string()])),
    schemaDecoder: () => createJsonDecoder(RT.tuple([RT.number(), RT.boolean(), RT.string()])),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.tuple([RT.number(), RT.boolean(), RT.string()])),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.tuple([RT.number(), RT.boolean(), RT.string()])),
    getTestData: () => ({
      values: [
        [3, true, 'hello'],
        [3, true, 'world'],
      ],
    }),
  },
  optional_params: {
    title: 'optional parameters',
    mutateEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'clone'});
    },
    stripMutateEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>();
    },
    directEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoder<Parameters<typeof fnOptionalParams>>();
    },
    preserveDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createBinaryEncoder<Parameters<typeof fnOptionalParams>>();
    },
    binaryDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createBinaryDecoder<Parameters<typeof fnOptionalParams>>();
    },
    // Parameters tuple [Date, boolean?] — trailing optional slot.
    schemaEncoder: () => createJsonEncoder(RT.tuple([RT.date()], [RT.boolean()])),
    schemaDecoder: () => createJsonDecoder(RT.tuple([RT.date()], [RT.boolean()])),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.tuple([RT.date()], [RT.boolean()])),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.tuple([RT.date()], [RT.boolean()])),
    getTestData: () => {
      const d = new Date('2000-08-06T02:13:00.000Z');
      return {values: [[d, true], [d]]};
    },
  },
  function_return: {
    title: 'function return',
    mutateEncoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'clone'});
    },
    stripMutateEncoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParam>>();
    },
    directEncoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonDecoder<ReturnType<typeof fnOptionalParam>>();
    },
    preserveDecoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonDecoder<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createBinaryEncoder<ReturnType<typeof fnOptionalParam>>();
    },
    binaryDecoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createBinaryDecoder<ReturnType<typeof fnOptionalParam>>();
    },
    // Return type is Date.
    schemaEncoder: () => createJsonEncoder(RT.date()),
    schemaDecoder: () => createJsonDecoder(RT.date()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.date()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.date()),
    getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z')]}),
  },
  function_with_rest_parameters: {
    title: 'function with rest parameters',
    mutateEncoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnRestParams>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnRestParams>>(undefined, {strategy: 'clone'});
    },
    stripMutateEncoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnRestParams>>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnRestParams>>();
    },
    directEncoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnRestParams>>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonDecoder<Parameters<typeof fnRestParams>>();
    },
    preserveDecoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonDecoder<Parameters<typeof fnRestParams>>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createBinaryEncoder<Parameters<typeof fnRestParams>>();
    },
    binaryDecoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createBinaryDecoder<Parameters<typeof fnRestParams>>();
    },
    // Parameters tuple [number, boolean, ...Date[]] — trailing rest segment.
    schemaEncoder: () => createJsonEncoder(RT.tuple([RT.number(), RT.boolean()], RT.date())),
    schemaDecoder: () => createJsonDecoder(RT.tuple([RT.number(), RT.boolean()], RT.date())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.tuple([RT.number(), RT.boolean()], RT.date())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.tuple([RT.number(), RT.boolean()], RT.date())),
    getTestData: () => ({
      values: [
        [3, true, new Date('2000-08-06T02:13:00.000Z'), new Date('2000-08-06T02:13:00.000Z')],
        [3, true],
      ],
    }),
  },
  function_with_date_parameters: {
    title: 'function with Date parameters',
    mutateEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'clone'});
    },
    stripMutateEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>();
    },
    directEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoder<Parameters<typeof fnOptionalParams>>();
    },
    preserveDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createBinaryEncoder<Parameters<typeof fnOptionalParams>>();
    },
    binaryDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createBinaryDecoder<Parameters<typeof fnOptionalParams>>();
    },
    // Parameters tuple [Date, boolean?] — trailing optional slot.
    schemaEncoder: () => createJsonEncoder(RT.tuple([RT.date()], [RT.boolean()])),
    schemaDecoder: () => createJsonDecoder(RT.tuple([RT.date()], [RT.boolean()])),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.tuple([RT.date()], [RT.boolean()])),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.tuple([RT.date()], [RT.boolean()])),
    getTestData: () => {
      const d = new Date('2000-08-06T02:13:00.000Z');
      return {values: [[d, true], [d]]};
    },
  },
  required_function_return: {
    title: 'required function return',
    mutateEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'clone'});
    },
    stripMutateEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParams>>();
    },
    directEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoder<ReturnType<typeof fnOptionalParams>>();
    },
    preserveDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoder<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createBinaryEncoder<ReturnType<typeof fnOptionalParams>>();
    },
    binaryDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createBinaryDecoder<ReturnType<typeof fnOptionalParams>>();
    },
    // Return type is bigint.
    schemaEncoder: () => createJsonEncoder(RT.bigint()),
    schemaDecoder: () => createJsonDecoder(RT.bigint()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.bigint()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.bigint()),
    getTestData: () => ({values: [1n]}),
  },
  function_with_only_rest_parameters: {
    title: 'function with only rest parameters',
    mutateEncoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'clone'});
    },
    stripMutateEncoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnOnlyRestParams>>();
    },
    directEncoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonDecoder<Parameters<typeof fnOnlyRestParams>>();
    },
    preserveDecoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonDecoder<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createBinaryEncoder<Parameters<typeof fnOnlyRestParams>>();
    },
    binaryDecoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createBinaryDecoder<Parameters<typeof fnOnlyRestParams>>();
    },
    // Parameters tuple [...number[]] — no fixed slots, rest only.
    schemaEncoder: () => createJsonEncoder(RT.tuple([], RT.number())),
    schemaDecoder: () => createJsonDecoder(RT.tuple([], RT.number())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.tuple([], RT.number())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.tuple([], RT.number())),
    getTestData: () => ({values: [[3, 2, 1], []]}),
  },
  non_serializable_params: {
    title: 'non serializable params',
    mutateEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'clone'});
    },
    stripMutateEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnWithCallback>>();
    },
    directEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonDecoder<Parameters<typeof fnWithCallback>>();
    },
    preserveDecoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonDecoder<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createBinaryEncoder<Parameters<typeof fnWithCallback>>();
    },
    binaryDecoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createBinaryDecoder<Parameters<typeof fnWithCallback>>();
    },
    // Parameters<typeof fnWithCallback> resolves to a tuple ending
    // in `() => null`. Function-typed tuple slots are unsupported in
    // every family now (previously JSON silently dropped them, binary
    // threw); both paths render as alwaysThrow.
    // Function-typed tuple slot is non-serializable; no value-first builder.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  function_promise_return_type: {
    title: 'function returns a promise',
    description: 'Promise<T> as a return type — Promises are non-serializable in mion.',
    mutateEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'clone'});
    },
    stripMutateEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsPromise>>();
    },
    directEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonDecoder<ReturnType<typeof fnReturnsPromise>>();
    },
    preserveDecoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonDecoder<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createBinaryEncoder<ReturnType<typeof fnReturnsPromise>>();
    },
    binaryDecoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createBinaryDecoder<ReturnType<typeof fnReturnsPromise>>();
    },
    // Promise return type is non-serializable; no value-first builder.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  function_return_type_is_function: {
    title: 'return type of a closure',
    description: 'fn returns another fn — non-serializable.',
    mutateEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'mutate'});
    },
    cloneEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'clone'});
    },
    stripMutateEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'stripMutate'});
    },
    stripCloneEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsFunction>>();
    },
    directEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'direct'});
    },
    stripDecoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonDecoder<ReturnType<typeof fnReturnsFunction>>();
    },
    preserveDecoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonDecoder<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'preserve'});
    },
    binaryEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createBinaryEncoder<ReturnType<typeof fnReturnsFunction>>();
    },
    binaryDecoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createBinaryDecoder<ReturnType<typeof fnReturnsFunction>>();
    },
    // Return type is another function — non-serializable; no value-first builder.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  call_signature_params: {
    title: 'call signature params',
    mutateEncoder: () => createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () =>
      createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(),
    directEncoder: () => createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Parameters<{(a: number, b: boolean): string}>>(),
    preserveDecoder: () => createJsonDecoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Parameters<{(a: number, b: boolean): string}>>(),
    binaryDecoder: () => createBinaryDecoder<Parameters<{(a: number, b: boolean): string}>>(),
    // Call-signature parameters tuple [number, boolean].
    schemaEncoder: () => createJsonEncoder(RT.tuple([RT.number(), RT.boolean()])),
    schemaDecoder: () => createJsonDecoder(RT.tuple([RT.number(), RT.boolean()])),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.tuple([RT.number(), RT.boolean()])),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.tuple([RT.number(), RT.boolean()])),
    getTestData: () => ({values: [[3, true]]}),
  },
  call_signature_return: {
    title: 'call signature return',
    mutateEncoder: () => createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () =>
      createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(),
    directEncoder: () => createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<ReturnType<{(a: number, b: boolean): string}>>(),
    preserveDecoder: () => createJsonDecoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<ReturnType<{(a: number, b: boolean): string}>>(),
    binaryDecoder: () => createBinaryDecoder<ReturnType<{(a: number, b: boolean): string}>>(),
    // Call-signature return type is string.
    schemaEncoder: () => createJsonEncoder(RT.string()),
    schemaDecoder: () => createJsonDecoder(RT.string()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.string()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.string()),
    getTestData: () => ({values: ['result']}),
  },
} as const satisfies Record<string, SerializationCase>;
