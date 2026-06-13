// Pure mapping from RunTypes validation errors to Standard Schema issues. No
// plugin, no rtUtils — a plain function over an in-memory RunTypeError[], so it
// is independently unit-testable. Used by `createStandardSchema`'s validate to
// build the `{issues}` branch from `createGetValidationErrors` output.

import type {RunTypeError, RunTypeErrorPathSegment, TypeFormatError} from '../createRTFunctions.ts';
import type {StandardSchemaIssue, StandardSchemaPathSegment} from './spec.ts';

/** Options for `runTypeErrorsToIssues`. The `message` hook replaces the default
 *  mechanical message derivation — the seam a future `createFriendly`-backed
 *  renderer plugs into. **/
export interface IssueMappingOptions {
  message?: (err: RunTypeError) => string;
}

// A RunTypeError path segment is `string | number` (object key / array index)
// or an object `{key, index, failed?}` for Map/Set entries. Standard Schema's
// path accepts a bare PropertyKey or a `{key}` PathSegment, so we pass plain
// keys through and surface the collection KEY for the object form (preserving
// it — unlike createFriendly's dotted path, which drops object segments). The
// `index` / `failed` discriminators have no Standard Schema representation.
function pathSegmentToStandard(seg: RunTypeErrorPathSegment): PropertyKey | StandardSchemaPathSegment {
  if (typeof seg === 'string' || typeof seg === 'number') return seg;
  const key = (seg as {key?: PropertyKey}).key;
  return {key: key ?? ''};
}

// constraintName mirrors createFriendly's `constraintKey`: the failed-constraint
// token is the formatPath tail (e.g. 'minLength'), else the format name, else
// 'type' for a base type-shape failure.
function constraintName(format: TypeFormatError | undefined): string {
  if (!format) return 'type';
  const tail = format.formatPath[format.formatPath.length - 1];
  return tail !== undefined ? String(tail) : format.name;
}

// primitiveBound narrows a format bound to a renderable primitive; array /
// object bounds (Map/Set markers) degrade to undefined so the message omits the
// bound rather than printing `[object Object]`.
function primitiveBound(val: TypeFormatError['val']): string | number | bigint | boolean | undefined {
  return typeof val === 'string' || typeof val === 'number' || typeof val === 'bigint' || typeof val === 'boolean'
    ? val
    : undefined;
}

// defaultMessage derives a mechanical, dependency-free message from the
// structured error. Human-readable phrasing is the friendly-map's job (wire it
// via IssueMappingOptions.message when that lands).
function defaultMessage(err: RunTypeError): string {
  if (err.expected === 'circular') return 'Circular reference';
  if (!err.format) return `Expected ${err.expected}`;
  const constraint = constraintName(err.format);
  const bound = primitiveBound(err.format.val);
  return bound === undefined ? `Failed ${constraint} constraint` : `Failed ${constraint} constraint (${String(bound)})`;
}

/** Maps a flat `RunTypeError[]` to a flat Standard Schema `Issue[]` (one issue
 *  per error). Paths and messages translate per the rules above; pass
 *  `options.message` to override the default message derivation. **/
export function runTypeErrorsToIssues(errs: RunTypeError[], options?: IssueMappingOptions): StandardSchemaIssue[] {
  const render = options?.message ?? defaultMessage;
  return errs.map((err) => ({
    message: render(err),
    path: err.path.map(pathSegmentToStandard),
  }));
}
