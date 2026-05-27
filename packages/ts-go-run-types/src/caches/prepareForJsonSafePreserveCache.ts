// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// prepareForJsonSafePreserve cache module. Clone+preserve variant — every
// cloned object literal is emitted as `{...v, declared: <transformed>}` so
// undeclared keys survive. Powers `strategy: 'clone', stripExtras: false`.

'use strict';

/** @typedef {import('../jit/types.ts').PrepareForJsonSafePreserveJitFn} PrepareForJsonSafePreserveJitFn */

/** @param {import('../jit/jitUtils.ts').JITUtils} jitUtils */
export function initCache(jitUtils) {
  function init(
    jitFnHash,
    typeName,
    code,
    isNoop,
    jitDependencies,
    pureFnDependencies,
    createJitFn,
    alwaysThrowCode,
    alwaysThrowSite
  ) {
    const fn = isNoop ? noopPrepareForJsonSafePreserve : undefined;
    const resolvedCreateJitFn =
      alwaysThrowCode !== undefined ? jitUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createJitFn;
    /** @type {PrepareForJsonSafePreserveJitFn} */
    const entry = {
      jitFnHash,
      fnID: 'pjsp',
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
      alwaysThrowSite,
    };
    jitUtils.addToJitCache(entry);
  }
  void init;
  function noopPrepareForJsonSafePreserve(v) {
    return v;
  }
  void noopPrepareForJsonSafePreserve;

  // #### REPLACE HERE ####
}
