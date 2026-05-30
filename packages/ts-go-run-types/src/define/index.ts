// Public entry for the `@mionjs/ts-go-run-types/define` subpath — the
// value-first model authoring surface: the `object` model assembler, the
// per-type field builders (`string` / `number` / `boolean` / `bigint` /
// `date` / `temporal.*`), and the `propMod({optional?, readonly?}, field)`
// property-modifier wrapper. Each builder returns its
// branded format type, so `typeof object({...})` IS the model type. `ModelType`
// and the field-config types are re-exported as the retained config↔type bridge
// (no longer on the forward authoring path), now joined by the inverse
// `reflectModel<T>()` direction (RunType → typed `ModelConfigOf<T>`). Opt-in
// lane: consumers who want pure type-first reflection never import this. See
// ./define.ts for the rationale.

export {
  // Model assembler + field builders.
  object,
  string,
  number,
  boolean,
  bigint,
  date,
  temporal,
  // Atomic leaf builders for the remaining kinds — `literal(value)` (string /
  // number / bigint / boolean / null / undefined literals), `regexp()`
  // (`RegExp`), `symbol()` (`symbol`; validator unsupported by design).
  literal,
  regexp,
  symbol,
  // Property-modifier wrappers — `propMod({optional?, readonly?}, field)` and the
  // `optional(field)` shortcut for `propMod({optional: true}, field)`. The
  // modifiers live here + in `object`'s param, never in a `FieldConfig`.
  propMod,
  optional,
  type PropModifiers,
  // Type mapping + config types (the config↔type bridge, both directions).
  type ModelType,
  type ModelConfigOf,
  type ModelConfig,
  type FieldConfig,
  type StringFieldConfig,
  type NumberFieldConfig,
  type DateFieldConfig,
  type BigIntFieldConfig,
  type BooleanFieldConfig,
  type InstantFieldConfig,
  type ZonedDateTimeFieldConfig,
  type PlainDateFieldConfig,
  type PlainTimeFieldConfig,
  type PlainDateTimeFieldConfig,
  type PlainYearMonthFieldConfig,
} from './define.ts';

// Composer builders — `array` / `tuple` / `union` / `intersection` / `record`.
// Each returns the generic `RunType<…>` for the composed type; child schemas
// nest freely (the outer composer's marker reflects the whole shape).
export {array, tuple, union, intersection, record, map, set, promise, type MapTuple} from './compose.ts';

// Universal reflectors — `runType<T>()` (static) / `reflectRunType(value)`
// (inferred). The escape hatch for any TS type with no dedicated builder
// (utility types, template literals, conditionals, native, circular).
export {runType, reflectRunType} from './reflect.ts';

// Tier 3 — the inverse reflector (RunType → typed runtime model).
export {reflectModel} from './reflectModel.ts';

// Populate the run-type registry. The value-first builders (Tier 2) and
// `reflectModel` (Tier 3) resolve live RunType nodes from `runTypesCache` at
// runtime, so the `/define` surface must initialise it the same way the root
// entry (src/index.ts) does — otherwise a consumer importing ONLY `/define`
// gets an empty cache and the builders fall back to their carriers. Idempotent:
// re-running overwrites entries by id, so importing both root and `/define` is
// safe.
import {initCache as initRunTypesCache} from '../caches/runTypesCache.ts';
import {getRTUtils as _getRTUtilsForInit} from '../runtypes/rtUtils.ts';
initRunTypesCache(_getRTUtilsForInit());

type _HMR = {accept(dep: string, cb: (mod: {initCache?(j: unknown): void} | undefined) => void): void};
const _hot = (import.meta as unknown as {hot?: _HMR}).hot;
if (_hot) {
  _hot.accept('../caches/runTypesCache.ts', (newMod) => {
    newMod?.initCache?.(_getRTUtilsForInit());
  });
}
