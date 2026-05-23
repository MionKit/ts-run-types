// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// stripUnknownKeys cache module. Each entry deletes undeclared properties
// in place and returns the value.

'use strict';

/** @typedef {import('../runtypes/types.ts').StripUnknownKeysRTFn} StripUnknownKeysRTFn */

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
    const fn = isNoop ? noopStripUnknownKeys : undefined;
    const resolvedCreateRTFn =
      alwaysThrowCode !== undefined ? rtUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createRTFn;
    /** @type {StripUnknownKeysRTFn} */
    const entry = {
      rtFnHash,
      fnID: 'suk',
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
  function noopStripUnknownKeys(v) {
    return v;
  }
  void noopStripUnknownKeys;

  // #### REPLACE HERE ####
}
