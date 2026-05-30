// Tier 3 — `reflectModel<T>()`: the inverse direction. Reconstructs a typed,
// discriminated runtime model (`ModelConfig`) FROM the reflected RunType, for
// both value-first and type-first declarations (Drizzle / OpenAPI / form
// generation / default instances). It is a third interpreter over the same
// `runTypesCache` `mockType` walks: `getRunType(id)` → walk the object's
// property children → emit `{type, formatParams}` per field.
//
// The strong typing comes from the call-site `T` via `ModelConfigOf<T>` (the
// inverse of `ModelType<C>`), not from the walk — `getRunType(id)` carries the
// param VALUES but erases their literal TYPES at runtime, so the walk supplies
// the values and `ModelConfigOf<T>` supplies the precise shape. Flat models only
// (the leaf-only value-first scope): a nested field has no `__rtFormat*` brand,
// resolves to `never` in `ModelConfigOf`, and is skipped by the walk.

import {getRTUtils} from '../runtypes/rtUtils.ts';
import {RunTypeKind} from '../runTypeKind.ts';
import type {RunType} from '../runtypes/types.ts';
import type {InjectRunTypeId} from '../markers.ts';
import type {ModelConfigOf} from './define.ts';

/** A reflected field config — the loose runtime shape of a `FieldConfig` (the
 *  precise discriminated type comes from `ModelConfigOf<T>` at the call site). **/
interface FieldEntry {
  type: string;
  formatParams: Record<string, unknown>;
}

/** Reflection marker: reconstructs the discriminated runtime model for `T`.
 *  Static form `reflectModel<User>()` (explicit `T`, no value) or reflect form
 *  `reflectModel(user)` (`T` inferred from a value) — both resolve to the same
 *  cache entry, and `T` drives the precise `ModelConfigOf<T>` return type. The
 *  injected id resolves the RunType the walk reads. Throws if the Vite plugin
 *  isn't active (no id injected). **/
export function reflectModel<T>(value?: T, id?: InjectRunTypeId<T>): ModelConfigOf<T> {
  void value;
  if (id === undefined) {
    throw new Error('reflectModel(): no id injected. vite-plugin-runtypes must be active.');
  }
  const runType = getRTUtils().getRunType(id);
  if (!runType) {
    throw new Error(`reflectModel(): no RunType entry for "${id}". The build pipeline didn't emit a cache entry.`);
  }
  return reflectRunTypeToModel(runType) as ModelConfigOf<T>;
}

/** Walks a model RunType's property children and emits the discriminated
 *  `{type, formatParams}` config per field. Object-literal / interface members
 *  surface as `propertySignature`; `property` covers the class-instance shape.
 *  Non-property children and non-leaf field types are skipped — flat models
 *  only. **/
function reflectRunTypeToModel(runType: RunType): Record<string, FieldEntry> {
  const model: Record<string, FieldEntry> = {};
  const children = (runType.children ?? []) as RunType[];
  for (const property of children) {
    if (property.kind !== RunTypeKind.propertySignature && property.kind !== RunTypeKind.property) continue;
    const key = property.name;
    const fieldType = property.child;
    if (typeof key !== 'string' || !fieldType) continue;
    const entry = fieldEntryFromRunType(fieldType);
    if (entry) model[key] = entry;
  }
  return model;
}

/** A single field RunType → its discriminated config. A TypeFormat-branded leaf
 *  carries a `formatAnnotation` (name + params); a plain `boolean` carries none.
 *  Returns undefined for a non-leaf field (nested object / array / union) —
 *  outside the flat-model scope. **/
function fieldEntryFromRunType(runType: RunType): FieldEntry | undefined {
  const annotation = runType.formatAnnotation;
  if (annotation && typeof annotation.name === 'string') {
    return {type: tagFromFormatName(annotation.name), formatParams: (annotation.params ?? {}) as Record<string, unknown>};
  }
  if (runType.kind === RunTypeKind.boolean) {
    return {type: 'boolean', formatParams: {}};
  }
  return undefined;
}

/** Runtime twin of the `TagOf<N>` type — brand `__rtFormatName` → authoring tag.
 *  Kept in sync with `TagOf` in define.ts (and the builders). **/
function tagFromFormatName(name: string): string {
  switch (name) {
    case 'stringFormat':
      return 'string';
    case 'numberFormat':
      return 'number';
    case 'bigintFormat':
      return 'bigint';
    case 'nativeDate':
      return 'date';
    case 'temporalInstant':
      return 'temporal.instant';
    case 'temporalZonedDateTime':
      return 'temporal.zonedDateTime';
    case 'temporalPlainDate':
      return 'temporal.plainDate';
    case 'temporalPlainTime':
      return 'temporal.plainTime';
    case 'temporalPlainDateTime':
      return 'temporal.plainDateTime';
    case 'temporalPlainYearMonth':
      return 'temporal.plainYearMonth';
    default:
      return name;
  }
}
