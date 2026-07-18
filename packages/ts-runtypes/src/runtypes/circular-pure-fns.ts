// Registration module for the circular-reference walker `rt::findCycleParent`.
//
// The circular-reference guard is a COMPILE-TIME option (`{rejectCircularRefs:
// true}`): only the armed variant of a guarded factory (validate /
// validationErrors / toBinary / jsonEncoder) inlines the guard, and only for a
// cycle-capable type. The armed body calls `rt::findCycleParent(value, skeleton)`
// where `skeleton` is a small graph BAKED into the factory closure at build time
// (computed by internal/cachegen/typefunctions/circular_skeleton.go). So this
// walker needs NO RunType graph at runtime — the skeleton IS the pruned,
// cycle-capable graph — and it rides the demand-driven built-in pure-fn
// machinery like every other `rt::` body (body-referenced, so a plain unarmed
// type ships neither the walker nor a bundle).
//
// The skeleton shape (mirror of CircularSkeleton.JSLiteral):
//
//   {c: [1|0, …], e: [[{p: [seg, …], t: idx}, …], …]}
//
// Node 0 is the guarded root; c[i] flags a TRACKED node (a circular type whose
// values ride the descent stack). e[i] lists the outgoing circular edges from
// node i — each an access path `p` (segment list) to another tracked node `t`.
// Segment encodings: ["k", name] value[name]; ["a"] iterate array elements;
// ["s"] iterate Set elements; ["mk"]/["mv"] iterate Map keys/values; ["i"]
// iterate own-enumerable values (index signature).
//
// Self-containment: the body is rebuilt via `new Function('utl', code)`, so it
// references no module-level import and uses no `new Set()` constructor type
// argument (the pure-fn extractor strips annotations/casts but not ctor type
// args). It walks ONLY the baked circular edges with a descent stack LOCAL to
// itself (add-on-descent / delete-on-ascent), so DAGs / shared refs pass and
// only a true reference cycle flags — matching JSON.stringify's semantics.

import {registerPureFnFactory} from './pureFn.ts';

/** Path to a detected cycle — object keys and array/tuple indices, plus
 *  `mapKey[i]`/`mapValue[i]` labels for keyed collections. Mirrors CircularPath
 *  in circular.ts (kept there as the public type). **/
type CircularPath = (string | number)[];

/** The baked circular skeleton passed to `rt::findCycleParent` (see the module
 *  comment). Kept loose (`any`-ish) on purpose — the pure-fn extractor casts
 *  away annotations, so the shape is documented, not enforced, at runtime. **/
type CircularSkeleton = {c: number[]; e: {p: unknown[][]; t: number}[][]};

/** Runtime shape of the `rt::findCycleParent` pure fn: walk `value` against its
 *  baked circular skeleton and return the path to the first reference cycle, or
 *  null when acyclic. Called inline from the armed guarded factory bodies. **/
export type FindCycleParentFn = (value: unknown, skeleton: CircularSkeleton) => CircularPath | null;

registerPureFnFactory('rt::findCycleParent', function () {
  return function findCycleParent(value: unknown, skeleton: CircularSkeleton): CircularPath | null {
    if (value === null || typeof value !== 'object' || !skeleton) return null;
    const tracked = skeleton.c;
    const edges = skeleton.e;
    // Descent stack of tracked (circular-typed) values. A value re-encountered
    // while still on the stack is a back-edge → cycle. Untyped Set on purpose
    // (see the self-containment note above).
    const stack = new Set();
    const path: CircularPath = [];

    // Navigate one edge path from `val`, branching at iteration segments; at the
    // path end, descend into the reached value as tracked node `toNode`.
    const nav = (val: unknown, segs: unknown[][], si: number, toNode: number): boolean => {
      if (si === segs.length) return dfs(val, toNode);
      const seg = segs[si];
      const kind = seg[0];
      if (kind === 'k') {
        const child = val === null || typeof val !== 'object' ? undefined : (val as any)[seg[1] as any];
        if (child === undefined || child === null) return false;
        path.push(seg[1] as string | number);
        const hit = nav(child, segs, si + 1, toNode);
        if (hit) return true;
        path.pop();
        return false;
      }
      if (kind === 'a') {
        if (!Array.isArray(val)) return false;
        for (let i = 0; i < val.length; i++) {
          const el = val[i];
          if (el === undefined || el === null) continue;
          path.push(i);
          if (nav(el, segs, si + 1, toNode)) return true;
          path.pop();
        }
        return false;
      }
      if (kind === 'i') {
        if (val === null || typeof val !== 'object') return false;
        for (const key of Object.keys(val as object)) {
          const pv = (val as any)[key];
          if (pv === undefined || pv === null) continue;
          path.push(key);
          if (nav(pv, segs, si + 1, toNode)) return true;
          path.pop();
        }
        return false;
      }
      if (kind === 's') {
        if (!(val instanceof Set)) return false;
        let index = 0;
        for (const el of val) {
          if (el !== undefined && el !== null) {
            path.push(index);
            if (nav(el, segs, si + 1, toNode)) return true;
            path.pop();
          }
          index++;
        }
        return false;
      }
      if (kind === 'mk' || kind === 'mv') {
        if (!(val instanceof Map)) return false;
        let index = 0;
        for (const entry of val) {
          const member = kind === 'mk' ? entry[0] : entry[1];
          if (member !== undefined && member !== null) {
            path.push((kind === 'mk' ? 'mapKey[' : 'mapValue[') + index + ']');
            if (nav(member, segs, si + 1, toNode)) return true;
            path.pop();
          }
          index++;
        }
        return false;
      }
      return false;
    };

    // Push a tracked value on the descent stack (cycle-check first), follow its
    // circular edges, then pop. Non-tracked nodes (the root when its type isn't
    // itself circular) are traversed without stacking.
    const dfs = (val: unknown, node: number): boolean => {
      if (val === null || typeof val !== 'object') return false;
      const isTracked = !!tracked[node];
      if (isTracked) {
        if (stack.has(val)) return true;
        stack.add(val);
      }
      const outgoing = edges[node];
      for (let i = 0; i < outgoing.length; i++) {
        if (nav(val, outgoing[i].p, 0, outgoing[i].t)) return true;
      }
      if (isTracked) stack.delete(val);
      return false;
    };

    return dfs(value, 0) ? path.slice() : null;
  };
});
