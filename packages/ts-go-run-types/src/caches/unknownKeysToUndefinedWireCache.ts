// @ts-nocheck
// Hand-authored skeleton for the unknownKeysToUndefinedWire cache
// module — decoder-internal sibling of unknownKeysToUndefinedCache.
// Served by the Go binary via the Vite plugin's `transform()` hook
// after replacing the marker line below with generated `init(…)`
// calls.
//
// The ukuWire family differs from uku ONLY at union nodes: where uku
// is a no-op (the public API operates on user-shape inputs; running a
// merged-allowlist strip on the wire's `[idx, value]` wrapper would
// corrupt the wrapper's `0`/`1` indices), ukuWire detects the wrapper
// at runtime and reaches into `v[1]` to apply the merged-allowlist
// strip on the merged object branch.
//
// Mirrors `unknownKeysToUndefinedCache.ts` shape with the `fnID:
// 'ukuw'` tag. Every JitCompiledFn entry produces a (v) -> v mutator.

'use strict';

export function initCache(jitUtils) {
  const k_getUnknownKeysFromArray = 'mion::getUnknownKeysFromArray';

  function init(jitFnHash, typeName, code, isNoop, jitDependencies, pureFnDependencies, createJitFn) {
    const fn = isNoop ? noopUnknownKeysToUndefinedWire : undefined;
    jitUtils.addToJitCache({
      jitFnHash,
      fnID: 'ukuw',
      typeName,
      args: {vλl: 'v'},
      defaultParamValues: {vλl: undefined},
      code,
      isNoop,
      jitDependencies,
      pureFnDependencies,
      createJitFn,
      fn,
    });
  }
  void init;
  void k_getUnknownKeysFromArray;
  function noopUnknownKeysToUndefinedWire(v) {
    return v;
  }
  void noopUnknownKeysToUndefinedWire;

  // #### REPLACE HERE ####
}
