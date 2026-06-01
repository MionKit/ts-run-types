// Public entry for the `@mionjs/ts-go-run-types/define` subpath — the
// value-first model authoring surface: the `object` model assembler, the
// per-type field builders (`string` / `number` / `boolean` / `bigint` /
// `date` / `temporal.*`), the `optional` modifier, and the `ModelType`
// type mapping. Opt-in lane: consumers who want pure type-first reflection
// never import this. See ./define.ts for the design rationale.

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
