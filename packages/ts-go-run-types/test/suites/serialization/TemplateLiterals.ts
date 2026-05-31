import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {SerializationCase} from './types.ts';

export const TEMPLATE_LITERALS = {
  url_string: {
    title: 'template literal as string type',
    unsafeEncoder: () => createJsonEncoder<`api/users/${number}`>(undefined, {strategy: 'mutate', stripExtras: false}),
    clonePreserveEncoder: () => createJsonEncoder<`api/users/${number}`>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () => createJsonEncoder<`api/users/${number}`>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<`api/users/${number}`>(),
    safeDirectEncoder: () => createJsonEncoder<`api/users/${number}`>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<`api/users/${number}`>(),
    unsafeDecoder: () => createJsonDecoder<`api/users/${number}`>(undefined, {stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<`api/users/${number}`>(),
    binaryDecoder: () => createBinaryDecoder<`api/users/${number}`>(),
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
    title: 'template literal as object property type',
    unsafeEncoder: () =>
      createJsonEncoder<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'mutate', stripExtras: false}),
    clonePreserveEncoder: () =>
      createJsonEncoder<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () =>
      createJsonEncoder<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<{url: `api/user/${number}`; method: string}>(),
    safeDirectEncoder: () => createJsonEncoder<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<{url: `api/user/${number}`; method: string}>(),
    unsafeDecoder: () => createJsonDecoder<{url: `api/user/${number}`; method: string}>(undefined, {stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<{url: `api/user/${number}`; method: string}>(),
    binaryDecoder: () => createBinaryDecoder<{url: `api/user/${number}`; method: string}>(),
    getTestData: () => ({
      values: [
        {url: 'api/user/1', method: 'GET'},
        {url: 'api/user/42', method: 'POST'},
        {url: 'api/user/-7', method: 'DELETE'},
      ],
    }),
  },
  url_index_key: {
    title: 'template literal as index signature key',
    unsafeEncoder: () => createJsonEncoder<{[key: `api/${string}`]: number}>(undefined, {strategy: 'mutate', stripExtras: false}),
    clonePreserveEncoder: () =>
      createJsonEncoder<{[key: `api/${string}`]: number}>(undefined, {strategy: 'clone', stripExtras: false}),
    mutateStripEncoder: () =>
      createJsonEncoder<{[key: `api/${string}`]: number}>(undefined, {strategy: 'mutate', stripExtras: true}),
    safeEncoder: () => createJsonEncoder<{[key: `api/${string}`]: number}>(),
    safeDirectEncoder: () => createJsonEncoder<{[key: `api/${string}`]: number}>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<{[key: `api/${string}`]: number}>(),
    unsafeDecoder: () => createJsonDecoder<{[key: `api/${string}`]: number}>(undefined, {stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<{[key: `api/${string}`]: number}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: `api/${string}`]: number}>(),
    getTestData: () => ({values: [{}, {'api/users': 1, 'api/posts': 2}, {'api/v1/users': 7, 'api/admin': 0}]}),
  },
  url_index_key_with_named: {
    title: 'template literal index key + sibling named property',
    unsafeEncoder: () =>
      createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {
        strategy: 'mutate',
        stripExtras: false,
      }),
    clonePreserveEncoder: () =>
      createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {
        strategy: 'clone',
        stripExtras: false,
      }),
    mutateStripEncoder: () =>
      createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {
        strategy: 'mutate',
        stripExtras: true,
      }),
    safeEncoder: () => createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(),
    safeDirectEncoder: () =>
      createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<{meta: string; [key: `api/${string}`]: string | number}>(),
    unsafeDecoder: () =>
      createJsonDecoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {stripExtras: false}),
    binaryEncoder: () => createBinaryEncoder<{meta: string; [key: `api/${string}`]: string | number}>(),
    binaryDecoder: () => createBinaryDecoder<{meta: string; [key: `api/${string}`]: string | number}>(),
    getTestData: () => ({
      values: [{meta: 'a'}, {meta: 'b', 'api/users': 1}, {meta: 'c', 'api/users': 1, 'api/posts': 2}],
    }),
  },
} as const satisfies Record<string, SerializationCase>;
