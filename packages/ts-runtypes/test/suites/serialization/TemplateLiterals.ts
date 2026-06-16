import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';
import type {SerializationCase} from './types.ts';

export const TEMPLATE_LITERALS = {
  url_string: {
    title: 'Root template literal',
    description:
      'Root template-literal type `` `api/users/${number}` `` round-trips identically across JSON and binary as a plain string, with samples covering integer, negative, fractional, and max-safe-integer interpolations.',
    serializeNotes:
      'A template literal is a string subtype on the wire — no pattern-specific transform applies; it serializes exactly like a `string`.',
    mutateEncoder: () => createJsonEncoder<`api/users/${number}`>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<`api/users/${number}`>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<`api/users/${number}`>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<`api/users/${number}`>(),
    preserveDecoder: () => createJsonDecoder<`api/users/${number}`>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<`api/users/${number}`>(),
    binaryDecoder: () => createBinaryDecoder<`api/users/${number}`>(),
    schemaEncoder: () => createJsonEncoder(RT.templateLiteral(['api/users/', RT.number()])),
    schemaDecoder: () => createJsonDecoder(RT.templateLiteral(['api/users/', RT.number()])),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.templateLiteral(['api/users/', RT.number()])),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.templateLiteral(['api/users/', RT.number()])),
    getTestData: () => ({
      values: [
        'api/users/0',
        'api/users/1',
        'api/users/42',
        'api/users/-7',
        'api/users/3.14',
        `api/users/${Number.MAX_SAFE_INTEGER}`,
      ],
    }),
  },
  url_in_object: {
    title: 'Template literal property',
    description:
      'Object with a template-literal-typed `url` property plus a plain `method: string` round-trips identically across JSON and binary as plain strings.',
    mutateEncoder: () => createJsonEncoder<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{url: `api/user/${number}`; method: string}>(),
    preserveDecoder: () => createJsonDecoder<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{url: `api/user/${number}`; method: string}>(),
    binaryDecoder: () => createBinaryDecoder<{url: `api/user/${number}`; method: string}>(),
    schemaEncoder: () => createJsonEncoder(RT.object({url: RT.templateLiteral(['api/user/', RT.number()]), method: RT.string()})),
    schemaDecoder: () => createJsonDecoder(RT.object({url: RT.templateLiteral(['api/user/', RT.number()]), method: RT.string()})),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(RT.object({url: RT.templateLiteral(['api/user/', RT.number()]), method: RT.string()})),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(RT.object({url: RT.templateLiteral(['api/user/', RT.number()]), method: RT.string()})),
    getTestData: () => ({
      values: [
        {url: 'api/user/1', method: 'GET'},
        {url: 'api/user/42', method: 'POST'},
        {url: 'api/user/-7', method: 'DELETE'},
      ],
    }),
  },
  url_index_key: {
    title: 'Template literal index key',
    description:
      'Record whose index-signature key is a template literal `` `api/${string}` `` with `number` values round-trips as a plain key/value object across JSON and binary, including the empty-object case.',
    serializeNotes:
      'The template-literal key constrains which property names are valid but is not encoded separately — entries serialize as ordinary string-keyed members.',
    mutateEncoder: () => createJsonEncoder<{[key: `api/${string}`]: number}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{[key: `api/${string}`]: number}>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<{[key: `api/${string}`]: number}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{[key: `api/${string}`]: number}>(),
    preserveDecoder: () => createJsonDecoder<{[key: `api/${string}`]: number}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{[key: `api/${string}`]: number}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: `api/${string}`]: number}>(),
    schemaEncoder: () => createJsonEncoder(RT.record(RT.templateLiteral(['api/', RT.string()]), RT.number())),
    schemaDecoder: () => createJsonDecoder(RT.record(RT.templateLiteral(['api/', RT.string()]), RT.number())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.record(RT.templateLiteral(['api/', RT.string()]), RT.number())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.record(RT.templateLiteral(['api/', RT.string()]), RT.number())),
    getTestData: () => ({values: [{}, {'api/users': 1, 'api/posts': 2}, {'api/v1/users': 7, 'api/admin': 0}]}),
  },
  url_index_key_with_named: {
    title: 'Index key with named sibling',
    description:
      'Object combining a template-literal-keyed index signature (`` `api/${string}` `` → `string | number`) with a sibling named `meta: string` resolves to an intersection of the keyed record and an object carrying the named prop, round-tripping as a plain object across JSON and binary.',
    mutateEncoder: () =>
      createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{meta: string; [key: `api/${string}`]: string | number}>(),
    preserveDecoder: () =>
      createJsonDecoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{meta: string; [key: `api/${string}`]: string | number}>(),
    binaryDecoder: () => createBinaryDecoder<{meta: string; [key: `api/${string}`]: string | number}>(),
    // Index signature + sibling named prop = intersection of the template-literal-keyed
    // record with an object carrying the named props (mirrors validation Object.ts
    // index_signature_named_props composed with the template-literal index key).
    schemaEncoder: () =>
      createJsonEncoder(
        RT.intersection(
          RT.record(RT.templateLiteral(['api/', RT.string()]), RT.union([RT.string(), RT.number()])),
          RT.object({meta: RT.string()})
        )
      ),
    schemaDecoder: () =>
      createJsonDecoder(
        RT.intersection(
          RT.record(RT.templateLiteral(['api/', RT.string()]), RT.union([RT.string(), RT.number()])),
          RT.object({meta: RT.string()})
        )
      ),
    schemaBinaryEncoder: () =>
      createBinaryEncoder(
        RT.intersection(
          RT.record(RT.templateLiteral(['api/', RT.string()]), RT.union([RT.string(), RT.number()])),
          RT.object({meta: RT.string()})
        )
      ),
    schemaBinaryDecoder: () =>
      createBinaryDecoder(
        RT.intersection(
          RT.record(RT.templateLiteral(['api/', RT.string()]), RT.union([RT.string(), RT.number()])),
          RT.object({meta: RT.string()})
        )
      ),
    getTestData: () => ({
      values: [{meta: 'a'}, {meta: 'b', 'api/users': 1}, {meta: 'c', 'api/users': 1, 'api/posts': 2}],
    }),
  },
} as const satisfies Record<string, SerializationCase>;
