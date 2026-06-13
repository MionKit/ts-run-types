import type {SerializationCase} from './types.ts';
import * as RT from '@mionjs/ts-go-run-types/schema';
import '@mionjs/ts-go-run-types/formats';
import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {FormatBigInt, FormatBigInt64, FormatBigUInt64, FormatBigPositive} from '@mionjs/ts-go-run-types/formats';

export const BIGINT_FORMAT = {
  bigint_int64: {
    title: 'FormatBigInt64',
    description:
      'JSON + binary (de)serialization of FormatBigInt64 (bigint branded with the full int64 min/max); the signed 64-bit bounds select an 8-byte setBigInt64 binary packing while JSON serializes the bigint as a decimal string.',
    serializeNotes: [
      'Format-aware binary width: int64 bounds pack each bigint into exactly 8 bytes via setBigInt64 (getBinaryByteSizes [8,8,8]).',
      'JSON has no bigint primitive, so the wire value is the decimal string form of the bigint, restored to a bigint on decode.',
    ],
    mutateEncoder: () => createJsonEncoder<FormatBigInt64>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<FormatBigInt64>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<FormatBigInt64>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<FormatBigInt64>(),
    preserveDecoder: () => createJsonDecoder<FormatBigInt64>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatBigInt64>(),
    binaryDecoder: () => createBinaryDecoder<FormatBigInt64>(),
    schemaEncoder: () => createJsonEncoder(RT.bigInt64()),
    schemaDecoder: () => createJsonDecoder(RT.bigInt64()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.bigInt64()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.bigInt64()),
    getTestData: () => ({values: [10n, -9223372036854775808n, 9223372036854775807n]}),
    getBinaryByteSizes: () => [8, 8, 8],
    // JSON serializes bigint as a decimal string and restores it; the
    // round-trip is exercised via the binary half above, but JSON must
    // still round-trip — bigint stringifies to its decimal form.
  },
  bigint_uint64: {
    title: 'FormatBigUInt64',
    description:
      'JSON + binary (de)serialization of FormatBigUInt64 (bigint branded with the full unsigned uint64 min/max); the unsigned 64-bit bounds select an 8-byte setBigUint64 binary packing while JSON serializes the bigint as a decimal string.',
    serializeNotes: [
      'Format-aware binary width: uint64 bounds pack each bigint into exactly 8 bytes via setBigUint64 (getBinaryByteSizes [8,8,8]); uint64 packing takes precedence over int64 when both fit.',
      'JSON has no bigint primitive, so the wire value is the decimal string form of the bigint, restored to a bigint on decode.',
    ],
    mutateEncoder: () => createJsonEncoder<FormatBigUInt64>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<FormatBigUInt64>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<FormatBigUInt64>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<FormatBigUInt64>(),
    preserveDecoder: () => createJsonDecoder<FormatBigUInt64>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatBigUInt64>(),
    binaryDecoder: () => createBinaryDecoder<FormatBigUInt64>(),
    schemaEncoder: () => createJsonEncoder(RT.bigUInt64()),
    schemaDecoder: () => createJsonDecoder(RT.bigUInt64()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.bigUInt64()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.bigUInt64()),
    getTestData: () => ({values: [0n, 10n, 18446744073709551615n]}),
    getBinaryByteSizes: () => [8, 8, 8],
  },
  bigint_positive_string: {
    title: 'FormatBigPositive',
    description:
      'JSON + binary (de)serialization of FormatBigPositive (FormatBigInt<{min:0n}>, lower bound only); with no max, neither the int64 nor uint64 width can be selected, so BINARY ALSO falls back to the decimal-string serialization (variable length).',
    serializeNotes: [
      'No fixed binary width: setBigInt64/setBigUint64 require BOTH min and max, so an unbounded-above bigint packs as a variable-length decimal string in binary too — hence no getBinaryByteSizes.',
      'JSON likewise carries the decimal string form (no bigint primitive); the >64-bit sample proves the string fallback is lossless beyond the native int widths.',
    ],
    mutateEncoder: () => createJsonEncoder<FormatBigPositive>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<FormatBigPositive>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<FormatBigPositive>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<FormatBigPositive>(),
    preserveDecoder: () => createJsonDecoder<FormatBigPositive>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatBigPositive>(),
    binaryDecoder: () => createBinaryDecoder<FormatBigPositive>(),
    schemaEncoder: () => createJsonEncoder(RT.bigPositive()),
    schemaDecoder: () => createJsonDecoder(RT.bigPositive()),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.bigPositive()),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.bigPositive()),
    getTestData: () => ({values: [0n, 42n, 123456789012345678901234567890n]}),
    // No getBinaryByteSizes — string encoding is variable-length.
  },
  bigint_plain_brand: {
    title: 'FormatBigInt small range',
    description:
      'JSON + binary (de)serialization of an ad-hoc FormatBigInt<{min:0n; max:255n}> (small [0,255] range); unlike the number formats, bigint has NO sub-8-byte path, so even this tiny range packs the full 8 bytes via setBigUint64 while JSON writes the decimal string.',
    serializeNotes: [
      'TS DIVERGENCE from the number widths: [0,255] picks a 1-byte width for FormatUInt8 but a bigint always uses the 8-byte int64/uint64 packing — bigint binary has only the 8-byte path and a variable-length string fallback, nothing narrower (getBinaryByteSizes [8,8,8]).',
      'JSON carries the decimal string form (no bigint primitive).',
    ],
    mutateEncoder: () => createJsonEncoder<FormatBigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<FormatBigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'clone'}),
    directEncoder: () => createJsonEncoder<FormatBigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'direct'}),
    stripDecoder: () => createJsonDecoder<FormatBigInt<{min: 0n; max: 255n}>>(),
    preserveDecoder: () => createJsonDecoder<FormatBigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatBigInt<{min: 0n; max: 255n}>>(),
    binaryDecoder: () => createBinaryDecoder<FormatBigInt<{min: 0n; max: 255n}>>(),
    schemaEncoder: () => createJsonEncoder(RT.bigint({min: 0n, max: 255n})),
    schemaDecoder: () => createJsonDecoder(RT.bigint({min: 0n, max: 255n})),
    schemaBinaryEncoder: () => createBinaryEncoder(RT.bigint({min: 0n, max: 255n})),
    schemaBinaryDecoder: () => createBinaryDecoder(RT.bigint({min: 0n, max: 255n})),
    getTestData: () => ({values: [0n, 128n, 255n]}),
    getBinaryByteSizes: () => [8, 8, 8],
  },
} as const satisfies Record<string, SerializationCase>;
