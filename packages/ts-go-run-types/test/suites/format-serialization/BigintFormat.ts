import type {SerializationCase} from './types.ts';
import '@mionjs/ts-go-run-types/formats';
import {createBinaryDecoder, createBinaryEncoder, createJsonDecoder, createJsonEncoder} from '@mionjs/ts-go-run-types';
import type {FormatBigInt, FormatBigInt64, FormatBigUInt64, FormatBigPositive} from '@mionjs/ts-go-run-types/formats';

export const BIGINT_FORMAT = {
  bigint_int64: {
    title: 'FormatBigInt64 — packs into 8 bytes (setBigInt64)',
    unsafeEncoder: () => createJsonEncoder<FormatBigInt64>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<FormatBigInt64>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<FormatBigInt64>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<FormatBigInt64>(),
    safeDirectEncoder: () => createJsonEncoder<FormatBigInt64>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<FormatBigInt64>(),
    unsafeDecoder: () => createJsonDecoder<FormatBigInt64>(undefined, {strategy: 'preserve'}),
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
    unsafeEncoder: () => createJsonEncoder<FormatBigUInt64>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<FormatBigUInt64>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<FormatBigUInt64>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<FormatBigUInt64>(),
    safeDirectEncoder: () => createJsonEncoder<FormatBigUInt64>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<FormatBigUInt64>(),
    unsafeDecoder: () => createJsonDecoder<FormatBigUInt64>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatBigUInt64>(),
    binaryDecoder: () => createBinaryDecoder<FormatBigUInt64>(),
    getTestData: () => ({values: [0n, 10n, 18446744073709551615n]}),
    getBinaryByteSizes: () => [8, 8, 8],
  },
  bigint_positive_string: {
    title: 'FormatBigPositive — only min set, falls back to decimal-string serialization',
    unsafeEncoder: () => createJsonEncoder<FormatBigPositive>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<FormatBigPositive>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<FormatBigPositive>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<FormatBigPositive>(),
    safeDirectEncoder: () => createJsonEncoder<FormatBigPositive>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<FormatBigPositive>(),
    unsafeDecoder: () => createJsonDecoder<FormatBigPositive>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatBigPositive>(),
    binaryDecoder: () => createBinaryDecoder<FormatBigPositive>(),
    getTestData: () => ({values: [0n, 42n, 123456789012345678901234567890n]}),
    // No getBinaryByteSizes — string encoding is variable-length.
  },
  bigint_plain_brand: {
    title: 'FormatBigInt<{min:0n; max:255n}> — small range, packs 8 bytes via uint64',
    unsafeEncoder: () => createJsonEncoder<FormatBigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'mutate'}),
    clonePreserveEncoder: () => createJsonEncoder<FormatBigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'clone'}),
    mutateStripEncoder: () => createJsonEncoder<FormatBigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'stripMutate'}),
    safeEncoder: () => createJsonEncoder<FormatBigInt<{min: 0n; max: 255n}>>(),
    safeDirectEncoder: () => createJsonEncoder<FormatBigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'direct'}),
    safeDecoder: () => createJsonDecoder<FormatBigInt<{min: 0n; max: 255n}>>(),
    unsafeDecoder: () => createJsonDecoder<FormatBigInt<{min: 0n; max: 255n}>>(undefined, {strategy: 'preserve'}),
    binaryEncoder: () => createBinaryEncoder<FormatBigInt<{min: 0n; max: 255n}>>(),
    binaryDecoder: () => createBinaryDecoder<FormatBigInt<{min: 0n; max: 255n}>>(),
    getTestData: () => ({values: [0n, 128n, 255n]}),
    getBinaryByteSizes: () => [8, 8, 8],
  },
} as const satisfies Record<string, SerializationCase>;
