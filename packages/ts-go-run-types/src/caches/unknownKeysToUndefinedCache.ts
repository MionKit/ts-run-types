// @ts-nocheck
// Hand-authored skeleton for the unknownKeysToUndefined cache module.
// Served by the Go binary via the Vite plugin's `transform()` hook
// after replacing the marker line below with generated `init(…)`
// calls — one per cached RunType the UnknownKeysToUndefined emitter
// supports.
//
// Mirrors `stripUnknownKeysCache.ts` shape with the `fnID: 'uku'` tag.
// Every JitCompiledFn entry produces a (v) -> v mutator that sets
// unknown properties to undefined (instead of deleting them).

'use strict';

export function initCache(jitUtils) {
  const k_getUnknownKeysFromArray = 'mion::getUnknownKeysFromArray';

  function init(jitFnHash, typeName, code, isNoop, jitDependencies, pureFnDependencies, createJitFn, alwaysThrowCode) {
    const fn = isNoop ? noopUnknownKeysToUndefined : undefined;
    const resolvedCreateJitFn = alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode) : createJitFn;
    jitUtils.addToJitCache({
      jitFnHash,
      fnID: 'uku',
      typeName,
      args: {vλl: 'v'},
      defaultParamValues: {vλl: undefined},
      code,
      isNoop,
      jitDependencies,
      pureFnDependencies,
      createJitFn: resolvedCreateJitFn,
      fn,
      alwaysThrowCode,
    });
  }
  void init;
  void k_getUnknownKeysFromArray;
  function noopUnknownKeysToUndefined(v) {
    return v;
  }
  void noopUnknownKeysToUndefined;

  // #### REPLACE HERE ####
}
