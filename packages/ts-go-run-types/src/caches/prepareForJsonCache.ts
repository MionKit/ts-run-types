// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `validateCache.ts` for the full contract.
//
// prepareForJson cache module. Each entry transforms a value into a
// JSON-serializable form. Paired with `restoreFromJsonCache.ts` — round-trip
// `restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))` deep-equals v.

'use strict';

/** @typedef {import('../runtypes/types.ts').PrepareForJsonRTFn} PrepareForJsonRTFn */

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
    const fn = isNoop ? noopPrepareForJson : undefined;
    const resolvedCreateRTFn =
      alwaysThrowCode !== undefined ? rtUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createRTFn;
    /** @type {PrepareForJsonRTFn} */
    const entry = {
      rtFnHash,
      fnID: 'pj',
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
  function noopPrepareForJson(v) {
    return v;
  }
  void noopPrepareForJson;

  // #### REPLACE HERE ####
}
