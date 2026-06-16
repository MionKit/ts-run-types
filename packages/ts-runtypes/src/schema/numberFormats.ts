// Value-first PREDEFINED NUMBER-FORMAT builders — one builder per named number
// format alias (`integer()` → `RunType<FormatInteger>`, `int8()`, `uint32()`, …).
// Sibling of atomic.ts's generic `number({…})` leaf: these carry the CONCRETE
// named alias from `../formats/numberFormats.ts`, so the Go scanner reflects the
// SAME branded type off each builder's `InjectRunTypeId<…>` brand as the type-first
// `createValidate<FormatInt8>()` surface and the two converge on one structural id.
// All are fixed presets (no user params) → a single no-arg overload via
// `presetBuilder`. For ad-hoc constraints use `number({min, max, …})`.

import {presetBuilder} from './atomic.ts';
import type {
  FormatInteger,
  FormatFloat,
  FormatPositive,
  FormatNegative,
  FormatPositiveInt,
  FormatNegativeInt,
  FormatInt8,
  FormatInt16,
  FormatInt32,
  FormatUInt8,
  FormatUInt16,
  FormatUInt32,
} from '../formats/numberFormats.ts';

/** Integer (`FormatInteger`). **/
export const integer = presetBuilder<FormatInteger>('number');
/** Non-integer / float (`FormatFloat`). **/
export const float = presetBuilder<FormatFloat>('number');
/** ≥ 0 (`FormatPositive`). **/
export const positive = presetBuilder<FormatPositive>('number');
/** ≤ 0 (`FormatNegative`). **/
export const negative = presetBuilder<FormatNegative>('number');
/** Integer ≥ 0 (`FormatPositiveInt`). **/
export const positiveInt = presetBuilder<FormatPositiveInt>('number');
/** Integer ≤ 0 (`FormatNegativeInt`). **/
export const negativeInt = presetBuilder<FormatNegativeInt>('number');

/** Signed 8-bit integer (`FormatInt8`). **/
export const int8 = presetBuilder<FormatInt8>('number');
/** Signed 16-bit integer (`FormatInt16`). **/
export const int16 = presetBuilder<FormatInt16>('number');
/** Signed 32-bit integer (`FormatInt32`). **/
export const int32 = presetBuilder<FormatInt32>('number');
/** Unsigned 8-bit integer (`FormatUInt8`). **/
export const uint8 = presetBuilder<FormatUInt8>('number');
/** Unsigned 16-bit integer (`FormatUInt16`). **/
export const uint16 = presetBuilder<FormatUInt16>('number');
/** Unsigned 32-bit integer (`FormatUInt32`). **/
export const uint32 = presetBuilder<FormatUInt32>('number');
