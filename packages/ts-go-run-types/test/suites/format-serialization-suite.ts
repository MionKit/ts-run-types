// Format serialization suite — the type-format sibling of
// `serialization-suite.ts`. Same `SerializationCase` shape and the same
// JSON (unsafe / safe / safe-direct) + binary round-trip coverage, but
// every `T` is a format-branded type.
//
// String formats are branded strings, so today their serialization is
// identity — the round-trip is exercised to lock that in. The point is
// forward-looking: future format families (and possibly other formats)
// will customise the emitted serializer / wire format to improve
// performance or change encoding, and this suite is where that gets
// caught. Only the `STRING_FORMAT` section exists for now.
//
// The bare formats import registers the runtime machinery (see
// format-validation-suite for why a type-only import would not).

import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {SerializationCase} from './serialization-suite.ts';
import '@mionjs/ts-go-run-types/formats';
import type {
  FormatString,
  FormatAlpha,
  FormatUUIDv4,
  FormatStringDate,
  FormatEmail,
  FormatNumber,
  FormatInteger,
  FormatFloat,
  FormatInt8,
  FormatInt16,
  FormatInt32,
  FormatUInt8,
  FormatUInt16,
  FormatUInt32,
  FormatBigInt,
  FormatBigInt64,
  FormatBigUInt64,
  FormatBigPositive,
} from '@mionjs/ts-go-run-types/formats';

const V4 = '9f1b8c2e-3d4a-4b5c-8d6e-1f2a3b4c5d6e';

