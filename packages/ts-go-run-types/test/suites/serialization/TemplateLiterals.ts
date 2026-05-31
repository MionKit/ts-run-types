import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {SerializationCase} from './types.ts';

export const TEMPLATE_LITERALS = {
  url_string: {
    title: 'template literal as string type',
    mutateEncoder: () => createJsonEncoder<`api/users/${number}`>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<`api/users/${number}`>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<`api/users/${number}`>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<`api/users/${number}`>(),
    directEncoder: () => createJsonEncoder<`api/users/${number}`>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<`api/users/${number}`>(),
    preserveDecoder: () => createJsonDecoder<`api/users/${number}`>(undefined, {strategy: 'preserve'}),
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
    mutateEncoder: () => createJsonEncoder<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () =>
      createJsonEncoder<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{url: `api/user/${number}`; method: string}>(),
    directEncoder: () => createJsonEncoder<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{url: `api/user/${number}`; method: string}>(),
    preserveDecoder: () => createJsonDecoder<{url: `api/user/${number}`; method: string}>(undefined, {strategy: 'preserve'}),
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
    mutateEncoder: () => createJsonEncoder<{[key: `api/${string}`]: number}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<{[key: `api/${string}`]: number}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<{[key: `api/${string}`]: number}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{[key: `api/${string}`]: number}>(),
    directEncoder: () => createJsonEncoder<{[key: `api/${string}`]: number}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{[key: `api/${string}`]: number}>(),
    preserveDecoder: () => createJsonDecoder<{[key: `api/${string}`]: number}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{[key: `api/${string}`]: number}>(),
    binaryDecoder: () => createBinaryDecoder<{[key: `api/${string}`]: number}>(),
    getTestData: () => ({values: [{}, {'api/users': 1, 'api/posts': 2}, {'api/v1/users': 7, 'api/admin': 0}]}),
  },
  url_index_key_with_named: {
    title: 'template literal index key + sibling named property',
    mutateEncoder: () =>
      createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () =>
      createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(),
    directEncoder: () =>
      createJsonEncoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{meta: string; [key: `api/${string}`]: string | number}>(),
    preserveDecoder: () =>
      createJsonDecoder<{meta: string; [key: `api/${string}`]: string | number}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{meta: string; [key: `api/${string}`]: string | number}>(),
    binaryDecoder: () => createBinaryDecoder<{meta: string; [key: `api/${string}`]: string | number}>(),
    getTestData: () => ({
      values: [{meta: 'a'}, {meta: 'b', 'api/users': 1}, {meta: 'c', 'api/users': 1, 'api/posts': 2}],
    }),
  },
} as const satisfies Record<string, SerializationCase>;
