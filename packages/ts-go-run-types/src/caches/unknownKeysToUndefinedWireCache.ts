// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// unknownKeysToUndefinedWire cache module. Decoder-internal sibling of uku.
// Differs only at union nodes: detects the wire wrapper `[idx, value]` at
// runtime and reaches into `v[1]` to apply the merged-allowlist strip on the
// merged object branch (uku is a no-op there to avoid corrupting the wrapper).

'use strict';

/** @typedef {import('../runtypes/types.ts').UnknownKeysToUndefinedWireRTFn} UnknownKeysToUndefinedWireRTFn */

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
    const fn = isNoop ? noopUnknownKeysToUndefinedWire : undefined;
    const resolvedCreateRTFn =
      alwaysThrowCode !== undefined ? rtUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createRTFn;
    /** @type {UnknownKeysToUndefinedWireRTFn} */
    const entry = {
      rtFnHash,
      fnID: 'ukuw',
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
  function noopUnknownKeysToUndefinedWire(v) {
    return v;
  }
  void noopUnknownKeysToUndefinedWire;

  // #### REPLACE HERE ####
}
