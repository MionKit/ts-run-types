// Registration module for the circular-reference walker `rt::findCycle`.
//
// The circular-reference guard is a COMPILE-TIME option (`{rejectCircularRefs:
// true}`): only the armed variant of a guarded factory (validate /
// validationErrors / toBinary / jsonEncoder) inlines the guard, and only for a
// cycle-capable type. The armed body calls `rt::findCycle(value, skeleton)`
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
// references no module-level import. It walks ONLY the baked circular edges with
// a descent stack LOCAL to itself (add-on-descent / delete-on-ascent), so DAGs /
// shared refs pass and only a true reference cycle flags — matching
// JSON.stringify's semantics.
//
// The stack is a plain ARRAY, not a Set: it holds only the tracked values on the
// CURRENT descent path (short in practice — a tree's height, a short chain), and
// a linear `indexOf` scan of a short array beats Set's hashing (measured
// ~1.3–1.9x faster up to ~depth 100; Set only wins for pathologically deep single
// chains). The delete is always LIFO — delete-on-ascent removes the value this
// frame just pushed — so it's a plain `pop()`, and membership is the only scan.

import {registerPureFnFactory} from './pureFn.ts';

/** Path to a detected cycle — object keys and array/tuple indices, plus
 *  `mapKey[i]`/`mapValue[i]` labels for keyed collections. Mirrors CircularPath
 *  in circular.ts (kept there as the public type). **/
type CircularPath = (string | number)[];

/** The baked circular skeleton passed to `rt::findCycle` (see the module
 *  comment). Kept loose (`any`-ish) on purpose — the pure-fn extractor casts
 *  away annotations, so the shape is documented, not enforced, at runtime. **/
type CircularSkeleton = {c: number[]; e: {p: unknown[][]; t: number}[][]};

/** Runtime shape of the `rt::findCycle` pure fn: walk `value` against its
 *  baked circular skeleton and return the path to the first reference cycle, or
 *  null when acyclic. Called inline from the armed guarded factory bodies. **/
export type FindCycleFn = (value: unknown, skeleton: CircularSkeleton) => CircularPath | null;

registerPureFnFactory('rt::findCycle', function () {
  // Per-call state lives in the factory closure (built ONCE when the pure fn
  // materialises) and is reset at the top of each call, so the recursive `nav` /
  // `dfs` closures below are created once, not on every invocation. Safe as
  // shared state because findCycle is synchronous, single-threaded, and
  // never re-enters itself — calls never interleave.
  let tracked: number[] = [];
  let edges: CircularSkeleton['e'] = [];
  // Descent stack (array) of tracked (circular-typed) values on the current
  // path. A value re-encountered while still on the stack is a back-edge →
  // cycle; membership is a linear `indexOf` (identity), fast because the stack
  // stays short (see the note above).
  const stack: unknown[] = [];
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
      if (stack.indexOf(val) !== -1) return true;
      stack.push(val);
    }
    const outgoing = edges[node];
    for (let i = 0; i < outgoing.length; i++) {
      if (nav(val, outgoing[i].p, 0, outgoing[i].t)) return true;
    }
    // LIFO: this frame pushed `val` on entry, so pop removes exactly it.
    if (isTracked) stack.pop();
    return false;
  };

  return function findCycle(value: unknown, skeleton: CircularSkeleton): CircularPath | null {
    if (value === null || typeof value !== 'object' || !skeleton) return null;
    tracked = skeleton.c;
    edges = skeleton.e;
    stack.length = 0;
    path.length = 0;
    return dfs(value, 0) ? path.slice() : null;
  };
});