export const FORMAT_SERIALIZATION_SUITE: {
  STRING_FORMAT: Record<string, SerializationCase>;
  NUMBER_FORMAT: Record<string, SerializationCase>;
  BIGINT_FORMAT: Record<string, SerializationCase>;
} = {
  STRING_FORMAT: {
    string_maxLength: {
      title: 'FormatString<{maxLength: 5}>',
      unsafeEncoder: () => createJsonEncoder<FormatString<{maxLength: 5}>>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<FormatString<{maxLength: 5}>>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<FormatString<{maxLength: 5}>>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatString<{maxLength: 5}>>(),
      safeDirectEncoder: () => createJsonEncoder<FormatString<{maxLength: 5}>>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatString<{maxLength: 5}>>(),
      unsafeDecoder: () => createJsonDecoder<FormatString<{maxLength: 5}>>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatString<{maxLength: 5}>>(),
      binaryDecoder: () => createBinaryDecoder<FormatString<{maxLength: 5}>>(),
      getTestData: () => ({values: ['', 'hello', 'abc']}),
    },
    uuidv4: {
      title: 'FormatUUIDv4',
      unsafeEncoder: () => createJsonEncoder<FormatUUIDv4>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<FormatUUIDv4>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<FormatUUIDv4>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatUUIDv4>(),
      safeDirectEncoder: () => createJsonEncoder<FormatUUIDv4>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatUUIDv4>(),
      unsafeDecoder: () => createJsonDecoder<FormatUUIDv4>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatUUIDv4>(),
      binaryDecoder: () => createBinaryDecoder<FormatUUIDv4>(),
      getTestData: () => ({values: [V4]}),
    },
    date: {
      title: 'FormatStringDate',
      unsafeEncoder: () => createJsonEncoder<FormatStringDate>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<FormatStringDate>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<FormatStringDate>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatStringDate>(),
      safeDirectEncoder: () => createJsonEncoder<FormatStringDate>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatStringDate>(),
      unsafeDecoder: () => createJsonDecoder<FormatStringDate>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatStringDate>(),
      binaryDecoder: () => createBinaryDecoder<FormatStringDate>(),
      getTestData: () => ({values: ['2024-02-29', '2026-05-28', '0001-01-01']}),
    },
    email: {
      title: 'FormatEmail',
      unsafeEncoder: () => createJsonEncoder<FormatEmail>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<FormatEmail>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<FormatEmail>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatEmail>(),
      safeDirectEncoder: () => createJsonEncoder<FormatEmail>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatEmail>(),
      unsafeDecoder: () => createJsonDecoder<FormatEmail>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatEmail>(),
      binaryDecoder: () => createBinaryDecoder<FormatEmail>(),
      getTestData: () => ({values: ['john@example.com', 'jane.doe@mion.io']}),
    },
    alpha: {
      title: 'FormatAlpha',
      unsafeEncoder: () => createJsonEncoder<FormatAlpha>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<FormatAlpha>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<FormatAlpha>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatAlpha>(),
      safeDirectEncoder: () => createJsonEncoder<FormatAlpha>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatAlpha>(),
      unsafeDecoder: () => createJsonDecoder<FormatAlpha>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatAlpha>(),
      binaryDecoder: () => createBinaryDecoder<FormatAlpha>(),
      getTestData: () => ({values: ['Hello', 'abcXYZ']}),
    },
    object_with_formats: {
      title: 'object with format-branded fields {id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}',
      unsafeEncoder: () =>
        createJsonEncoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(undefined, {
          strategy: 'mutate',
          stripExtras: false,
        }),
      clonePreserveEncoder: () =>
        createJsonEncoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(undefined, {
          strategy: 'clone',
          stripExtras: false,
        }),
      mutateStripEncoder: () =>
        createJsonEncoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(undefined, {
          strategy: 'mutate',
          stripExtras: true,
        }),
      safeEncoder: () => createJsonEncoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(),
      safeDirectEncoder: () =>
        createJsonEncoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(),
      unsafeDecoder: () =>
        createJsonDecoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(),
      binaryDecoder: () => createBinaryDecoder<{id: FormatUUIDv4; name: FormatString<{maxLength: 20}>}>(),
      getTestData: () => ({values: [{id: V4, name: 'alice'}]}),
    },
    email_array: {
      title: 'array of FormatEmail',
      unsafeEncoder: () => createJsonEncoder<FormatEmail[]>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<FormatEmail[]>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<FormatEmail[]>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatEmail[]>(),
      safeDirectEncoder: () => createJsonEncoder<FormatEmail[]>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatEmail[]>(),
      unsafeDecoder: () => createJsonDecoder<FormatEmail[]>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatEmail[]>(),
      binaryDecoder: () => createBinaryDecoder<FormatEmail[]>(),
      getTestData: () => ({values: [['john@example.com', 'jane.doe@mion.io']]}),
    },
  },
  // Number formats serialize as plain JSON (identity round-trip); the
  // payoff is binary — `getBinaryByteSizes` pins the int-width packing
  // ported from mion's defaultNumberBinary.spec.ts.
  NUMBER_FORMAT: {
    number_int8: {
      title: 'FormatInt8 — packs into 1 byte',
      unsafeEncoder: () => createJsonEncoder<FormatInt8>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<FormatInt8>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<FormatInt8>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatInt8>(),
      safeDirectEncoder: () => createJsonEncoder<FormatInt8>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatInt8>(),
      unsafeDecoder: () => createJsonDecoder<FormatInt8>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatInt8>(),
      binaryDecoder: () => createBinaryDecoder<FormatInt8>(),
      getTestData: () => ({values: [-128, 0, 127]}),
      getBinaryByteSizes: () => [1, 1, 1],
    },
    number_int16: {
      title: 'FormatInt16 — packs into 2 bytes',
      unsafeEncoder: () => createJsonEncoder<FormatInt16>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<FormatInt16>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<FormatInt16>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatInt16>(),
      safeDirectEncoder: () => createJsonEncoder<FormatInt16>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatInt16>(),
      unsafeDecoder: () => createJsonDecoder<FormatInt16>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatInt16>(),
      binaryDecoder: () => createBinaryDecoder<FormatInt16>(),
      getTestData: () => ({values: [-32768, 0, 32767]}),
      getBinaryByteSizes: () => [2, 2, 2],
    },
    number_int32: {
      title: 'FormatInt32 — packs into 4 bytes',
      unsafeEncoder: () => createJsonEncoder<FormatInt32>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<FormatInt32>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<FormatInt32>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatInt32>(),
      safeDirectEncoder: () => createJsonEncoder<FormatInt32>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatInt32>(),
      unsafeDecoder: () => createJsonDecoder<FormatInt32>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatInt32>(),
      binaryDecoder: () => createBinaryDecoder<FormatInt32>(),
      getTestData: () => ({values: [-2147483648, 0, 2147483647]}),
      getBinaryByteSizes: () => [4, 4, 4],
    },
    number_uint8: {
      title: 'FormatUInt8 — packs into 1 byte',
      unsafeEncoder: () => createJsonEncoder<FormatUInt8>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<FormatUInt8>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<FormatUInt8>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatUInt8>(),
      safeDirectEncoder: () => createJsonEncoder<FormatUInt8>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatUInt8>(),
      unsafeDecoder: () => createJsonDecoder<FormatUInt8>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatUInt8>(),
      binaryDecoder: () => createBinaryDecoder<FormatUInt8>(),
      getTestData: () => ({values: [0, 128, 255]}),
      getBinaryByteSizes: () => [1, 1, 1],
    },
    number_uint16: {
      title: 'FormatUInt16 — packs into 2 bytes',
      unsafeEncoder: () => createJsonEncoder<FormatUInt16>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<FormatUInt16>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<FormatUInt16>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatUInt16>(),
      safeDirectEncoder: () => createJsonEncoder<FormatUInt16>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatUInt16>(),
      unsafeDecoder: () => createJsonDecoder<FormatUInt16>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatUInt16>(),
      binaryDecoder: () => createBinaryDecoder<FormatUInt16>(),
      getTestData: () => ({values: [0, 32768, 65535]}),
      getBinaryByteSizes: () => [2, 2, 2],
    },
    number_uint32: {
      title: 'FormatUInt32 — packs into 4 bytes',
      unsafeEncoder: () => createJsonEncoder<FormatUInt32>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<FormatUInt32>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<FormatUInt32>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatUInt32>(),
      safeDirectEncoder: () => createJsonEncoder<FormatUInt32>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatUInt32>(),
      unsafeDecoder: () => createJsonDecoder<FormatUInt32>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatUInt32>(),
      binaryDecoder: () => createBinaryDecoder<FormatUInt32>(),
      getTestData: () => ({values: [0, 2147483648, 4294967295]}),
      getBinaryByteSizes: () => [4, 4, 4],
    },
    number_integer_8bytes: {
      title: 'FormatInteger — unbounded integer falls back to float64 (8 bytes)',
      unsafeEncoder: () => createJsonEncoder<FormatInteger>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<FormatInteger>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<FormatInteger>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatInteger>(),
      safeDirectEncoder: () => createJsonEncoder<FormatInteger>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatInteger>(),
      unsafeDecoder: () => createJsonDecoder<FormatInteger>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatInteger>(),
      binaryDecoder: () => createBinaryDecoder<FormatInteger>(),
      getTestData: () => ({values: [10, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER]}),
      getBinaryByteSizes: () => [8, 8, 8],
    },
    number_float_8bytes: {
      title: 'FormatFloat — float64 (8 bytes)',
      unsafeEncoder: () => createJsonEncoder<FormatFloat>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<FormatFloat>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<FormatFloat>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatFloat>(),
      safeDirectEncoder: () => createJsonEncoder<FormatFloat>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatFloat>(),
      unsafeDecoder: () => createJsonDecoder<FormatFloat>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatFloat>(),
      binaryDecoder: () => createBinaryDecoder<FormatFloat>(),
      getTestData: () => ({values: [10.5, -3.14, 1.23e10]}),
      getBinaryByteSizes: () => [8, 8, 8],
    },
    number_ranged: {
      title: 'FormatNumber<{min:0; max:1000; integer:true}> — picks uint16 (2 bytes)',
      unsafeEncoder: () =>
        createJsonEncoder<FormatNumber<{min: 0; max: 1000; integer: true}>>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<FormatNumber<{min: 0; max: 1000; integer: true}>>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<FormatNumber<{min: 0; max: 1000; integer: true}>>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatNumber<{min: 0; max: 1000; integer: true}>>(),
      safeDirectEncoder: () =>
        createJsonEncoder<FormatNumber<{min: 0; max: 1000; integer: true}>>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatNumber<{min: 0; max: 1000; integer: true}>>(),
      unsafeDecoder: () => createJsonDecoder<FormatNumber<{min: 0; max: 1000; integer: true}>>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatNumber<{min: 0; max: 1000; integer: true}>>(),
      binaryDecoder: () => createBinaryDecoder<FormatNumber<{min: 0; max: 1000; integer: true}>>(),
      getTestData: () => ({values: [0, 500, 1000]}),
      getBinaryByteSizes: () => [2, 2, 2],
    },
  },
  // BigInt formats: only the 64-bit defaults pack to 8 bytes; everything
  // else falls back to the variable-length decimal-string base arm
  // (round-trip only, no byte-size assertion). Ported from
  // mion's defaultBigNumberBinary.spec.ts.
  BIGINT_FORMAT: {
    bigint_int64: {
      title: 'FormatBigInt64 — packs into 8 bytes (setBigInt64)',
      unsafeEncoder: () => createJsonEncoder<FormatBigInt64>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<FormatBigInt64>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<FormatBigInt64>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatBigInt64>(),
      safeDirectEncoder: () => createJsonEncoder<FormatBigInt64>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatBigInt64>(),
      unsafeDecoder: () => createJsonDecoder<FormatBigInt64>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatBigInt64>(),
      binaryDecoder: () => createBinaryDecoder<FormatBigInt64>(),
      getTestData: () => ({values: [10n, -9223372036854775808n, 9223372036854775807n]}),
      getBinaryByteSizes: () => [8, 8, 8],
      // JSON serializes bigint as a decimal string and restores it; the
      // round-trip is exercised via the binary half above, but JSON must
      // still round-trip — bigint stringifies to its decimal form.
    },
    bigint_uint64: {
      title: 'FormatBigUInt64 — packs into 8 bytes (setBigUint64)',
      unsafeEncoder: () => createJsonEncoder<FormatBigUInt64>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<FormatBigUInt64>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<FormatBigUInt64>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatBigUInt64>(),
      safeDirectEncoder: () => createJsonEncoder<FormatBigUInt64>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatBigUInt64>(),
      unsafeDecoder: () => createJsonDecoder<FormatBigUInt64>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatBigUInt64>(),
      binaryDecoder: () => createBinaryDecoder<FormatBigUInt64>(),
      getTestData: () => ({values: [0n, 10n, 18446744073709551615n]}),
      getBinaryByteSizes: () => [8, 8, 8],
    },
    bigint_positive_string: {
      title: 'FormatBigPositive — only min set, falls back to decimal-string serialization',
      unsafeEncoder: () => createJsonEncoder<FormatBigPositive>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () => createJsonEncoder<FormatBigPositive>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () => createJsonEncoder<FormatBigPositive>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatBigPositive>(),
      safeDirectEncoder: () => createJsonEncoder<FormatBigPositive>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatBigPositive>(),
      unsafeDecoder: () => createJsonDecoder<FormatBigPositive>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatBigPositive>(),
      binaryDecoder: () => createBinaryDecoder<FormatBigPositive>(),
      getTestData: () => ({values: [0n, 42n, 123456789012345678901234567890n]}),
      // No getBinaryByteSizes — string encoding is variable-length.
    },
    bigint_plain_brand: {
      title: 'FormatBigInt<{min:0n; max:255n}> — small range, packs 8 bytes via uint64',
      unsafeEncoder: () =>
        createJsonEncoder<FormatBigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'mutate', stripExtras: false}),
      clonePreserveEncoder: () =>
        createJsonEncoder<FormatBigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'clone', stripExtras: false}),
      mutateStripEncoder: () =>
        createJsonEncoder<FormatBigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'mutate', stripExtras: true}),
      safeEncoder: () => createJsonEncoder<FormatBigInt<{min: 0n; max: 255n}>>(),
      safeDirectEncoder: () => createJsonEncoder<FormatBigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'direct'}),
      safeDecoder: () => createJsonDecoder<FormatBigInt<{min: 0n; max: 255n}>>(),
      unsafeDecoder: () => createJsonDecoder<FormatBigInt<{min: 0n; max: 255n}>>(undefined, {stripExtras: false}),
      binaryEncoder: () => createBinaryEncoder<FormatBigInt<{min: 0n; max: 255n}>>(),
      binaryDecoder: () => createBinaryDecoder<FormatBigInt<{min: 0n; max: 255n}>>(),
      getTestData: () => ({values: [0n, 128n, 255n]}),
      getBinaryByteSizes: () => [8, 8, 8],
    },
  },
};
