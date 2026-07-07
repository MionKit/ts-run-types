import * as TF from '@ts-runtypes/core/formats';
import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@ts-runtypes/core';
import * as RT from '@ts-runtypes/core/schema';
import type {SerializationCase} from './types.ts';

export const RECORDS = {
  index_property: {
    title: 'Index property',
    description:
      'Root `{[key: string]: string}` dynamic-key record of string values where JSON and binary round-trip every key/value pair (and empty objects) as a plain object with no per-value transform on the atomic string values.',
    serializeNotes:
      'The index signature admits every key, so strip and preserve decode identically — there are no undeclared keys to drop.',
    mutateEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<{[key: string]: string}>(),
    preserveDecoder: () => createJsonDecoder<{[key: string]: string}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<{[key: string]: string}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<{[key: string]: string}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: string]: string}>(),
    schemaEncoder: () => createJsonEncoder(RT.record(TF.string())),
    schemaDecoder: () => createJsonDecoder(RT.record(TF.string())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.record(TF.string())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.record(TF.string())),
    getTestData: () => ({values: [{key1: 'value1', key2: 'value2'}, {}]}),
  },
  index_property_and_prop: {
    title: 'Property and index',
    description:
      'Root `{a: string; [key: string]: string}` with a declared `a` plus a string-valued index signature where JSON and binary round-trip the declared property alongside any number of dynamic string keys, with samples covering the `a`-only shape and one with an extra `b` key.',
    serializeNotes:
      'The index signature admits every key, so strip and preserve decode identically — dynamic keys are never treated as undeclared.',
    mutateEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<{a: string; [key: string]: string}>(),
    preserveDecoder: () => createJsonDecoder<{a: string; [key: string]: string}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<{a: string; [key: string]: string}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<{a: string; [key: string]: string}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string; [key: string]: string}>(),
    schemaEncoder: () => createJsonEncoder(RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))),
    schemaDecoder: () => createJsonDecoder(RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))),
    getTestData: () => ({values: [{a: 'helloA'}, {a: 'helloA', b: 'helloB'}]}),
  },
  index_property_extra: {
    title: 'Index with unions',
    description:
      'Root `{a: string; b: number; [key: string]: string | number}` with declared `a`/`b` plus a `string | number` index signature where JSON and binary round-trip the declared props alongside dynamic keys whose per-value union is resolved structurally on encode and decode.',
    serializeNotes:
      'The index signature admits every key, so strip and preserve decode identically — dynamic string-or-number keys are never dropped.',
    mutateEncoder: () =>
      createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'direct'}),
    compactEncoder: () =>
      createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<{a: string; b: number; [key: string]: string | number}>(),
    preserveDecoder: () =>
      createJsonDecoder<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () =>
      createJsonDecoder<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<{a: string; b: number; [key: string]: string | number}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string; b: number; [key: string]: string | number}>(),
    schemaEncoder: () =>
      createJsonEncoder(
        RT.intersection(RT.record(RT.union([TF.string(), TF.number()])), RT.object({a: TF.string(), b: TF.number()}))
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.intersection(RT.record(RT.union([TF.string(), TF.number()])), RT.object({a: TF.string(), b: TF.number()}))
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.intersection(RT.record(RT.union([TF.string(), TF.number()])), RT.object({a: TF.string(), b: TF.number()}))
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.intersection(RT.record(RT.union([TF.string(), TF.number()])), RT.object({a: TF.string(), b: TF.number()}))
      ),
    getTestData: () => ({values: [{key1: 'value1', key2: 'value2', a: 'extra1', b: 123}]}),
  },
  multiple_index_props: {
    title: 'Multiple index signatures',
    description:
      'Root `{[key: string]: string; [key: number]: string; [abc: symbol]: Date}` with three heterogeneous index signatures where string and number keys round-trip as object keys while non-serializable symbol-keyed entries are silently dropped, leaving the decoded value with only the string/number keys.',
    serializeNotes: [
      'Symbol-keyed entries are non-serializable: JSON.stringify omits them and the round-trip restores only the string/number keys (deserializedValues reflects the dropped symbol keys).',
      'No value-first schema can express multiple heterogeneous index signatures (RT.record takes a single key/value pair), so the schema variants opt out via not-supported.',
    ],
    mutateEncoder: () =>
      createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'direct'}),
    compactEncoder: () =>
      createJsonEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
    preserveDecoder: () =>
      createJsonDecoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () =>
      createJsonDecoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
    // No value-first builder can express MULTIPLE heterogeneous index signatures
    // (string + number + symbol keys) in one shape — `RT.record(...)` takes a
    // single key/value pair, so e.g. `RT.record(TF.string())` types as
    // `Record<string, string>`, which does not match the declared multi-index type.
    schemaEncoder: 'not-supported',
    schemaDecoder: 'not-supported',
    schemaBinaryEncoder: 'not-supported',
    schemaBinaryDecoder: 'not-supported',
    getTestData: () => {
      const objWithSymbolKeys = {
        key1: 'value1',
        key2: 'value2',
        [Symbol('key3')]: new Date(),
        [Symbol('key4')]: new Date(),
      };
      // Numeric keys exercise the [key: number] index signature: JS stores them
      // as string property keys, JSON emits them as string keys, and the
      // round-trip restores them as string keys — the headline number-key→string
      // behavior. (`{5: 'five'}` and `{'5': 'five'}` are the same object.)
      const objWithNumericKeys = {0: 'zero', 5: 'five', key1: 'value1'};
      return {
        values: [{key1: 'value1', key2: 'value2'}, objWithSymbolKeys, objWithNumericKeys],
        deserializedValues: [
          {key1: 'value1', key2: 'value2'},
          {key1: 'value1', key2: 'value2'},
          {0: 'zero', 5: 'five', key1: 'value1'},
        ],
      };
    },
  },
  index_property_nested: {
    title: 'Nested index',
    description:
      'Root `{[key: string]: {[key: string]: number}}` record whose values are themselves string-keyed number records, where JSON and binary round-trip both levels of dynamic keys as nested plain objects with no per-value transform on the atomic number values.',
    serializeNotes:
      'Both index signatures admit every key at their level, so strip and preserve decode identically — no key is undeclared.',
    mutateEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: number}}>(),
    preserveDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<{[key: string]: {[key: string]: number}}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: string]: {[key: string]: number}}>(),
    schemaEncoder: () => createJsonEncoder(RT.record(RT.record(TF.number()))),
    schemaDecoder: () => createJsonDecoder(RT.record(RT.record(TF.number()))),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.record(RT.record(TF.number()))),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.record(RT.record(TF.number()))),
    getTestData: () => ({values: [{key1: {nestedKey1: 1, nestedKey2: 2}}]}),
  },
  index_property_nested_date: {
    title: 'Nested Date index',
    description:
      'Root `{[key: string]: {[key: string]: Date}}` record of string-keyed records whose innermost values are `Date`, where JSON and binary round-trip both levels of dynamic keys with each `Date` becoming an ISO string on encode and rebuilt via `new Date(...)` on decode.',
    serializeNotes:
      'Innermost Date values serialize via their ISO string and restore with new Date(...); both index signatures admit every key, so strip and preserve decode identically.',
    mutateEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: Date}}>(),
    preserveDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<{[key: string]: {[key: string]: Date}}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: string]: {[key: string]: Date}}>(),
    schemaEncoder: () => createJsonEncoder(RT.record(RT.record(TF.date()))),
    schemaDecoder: () => createJsonDecoder(RT.record(RT.record(TF.date()))),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.record(RT.record(TF.date()))),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.record(RT.record(TF.date()))),
    getTestData: () => ({
      values: [
        {
          key1: {
            nestedKey1: new Date('2000-08-06T02:13:00.000Z'),
            nestedKey2: new Date('2000-08-06T02:13:00.000Z'),
          },
        },
      ],
    }),
  },
  index_property_bigint: {
    title: 'Bigint index',
    description:
      'Root `{[key: string]: bigint}` dynamic-key record of bigint values where JSON serializes each value as a decimal string (not natively JSON-encodable) and restores it with `BigInt(...)`, binary encodes the values natively, and keys round-trip as plain object keys.',
    serializeNotes: [
      'bigint values serialize as decimal strings and restore via BigInt(...); JSON cannot encode bigint directly.',
      'The index signature admits every key, so strip and preserve decode identically.',
    ],
    mutateEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<{[key: string]: bigint}>(),
    preserveDecoder: () => createJsonDecoder<{[key: string]: bigint}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<{[key: string]: bigint}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<{[key: string]: bigint}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: string]: bigint}>(),
    schemaEncoder: () => createJsonEncoder(RT.record(TF.bigInt())),
    schemaDecoder: () => createJsonDecoder(RT.record(TF.bigInt())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.record(TF.bigInt())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.record(TF.bigInt())),
    getTestData: () => ({
      values: [
        {key1: 1n, key2: 2n},
        {hello: 1n, world: 2n},
      ],
    }),
  },
  index_property_non_root: {
    title: 'Non-root index',
    description:
      'Root object `{b: string; c: {...}}` where the nested `c` carries a declared `a` plus a string-valued index signature, so JSON and binary round-trip the fixed root shape while the nested `c` admits arbitrary dynamic string keys alongside `a`.',
    serializeNotes:
      'Only the nested `c` has an index signature, so its dynamic keys survive strip and preserve identically; the root has a fixed declared shape.',
    mutateEncoder: () => createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'direct'}),
    compactEncoder: () => createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'compact'}),
    stripDecoder: () => createJsonDecoder<{b: string; c: {a: string; [key: string]: string}}>(),
    preserveDecoder: () =>
      createJsonDecoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'preserve'}),
    compactDecoder: () => createJsonDecoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'compact'}),
    binaryEncoder: () => createBinaryEncoder<{b: string; c: {a: string; [key: string]: string}}>(),
    binaryDecoder: () => createBinaryDecoder<{b: string; c: {a: string; [key: string]: string}}>(),
    schemaEncoder: () =>
      createJsonEncoder(RT.object({b: TF.string(), c: RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))})),
    schemaDecoder: () =>
      createJsonDecoder(RT.object({b: TF.string(), c: RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))})),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(RT.object({b: TF.string(), c: RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))})),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(RT.object({b: TF.string(), c: RT.intersection(RT.record(TF.string()), RT.object({a: TF.string()}))})),
    getTestData: () => ({values: [{b: 'hello', c: {a: 'world', c: 'world'}}]}),
  },
} as const satisfies Record<string, SerializationCase>;
