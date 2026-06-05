import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {SerializationCase} from './types.ts';

export const FUNCTIONS = {
  // Function parameter and return-type slicing uses TS utility types
  // (Parameters<typeof fn>, ReturnType<typeof fn>) rather than mion's
  // bespoke createSerializationParamsFn / createSerializationReturnFn
  // helpers. Same type-level slicing, no extra factories.
  parameters: {
    title: 'function parameters',
    unsafeEncoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonEncoder<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonEncoder<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonEncoder<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonEncoder<Parameters<typeof fnNoOptional>>();
    },
    safeDirectEncoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonEncoder<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonDecoder<Parameters<typeof fnNoOptional>>();
    },
    unsafeDecoder: () => {
      function fnNoOptional(a: number, b: boolean, c: string): Date {
        return new Date(a);
      }
      return createJsonDecoder<Parameters<typeof fnNoOptional>>(undefined, {strategy: 'mutate', stripExtras: false});
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
    getTestData: () => ({
      values: [
        [3, true, 'hello'],
        [3, true, 'world'],
      ],
    }),
  },
  optional_params: {
    title: 'optional parameters',
    unsafeEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>();
    },
    safeDirectEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoder<Parameters<typeof fnOptionalParams>>();
    },
    unsafeDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: false});
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
    getTestData: () => {
      const d = new Date('2000-08-06T02:13:00.000Z');
      return {values: [[d, true], [d]]};
    },
  },
  function_return: {
    title: 'function return',
    unsafeEncoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParam>>();
    },
    safeDirectEncoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonDecoder<ReturnType<typeof fnOptionalParam>>();
    },
    unsafeDecoder: () => {
      function fnOptionalParam(a: number, b: boolean, c?: string): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonDecoder<ReturnType<typeof fnOptionalParam>>(undefined, {strategy: 'mutate', stripExtras: false});
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
    getTestData: () => ({values: [new Date('2000-08-06T02:13:00.000Z')]}),
  },
  function_with_rest_parameters: {
    title: 'function with rest parameters',
    unsafeEncoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnRestParams>>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnRestParams>>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnRestParams>>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnRestParams>>();
    },
    safeDirectEncoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnRestParams>>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonDecoder<Parameters<typeof fnRestParams>>();
    },
    unsafeDecoder: () => {
      function fnRestParams(a: number, b: boolean, ...rest: Date[]): Date {
        void rest;
        void a;
        void b;
        return new Date(0);
      }
      return createJsonDecoder<Parameters<typeof fnRestParams>>(undefined, {strategy: 'mutate', stripExtras: false});
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
    getTestData: () => ({
      values: [
        [3, true, new Date('2000-08-06T02:13:00.000Z'), new Date('2000-08-06T02:13:00.000Z')],
        [3, true],
      ],
    }),
  },
  function_with_date_parameters: {
    title: 'function with Date parameters',
    unsafeEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>();
    },
    safeDirectEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoder<Parameters<typeof fnOptionalParams>>();
    },
    unsafeDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoder<Parameters<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: false});
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
    getTestData: () => {
      const d = new Date('2000-08-06T02:13:00.000Z');
      return {values: [[d, true], [d]]};
    },
  },
  required_function_return: {
    title: 'required function return',
    unsafeEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParams>>();
    },
    safeDirectEncoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonEncoder<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoder<ReturnType<typeof fnOptionalParams>>();
    },
    unsafeDecoder: () => {
      function fnOptionalParams(a: Date, b?: boolean): bigint {
        void a;
        void b;
        return 1n;
      }
      return createJsonDecoder<ReturnType<typeof fnOptionalParams>>(undefined, {strategy: 'mutate', stripExtras: false});
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
    getTestData: () => ({values: [1n]}),
  },
  function_with_only_rest_parameters: {
    title: 'function with only rest parameters',
    unsafeEncoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnOnlyRestParams>>();
    },
    safeDirectEncoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonDecoder<Parameters<typeof fnOnlyRestParams>>();
    },
    unsafeDecoder: () => {
      function fnOnlyRestParams(...rest: number[]): Date {
        void rest;
        return new Date(0);
      }
      return createJsonDecoder<Parameters<typeof fnOnlyRestParams>>(undefined, {strategy: 'mutate', stripExtras: false});
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
    getTestData: () => ({values: [[3, 2, 1], []]}),
  },
  non_serializable_params: {
    title: 'non serializable params',
    unsafeEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnWithCallback>>();
    },
    safeDirectEncoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonEncoder<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonDecoder<Parameters<typeof fnWithCallback>>();
    },
    unsafeDecoder: () => {
      function fnWithCallback(a: number, b: boolean, c?: () => null): Date {
        void a;
        void b;
        void c;
        return new Date(0);
      }
      return createJsonDecoder<Parameters<typeof fnWithCallback>>(undefined, {strategy: 'mutate', stripExtras: false});
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
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  function_promise_return_type: {
    title: 'function returns a promise',
    description: 'Promise<T> as a return type — Promises are non-serializable in mion.',
    unsafeEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsPromise>>();
    },
    safeDirectEncoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonDecoder<ReturnType<typeof fnReturnsPromise>>();
    },
    unsafeDecoder: () => {
      function fnReturnsPromise(a: number, b: boolean, c?: string): Promise<Date> {
        void a;
        void b;
        void c;
        return Promise.resolve(new Date(0));
      }
      return createJsonDecoder<ReturnType<typeof fnReturnsPromise>>(undefined, {strategy: 'mutate', stripExtras: false});
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
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  function_return_type_is_function: {
    title: 'return type of a closure',
    description: 'fn returns another fn — non-serializable.',
    unsafeEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'mutate', stripExtras: false});
    },
    clonePreserveEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'clone', stripExtras: false});
    },
    mutateStripEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'mutate', stripExtras: true});
    },
    safeEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsFunction>>();
    },
    safeDirectEncoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonEncoder<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'direct'});
    },
    safeDecoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonDecoder<ReturnType<typeof fnReturnsFunction>>();
    },
    unsafeDecoder: () => {
      function fnReturnsFunction(a: number, b: boolean, c?: string): () => Date {
        void a;
        void b;
        void c;
        return () => new Date(0);
      }
      return createJsonDecoder<ReturnType<typeof fnReturnsFunction>>(undefined, {strategy: 'mutate', stripExtras: false});
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
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  call_signature_params: {
    title: 'call signature params',
    unsafeEncoder: () =>
      createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate', stripExtras: false}),
    clonePreserveEncoder: () =>
      createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () =>
      createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(),
    safeDirectEncoder: () => createJsonEncoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<Parameters<{(a: number, b: boolean): string}>>(),
    unsafeDecoder: () =>
      createJsonDecoder<Parameters<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate', stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<Parameters<{(a: number, b: boolean): string}>>(),
    binaryDecoder: () => createBinaryDecoder<Parameters<{(a: number, b: boolean): string}>>(),
    getTestData: () => ({values: [[3, true]]}),
  },
  call_signature_return: {
    title: 'call signature return',
    unsafeEncoder: () =>
      createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate', stripExtras: false}),
    clonePreserveEncoder: () =>
      createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () =>
      createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(),
    safeDirectEncoder: () => createJsonEncoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<ReturnType<{(a: number, b: boolean): string}>>(),
    unsafeDecoder: () =>
      createJsonDecoder<ReturnType<{(a: number, b: boolean): string}>>(undefined, {strategy: 'mutate', stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<ReturnType<{(a: number, b: boolean): string}>>(),
    binaryDecoder: () => createBinaryDecoder<ReturnType<{(a: number, b: boolean): string}>>(),
    getTestData: () => ({values: ['result']}),
  },
} as const satisfies Record<string, SerializationCase>;
