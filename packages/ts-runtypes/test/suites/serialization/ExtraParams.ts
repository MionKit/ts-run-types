import * as TF from 'ts-runtypes/formats';
import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';
import type {SerializationCase} from './types.ts';

export const EXTRA_PARAMS = {
  extras_passthrough_compatible: {
    title: 'JSON-compatible extra',
    description:
      'Extra `extra: "hello"` is JSON-encodable, so the unsafe path round-trips it intact (prepareForJson never visits it and JSON.stringify keeps it) while the safe path strips it before serialise, leaving only the declared key.',
    mutateEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<{declared: string}>(),
    preserveDecoder: () => createJsonDecoder<{declared: string}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<{declared: string}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<{declared: string}>(),
    binaryDecoder: () => createBinaryDecoder<{declared: string}>(),
    schemaEncoder: () => createJsonEncoder(RT.object({declared: TF.string()})),
    schemaDecoder: () => createJsonDecoder(RT.object({declared: TF.string()})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({declared: TF.string()})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({declared: TF.string()})),
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
    title: 'Bigint extra',
    description:
      'Extra `extra: 123n` is not JSON-encodable, so the unsafe path throws at JSON.stringify (prepareForJson never visits the bigint) while the safe path strips the extra via stripUnknownKeys before serialise, leaving the clean declared-only shape.',
    mutateEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<{declared: string}>(),
    preserveDecoder: () => createJsonDecoder<{declared: string}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<{declared: string}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<{declared: string}>(),
    binaryDecoder: () => createBinaryDecoder<{declared: string}>(),
    schemaEncoder: () => createJsonEncoder(RT.object({declared: TF.string()})),
    schemaDecoder: () => createJsonDecoder(RT.object({declared: TF.string()})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({declared: TF.string()})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({declared: TF.string()})),
    jsonStringifyThrows: true,
    getTestData: () => ({values: [{declared: 'x', extra: 123n}]}),
    getTestDataForStringify: () => ({
      values: [{declared: 'x', extra: 123n}],
      deserializedValues: [{declared: 'x'}],
    }),
  },

  extras_dropped_symbol: {
    title: 'Symbol-valued extra',
    description:
      'Extra `sym: Symbol("x")` is silently dropped by JSON.stringify per ECMAScript spec, so both paths produce declared-only output via different mechanisms (unsafe preserves it then stringify drops it; safe strips it before stringify).',
    mutateEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<{declared: string}>(),
    preserveDecoder: () => createJsonDecoder<{declared: string}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<{declared: string}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<{declared: string}>(),
    binaryDecoder: () => createBinaryDecoder<{declared: string}>(),
    schemaEncoder: () => createJsonEncoder(RT.object({declared: TF.string()})),
    schemaDecoder: () => createJsonDecoder(RT.object({declared: TF.string()})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({declared: TF.string()})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({declared: TF.string()})),
    getTestData: () => ({
      values: [{declared: 'x', sym: Symbol('extra')}],
      // JSON.stringify drops the symbol — restored shape has no `sym`.
      deserializedValues: [{declared: 'x'}],
    }),
    // Safe path produces the same output; no override needed.
  },

  extras_dropped_function: {
    title: 'Function-valued extra',
    description:
      'Extra `fn: () => 0` is silently dropped by JSON.stringify (function-valued props serialise to undefined and the key is omitted), so both paths produce declared-only output — strip removes the function on the safe path and JSON.stringify drops it on the unsafe path.',
    mutateEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<{declared: string}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<{declared: string}>(),
    preserveDecoder: () => createJsonDecoder<{declared: string}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<{declared: string}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<{declared: string}>(),
    binaryDecoder: () => createBinaryDecoder<{declared: string}>(),
    schemaEncoder: () => createJsonEncoder(RT.object({declared: TF.string()})),
    schemaDecoder: () => createJsonDecoder(RT.object({declared: TF.string()})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({declared: TF.string()})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({declared: TF.string()})),
    getTestData: () => ({
      values: [{declared: 'x', fn: () => 0}],
      deserializedValues: [{declared: 'x'}],
    }),
    // Safe path produces the same output; no override needed.
  },

  nested_extras_in_declared_child: {
    title: 'Nested extra',
    description:
      'Extra `outer.extra` sits inside a declared `outer: {declared: string}` composite, confirming the extras semantic recurses through declared composites where unsafe preserves the nested extra and safe strips it.',
    mutateEncoder: () => createJsonEncoder<{outer: {declared: string}}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{outer: {declared: string}}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{outer: {declared: string}}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<{outer: {declared: string}}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<{outer: {declared: string}}>(),
    preserveDecoder: () => createJsonDecoder<{outer: {declared: string}}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<{outer: {declared: string}}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<{outer: {declared: string}}>(),
    binaryDecoder: () => createBinaryDecoder<{outer: {declared: string}}>(),
    schemaEncoder: () => createJsonEncoder(RT.object({outer: RT.object({declared: TF.string()})})),
    schemaDecoder: () => createJsonDecoder(RT.object({outer: RT.object({declared: TF.string()})})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({outer: RT.object({declared: TF.string()})})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({outer: RT.object({declared: TF.string()})})),
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
