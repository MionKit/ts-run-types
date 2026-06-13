// Number-format TYPE aliases — the public type surface of the number
// format family (Number + the integer/float/range/int-width
// defaults). Validation, serialization (incl. the int8/16/32 binary
// packing) and mocking are emitted/registered elsewhere; this file is
// type-only + the brand wiring. Mirrors
// (ref: packages/type-formats/src/number/{numberFormat.runtype.ts,defaultNumberFormats.ts}).
//
// `TypeFormat` IS imported as a value (not `import type`): the value-level
// import keeps each brand alias's reflection metadata reachable for tsgo.

import {TypeFormat} from '../runtypes/typeFormat.ts';
import {presetBuilder} from '../runtypes/builderCore.ts';

// ─────────────────────────── NumberFormat ───────────────────────────

// NumberParams — the wire-serialisable params shape for Number.
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

// Number — the branded number alias users annotate with:
// `Number<{min: 0; max: 100}>`. `BrandName` produces a nominal type
// when needed (by convention).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type Number<P extends NumberParams = {}, BrandName extends string = never> = TypeFormat<
  number,
  'numberFormat',
  P,
  BrandName
>;

// Default number formats — ported from the reference defaultNumberFormats.ts.
// The fixed-width int formats SET the min/max that drive the binary
// packing optimization (Int8 → 1 byte, UInt16 → 2 bytes, …).
export type Integer = Number<{integer: true}>;
export type Float = Number<{float: true}>;
export type Positive = Number<{min: 0}>;
export type Negative = Number<{max: 0}>;
export type PositiveInt = Number<{min: 0; integer: true}>;
export type NegativeInt = Number<{max: 0; integer: true}>;
export type Int8 = Number<{integer: true; min: -128; max: 127}>;
export type Int16 = Number<{integer: true; min: -32768; max: 32767}>;
export type Int32 = Number<{integer: true; min: -2147483648; max: 2147483647}>;
export type UInt8 = Number<{integer: true; min: 0; max: 255}>;
export type UInt16 = Number<{integer: true; min: 0; max: 65535}>;
export type UInt32 = Number<{integer: true; min: 0; max: 4294967295}>;

// ───────────────────── Predefined number builders ───────────────────
//
// Value-first builder per named alias (`TF.int8()` → `RunType<Int8>`, …). Each
// carries the CONCRETE alias above, so the Go scanner reflects the SAME branded
// type off the builder's `InjectRunTypeId<…>` brand as the type-first
// `createValidate<Int8>()` surface and the two converge on one structural id. All
// are fixed presets (no user params) → a single no-arg overload via `presetBuilder`.
// For ad-hoc constraints use `TF.number({min, max, …})`.

/** Integer (`Integer`). **/
export const integer = presetBuilder<Integer>('number');
/** Non-integer / float (`Float`). **/
export const float = presetBuilder<Float>('number');
/** ≥ 0 (`Positive`). **/
export const positive = presetBuilder<Positive>('number');
/** ≤ 0 (`Negative`). **/
export const negative = presetBuilder<Negative>('number');
/** Integer ≥ 0 (`PositiveInt`). **/
export const positiveInt = presetBuilder<PositiveInt>('number');
/** Integer ≤ 0 (`NegativeInt`). **/
export const negativeInt = presetBuilder<NegativeInt>('number');
/** Signed 8-bit integer (`Int8`). **/
export const int8 = presetBuilder<Int8>('number');
/** Signed 16-bit integer (`Int16`). **/
export const int16 = presetBuilder<Int16>('number');
/** Signed 32-bit integer (`Int32`). **/
export const int32 = presetBuilder<Int32>('number');
/** Unsigned 8-bit integer (`UInt8`). **/
export const uint8 = presetBuilder<UInt8>('number');
/** Unsigned 16-bit integer (`UInt16`). **/
export const uint16 = presetBuilder<UInt16>('number');
/** Unsigned 32-bit integer (`UInt32`). **/
export const uint32 = presetBuilder<UInt32>('number');
