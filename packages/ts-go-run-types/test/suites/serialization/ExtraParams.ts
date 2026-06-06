import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {SerializationCase} from './types.ts';

export const EXTRA_PARAMS = {
  extras_passthrough_compatible: {
    title: 'JSON-compatible extra prop — unsafe preserves, safe strips',
    description:
      'Extra `extra: "hello"` is JSON-encodable (string). Unsafe path round-trips with the extra intact (prepareForJson never visits it, JSON.stringify keeps it). Safe path strips it before serialise — restored value contains only the declared key.',
    mutateEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{declared: string}>(),
    directEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{declared: string}>(),
    preserveDecoder: () => createJsonDecoder<{declared: string}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{declared: string}>(),
    binaryDecoder: () => createBinaryDecoder<{declared: string}>(),
    schemaEncoder: () => createJsonEncoder(RT.object({declared: RT.string()})),
    schemaDecoder: () => createJsonDecoder(RT.object({declared: RT.string()})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({declared: RT.string()})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({declared: RT.string()})),
    getTestData: () => ({
      values: [{declared: 'x', extra: 'hello'}],
      // Unsafe: extra preserved through round-trip.
    }),
    getTestDataForStringify: () => ({
      values: [{declared: 'x', extra: 'hello'}],
      deserializedValues: [{declared: 'x'}],
    }),
  },

  extras_throws_bigint: {
    title: 'bigint extra prop — unsafe throws at JSON.stringify, safe strips it',
    description:
      'Extra `extra: 123n` is not JSON-encodable. Unsafe path: prepareForJson never visits the extra, JSON.stringify throws on the bigint. Safe path: stripUnknownKeys removes the extra before prepareForJson runs, so the bigint never reaches JSON.stringify and the output is the clean declared-only shape.',
    mutateEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{declared: string}>(),
    directEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{declared: string}>(),
    preserveDecoder: () => createJsonDecoder<{declared: string}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{declared: string}>(),
    binaryDecoder: () => createBinaryDecoder<{declared: string}>(),
    schemaEncoder: () => createJsonEncoder(RT.object({declared: RT.string()})),
    schemaDecoder: () => createJsonDecoder(RT.object({declared: RT.string()})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({declared: RT.string()})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({declared: RT.string()})),
    jsonStringifyThrows: true,
    getTestData: () => ({values: [{declared: 'x', extra: 123n}]}),
    getTestDataForStringify: () => ({
      values: [{declared: 'x', extra: 123n}],
      deserializedValues: [{declared: 'x'}],
    }),
  },

  extras_dropped_symbol: {
    title: 'symbol-valued extra prop — both paths produce declared-only output',
    description:
      'Extra `sym: Symbol("x")` is silently dropped by JSON.stringify per ECMAScript spec (symbol-valued own props are non-enumerable for JSON purposes). Unsafe path: prepareForJson preserves it, JSON.stringify drops it. Safe path: strip removes it before stringify. Same observable, different mechanism — document the lossy round-trip in both paths.',
    mutateEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{declared: string}>(),
    directEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{declared: string}>(),
    preserveDecoder: () => createJsonDecoder<{declared: string}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{declared: string}>(),
    binaryDecoder: () => createBinaryDecoder<{declared: string}>(),
    schemaEncoder: () => createJsonEncoder(RT.object({declared: RT.string()})),
    schemaDecoder: () => createJsonDecoder(RT.object({declared: RT.string()})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({declared: RT.string()})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({declared: RT.string()})),
    getTestData: () => ({
      values: [{declared: 'x', sym: Symbol('extra')}],
      // JSON.stringify drops the symbol — restored shape has no `sym`.
      deserializedValues: [{declared: 'x'}],
    }),
    // Safe path produces the same output; no override needed.
  },

  extras_dropped_function: {
    title: 'function-valued extra prop — both paths produce declared-only output',
    description:
      'Extra `fn: () => 0` is silently dropped by JSON.stringify (function-valued props serialise to undefined and the key is omitted). Both paths produce declared-only output — strip removes the function on the safe path; JSON.stringify drops it on the unsafe path.',
    mutateEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{declared: string}>(),
    directEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{declared: string}>(),
    preserveDecoder: () => createJsonDecoder<{declared: string}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{declared: string}>(),
    binaryDecoder: () => createBinaryDecoder<{declared: string}>(),
    schemaEncoder: () => createJsonEncoder(RT.object({declared: RT.string()})),
    schemaDecoder: () => createJsonDecoder(RT.object({declared: RT.string()})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({declared: RT.string()})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({declared: RT.string()})),
    getTestData: () => ({
      values: [{declared: 'x', fn: () => 0}],
      deserializedValues: [{declared: 'x'}],
    }),
    // Safe path produces the same output; no override needed.
  },

  nested_extras_in_declared_child: {
    title: 'extras nested inside a declared composite child',
    description:
      'Extra `outer.extra` sits inside a declared `outer: {declared: string}` composite. Confirms the extras semantic recurses through declared composites: unsafe preserves the nested extra; safe strips it.',
    mutateEncoder: () => createJsonEncoder<{outer: {declared: string}}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{outer: {declared: string}}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<{outer: {declared: string}}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{outer: {declared: string}}>(),
    directEncoder: () => createJsonEncoder<{outer: {declared: string}}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{outer: {declared: string}}>(),
    preserveDecoder: () => createJsonDecoder<{outer: {declared: string}}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{outer: {declared: string}}>(),
    binaryDecoder: () => createBinaryDecoder<{outer: {declared: string}}>(),
    schemaEncoder: () => createJsonEncoder(RT.object({outer: RT.object({declared: RT.string()})})),
    schemaDecoder: () => createJsonDecoder(RT.object({outer: RT.object({declared: RT.string()})})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({outer: RT.object({declared: RT.string()})})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({outer: RT.object({declared: RT.string()})})),
    getTestData: () => ({
      values: [{outer: {declared: 'x', extra: 'y'}}],
      // Unsafe: nested extra preserved.
    }),
    getTestDataForStringify: () => ({
      values: [{outer: {declared: 'x', extra: 'y'}}],
      deserializedValues: [{outer: {declared: 'x'}}],
    }),
  },
} as const satisfies Record<string, SerializationCase>;
