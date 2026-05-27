// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// stringifyJson cache module. Single-pass JSON serialiser: walks the TYPE and
// builds the JSON string directly (no mutation of `v`, extras stripped by
// construction). Noop entries degrade to `JSON.stringify(v)` since there is
// no identity shape for atomic kinds.

'use strict';

/** @typedef {import('../rt/types.ts').StringifyJsonRTFn} StringifyJsonRTFn */

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
    const fn = isNoop ? noopStringifyJson : undefined;
    const resolvedCreateRTFn =
      alwaysThrowCode !== undefined ? rtUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createRTFn;
    /** @type {StringifyJsonRTFn} */
    const entry = {
      rtFnHash,
      fnID: 'sj',
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
  function noopStringifyJson(v) {
    return JSON.stringify(v);
  }
  void noopStringifyJson;

  // #### REPLACE HERE ####
}
