// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `validateCache.ts` for the full contract.
//
// fromBinary cache module. Each entry reads bytes from a DataViewDeserializer.

'use strict';

/** @typedef {import('../runtypes/types.ts').FromBinaryRTFn} FromBinaryRTFn */

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
    const fn = isNoop ? noopFromBinary : undefined;
    const resolvedCreateRTFn =
      alwaysThrowCode !== undefined ? rtUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createRTFn;
    /** @type {FromBinaryRTFn} */
    const entry = {
      rtFnHash,
      fnID: 'fb',
      typeName,
      args: {vλl: 'ret', dεs: 'Des'},
      defaultParamValues: {vλl: undefined, dεs: undefined},
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
  // Noop fallback for collapsed entries — returns the placeholder `ret`.
  function noopFromBinary(ret, Des) {
    void Des;
    return ret;
  }
  void noopFromBinary;

  // #### REPLACE HERE ####
}
