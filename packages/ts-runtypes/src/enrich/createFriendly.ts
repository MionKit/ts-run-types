// `createFriendly<T>(map)` — renders `getValidationErrors` output into
// human-readable messages using a `FriendlyType<T>` map (see docs/AI_ENRICHMENT.md).
//
// Pure data over (map, errors): for each error it walks `error.path` into the map,
// picks a template by the `(format.name, formatPath-tail)` discriminator (`type`
// for the base type-shape failure), and interpolates `$[…]` placeholders. NO
// type-id injection and NO rtUtils — error rendering needs only the map. (UI field
// enumeration, which needs the runtype, is the deferred registry-accessor path.)
//
// Aggregation matches the validator: `getValidationErrors` accumulates, so a field
// can carry several errors. Data-form `$errors` yield ONE message per failed
// constraint (a list); a function-form `$errors` yields ONE message per field,
// handed all of that field's failures aggregated.

import type {RTValidationError, RTValidationErrorPathSegment, TypeFormatError} from '../createRTFunctions.ts';
import type {ErrorTemplates, FailedConstraints, FriendlyType} from './friendlyType.ts';

/** A rendered, human-readable validation message for one failure. */
export interface FriendlyMessage {
  /** Dotted path to the field (`profile.email`); `''` for the root. */
  path: string;
  /** The field's friendly label, or its raw last path segment as fallback. */
  label: string;
  /** The interpolated message. */
  message: string;
}

/** What `createFriendly` returns. */
export interface FriendlyRenderer {
  /** The friendly label for a path (dotted string or a raw segment array). */
  label(path: string | RTValidationErrorPathSegment[]): string;
  /** Render a `getValidationErrors` result into friendly messages. */
  errors(errs: RTValidationError[]): FriendlyMessage[];
}

// Runtime view of a node — the authored map is a plain object with `$label` /
// `$errors` meta keys plus child-field keys (`$items` for arrays and rest-tuple
// elements, `$slots` for fixed-tuple positions, `$keys` / `$values` for
// maps/sets).
type FriendlyNodeRuntime = {
  $label?: string;
  $errors?: ErrorTemplates;
  $items?: FriendlyNodeRuntime;
  $slots?: FriendlyNodeRuntime[];
  $keys?: FriendlyNodeRuntime;
  $values?: FriendlyNodeRuntime;
  [field: string]: unknown;
};

const PLACEHOLDER = /\$\[(\w+)\]/g;

/** A path segment's dotted-path key: a string field name, an array / tuple
 *  index, or a Map / Set entry's iteration index (its numeric `key`). */
function segmentKey(seg: RTValidationErrorPathSegment): string | number {
  if (typeof seg === 'string' || typeof seg === 'number') return seg;
  return seg.key;
}

/** Descend one segment: string → child field; number → `$slots[i]` for a fixed
 *  tuple, else `$items` (array / rest-tuple element); Map / Set entry → `$keys`
 *  (a `mapKey` failure) or `$values` (a `mapValue` / `setKey` failure), routed
 *  by the segment's `failed` role. A fixed tuple has positional `$slots`; an
 *  array (and a rest tuple, whose `length` is the broad `number`) has `$items`. */
function descend(node: FriendlyNodeRuntime | undefined, seg: RTValidationErrorPathSegment): FriendlyNodeRuntime | undefined {
  if (!node) return undefined;
  if (typeof seg === 'string') return node[seg] as FriendlyNodeRuntime | undefined;
  if (typeof seg === 'number') return node.$slots ? node.$slots[seg] : node.$items;
  return seg.failed === 'mapKey' ? node.$keys : node.$values;
}

function nodeAt(root: FriendlyNodeRuntime, path: RTValidationErrorPathSegment[]): FriendlyNodeRuntime | undefined {
  let node: FriendlyNodeRuntime | undefined = root;
  for (const seg of path) node = descend(node, seg);
  return node;
}

/** Fallback label when a node has no `$label`: the last STRING segment (the
 *  field name) if any, else the last segment stringified. */
function rawLabel(path: RTValidationErrorPathSegment[]): string {
  for (let i = path.length - 1; i >= 0; i--) {
    if (typeof path[i] === 'string') return path[i] as string;
  }
  const tail = path.length ? segmentKey(path[path.length - 1]) : undefined;
  return tail === undefined ? '' : String(tail);
}

