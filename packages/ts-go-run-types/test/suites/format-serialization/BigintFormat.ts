import type {SerializationCase} from './types.ts';
import * as RT from '@mionjs/ts-go-run-types/schema';
import '@mionjs/ts-go-run-types/formats';
import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {FormatBigInt, FormatBigInt64, FormatBigUInt64, FormatBigPositive} from '@mionjs/ts-go-run-types/formats';

export const BIGINT_FORMAT = {
  bigint_int64: {
    title: 'FormatBigInt64 — packs into 8 bytes (setBigInt64)',
    mutateEncoder: () => createJsonEncoder<FormatBigInt64>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<FormatBigInt64>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<FormatBigInt64>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<FormatBigInt64>(),
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
    title: 'FormatBigUInt64 — packs into 8 bytes (setBigUint64)',
    mutateEncoder: () => createJsonEncoder<FormatBigUInt64>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<FormatBigUInt64>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<FormatBigUInt64>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<FormatBigUInt64>(),
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
    title: 'FormatBigPositive — only min set, falls back to decimal-string serialization',
    mutateEncoder: () => createJsonEncoder<FormatBigPositive>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<FormatBigPositive>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<FormatBigPositive>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<FormatBigPositive>(),
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
    title: 'FormatBigInt<{min:0n; max:255n}> — small range, packs 8 bytes via uint64',
    mutateEncoder: () => createJsonEncoder<FormatBigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'mutate'}),
    cloneEncoder: () => createJsonEncoder<FormatBigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'clone'}),
    stripMutateEncoder: () => createJsonEncoder<FormatBigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'stripMutate'}),
    stripCloneEncoder: () => createJsonEncoder<FormatBigInt<{min: 0n; max: 255n}>>(),
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
