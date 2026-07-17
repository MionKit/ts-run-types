// Registration module for the circular-reference walker `rt::findCycle`.
//
// The walker is heavy (~200 lines + the RunTypeKind / RunTypeSubKind tables it
// dispatches on) but does real work only for the rare app that both ARMS the
// guard (setRejectCircularRefs / a per-call {rejectCircularRefs}) AND encodes a
// type that can actually cycle. So instead of shipping it statically in every
// bundle, it rides the demand-driven built-in pure-fn machinery like every other
// `rt::` body: the resolver wires `rt::findCycle` into the SoftDeps of exactly
// the guarded fn entries whose type cycles (wireCircularRunTypeDeps), so the
// walker's module registers precisely when a cycle-capable createX entry does,
// and never otherwise. maybeGuardCircular (entryTuple.ts) fetches it from the
// registry at arm time.
//
// Self-containment: a pure-fn body is rebuilt via `new Function('utl', code)`, so
// it cannot reference the module-level RunTypeKind enum. The kind / subKind
// values the walk needs are therefore inlined as literals below (mirroring
// runTypeKind.ts — the CircularGuard suites are the behavioral drift guard: a
// wrong value breaks cycle detection for that kind). Only the members findCycle
// actually dispatches on are inlined.

import {registerPureFnFactory} from './pureFn.ts';
import type {RunType} from './types.ts';

/** Path to a detected cycle — object keys and array/tuple indices, plus
 *  `mapKey`/`mapValue`/set-index labels for keyed collections. Mirrors
 *  CircularPath in circular.ts (kept there as the public type). **/
type CircularPath = (string | number)[];

/** Runtime shape of the `rt::findCycle` pure fn: walk a value against its
 *  RunType and return the path to the first reference cycle, or null when
 *  acyclic. The circular guards (entryTuple.ts) receive it as a parameter. **/
export type FindCycleFn = (value: unknown, rt: RunType | undefined) => CircularPath | null;

registerPureFnFactory('rt::findCycle', function () {
  // Inlined kind / subKind constants (see the self-containment note above).
  const RunTypeKind = {
    object: 4,
    property: 15,
    method: 16,
    parameter: 18,
    promise: 19,
    class: 20,
    union: 23,
    intersection: 24,
    array: 25,
    tuple: 26,
    tupleMember: 27,
    rest: 29,
    objectLiteral: 30,
    indexSignature: 31,
    propertySignature: 32,
    methodSignature: 33,
    ref: -1,
  };
  const RunTypeSubKind = {none: 0, map: 2002, set: 2003};

  return function findCycle(value: unknown, rt: RunType | undefined): CircularPath | null {
    if (!rt) return null;
    // The descent stack of value objects currently being traversed. A value
    // re-encountered while still on the stack is a back-edge → cycle.
    // Untyped on purpose: the pure-fn extractor strips annotations and casts but
    // NOT constructor type arguments, so a typed Set would survive into the
    // emitted body as invalid JS. An inferred Set accepts the object refs stored.
    const stack = new Set();
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
  };
});
