// Maps RunTypes validation errors to Standard Schema issues. No plugin, no
// rtUtils — a plain function over an in-memory RTValidationError[], so it is
// independently unit-testable. Used by `createStandardSchema`'s validate to
// build the `{issues}` branch from `createGetValidationErrors` output.
//
// The mapping is LOSSLESS and adds NO path recreation: a RTValidationError path
// is already a valid Standard Schema path (every segment is a `PropertyKey` or
// an `RTPathSegment`, which is a `{key: PropertyKey}` carrying an extra `failed`
// role marker), so we pass `err.path` straight through. The only thing we
// build is the `message`; `expected` and `format` ride along as structured
// fields a spec consumer ignores but a RunTypes-aware one can read.

import type {RTValidationError, RTPathSegment, TypeFormatError} from '../createRTFunctions.ts';
import type {StandardSchemaIssue} from './spec.ts';

/** A Standard Schema Issue that ALSO carries the full RTValidationError
 *  structure, with no duplication: `path` is the single, spec-shaped path (its
 *  segments may be the richer `RTPathSegment`), and `expected` + `format` are
 *  the structured fields the spec `message` otherwise only encodes as text.
 *  RTValidationIssue extends StandardSchemaIssue, so an array of these is
 *  assignable to `ReadonlyArray<StandardSchemaIssue>` — generic consumers keep
 *  working; RunTypes-aware consumers read the extras. **/
export interface RTValidationIssue extends StandardSchemaIssue {
  readonly message: string;
  readonly path: ReadonlyArray<PropertyKey | RTPathSegment>;
  readonly expected: string;
  readonly format?: TypeFormatError;
}

/** Options for `runTypeErrorsToIssues`. The `message` hook replaces the default
 *  mechanical message derivation — the seam a future `createFriendly`-backed
 *  renderer plugs into. **/
export interface IssueMappingOptions {
  message?: (err: RTValidationError) => string;
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
function defaultMessage(err: RTValidationError): string {
  if (err.expected === 'circular') return 'Circular reference';
  if (!err.format) return `Expected ${err.expected}`;
  const constraint = constraintName(err.format);
  const bound = primitiveBound(err.format.val);
  return bound === undefined ? `Failed ${constraint} constraint` : `Failed ${constraint} constraint (${String(bound)})`;
}

/** Maps a flat `RTValidationError[]` to a flat `RTValidationIssue[]` (one issue
 *  per error). The path passes through unchanged (already spec-shaped); the
 *  structured `expected` / `format` are preserved; only `message` is derived
 *  (override it via `options.message`). **/
export function runTypeErrorsToIssues(errs: RTValidationError[], options?: IssueMappingOptions): RTValidationIssue[] {
  const render = options?.message ?? defaultMessage;
  return errs.map((err) => ({
    message: render(err),
    path: err.path,
    expected: err.expected,
    ...(err.format ? {format: err.format} : {}),
  }));
}
