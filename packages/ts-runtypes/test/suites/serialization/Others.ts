import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from 'ts-runtypes';
import type {SerializationCase} from './types.ts';

export const OTHERS = {
  promise_jsonStringify_error: {
    title: 'Root Promise',
    description:
      'A root `Promise<string>` is non-serializable, so the Go pipeline renders the factory as alwaysThrow and every encoder / decoder invocation throws.',
    serializeNotes: [
      'No value-first builder exists for Promise, so all schema variants are not-supported.',
      'Binary shares the same alwaysThrow contract; test data is empty since the factory throws before any round-trip.',
    ],
    mutateEncoder: () => createJsonEncoder<Promise<string>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Promise<string>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Promise<string>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Promise<string>>(),
    preserveDecoder: () => createJsonDecoder<Promise<string>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Promise<string>>(),
    binaryDecoder: () => createBinaryDecoder<Promise<string>>(),
    // Promise has no value-first builder and is non-serializable.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  non_serializable: {
    title: 'Root Int8Array',
    description:
      'A root `Int8Array` is non-serializable, so the factory renders as alwaysThrow and every encoder / decoder invocation throws for both JSON and binary.',
    serializeNotes:
      'No value-first builder exists for Int8Array, so all schema variants are not-supported and test data is empty.',
    mutateEncoder: () => createJsonEncoder<Int8Array>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Int8Array>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Int8Array>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Int8Array>(),
    preserveDecoder: () => createJsonDecoder<Int8Array>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Int8Array>(),
    binaryDecoder: () => createBinaryDecoder<Int8Array>(),
    // Int8Array has no value-first builder and is non-serializable.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  non_serializable_interface: {
    title: 'Int8Array in interface',
    description:
      'An interface with a non-serializable `Int8Array` member renders the factory as alwaysThrow, so every encoder / decoder invocation throws for both JSON and binary.',
    serializeNotes:
      'No value-first builder can express the enclosing object, so all schema variants are not-supported and test data is empty.',
    mutateEncoder: () => createJsonEncoder<{a: Int8Array}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{a: Int8Array}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{a: Int8Array}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{a: Int8Array}>(),
    preserveDecoder: () => createJsonDecoder<{a: Int8Array}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{a: Int8Array}>(),
    binaryDecoder: () => createBinaryDecoder<{a: Int8Array}>(),
    // No value-first builder for Int8Array, so the enclosing object is inexpressible.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  non_serializable_array: {
    title: 'Int8Array in array',
    description:
      'An array of non-serializable `Int8Array` elements renders the factory as alwaysThrow because a non-serializable element is a propagating position, so every encoder / decoder invocation throws for both JSON and binary.',
    serializeNotes:
      'No value-first builder can express the enclosing array, so all schema variants are not-supported and test data is empty.',
    mutateEncoder: () => createJsonEncoder<Int8Array[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<Int8Array[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<Int8Array[]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<Int8Array[]>(),
    preserveDecoder: () => createJsonDecoder<Int8Array[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<Int8Array[]>(),
    binaryDecoder: () => createBinaryDecoder<Int8Array[]>(),
    // No value-first builder for Int8Array, so the enclosing array is inexpressible.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
  non_serializable_tuple: {
    title: 'Int8Array in tuple',
    description:
      'A tuple with a non-serializable `Int8Array` slot renders the factory as alwaysThrow because a non-serializable tuple slot is a propagating position, so every encoder / decoder invocation throws for both JSON and binary.',
    serializeNotes:
      'No value-first builder can express the enclosing tuple, so all schema variants are not-supported and test data is empty.',
    mutateEncoder: () => createJsonEncoder<[Int8Array]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<[Int8Array]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<[Int8Array]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<[Int8Array]>(),
    preserveDecoder: () => createJsonDecoder<[Int8Array]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<[Int8Array]>(),
    binaryDecoder: () => createBinaryDecoder<[Int8Array]>(),
    // No value-first builder for Int8Array, so the enclosing tuple is inexpressible.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    factoryThrows: true,
    getTestData: () => ({values: []}),
  },
} as const satisfies Record<string, SerializationCase>;
