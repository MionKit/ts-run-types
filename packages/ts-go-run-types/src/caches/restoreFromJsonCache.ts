// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// restoreFromJson cache module. Each entry takes a JSON-parsed value and
// reconstructs the original runtime shape (Dates from ISO strings, BigInts
// from decimal strings, etc.).

'use strict';

/** @typedef {import('../runtypes/types.ts').RestoreFromJsonRTFn} RestoreFromJsonRTFn */

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
    const fn = isNoop ? noopRestoreFromJson : undefined;
    const resolvedCreateRTFn =
      alwaysThrowCode !== undefined ? rtUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createRTFn;
    /** @type {RestoreFromJsonRTFn} */
    const entry = {
      rtFnHash,
      fnID: 'rj',
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
  function noopRestoreFromJson(v) {
    return v;
  }
  void noopRestoreFromJson;

  // #### REPLACE HERE ####
}
