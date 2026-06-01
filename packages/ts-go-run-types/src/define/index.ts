// Public entry for the `@mionjs/ts-go-run-types/define` subpath — the
// value-first model authoring surface (`defineObject` + `ModelType`) and the
// field-config types. Opt-in lane: consumers who want pure type-first
// reflection never import this. See ./define.ts for the design rationale.

export {
  defineObject,
  type ModelType,
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
