// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// prepareForJsonSafe cache module. Non-mutating sibling of prepareForJson:
// builds a new value with only declared keys (extras stripped) and
// transformed leaves. Wire shape matches `prepareForJson + JSON.stringify`,
// so it pairs with `createRestoreFromJson` on the decode side.

'use strict';

/** @typedef {import('../runtypes/types.ts').PrepareForJsonSafeRTFn} PrepareForJsonSafeRTFn */

/** @param {import('../runtypes/rtUtils.ts').RTUtils} rtUtils */
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
    const fn = isNoop ? noopPrepareForJsonSafe : undefined;
    const resolvedCreateRTFn =
      alwaysThrowCode !== undefined ? rtUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createRTFn;
    /** @type {PrepareForJsonSafeRTFn} */
    const entry = {
      rtFnHash,
      fnID: 'pjs',
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
  function noopPrepareForJsonSafe(v) {
    return v;
  }
  void noopPrepareForJsonSafe;

  // #### REPLACE HERE ####
}
