import * as TF from 'ts-runtypes/formats';
import type {SerializationCase} from './types.ts';
import * as RT from 'ts-runtypes/schema';
import 'ts-runtypes/formats';
import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from 'ts-runtypes';

const V4 = '9f1b8c2e-3d4a-4b5c-8d6e-1f2a3b4c5d6e';

export const STRING_FORMAT = {
  string_maxLength: {
    title: 'String maxLength',
    description:
      'JSON and binary (de)serialization of TF.String<{maxLength: 5}>, a string branded with a length cap, where the maxLength brand constrains validation only and both formats serialize the plain underlying string.',
    serializeNotes:
      'The maxLength brand never reaches the wire: serialization uses the base string kind, so the value round-trips as a plain variable-length string in JSON and binary (no fixed byte size).',
    mutateEncoder: () => createJsonEncoder<TF.String<{maxLength: 5}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<TF.String<{maxLength: 5}>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<TF.String<{maxLength: 5}>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<TF.String<{maxLength: 5}>>(),
    preserveDecoder: () => createJsonDecoder<TF.String<{maxLength: 5}>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<TF.String<{maxLength: 5}>>(),
    binaryDecoder: () => createBinaryDecoder<TF.String<{maxLength: 5}>>(),
    schemaEncoder: () => createJsonEncoder(TF.string({maxLength: 5})),
    schemaDecoder: () => createJsonDecoder(TF.string({maxLength: 5})),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.string({maxLength: 5})),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.string({maxLength: 5})),
    getTestData: () => ({values: ['', 'hello', 'abc']}),
  },
  uuidv4: {
    title: 'UUID v4',
    description:
      'JSON and binary (de)serialization of TF.UUIDv4, a string branded {version:"4"}, where the UUID format is a string subKind so the canonical v4 UUID text round-trips unchanged in both formats.',
    serializeNotes:
      'No compact 16-byte UUID packing — binary serializes the UUID as its plain 36-char string form (variable-length, like any branded string); the version brand is validation-only.',
    mutateEncoder: () => createJsonEncoder<TF.UUIDv4>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<TF.UUIDv4>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<TF.UUIDv4>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<TF.UUIDv4>(),
    preserveDecoder: () => createJsonDecoder<TF.UUIDv4>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<TF.UUIDv4>(),
    binaryDecoder: () => createBinaryDecoder<TF.UUIDv4>(),
    schemaEncoder: () => createJsonEncoder(TF.uuidv4()),
    schemaDecoder: () => createJsonDecoder(TF.uuidv4()),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.uuidv4()),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.uuidv4()),
    getTestData: () => ({values: [V4]}),
  },
  date: {
    title: 'String date',
    description:
      'JSON and binary (de)serialization of TF.StringDate, a STRING date such as "2024-02-29" rather than a native Date object, where the value stays an ISO date string on the wire and round-trips unchanged in both formats.',
    serializeNotes:
      'String-on-wire date: unlike the native FormatDate (DateTime.ts), the value is already a string, so there is no toJSON/.from conversion — JSON and binary both carry the plain date string. Samples cover a leap day and the 0001 lower edge.',
    mutateEncoder: () => createJsonEncoder<TF.StringDate>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<TF.StringDate>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<TF.StringDate>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<TF.StringDate>(),
    preserveDecoder: () => createJsonDecoder<TF.StringDate>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<TF.StringDate>(),
    binaryDecoder: () => createBinaryDecoder<TF.StringDate>(),
    schemaEncoder: () => createJsonEncoder(TF.stringDate()),
    schemaDecoder: () => createJsonDecoder(TF.stringDate()),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.stringDate()),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.stringDate()),
    getTestData: () => ({values: ['2024-02-29', '2026-05-28', '0001-01-01']}),
  },
  email: {
    title: 'Email',
    description:
      'JSON and binary (de)serialization of TF.Email, a string branded with the built-in email pattern and length bounds, where the email string round-trips unchanged in both formats.',
    serializeNotes:
      'The email pattern/length brand is validation-only; serialization uses the base string kind (plain variable-length string on the wire).',
    mutateEncoder: () => createJsonEncoder<TF.Email>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<TF.Email>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<TF.Email>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<TF.Email>(),
    preserveDecoder: () => createJsonDecoder<TF.Email>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<TF.Email>(),
    binaryDecoder: () => createBinaryDecoder<TF.Email>(),
    schemaEncoder: () => createJsonEncoder(TF.email()),
    schemaDecoder: () => createJsonDecoder(TF.email()),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.email()),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.email()),
    getTestData: () => ({values: ['john@example.com', 'jane.doe@mion.io']}),
  },
  alpha: {
    title: 'Alpha',
    description:
      'JSON and binary (de)serialization of TF.Alpha, a string branded with the alphabetic-only pattern, where the letters-only string round-trips unchanged in both formats.',
    serializeNotes:
      'The alpha pattern brand is validation-only; serialization uses the base string kind (plain variable-length string on the wire).',
    mutateEncoder: () => createJsonEncoder<TF.Alpha>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<TF.Alpha>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<TF.Alpha>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<TF.Alpha>(),
    preserveDecoder: () => createJsonDecoder<TF.Alpha>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<TF.Alpha>(),
    binaryDecoder: () => createBinaryDecoder<TF.Alpha>(),
    schemaEncoder: () => createJsonEncoder(TF.alpha()),
    schemaDecoder: () => createJsonDecoder(TF.alpha()),
    schemaBinaryEncoder: () => createBinaryEncoder(TF.alpha()),
    schemaBinaryDecoder: () => createBinaryDecoder(TF.alpha()),
    getTestData: () => ({values: ['Hello', 'abcXYZ']}),
  },
  object_with_formats: {
    title: 'Format-branded object',
    description:
      'JSON and binary (de)serialization of an object whose fields are format-branded strings ({id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}), proving format brands compose under an objectLiteral where each field serializes as its base string.',
    serializeNotes:
      'Format brands are validation-only at each property; the wire shape is a plain object of strings (binary writes each field as a variable-length string, no UUID/length packing).',
    mutateEncoder: () =>
      createJsonEncoder<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () =>
      createJsonEncoder<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(undefined, {strategy: 'clone'}),
    directEncoder: () =>
      createJsonEncoder<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(),
    preserveDecoder: () =>
      createJsonDecoder<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(),
    binaryDecoder: () => createBinaryDecoder<{id: TF.UUIDv4; name: TF.String<{maxLength: 20}>}>(),
    schemaEncoder: () => createJsonEncoder(RT.object({id: TF.uuidv4(), name: TF.string({maxLength: 20})})),
    schemaDecoder: () => createJsonDecoder(RT.object({id: TF.uuidv4(), name: TF.string({maxLength: 20})})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.object({id: TF.uuidv4(), name: TF.string({maxLength: 20})})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.object({id: TF.uuidv4(), name: TF.string({maxLength: 20})})),
    getTestData: () => ({values: [{id: V4, name: 'alice'}]}),
  },
  email_array: {
    title: 'Email array',
    description:
      'JSON and binary (de)serialization of TF.Email[], an array whose element is a format-branded string, proving format brands propagate through the array element kind where each element serializes as its base string.',
    serializeNotes:
      'The element email brand is validation-only; the wire shape is a plain array of strings (binary writes a length-prefixed sequence of variable-length strings).',
    mutateEncoder: () => createJsonEncoder<TF.Email[]>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<TF.Email[]>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<TF.Email[]>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<TF.Email[]>(),
    preserveDecoder: () => createJsonDecoder<TF.Email[]>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<TF.Email[]>(),
    binaryDecoder: () => createBinaryDecoder<TF.Email[]>(),
    schemaEncoder: () => createJsonEncoder(RT.array(TF.email())),
    schemaDecoder: () => createJsonDecoder(RT.array(TF.email())),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.array(TF.email())),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.array(TF.email())),
    getTestData: () => ({values: [['john@example.com', 'jane.doe@mion.io']]}),
  },
} as const satisfies Record<string, SerializationCase>;
