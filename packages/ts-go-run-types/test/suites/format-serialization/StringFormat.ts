import type {SerializationCase} from './types.ts';
import '@mionjs/ts-go-run-types/formats';
import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {FormatString, FormatAlpha, FormatUUIDv4, FormatStringDate, FormatEmail} from '@mionjs/ts-go-run-types/formats';

const V4 = '9f1b8c2e-3d4a-4b5c-8d6e-1f2a3b4c5d6e';

export const STRING_FORMAT = {
  string_maxLength: {
    title: 'FormatString<{maxLength: 5}>',
    unsafeEncoder: () => createJsonEncoder<FormatString<{maxLength: 5}>>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<FormatString<{maxLength: 5}>>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<FormatString<{maxLength: 5}>>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<FormatString<{maxLength: 5}>>(),
    safeDirectEncoder: () => createJsonEncoder<FormatString<{maxLength: 5}>>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<FormatString<{maxLength: 5}>>(),
    unsafeDecoder: () => createJsonDecoder<FormatString<{maxLength: 5}>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatString<{maxLength: 5}>>(),
    binaryDecoder: () => createBinaryDecoder<FormatString<{maxLength: 5}>>(),
    getTestData: () => ({values: ['', 'hello', 'abc']}),
  },
  uuidv4: {
    title: 'FormatUUIDv4',
    unsafeEncoder: () => createJsonEncoder<FormatUUIDv4>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<FormatUUIDv4>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<FormatUUIDv4>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<FormatUUIDv4>(),
    safeDirectEncoder: () => createJsonEncoder<FormatUUIDv4>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<FormatUUIDv4>(),
    unsafeDecoder: () => createJsonDecoder<FormatUUIDv4>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatUUIDv4>(),
    binaryDecoder: () => createBinaryDecoder<FormatUUIDv4>(),
    getTestData: () => ({values: [V4]}),
  },
  date: {
    title: 'FormatStringDate',
    unsafeEncoder: () => createJsonEncoder<FormatStringDate>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<FormatStringDate>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<FormatStringDate>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<FormatStringDate>(),
    safeDirectEncoder: () => createJsonEncoder<FormatStringDate>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<FormatStringDate>(),
    unsafeDecoder: () => createJsonDecoder<FormatStringDate>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatStringDate>(),
    binaryDecoder: () => createBinaryDecoder<FormatStringDate>(),
    getTestData: () => ({values: ['2024-02-29', '2026-05-28', '0001-01-01']}),
  },
  email: {
    title: 'FormatEmail',
    unsafeEncoder: () => createJsonEncoder<FormatEmail>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<FormatEmail>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<FormatEmail>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<FormatEmail>(),
    safeDirectEncoder: () => createJsonEncoder<FormatEmail>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<FormatEmail>(),
    unsafeDecoder: () => createJsonDecoder<FormatEmail>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatEmail>(),
    binaryDecoder: () => createBinaryDecoder<FormatEmail>(),
    getTestData: () => ({values: ['john@example.com', 'jane.doe@mion.io']}),
  },
  alpha: {
    title: 'FormatAlpha',
    unsafeEncoder: () => createJsonEncoder<FormatAlpha>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<FormatAlpha>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<FormatAlpha>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<FormatAlpha>(),
    safeDirectEncoder: () => createJsonEncoder<FormatAlpha>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<FormatAlpha>(),
    unsafeDecoder: () => createJsonDecoder<FormatAlpha>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatAlpha>(),
    binaryDecoder: () => createBinaryDecoder<FormatAlpha>(),
    getTestData: () => ({values: ['Hello', 'abcXYZ']}),
  },
  object_with_formats: {
    title: 'object with format-branded fields {id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}',
    unsafeEncoder: () =>
      createJsonEncoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () =>
      createJsonEncoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () =>
      createJsonEncoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(),
    safeDirectEncoder: () =>
      createJsonEncoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(),
    unsafeDecoder: () =>
      createJsonDecoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(),
    binaryDecoder: () => createBinaryDecoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(),
    getTestData: () => ({values: [{id: V4, name: 'alice'}]}),
  },
  email_array: {
    title: 'array of FormatEmail',
    unsafeEncoder: () => createJsonEncoder<FormatEmail[]>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<FormatEmail[]>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<FormatEmail[]>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<FormatEmail[]>(),
    safeDirectEncoder: () => createJsonEncoder<FormatEmail[]>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<FormatEmail[]>(),
    unsafeDecoder: () => createJsonDecoder<FormatEmail[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatEmail[]>(),
    binaryDecoder: () => createBinaryDecoder<FormatEmail[]>(),
    getTestData: () => ({values: [['john@example.com', 'jane.doe@mion.io']]}),
  },
} as const satisfies Record<string, SerializationCase>;
