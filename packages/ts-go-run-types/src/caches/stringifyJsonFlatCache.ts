// @ts-nocheck
// Hand-authored skeleton for the stringifyJsonFlat cache module.
// Single-pass JSON serialiser that emits the flat-union wire shape
// directly (no intermediate prepareForJson). See prepareForJsonFlatCache.ts
// for the family's rationale.

'use strict';

export function initCache(jitUtils) {
  function init(jitFnHash, typeName, code, isNoop, jitDependencies, pureFnDependencies, createJitFn) {
    const fn = isNoop ? noopStringifyJsonFlat : undefined;
    jitUtils.addToJitCache({
      jitFnHash,
      fnID: 'sjf',
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
  function noopStringifyJsonFlat(v) {
    return JSON.stringify(v);
  }
  void noopStringifyJsonFlat;

  // #### REPLACE HERE ####
}
