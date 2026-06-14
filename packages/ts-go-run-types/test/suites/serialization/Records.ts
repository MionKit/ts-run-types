import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import * as RT from '@mionjs/ts-go-run-types/schema';
import type {SerializationCase} from './types.ts';

export const RECORDS = {
  index_property: {
    title: 'index property',
    description:
      'Root `{[key: string]: string}` — a dynamic-key record of string values. JSON and binary round-trip every key/value pair as a plain object; empty objects also round-trip. String values are atomic so no per-value transform runs.',
    serializeNotes:
      'The index signature admits every key, so strip and preserve decode identically — there are no undeclared keys to drop.',
    mutateEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{[key: string]: string}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{[key: string]: string}>(),
    preserveDecoder: () => createJsonDecoder<{[key: string]: string}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{[key: string]: string}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: string]: string}>(),
    schemaEncoder: () => createJsonEncoder(RT.record(RT.string())),
    schemaDecoder: () => createJsonDecoder(RT.record(RT.string())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.record(RT.string())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.record(RT.string())),
    getTestData: () => ({values: [{key1: 'value1', key2: 'value2'}, {}]}),
  },
  index_property_and_prop: {
    title: 'interface with a single property and index property',
    description:
      'Root `{a: string; [key: string]: string}` — a declared `a` plus a string-valued index signature. JSON and binary round-trip the declared property alongside any number of dynamic string keys; samples cover the index-only-on-`a` shape and one with an extra `b` key.',
    serializeNotes:
      'The index signature admits every key, so strip and preserve decode identically — dynamic keys are never treated as undeclared.',
    mutateEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{a: string; [key: string]: string}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{a: string; [key: string]: string}>(),
    preserveDecoder: () => createJsonDecoder<{a: string; [key: string]: string}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{a: string; [key: string]: string}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string; [key: string]: string}>(),
    schemaEncoder: () => createJsonEncoder(RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()}))),
    schemaDecoder: () => createJsonDecoder(RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()}))),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()}))),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()}))),
    getTestData: () => ({values: [{a: 'helloA'}, {a: 'helloA', b: 'helloB'}]}),
  },
  index_property_extra: {
    title: 'index property with extra props and unions',
    description:
      'Root `{a: string; b: number; [key: string]: string | number}` — declared `a`/`b` plus a `string | number` index signature. JSON and binary round-trip the declared props alongside dynamic keys whose values are either string or number; the per-value union is resolved structurally on encode and decode.',
    serializeNotes:
      'The index signature admits every key, so strip and preserve decode identically — dynamic string-or-number keys are never dropped.',
    mutateEncoder: () =>
      createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{a: string; b: number; [key: string]: string | number}>(),
    preserveDecoder: () =>
      createJsonDecoder<{a: string; b: number; [key: string]: string | number}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{a: string; b: number; [key: string]: string | number}>(),
    binaryDecoder: () => createBinaryDecoder<{a: string; b: number; [key: string]: string | number}>(),
    schemaEncoder: () =>
      createJsonEncoder(
        RT.intersection(RT.record(RT.union([RT.string(), RT.number()])), RT.object({a: RT.string(), b: RT.number()}))
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.intersection(RT.record(RT.union([RT.string(), RT.number()])), RT.object({a: RT.string(), b: RT.number()}))
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.intersection(RT.record(RT.union([RT.string(), RT.number()])), RT.object({a: RT.string(), b: RT.number()}))
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.intersection(RT.record(RT.union([RT.string(), RT.number()])), RT.object({a: RT.string(), b: RT.number()}))
      ),
    getTestData: () => ({values: [{key1: 'value1', key2: 'value2', a: 'extra1', b: 123}]}),
  },
  multiple_index_props: {
    title: 'multiple index properties (symbol keys skipped)',
    description:
      'Root `{[key: string]: string; [key: number]: string; [abc: symbol]: Date}` with three heterogeneous index signatures. String and number keys round-trip as object keys; symbol-keyed entries are non-serializable and are silently dropped, so the decoded value carries only the string/number keys.',
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
    stripDecoder: () => createJsonDecoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
    preserveDecoder: () =>
      createJsonDecoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: string]: string; [key: number]: string; [abc: symbol]: Date}>(),
    // No value-first builder can express MULTIPLE heterogeneous index signatures
    // (string + number + symbol keys) in one shape — `RT.record(...)` takes a
    // single key/value pair, so e.g. `RT.record(RT.string())` types as
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
      return {
        values: [{key1: 'value1', key2: 'value2'}, objWithSymbolKeys],
        deserializedValues: [
          {key1: 'value1', key2: 'value2'},
          {key1: 'value1', key2: 'value2'},
        ],
      };
    },
  },
  index_property_nested: {
    title: 'index property nested',
    description:
      'Root `{[key: string]: {[key: string]: number}}` — a record whose values are themselves string-keyed number records. JSON and binary round-trip both levels of dynamic keys as nested plain objects; number values are atomic so no per-value transform runs.',
    serializeNotes:
      'Both index signatures admit every key at their level, so strip and preserve decode identically — no key is undeclared.',
    mutateEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: number}}>(),
    preserveDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: number}}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{[key: string]: {[key: string]: number}}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: string]: {[key: string]: number}}>(),
    schemaEncoder: () => createJsonEncoder(RT.record(RT.record(RT.number()))),
    schemaDecoder: () => createJsonDecoder(RT.record(RT.record(RT.number()))),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.record(RT.record(RT.number()))),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.record(RT.record(RT.number()))),
    getTestData: () => ({values: [{key1: {nestedKey1: 1, nestedKey2: 2}}]}),
  },
  index_property_nested_date: {
    title: 'index property nested with Date values',
    description:
      'Root `{[key: string]: {[key: string]: Date}}` — a record of string-keyed records whose innermost values are `Date`. JSON and binary round-trip both levels of dynamic keys; each `Date` becomes an ISO string on encode and is rebuilt with `new Date(...)` on decode.',
    serializeNotes:
      'Innermost Date values serialize via their ISO string and restore with new Date(...); both index signatures admit every key, so strip and preserve decode identically.',
    mutateEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: Date}}>(),
    preserveDecoder: () => createJsonDecoder<{[key: string]: {[key: string]: Date}}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{[key: string]: {[key: string]: Date}}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: string]: {[key: string]: Date}}>(),
    schemaEncoder: () => createJsonEncoder(RT.record(RT.record(RT.date()))),
    schemaDecoder: () => createJsonDecoder(RT.record(RT.record(RT.date()))),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.record(RT.record(RT.date()))),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.record(RT.record(RT.date()))),
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
    title: 'index property with bigint values',
    description:
      'Root `{[key: string]: bigint}` — a dynamic-key record of bigint values. JSON serializes each bigint value as a decimal string (not natively JSON-encodable) and restores it with `BigInt(...)`; binary encodes bigint values natively. Keys round-trip as plain object keys.',
    serializeNotes: [
      'bigint values serialize as decimal strings and restore via BigInt(...); JSON cannot encode bigint directly.',
      'The index signature admits every key, so strip and preserve decode identically.',
    ],
    mutateEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{[key: string]: bigint}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{[key: string]: bigint}>(),
    preserveDecoder: () => createJsonDecoder<{[key: string]: bigint}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{[key: string]: bigint}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: string]: bigint}>(),
    schemaEncoder: () => createJsonEncoder(RT.record(RT.bigint())),
    schemaDecoder: () => createJsonDecoder(RT.record(RT.bigint())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.record(RT.bigint())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.record(RT.bigint())),
    getTestData: () => ({
      values: [
        {key1: 1n, key2: 2n},
        {hello: 1n, world: 2n},
      ],
    }),
  },
  index_property_non_root: {
    title: 'index property non-root',
    description:
      'Root object `{b: string; c: {...}}` where the nested `c` carries a declared `a` plus a string-valued index signature. JSON and binary round-trip the fixed root shape while the nested `c` admits arbitrary dynamic string keys alongside `a`.',
    serializeNotes:
      'Only the nested `c` has an index signature, so its dynamic keys survive strip and preserve identically; the root has a fixed declared shape.',
    mutateEncoder: () => createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{b: string; c: {a: string; [key: string]: string}}>(),
    preserveDecoder: () =>
      createJsonDecoder<{b: string; c: {a: string; [key: string]: string}}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{b: string; c: {a: string; [key: string]: string}}>(),
    binaryDecoder: () => createBinaryDecoder<{b: string; c: {a: string; [key: string]: string}}>(),
    schemaEncoder: () =>
      createJsonEncoder(RT.object({b: RT.string(), c: RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()}))})),
    schemaDecoder: () =>
      createJsonDecoder(RT.object({b: RT.string(), c: RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()}))})),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(RT.object({b: RT.string(), c: RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()}))})),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(RT.object({b: RT.string(), c: RT.intersection(RT.record(RT.string()), RT.object({a: RT.string()}))})),
    getTestData: () => ({values: [{b: 'hello', c: {a: 'world', c: 'world'}}]}),
  },
} as const satisfies Record<string, SerializationCase>;
