// Public entry for the `@mionjs/ts-go-run-types/define` subpath — the
// value-first model authoring surface (`define` + `ModelType`) and the
// field-config types. Opt-in lane: consumers who want pure type-first
// reflection never import this. See ./define.ts for the design rationale.

export {
  define,
  type ModelType,
  type ModelConfig,
  type FieldConfig,
  type StringFieldConfig,
  type NumberFieldConfig,
  type DateFieldConfig,
} from './define.ts';
