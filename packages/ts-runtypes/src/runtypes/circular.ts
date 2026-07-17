// Runtime circular-reference detector for the live-object families
// (validate / getValidationErrors / jsonEncode / binaryEncode). Opt-in and
// OFF by default — `setRejectCircularRefs(true)` arms it. The Go resolver only
// links a type's reflection RunType graph into a createX entry's dependency
// closure when that type's graph contains a circular node (see
// internal/cachegen/runtype/entries.go), so the guard is pay-for-use: types
// with no possible cycle register no RunType and skip the walk entirely.
//
// The walk pairs a runtime VALUE with its RunType node (the same graph the
// mock walker interprets) and reports the first back-edge — a value object
// already on the current descent stack. Add-on-descent / delete-on-ascent
// means shared refs and DAGs pass; only a true cycle flags, matching
// JSON.stringify's own semantics.

import type {RunType} from './types.ts';

/** Path to a detected cycle — object keys and array/tuple indices, plus
 *  `mapKey`/`mapValue`/set-index labels for keyed collections. **/
export type CircularPath = (string | number)[];

/** Thrown by the encoder families (`jsonEncode` / `binaryEncode`) when the
 *  input value contains a reference cycle. `validate` returns `false` and
 *  `getValidationErrors` pushes a `{expected: 'circular'}` entry instead — see
 *  the guard wrapper in entryTuple.ts. **/
export class CircularReferenceError extends Error {
  readonly path: CircularPath;
  constructor(path: CircularPath) {
    super(`Circular reference detected at ${formatCircularPath(path)}`);
    this.name = 'CircularReferenceError';
    this.path = path;
  }
}

/** Renders a CircularPath to a dotted/bracketed string for error messages. **/
export function formatCircularPath(path: CircularPath): string {
  if (path.length === 0) return '<root>';
  let out = '';
  for (const segment of path) {
    if (typeof segment === 'number') out += `[${segment}]`;
    else out += out ? `.${segment}` : segment;
  }
  return out;
}

// Global arm — a single process-wide flag (runtime decision, independent of the
// build-time linking the resolver performs for circular types). Each guarded
// factory also accepts a per-call `{rejectCircularRefs}` override that wins over this
// flag for that one instance (see ValidateOptions / JsonEncoderOptions /
// BinaryEncoderOptions).
let rejectCircularRefsEnabled = false;

/** Arms (or disarms) circular-reference checking for every guarded createX
 *  factory. Off by default; a per-call `{rejectCircularRefs}` option overrides it. **/
export function setRejectCircularRefs(enabled: boolean): void {
  rejectCircularRefsEnabled = enabled;
}

/** Whether circular-reference checking is currently armed. **/
export function isRejectCircularRefsEnabled(): boolean {
  return rejectCircularRefsEnabled;
}

// Memoised "does this type's graph contain a circular node?" keyed by the root
// RunType id. The resolver only links a RunType graph for circular-containing
// types, but the SAME graph can also arrive via a reflection (getRunTypeId)
// site for a non-circular type — this gate keeps the guard from walking values
// of types that can never cycle. The type graph itself may be cyclic (patched
// refs), so the visit set is by node identity.
const typeGraphCircularMemo = new Map<string, boolean>();

/** True when `rt`'s type graph contains at least one node flagged circular by
 *  the Go serializer (`RunType.isCircular`). Memoised per type id. **/
export function typeGraphIsCircular(rt: RunType): boolean {
  const cached = typeGraphCircularMemo.get(rt.id);
  if (cached !== undefined) return cached;
  const visited = new Set<RunType>();
  let found = false;
  const visit = (node: RunType | undefined): void => {
    if (!node || found || visited.has(node)) return;
    visited.add(node);
    if (node.isCircular) {
      found = true;
      return;
    }
    visit(node.child);
    visit(node.index);
    visit(node.return);
    visit(node.indexType);
    visit(node.extends);
    visit(node.classType);
    visitAll(node.parameters);
    visitAll(node.children);
    visitAll(node.safeUnionChildren);
    visitAll(node.typeArguments);
    visitAll(node.arguments);
    visitAll(node.extendsArguments);
    visitAll(node.implements);
  };
  const visitAll = (nodes: RunType[] | undefined): void => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) visit(node);
  };
  visit(rt);
  typeGraphCircularMemo.set(rt.id, found);
  return found;
}
