import type {SerializationCase} from './types.ts';
import * as RT from '@mionjs/ts-go-run-types/schema';
import '@mionjs/ts-go-run-types/formats';
import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {FormatString, FormatAlpha, FormatUUIDv4, FormatStringDate, FormatEmail} from '@mionjs/ts-go-run-types/formats';

const V4 = '9f1b8c2e-3d4a-4b5c-8d6e-1f2a3b4c5d6e';

export const STRING_FORMAT = {
  string_maxLength: {
    title: 'String maxLength',
    description:
      'JSON and binary (de)serialization of FormatString<{maxLength: 5}>, a string branded with a length cap, where the maxLength brand constrains validation only and both formats serialize the plain underlying string.',
    serializeNotes:
      'The maxLength brand never reaches the wire: serialization uses the base string kind, so the value round-trips as a plain variable-length string in JSON and binary (no fixed byte size).',
    mutateEncoder: () => createJsonEncoder<FormatString<{maxLength: 5}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<FormatString<{maxLength: 5}>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<FormatString<{maxLength: 5}>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<FormatString<{maxLength: 5}>>(),
    preserveDecoder: () => createJsonDecoder<FormatString<{maxLength: 5}>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatString<{maxLength: 5}>>(),
    binaryDecoder: () => createBinaryDecoder<FormatString<{maxLength: 5}>>(),
    schemaEncoder: () => createJsonEncoder(RT.string({maxLength: 5})),
    schemaDecoder: () => createJsonDecoder(RT.string({maxLength: 5})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.string({maxLength: 5})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.string({maxLength: 5})),
    getTestData: () => ({values: ['', 'hello', 'abc']}),
  },
  uuidv4: {
    title: 'UUID v4',
    description:
      'JSON and binary (de)serialization of FormatUUIDv4, a string branded {version:"4"}, where the UUID format is a string subKind so the canonical v4 UUID text round-trips unchanged in both formats.',
    serializeNotes:
      'No compact 16-byte UUID packing — binary serializes the UUID as its plain 36-char string form (variable-length, like any branded string); the version brand is validation-only.',
    mutateEncoder: () => createJsonEncoder<FormatUUIDv4>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<FormatUUIDv4>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<FormatUUIDv4>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<FormatUUIDv4>(),
    preserveDecoder: () => createJsonDecoder<FormatUUIDv4>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatUUIDv4>(),
    binaryDecoder: () => createBinaryDecoder<FormatUUIDv4>(),
    schemaEncoder: () => createJsonEncoder(RT.uuidv4()),
    schemaDecoder: () => createJsonDecoder(RT.uuidv4()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.uuidv4()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.uuidv4()),
    getTestData: () => ({values: [V4]}),
  },
  date: {
    title: 'String date',
    description:
      'JSON and binary (de)serialization of FormatStringDate, a STRING date such as "2024-02-29" rather than a native Date object, where the value stays an ISO date string on the wire and round-trips unchanged in both formats.',
    serializeNotes:
      'String-on-wire date: unlike the native FormatDate (DateTime.ts), the value is already a string, so there is no toJSON/.from conversion — JSON and binary both carry the plain date string. Samples cover a leap day and the 0001 lower edge.',
    mutateEncoder: () => createJsonEncoder<FormatStringDate>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<FormatStringDate>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<FormatStringDate>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<FormatStringDate>(),
    preserveDecoder: () => createJsonDecoder<FormatStringDate>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatStringDate>(),
    binaryDecoder: () => createBinaryDecoder<FormatStringDate>(),
    schemaEncoder: () => createJsonEncoder(RT.stringDate()),
    schemaDecoder: () => createJsonDecoder(RT.stringDate()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.stringDate()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.stringDate()),
    getTestData: () => ({values: ['2024-02-29', '2026-05-28', '0001-01-01']}),
  },
  email: {
    title: 'Email',
    description:
      'JSON and binary (de)serialization of FormatEmail, a string branded with the built-in email pattern and length bounds, where the email string round-trips unchanged in both formats.',
    serializeNotes: 'The email pattern/length brand is validation-only; serialization uses the base string kind (plain variable-length string on the wire).',
    mutateEncoder: () => createJsonEncoder<FormatEmail>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<FormatEmail>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<FormatEmail>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<FormatEmail>(),
    preserveDecoder: () => createJsonDecoder<FormatEmail>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatEmail>(),
    binaryDecoder: () => createBinaryDecoder<FormatEmail>(),
    schemaEncoder: () => createJsonEncoder(RT.email()),
    schemaDecoder: () => createJsonDecoder(RT.email()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.email()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.email()),
    getTestData: () => ({values: ['john@example.com', 'jane.doe@mion.io']}),
  },
  alpha: {
    title: 'Alpha',
    description:
      'JSON and binary (de)serialization of FormatAlpha, a string branded with the alphabetic-only pattern, where the letters-only string round-trips unchanged in both formats.',
    serializeNotes: 'The alpha pattern brand is validation-only; serialization uses the base string kind (plain variable-length string on the wire).',
    mutateEncoder: () => createJsonEncoder<FormatAlpha>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<FormatAlpha>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<FormatAlpha>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<FormatAlpha>(),
    preserveDecoder: () => createJsonDecoder<FormatAlpha>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatAlpha>(),
    binaryDecoder: () => createBinaryDecoder<FormatAlpha>(),
    schemaEncoder: () => createJsonEncoder(RT.alpha()),
    schemaDecoder: () => createJsonDecoder(RT.alpha()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.alpha()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.alpha()),
    getTestData: () => ({values: ['Hello', 'abcXYZ']}),
  },
  object_with_formats: {
    title: 'Format-branded object',
    description:
      'JSON and binary (de)serialization of an object whose fields are format-branded strings ({id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}), proving format brands compose under an objectLiteral where each field serializes as its base string.',
    serializeNotes: 'Format brands are validation-only at each property; the wire shape is a plain object of strings (binary writes each field as a variable-length string, no UUID/length packing).',
    mutateEncoder: () =>
      createJsonEncoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(),
    preserveDecoder: () =>
      createJsonDecoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(),
    binaryDecoder: () => createBinaryDecoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(),
    schemaEncoder: () => createJsonEncoder(RT.object({id: RT.uuidv4(), name: RT.string({maxLength: 20})})),
    schemaDecoder: () => createJsonDecoder(RT.object({id: RT.uuidv4(), name: RT.string({maxLength: 20})})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({id: RT.uuidv4(), name: RT.string({maxLength: 20})})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({id: RT.uuidv4(), name: RT.string({maxLength: 20})})),
    getTestData: () => ({values: [{id: V4, name: 'alice'}]}),
  },
  email_array: {
    title: 'Email array',
    description:
      'JSON and binary (de)serialization of FormatEmail[], an array whose element is a format-branded string, proving format brands propagate through the array element kind where each element serializes as its base string.',
    serializeNotes: 'The element email brand is validation-only; the wire shape is a plain array of strings (binary writes a length-prefixed sequence of variable-length strings).',
    mutateEncoder: () => createJsonEncoder<FormatEmail[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<FormatEmail[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<FormatEmail[]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<FormatEmail[]>(),
    preserveDecoder: () => createJsonDecoder<FormatEmail[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatEmail[]>(),
    binaryDecoder: () => createBinaryDecoder<FormatEmail[]>(),
    schemaEncoder: () => createJsonEncoder(RT.array(RT.email())),
    schemaDecoder: () => createJsonDecoder(RT.array(RT.email())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.array(RT.email())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.array(RT.email())),
    getTestData: () => ({values: [['john@example.com', 'jane.doe@mion.io']]}),
  },
} as const satisfies Record<string, SerializationCase>;
