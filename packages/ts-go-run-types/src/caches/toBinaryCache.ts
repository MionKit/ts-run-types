// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// toBinary cache module. Each entry writes bytes into a DataViewSerializer.

'use strict';

/** @typedef {import('../rt/types.ts').ToBinaryRTFn} ToBinaryRTFn */

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
    const fn = isNoop ? noopToBinary : undefined;
    const resolvedCreateRTFn =
      alwaysThrowCode !== undefined ? rtUtils.alwaysThrowFactory(alwaysThrowCode, alwaysThrowSite) : createRTFn;
    /** @type {ToBinaryRTFn} */
    const entry = {
      rtFnHash,
      fnID: 'tb',
      typeName,
      args: {vλl: 'v', sεr: 'Ser'},
      defaultParamValues: {vλl: undefined, sεr: undefined},
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
  // Noop fallback for collapsed entries (e.g. `any` / `unknown`). Returns
  // the serializer untouched so callers can still chain `.getBuffer()`.
  function noopToBinary(v, Ser) {
    void v;
    return Ser;
  }
  void noopToBinary;

  // #### REPLACE HERE ####
}
