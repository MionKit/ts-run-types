// BigInt-format TYPE aliases — the public type surface of the bigint
// format family (FormatBigInt + the positive/negative/64-bit defaults).
// Validation, serialization (the setBigInt64/setBigUint64 8-byte packing)
// and mocking are emitted/registered elsewhere; this file is type-only +
// the brand wiring. Mirrors mion's
// packages/type-formats/src/bigint/{bigIntFormat.runtype.ts,defaultBigNumberFormats.ts}.
//
// `TypeFormat` IS imported as a value (not `import type`): the value-level
// import keeps each brand alias's reflection metadata reachable for tsgo.

import {TypeFormat} from '../runtypes/typeFormat.ts';

// ─────────────────────────── BigIntFormat ───────────────────────────

// BigIntParams — the wire-serialisable params shape for FormatBigInt.
// Cross-param invariants (min⊕gt, max⊕lt, multipleOf>0) are validated
// build-time in Go: a lower/upper bound is inclusive OR exclusive, never
// both. No integer/float distinction — bigints are integers.
export interface BigIntParams {
  min?: bigint;
  max?: bigint;
  lt?: bigint;
  gt?: bigint;
  multipleOf?: bigint;
}

// FormatBigInt — the branded bigint alias users annotate with:
// `FormatBigInt<{min: 0n}>`.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatBigInt<P extends BigIntParams = {}, BrandName extends string = never> = TypeFormat<
  bigint,
  'bigintFormat',
  P,
  BrandName
>;

// Default bigint formats — ported from mion's defaultBigNumberFormats.ts.
// FormatBigInt64 / FormatBigUInt64 SET the min/max that select the 8-byte
// binary packing; the others fall back to decimal-string serialization.
export type FormatBigPositive = FormatBigInt<{min: 0n}, 'bigPositive'>;
export type FormatBigNegative = FormatBigInt<{max: 0n}, 'bigNegative'>;
export type FormatBigPositiveInt = FormatBigInt<{min: 0n; multipleOf: 1n}, 'bigPositiveInt'>;
export type FormatBigNegativeInt = FormatBigInt<{max: 0n; multipleOf: 1n}, 'bigNegativeInt'>;
export type FormatBigInt64 = FormatBigInt<{min: -9223372036854775808n; max: 9223372036854775807n}, 'bigInt64'>;
export type FormatBigUInt64 = FormatBigInt<{min: 0n; max: 18446744073709551615n}, 'bigUInt64'>;
