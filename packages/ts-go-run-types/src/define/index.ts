// Public entry for the `@mionjs/ts-go-run-types/define` subpath — the
// value-first model authoring surface: the `object` model assembler, the
// per-type field builders (`string` / `number` / `boolean` / `bigint` /
// `date` / `temporal.*`), and the `optional` modifier. Each builder returns its
// branded format type, so `typeof object({...})` IS the model type. `ModelType`
// and the field-config types are re-exported as the retained config↔type bridge
// (no longer on the forward authoring path). Opt-in lane: consumers who want
// pure type-first reflection never import this. See ./define.ts for the rationale.

export {
  // Model assembler + field builders.
  object,
  string,
  number,
  boolean,
  bigint,
  date,
  temporal,
  optional,
  // Type mapping + config types.
  type ModelType,
  type ModelConfig,
  type FieldConfig,
  type StringFamilyParams,
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
