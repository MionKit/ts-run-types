// Number-format TYPE aliases — the public type surface of the number
// format family (FormatNumber + the integer/float/range/int-width
// defaults). Validation, serialization (incl. the int8/16/32 binary
// packing) and mocking are emitted/registered elsewhere; this file is
// type-only + the brand wiring. Mirrors mion's
// packages/type-formats/src/number/{numberFormat.runtype.ts,defaultNumberFormats.ts}.
//
// `TypeFormat` IS imported as a value (not `import type`): the value-level
// import keeps each brand alias's reflection metadata reachable for tsgo.

import {TypeFormat} from '../runtypes/typeFormat.ts';

// ─────────────────────────── NumberFormat ───────────────────────────

// NumberParams — the wire-serialisable params shape for FormatNumber.
// Cross-param invariants (integer⊕float, min⊕gt, max⊕lt, multipleOf rules)
// are validated build-time in Go. A lower bound is inclusive (`min`) OR
// exclusive (`gt`), never both; likewise the upper bound (`max`/`lt`).
export interface NumberParams {
  integer?: boolean;
  float?: boolean;
  min?: number;
  max?: number;
  lt?: number;
  gt?: number;
  multipleOf?: number;
}

// FormatNumber — the branded number alias users annotate with:
// `FormatNumber<{min: 0; max: 100}>`. `BrandName` produces a nominal type
// when needed (mion's convention).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatNumber<P extends NumberParams = {}, BrandName extends string = never> = TypeFormat<
  number,
  'numberFormat',
  P,
  BrandName
>;

// Default number formats — ported from mion's defaultNumberFormats.ts.
// The fixed-width int formats SET the min/max that drive the binary
// packing optimization (FormatInt8 → 1 byte, FormatUInt16 → 2 bytes, …).
export type FormatInteger = FormatNumber<{integer: true}>;
export type FormatFloat = FormatNumber<{float: true}>;
export type FormatPositive = FormatNumber<{min: 0}>;
export type FormatNegative = FormatNumber<{max: 0}>;
export type FormatPositiveInt = FormatNumber<{min: 0; integer: true}>;
export type FormatNegativeInt = FormatNumber<{max: 0; integer: true}>;
export type FormatInt8 = FormatNumber<{integer: true; min: -128; max: 127}>;
export type FormatInt16 = FormatNumber<{integer: true; min: -32768; max: 32767}>;
export type FormatInt32 = FormatNumber<{integer: true; min: -2147483648; max: 2147483647}>;
export type FormatUInt8 = FormatNumber<{integer: true; min: 0; max: 255}>;
export type FormatUInt16 = FormatNumber<{integer: true; min: 0; max: 65535}>;
export type FormatUInt32 = FormatNumber<{integer: true; min: 0; max: 4294967295}>;