function pathToString(path: RTValidationErrorPathSegment[]): string {
  return path.map((seg) => String(segmentKey(seg))).join('.');
}

/** The template key for an error: the format sub-constraint (`formatPath` tail),
 *  else the format name, else `type` for a base type-shape failure. */
function constraintKey(format: TypeFormatError | undefined): string {
  if (!format) return 'type';
  const tail = format.formatPath[format.formatPath.length - 1];
  return tail !== undefined ? String(tail) : format.name;
}

/** Keep only primitive constraint values; arrays/objects → undefined. */
function primitiveVal(val: TypeFormatError['val'] | undefined): string | number | boolean | bigint | undefined {
  const kind = typeof val;
  if (kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'bigint') {
    return val as string | number | boolean | bigint;
  }
  return undefined;
}

/** The last numeric path segment (array index or Map / Set entry index), for
 *  `$[index]`. */
function numericIndex(path: RTValidationErrorPathSegment[]): number | undefined {
  for (let i = path.length - 1; i >= 0; i--) {
    const key = segmentKey(path[i]);
    if (typeof key === 'number') return key;
  }
  return undefined;
}

function interpolate(
  template: string,
  ctx: {label: string; val?: string | number | boolean | bigint; path: string; index?: number}
): string {
  return template.replace(PLACEHOLDER, (whole: string, name: string) => {
    if (name === 'label') return ctx.label;
    if (name === 'val') return ctx.val === undefined ? '' : String(ctx.val);
    if (name === 'path') return ctx.path;
    if (name === 'index') return ctx.index === undefined ? '' : String(ctx.index);
    return whole;
  });
}

interface PathGroup {
  path: RTValidationErrorPathSegment[];
  pathStr: string;
  errors: RTValidationError[];
}

/** Grouping signature: the dotted path, but a Map / Set entry also encodes its
 *  `failed` role so a key-failure and a value-failure at the SAME entry index
 *  resolve to their own (`$keys` vs `$values`) node instead of colliding. */
function groupSignature(path: RTValidationErrorPathSegment[]): string {
  return path.map((seg) => (typeof seg === 'object' ? `${seg.key} ${seg.failed ?? ''}` : String(seg))).join('.');
}

/** Group errors by path (role-aware for Map / Set), preserving first-seen order. */
function groupByPath(errs: RTValidationError[]): PathGroup[] {
  const groups: PathGroup[] = [];
  const bySignature = new Map<string, PathGroup>();
  for (const err of errs) {
    const signature = groupSignature(err.path);
    let group = bySignature.get(signature);
    if (!group) {
      group = {path: err.path, pathStr: pathToString(err.path), errors: []};
      bySignature.set(signature, group);
      groups.push(group);
    }
    group.errors.push(err);
  }
  return groups;
}

export function createFriendly<T>(map: FriendlyType<T>): FriendlyRenderer {
  const root = map as FriendlyNodeRuntime;

  const labelFor = (node: FriendlyNodeRuntime | undefined, path: RTValidationErrorPathSegment[]): string =>
    node?.$label ?? rawLabel(path);

  return {
    label(path) {
      const segs = typeof path === 'string' ? (path === '' ? [] : path.split('.')) : path;
      return labelFor(nodeAt(root, segs), segs);
    },

    errors(errs) {
      const out: FriendlyMessage[] = [];
      for (const group of groupByPath(errs)) {
        const node = nodeAt(root, group.path);
        const label = labelFor(node, group.path);
        const errorTemplates = node?.$errors;

        if (typeof errorTemplates === 'function') {
          const failed: FailedConstraints = {};
          for (const err of group.errors) failed[constraintKey(err.format)] = {val: primitiveVal(err.format?.val)};
          out.push({path: group.pathStr, label, message: errorTemplates(failed)});
          continue;
        }

        const index = numericIndex(group.path);
        for (const err of group.errors) {
          const template = errorTemplates?.[constraintKey(err.format)] ?? errorTemplates?.$default;
          const message = template
            ? interpolate(template, {label, val: primitiveVal(err.format?.val), path: group.pathStr, index})
            : `${label || 'value'} is invalid`;
          out.push({path: group.pathStr, label, message});
        }
      }
      return out;
    },
  };
}
