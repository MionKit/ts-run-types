// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// prepareForJsonSafePreserve cache module. Clone+preserve variant — every
// cloned object literal is emitted as `{...v, declared: <transformed>}` so
// undeclared keys survive. Powers `strategy: 'clone', stripExtras: false`.

'use strict';

/** @typedef {import('../rt/types.ts').PrepareForJsonSafePreserveRTFn} PrepareForJsonSafePreserveRTFn */

/** @param {import('../rt/rtUtils.ts').RTUtils} rtUtils */
export function initCache(rtUtils) {
  function init(
    rtFnHash,
    typeName,
    code,
    isNoop,
    rtDependencies,
    pureFnDependencies,
    createRTFn,
    alwaysThrowCode,
    alwaysThrowSite
  ) {
    const fn = isNoop ? noopPrepareForJsonSafePreserve : undefined;
    const resolvedCreateRTFn =
      alwaysThrowCode !== undefined ? rtUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createRTFn;
    /** @type {PrepareForJsonSafePreserveRTFn} */
    const entry = {
      rtFnHash,
      fnID: 'pjsp',
      typeName,
      args: {vλl: 'v'},
      defaultParamValues: {vλl: undefined},
      code,
      isNoop,
      rtDependencies,
      pureFnDependencies,
      createRTFn: resolvedCreateRTFn,
      fn,
      alwaysThrowCode,
      alwaysThrowSite,
    };
    rtUtils.addToRTCache(entry);
  }
  void init;
  function noopPrepareForJsonSafePreserve(v) {
    return v;
  }
  void noopPrepareForJsonSafePreserve;

  // #### REPLACE HERE ####
}
