// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `validateCache.ts` for the full contract.
//
// unknownKeyErrors cache module. Each entry appends one RunTypeError
// (`expected: 'never'`) per unknown key.

'use strict';

/** @typedef {import('../runtypes/types.ts').UnknownKeyErrorsRTFn} UnknownKeyErrorsRTFn */

/** @param {import('../runtypes/rtUtils.ts').RTUtils} rtUtils */
export function initCache(rtUtils) {
  // Pure-fn key consts referenced by emitted factory bodies.
  const k_nRT = 'mion::newRunTypeErr';
  const k_gUKFA = 'mion::getUnknownKeysFromArray';
  // Wraps the runtime entry key into a JSON-safe path segment for Map/Set emit.
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
    const fn = isNoop ? noopUnknownKeyErrors : undefined;
    const resolvedCreateRTFn =
      alwaysThrowCode !== undefined ? rtUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createRTFn;
    /** @type {UnknownKeyErrorsRTFn} */
    const entry = {
      rtFnHash,
      fnID: 'uke',
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
  void k_gUKFA;
  void k_sIK;
  function noopUnknownKeyErrors(_v, _pth, er) {
    return er || [];
  }
  void noopUnknownKeyErrors;

  // #### REPLACE HERE ####
}
