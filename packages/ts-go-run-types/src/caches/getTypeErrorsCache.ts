// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// typeErrors cache module. Three-arg shape (vλl / pλth / εrr); each entry
// accumulates errors into `er` and returns it.

'use strict';

/** @typedef {import('../runtypes/types.ts').GetTypeErrorsRTFn} GetTypeErrorsRTFn */

/** @param {import('../runtypes/rtUtils.ts').RTUtils} rtUtils */
export function initCache(rtUtils) {
  // Pure-fn key consts referenced by emitted factory bodies. Mirror the
  // Go-side alias table at internal/compiled/typefns/purefn_aliases.go.
  const k_nRT = 'mion::newRunTypeErr';
  const k_sIK = 'mion::safeIterableKey';
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
    const fn = isNoop ? noopTypeErrors : undefined;
    const resolvedCreateRTFn =
      alwaysThrowCode !== undefined ? rtUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createRTFn;
    /** @type {GetTypeErrorsRTFn} */
    const entry = {
      rtFnHash,
      fnID: 'te',
      typeName,
      args: {vλl: 'v', pλth: 'pth', εrr: 'er'},
      defaultParamValues: {vλl: undefined, pλth: [], εrr: []},
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
  void k_nRT;
  void k_sIK;
  function noopTypeErrors(_v, _pth, er) {
    return er || [];
  }
  void noopTypeErrors;

  // #### REPLACE HERE ####
}
