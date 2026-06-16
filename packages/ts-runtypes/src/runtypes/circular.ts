// Runtime circular-reference detector for the live-object families
// (validate / getValidationErrors / jsonEncode / binaryEncode). Opt-in and
// OFF by default — `setRejectCircularRefs(true)` arms it. The Go resolver only
// links a type's reflection RunType graph into a createX entry's dependency
// closure when that type's graph contains a circular node (see
// internal/compiled/runtype/entries.go), so the guard is pay-for-use: types
// with no possible cycle register no RunType and skip the walk entirely.
//
// The walk pairs a runtime VALUE with its RunType node (the same graph the
// mock walker interprets) and reports the first back-edge — a value object
// already on the current descent stack. Add-on-descent / delete-on-ascent
// means shared refs and DAGs pass; only a true cycle flags, matching
// JSON.stringify's own semantics.

import type {RunType} from './types.ts';
import {RunTypeKind, RunTypeSubKind} from '../runTypeKind.ts';

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

/** Walks `value` against its RunType `rt` and returns the path to the first
 *  reference cycle, or null when the value is acyclic. The walk only descends
 *  the data-bearing kinds the validators / serializers themselves traverse
 *  (methods, functions, symbols and builtin atoms are leaves). **/
export function findCycle(value: unknown, rt: RunType | undefined): CircularPath | null {
  if (!rt) return null;
  // The descent stack of value objects currently being traversed. A value
  // re-encountered while still on the stack is a back-edge → cycle.
  const stack = new Set<object>();
  const path: CircularPath = [];

  const walk = (current: unknown, node: RunType): boolean => {
    const kind = node.kind as number;
    switch (kind) {
      case RunTypeKind.object:
      case RunTypeKind.objectLiteral:
      case RunTypeKind.intersection:
        return walkObject(current, node);
      case RunTypeKind.class:
        return walkClass(current, node);
      case RunTypeKind.array:
        return walkArray(current, node);
      case RunTypeKind.tuple:
        return walkTuple(current, node);
      case RunTypeKind.union:
        return walkUnion(current, node);
      // Wrappers re-interpret the same value or unwrap to a child type — pass
      // through without touching the stack (the child container owns the push).
      case RunTypeKind.property:
      case RunTypeKind.propertySignature:
      case RunTypeKind.parameter:
      case RunTypeKind.tupleMember:
      case RunTypeKind.rest:
        return node.child ? walk(current, node.child as RunType) : false;
      // A pending promise can't be walked synchronously and is not
      // serialisable data; ref slots are patched to real nodes after
      // registration. Both are leaves here.
      case RunTypeKind.promise:
      case RunTypeKind.ref:
      default:
        return false;
    }
  };

  // Pushes `obj` on the descent stack, returns false if it was already there
  // (caller handles the cycle). enter/leave bracket every container walk.
  const enter = (obj: object): boolean => {
    if (stack.has(obj)) return false;
    stack.add(obj);
    return true;
  };

  const walkObject = (value: unknown, node: RunType): boolean => {
    if (value === null || typeof value !== 'object') return false;
    const obj = value as Record<string | number, unknown>;
    if (!enter(obj)) return true;
    let hit = false;
    for (const member of (node.children ?? []) as RunType[]) {
      const memberKind = member.kind as number;
      if (memberKind === RunTypeKind.method || memberKind === RunTypeKind.methodSignature) continue;
      if (member.notSupported) continue;
      if (memberKind === RunTypeKind.indexSignature) {
        if (walkIndexSignature(obj, member)) {
          hit = true;
          break;
        }
        continue;
      }
      const name = member.name as string | number | undefined;
      const childType = member.child as RunType | undefined;
      if (name === undefined || !childType) continue;
      const propValue = obj[name];
      if (propValue === undefined) continue;
      path.push(name);
      if (walk(propValue, childType)) {
        hit = true;
        break;
      }
      path.pop();
    }
    stack.delete(obj);
    return hit;
  };

  const walkIndexSignature = (obj: Record<string | number, unknown>, member: RunType): boolean => {
    const childType = member.child as RunType | undefined;
    if (!childType) return false;
    for (const key of Object.keys(obj)) {
      const propValue = obj[key];
      if (propValue === undefined) continue;
      path.push(key);
      if (walk(propValue, childType)) return true;
      path.pop();
    }
    return false;
  };

  const walkClass = (value: unknown, node: RunType): boolean => {
    const subKind = node.subKind as number | undefined;
    if (subKind === RunTypeSubKind.map) return walkMap(value, node);
    if (subKind === RunTypeSubKind.set) return walkSet(value, node);
    // Date / Temporal / RegExp / non-serialisable builtins project atomically.
    if (subKind !== undefined && subKind !== RunTypeSubKind.none) return false;
    // User-defined class: validates structurally, walk like an object.
    return walkObject(value, node);
  };

  const walkArray = (value: unknown, node: RunType): boolean => {
    if (!Array.isArray(value)) return false;
    if (!enter(value)) return true;
    const child = node.child as RunType | undefined;
    let hit = false;
    if (child) {
      for (let i = 0; i < value.length; i++) {
        if (value[i] === undefined) continue;
        path.push(i);
        if (walk(value[i], child)) {
          hit = true;
          break;
        }
        path.pop();
      }
    }
    stack.delete(value);
    return hit;
  };

  const walkTuple = (value: unknown, node: RunType): boolean => {
    if (!Array.isArray(value)) return false;
    if (!enter(value)) return true;
    const children = (node.children ?? []) as RunType[];
    let hit = false;
    for (let i = 0; i < children.length; i++) {
      if (value[i] === undefined) continue;
      path.push(i);
      if (walk(value[i], children[i])) {
        hit = true;
        break;
      }
      path.pop();
    }
    stack.delete(value);
    return hit;
  };

  const walkMap = (value: unknown, node: RunType): boolean => {
    if (!(value instanceof Map)) return false;
    if (!enter(value)) return true;
    const args = (node.arguments ?? []) as RunType[];
    const keyType = args[0]?.child as RunType | undefined;
    const valueType = args[1]?.child as RunType | undefined;
    let hit = false;
    let index = 0;
    for (const [entryKey, entryValue] of value) {
      if (keyType) {
        path.push(`mapKey[${index}]`);
        if (walk(entryKey, keyType)) {
          hit = true;
          break;
        }
        path.pop();
      }
      if (valueType) {
        path.push(`mapValue[${index}]`);
        if (walk(entryValue, valueType)) {
          hit = true;
          break;
        }
        path.pop();
      }
      index++;
    }
    stack.delete(value);
    return hit;
  };

  const walkSet = (value: unknown, node: RunType): boolean => {
    if (!(value instanceof Set)) return false;
    if (!enter(value)) return true;
    const elementType = ((node.arguments ?? []) as RunType[])[0]?.child as RunType | undefined;
    let hit = false;
    if (elementType) {
      let index = 0;
      for (const element of value) {
        path.push(index);
        if (walk(element, elementType)) {
          hit = true;
          break;
        }
        path.pop();
        index++;
      }
    }
    stack.delete(value);
    return hit;
  };

  // A union delegates to whichever arm the value matches; without replaying the
  // validator's arm selection we conservatively try every arm (a non-matching
  // atomic arm short-circuits immediately). No push — the matching arm's own
  // container walk owns the value identity.
  const walkUnion = (value: unknown, node: RunType): boolean => {
    for (const arm of (node.children ?? []) as RunType[]) {
      if (walk(value, arm)) return true;
    }
    return false;
  };

  return walk(value, rt) ? path.slice() : null;
}
