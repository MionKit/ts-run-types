// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// unknownKeysToUndefined cache module. Each entry sets unknown properties to
// `undefined` (vs `strip`, which deletes them).

'use strict';

/** @typedef {import('../runtypes/types.ts').UnknownKeysToUndefinedRTFn} UnknownKeysToUndefinedRTFn */

/** @param {import('../runtypes/rtUtils.ts').RTUtils} rtUtils */
export function initCache(rtUtils) {
  const k_gUKFA = 'mion::getUnknownKeysFromArray';

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
    const fn = isNoop ? noopUnknownKeysToUndefined : undefined;
    const resolvedCreateRTFn =
      alwaysThrowCode !== undefined ? rtUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createRTFn;
    /** @type {UnknownKeysToUndefinedRTFn} */
    const entry = {
      rtFnHash,
      fnID: 'uku',
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
  void k_gUKFA;
  function noopUnknownKeysToUndefined(v) {
    return v;
  }
  void noopUnknownKeysToUndefined;

  // #### REPLACE HERE ####
}
