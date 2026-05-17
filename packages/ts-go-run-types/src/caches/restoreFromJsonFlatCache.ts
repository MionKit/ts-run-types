// @ts-nocheck
// Hand-authored skeleton for the restoreFromJsonFlat cache module.
// Decodes the wire shape produced by prepareForJsonFlat / stringifyJsonFlat.
// See prepareForJsonFlatCache.ts for the family's rationale.

'use strict';

export function initCache(jitUtils) {
  function init(jitFnHash, typeName, code, isNoop, jitDependencies, pureFnDependencies, createJitFn) {
    const fn = isNoop ? noopRestoreFromJsonFlat : undefined;
    jitUtils.addToJitCache({
      jitFnHash,
      fnID: 'rjf',
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
  function noopRestoreFromJsonFlat(v) {
    return v;
  }
  void noopRestoreFromJsonFlat;

  // #### REPLACE HERE ####
}
