// Value-first PREDEFINED BIGINT-FORMAT builders — one builder per named bigint
// format alias (`bigInt64()` → `RunType<FormatBigInt64>`, `bigUInt64()`, …).
// Sibling of atomic.ts's generic `bigint({…})` leaf: these carry the CONCRETE
// named alias from `../formats/bigintFormats.ts`, so the Go scanner reflects the
// SAME branded type off each builder's `InjectRunTypeId<…>` brand as the type-first
// `createIsType<FormatBigInt64>()` surface and the two converge on one structural
// id. All are fixed presets (no user params) → a single no-arg overload via
// `presetBuilder`. For ad-hoc constraints use `bigint({min, max, …})`.

import {presetBuilder} from './atomic.ts';
import type {
  FormatBigPositive,
  FormatBigNegative,
  FormatBigPositiveInt,
  FormatBigNegativeInt,
  FormatBigInt64,
  FormatBigUInt64,
} from '../formats/bigintFormats.ts';

/** ≥ 0n (`FormatBigPositive`). **/
export const bigPositive = presetBuilder<FormatBigPositive>('bigint');
/** ≤ 0n (`FormatBigNegative`). **/
export const bigNegative = presetBuilder<FormatBigNegative>('bigint');
/** ≥ 0n, whole (`FormatBigPositiveInt`). **/
export const bigPositiveInt = presetBuilder<FormatBigPositiveInt>('bigint');
/** ≤ 0n, whole (`FormatBigNegativeInt`). **/
export const bigNegativeInt = presetBuilder<FormatBigNegativeInt>('bigint');
/** Signed 64-bit bigint (`FormatBigInt64`). **/
export const bigInt64 = presetBuilder<FormatBigInt64>('bigint');
/** Unsigned 64-bit bigint (`FormatBigUInt64`). **/
export const bigUInt64 = presetBuilder<FormatBigUInt64>('bigint');
