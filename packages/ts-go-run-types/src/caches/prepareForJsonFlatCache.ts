// @ts-nocheck
// Hand-authored skeleton for the prepareForJsonFlat cache module.
// Optimised sibling of prepareForJsonCache.ts — wire shape diverges
// only at union boundaries (object members merge into [-1, mergedObject]
// envelope; atomic members keep [memberIndex, value]). Consumers opt in
// via createPrepareForJsonFlat; the non-flat cache stays untouched.

'use strict';

export function initCache(jitUtils) {
  function init(jitFnHash, typeName, code, isNoop, jitDependencies, pureFnDependencies, createJitFn) {
    const fn = isNoop ? noopPrepareForJsonFlat : undefined;
    jitUtils.addToJitCache({
      jitFnHash,
      fnID: 'pjf',
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
  function noopPrepareForJsonFlat(v) {
    return v;
  }
  void noopPrepareForJsonFlat;

  // #### REPLACE HERE ####
}
